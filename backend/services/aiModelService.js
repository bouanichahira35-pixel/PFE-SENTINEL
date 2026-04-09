const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const Product = require('../models/Product');
const History = require('../models/History');
const StockEntry = require('../models/StockEntry');
const StockLot = require('../models/StockLot');
const AIAlert = require('../models/AIAlert');
const { isGeminiConfigured, generateGeminiContent } = require('./geminiService');

const AI_DATA_DIR = path.join(process.cwd(), 'data', 'ai');
const AI_PY_DIR = path.join(process.cwd(), 'ai_py');
const AI_TMP_DIR = path.join(AI_DATA_DIR, '_tmp');
const DAY_MS = 24 * 60 * 60 * 1000;

let pythonDisabled = null;
let pythonCommand = null;

const AI_CACHE_TTL_MS = Math.max(10 * 1000, Number(process.env.AI_CACHE_TTL_MS || 60 * 1000));
const AI_CACHE_MAX = Math.max(50, Number(process.env.AI_CACHE_MAX_ITEMS || 250));
const aiCache = new Map();

function makeCacheKey(prefix, payload) {
  try {
    return `${prefix}:${JSON.stringify(payload || {})}`;
  } catch {
    return `${prefix}:__unserializable__`;
  }
}

function getCache(key) {
  const item = aiCache.get(key);
  if (!item) return null;
  if (item.expires_at <= Date.now()) {
    aiCache.delete(key);
    return null;
  }
  return item.value;
}

function setCache(key, value, ttlMs = AI_CACHE_TTL_MS) {
  aiCache.set(key, { value, expires_at: Date.now() + Math.max(1000, Number(ttlMs || AI_CACHE_TTL_MS)) });
  while (aiCache.size > AI_CACHE_MAX) {
    const oldestKey = aiCache.keys().next().value;
    if (!oldestKey) break;
    aiCache.delete(oldestKey);
  }
}

async function cachedAsync(key, task) {
  const cached = getCache(key);
  if (cached !== null) return cached;
  const value = await task();
  setCache(key, value);
  return value;
}

function resolvePythonCommand() {
  if (pythonDisabled) return null;
  if (pythonCommand) return pythonCommand;

  const envBin = String(process.env.AI_PYTHON_BIN || '').trim();
  const candidates = [];

  if (envBin) {
    candidates.push({ bin: envBin, baseArgs: [] });
  } else {
    // Common local defaults (Windows/macOS/Linux) + Python launcher on Windows.
    candidates.push({ bin: 'python', baseArgs: [] });
    candidates.push({ bin: 'python3', baseArgs: [] });
    candidates.push({ bin: 'py', baseArgs: ['-3'] });
  }

  for (const cand of candidates) {
    try {
      const proc = spawnSync(cand.bin, [...cand.baseArgs, '--version'], {
        stdio: ['ignore', 'ignore', 'ignore'],
        cwd: process.cwd(),
        windowsHide: true,
      });
      if (proc?.error) continue;
      if (proc?.status !== 0) continue;
      pythonCommand = cand;
      return pythonCommand;
    } catch (_) {
      // try next candidate
    }
  }

  pythonDisabled = {
    code: 'PYTHON_UNAVAILABLE',
    message: 'Python introuvable pour executer les scripts IA',
    details: 'Installez Python 3, ou configurez `AI_PYTHON_BIN`. En Docker: utilisez `backend/docker-compose.yml` (python3 inclus).',
  };
  return null;
}

function getPythonRuntimeStatus() {
  const cmd = resolvePythonCommand();
  if (cmd) {
    return {
      ok: true,
      state: 'ready',
      user_message: 'Moteur IA local prêt.',
      configured: Boolean(String(process.env.AI_PYTHON_BIN || '').trim()),
      command: cmd.bin,
      base_args: cmd.baseArgs || [],
      code: null,
      details: null,
    };
  }
  return {
    ok: false,
    state: 'unavailable',
    user_message:
      'Moteur IA local indisponible sur ce serveur. Les prédictions restent disponibles en mode automatique.',
    configured: Boolean(String(process.env.AI_PYTHON_BIN || '').trim()),
    command: null,
    base_args: [],
    code: pythonDisabled?.code || 'PYTHON_UNAVAILABLE',
    details: pythonDisabled?.details || pythonDisabled?.message || 'Python indisponible',
  };
}

function asPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function startOfDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  return new Date(startOfDay(date).getTime() + days * DAY_MS);
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((acc, v) => acc + Number(v || 0), 0) / values.length;
}

function std(values, m) {
  if (!values.length) return 0;
  const variance = values.reduce((acc, v) => acc + (Number(v || 0) - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function safeDiv(a, b, fallback = 0) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return fallback;
  return a / b;
}

function clamp(value, low, high) {
  const n = Number(value);
  if (!Number.isFinite(n)) return low;
  return Math.max(low, Math.min(high, n));
}

function asEnum(value, allowed, fallback) {
  const v = String(value || '').trim();
  if (!v) return fallback;
  return allowed.includes(v) ? v : fallback;
}

function buildAssistantContextText(ctx) {
  if (!ctx || typeof ctx !== 'object') return 'CONTEXTE: {}';
  const safe = {
    stockout_top: Array.isArray(ctx.stockout_top) ? ctx.stockout_top.slice(0, 5) : [],
    consumption_top: Array.isArray(ctx.consumption_top) ? ctx.consumption_top.slice(0, 5) : [],
    anomaly_top: Array.isArray(ctx.anomaly_top) ? ctx.anomaly_top.slice(0, 5) : [],
    action_plan: Array.isArray(ctx.action_plan) ? ctx.action_plan.slice(0, 5) : [],
    metrics: ctx.metrics && typeof ctx.metrics === 'object' ? ctx.metrics : {},
  };
  return `CONTEXTE OPERATOIRE (extrait):\n${JSON.stringify(safe, null, 2)}`;
}

function buildAssistantToolDeclarations() {
  return [
    {
      name: 'get_stock_snapshot',
      description: 'Snapshot du stock (produits approuves), filtre possible sur les produits a risque. Lecture seule.',
      parameters: {
        type: 'object',
        properties: {
          status_filter: { type: 'string', description: 'any|at_risk (defaut at_risk)' },
          limit: { type: 'integer', description: 'Nombre max (1..50), defaut 10' },
        },
      },
    },
    {
      name: 'list_ai_alerts',
      description: 'Liste des alertes IA (anomaly/rupture/surconsommation). Lecture seule.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'any|new|reviewed (defaut any)' },
          alert_type: { type: 'string', description: 'any|anomaly|rupture|surconsommation (defaut any)' },
          limit: { type: 'integer', description: 'Nombre max (1..50), defaut 10' },
        },
      },
    },
    {
      name: 'get_product_timeline',
      description: 'Historique des mouvements (History) + lots ouverts pour un produit (par code). Lecture seule.',
      parameters: {
        type: 'object',
        properties: {
          product_code: { type: 'string', description: 'Code produit (ex: ABC123)' },
          days: { type: 'integer', description: 'Fenetre en jours (1..90), defaut 14' },
          limit: { type: 'integer', description: 'Nb evenements max (1..200), defaut 30' },
        },
        required: ['product_code'],
      },
    },
    {
      name: 'get_top_stockout_predictions',
      description: 'Predictions de risque de rupture (top N). Lecture seule.',
      parameters: {
        type: 'object',
        properties: {
          horizon_days: { type: 'integer', description: 'Horizon (1..30), defaut 7' },
          limit: { type: 'integer', description: 'Nombre max (1..50), defaut 10' },
        },
      },
    },
    {
      name: 'get_top_anomaly_predictions',
      description: 'Predictions d’anomalie (top N). Lecture seule.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Nombre max (1..50), defaut 10' },
        },
      },
    },
    {
      name: 'get_copilot_recommendations',
      description: 'Construit un plan d’actions IA (copilot decision engine) a partir des predictions. Lecture seule.',
      parameters: {
        type: 'object',
        properties: {
          horizon_days: { type: 'integer', description: 'Horizon (1..30), defaut 14' },
          top_n: { type: 'integer', description: 'Nombre max produits (1..20), defaut 5' },
          include_consumption: { type: 'boolean', description: 'Inclure analyse de consommation (defaut true)' },
        },
      },
    },
    {
      name: 'explain_ai_alert',
      description: 'Explique une alerte IA (produit + details + timeline + lots). Lecture seule.',
      parameters: {
        type: 'object',
        properties: {
          alert_id: { type: 'string', description: 'ID MongoDB de l’alerte' },
          days: { type: 'integer', description: 'Fenetre timeline (1..90), defaut 14' },
          limit: { type: 'integer', description: 'Nb evenements timeline max (1..200), defaut 40' },
        },
        required: ['alert_id'],
      },
    },
  ];
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeywords(query, maxTokens = 4) {
  const stop = new Set(['pourquoi', 'alerte', 'risque', 'resume', 'resumer', 'resumez', 'critique', 'critiques', 'produit', 'article']);
  const tokens = normalizeText(query)
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !stop.has(t));
  return Array.from(new Set(tokens)).slice(0, maxTokens);
}

async function findProductSnapshotByQuestion(question) {
  const keywords = extractKeywords(question, 4);
  if (!keywords.length) return null;

  const or = keywords.map((kw) => ({
    name: { $regex: kw, $options: 'i' },
  }));
  or.push(...keywords.map((kw) => ({ code_product: { $regex: kw, $options: 'i' } })));

  const product = await Product.findOne({
    validation_status: 'approved',
    $or: or,
  })
    .select('name code_product quantity_current seuil_minimum status family emplacement')
    .lean();

  if (!product) return null;
  const alert = await AIAlert.findOne({ product: product._id })
    .sort({ detected_at: -1, createdAt: -1 })
    .select('alert_type risk_level message detected_at createdAt status')
    .lean();

  return { product, alert };
}

async function executeAssistantTool(name, args = {}) {
  const toolName = String(name || '').trim();
  const safeArgs = args && typeof args === 'object' ? args : {};

  if (toolName === 'get_stock_snapshot') {
    const statusFilter = asEnum(safeArgs.status_filter, ['any', 'at_risk'], 'at_risk');
    const limit = Math.min(50, asPositiveInt(safeArgs.limit, 10));
    const query = statusFilter === 'at_risk'
      ? { validation_status: 'approved', status: { $in: ['sous_seuil', 'rupture', 'bloque'] } }
      : { validation_status: 'approved' };

    const products = await Product.find(query)
      .select('code_product name quantity_current seuil_minimum status family emplacement updatedAt')
      .sort({ status: -1, quantity_current: 1, updatedAt: -1 })
      .limit(limit)
      .lean();

    return { products };
  }

  if (toolName === 'list_ai_alerts') {
    const status = asEnum(safeArgs.status, ['any', 'new', 'reviewed'], 'any');
    const alertType = asEnum(safeArgs.alert_type, ['any', 'anomaly', 'rupture', 'surconsommation'], 'any');
    const limit = Math.min(50, asPositiveInt(safeArgs.limit, 10));
    const query = {};
    if (status !== 'any') query.status = status;
    if (alertType !== 'any') query.alert_type = alertType;

    const alerts = await AIAlert.find(query)
      .populate('product', 'name code_product status quantity_current seuil_minimum')
      .sort({ detected_at: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    return { alerts };
  }

  if (toolName === 'get_product_timeline') {
    const productCode = String(safeArgs.product_code || '').trim().toUpperCase();
    if (!productCode) throw new Error('product_code obligatoire');
    const days = Math.min(90, asPositiveInt(safeArgs.days, 14));
    const limit = Math.min(200, asPositiveInt(safeArgs.limit, 30));

    const product = await Product.findOne({ code_product: productCode })
      .select('code_product name quantity_current seuil_minimum status family emplacement updatedAt')
      .lean();
    if (!product) throw new Error('Produit introuvable');

    const since = new Date(Date.now() - days * DAY_MS);
    const events = await History.find({ product: product._id, date_action: { $gte: since } })
      .select('action_type quantity date_action source description actor_role correlation_id')
      .sort({ date_action: -1 })
      .limit(limit)
      .lean();

    const lots = await StockLot.find({ product: product._id, status: { $in: ['open', 'expired'] } })
      .select('lot_number quantity_available quantity_initial expiry_date date_entry status')
      .sort({ date_entry: 1 })
      .limit(50)
      .lean();

    return { product, events, lots, window_days: days };
  }

  if (toolName === 'get_top_stockout_predictions') {
    const horizonDays = Math.min(30, asPositiveInt(safeArgs.horizon_days, 7));
    const limit = Math.min(50, asPositiveInt(safeArgs.limit, 10));
    const predictions = await predictStockout({ horizon_days: horizonDays });
    const top = [...predictions]
      .sort((a, b) => Number(b.risk_probability || 0) - Number(a.risk_probability || 0))
      .slice(0, limit);
    return { horizon_days: horizonDays, predictions: top };
  }

  if (toolName === 'get_top_anomaly_predictions') {
    const limit = Math.min(50, asPositiveInt(safeArgs.limit, 10));
    const predictions = await predictAnomaly({});
    const top = [...predictions]
      .sort((a, b) => Number(b.anomaly_score || 0) - Number(a.anomaly_score || 0))
      .slice(0, limit);
    return { predictions: top };
  }

  if (toolName === 'get_copilot_recommendations') {
    const horizonDays = Math.min(30, asPositiveInt(safeArgs.horizon_days, 14));
    const topN = Math.min(20, asPositiveInt(safeArgs.top_n, 5));
    const includeConsumption = safeArgs.include_consumption !== false;
    const copilot = await buildCopilotRecommendations({
      horizon_days: horizonDays,
      top_n: topN,
      simulations: [],
      include_consumption: includeConsumption,
    });
    return { copilot };
  }

  if (toolName === 'explain_ai_alert') {
    const alertId = String(safeArgs.alert_id || '').trim();
    if (!alertId) throw new Error('alert_id obligatoire');
    const days = Math.min(90, asPositiveInt(safeArgs.days, 14));
    const limit = Math.min(200, asPositiveInt(safeArgs.limit, 40));

    const alert = await AIAlert.findById(alertId)
      .populate('product', 'name code_product status quantity_current seuil_minimum family emplacement')
      .lean();
    if (!alert) throw new Error('Alerte introuvable');
    const productCode = String(alert?.product?.code_product || '').trim();
    if (!productCode) return { alert, note: 'Alerte sans code produit exploitable' };

    const timeline = await executeAssistantTool('get_product_timeline', { product_code: productCode, days, limit });
    return { alert, timeline };
  }

  throw new Error(`Tool inconnu: ${toolName}`);
}

async function runGeminiAgent({ question, history, system_instruction, mode, context }) {
  const toolDeclarations = buildAssistantToolDeclarations();
  const tools = [{ functionDeclarations: toolDeclarations }];
  const toolConfig = { includeServerSideToolInvocations: true };

  const normalizedQuestion = String(question || '').toLowerCase();
  const wantsFiveLines =
    (normalizedQuestion.includes('resume') || normalizedQuestion.includes('résume') || normalizedQuestion.includes('resum'))
    && (normalizedQuestion.includes('5') || normalizedQuestion.includes('cinq') || normalizedQuestion.includes('5 lignes'));
  const wantsWhy =
    normalizedQuestion.includes('pourquoi')
    || normalizedQuestion.includes('raison')
    || normalizedQuestion.includes('alerte')
    || normalizedQuestion.includes('risque');

  const modeInstruction = mode === 'report'
    ? 'MODE=REPORT. Produis un mini-rapport markdown structure, concret, avec sections et puces.'
    : [
      'MODE=CHAT. Reponds de maniere conversationnelle, concise et utile.',
      'Regle prioritaire: repondre EXACTEMENT a la question (pas de mini-rapport generique).',
      wantsFiveLines ? 'Contrainte: exactement 5 lignes.' : null,
      wantsWhy ? 'Si c’est une question "pourquoi", reponds SPECIFIQUEMENT sur le produit/alerte demande(e) avec 4-6 puces max.' : null,
    ].filter(Boolean).join(' ');

  const prompt = `${modeInstruction}\n\n${buildAssistantContextText(context)}\n\nQuestion utilisateur:\n${question}`;

  const contents = [
    ...(Array.isArray(history)
      ? history
        .filter((x) => x && typeof x.text === 'string' && x.text.trim())
        .slice(-20)
        .map((x) => ({
          role: x.role === 'model' ? 'model' : 'user',
          parts: [{ text: String(x.text).slice(0, 4000) }],
        }))
      : []),
    { role: 'user', parts: [{ text: prompt.slice(0, 8000) }] },
  ];

  for (let step = 0; step < 4; step += 1) {
    const result = await generateGeminiContent({
      prompt: '',
      contents,
      tools,
      tool_config: toolConfig,
      system_instruction,
      temperature: mode === 'report' ? 0.25 : 0.4,
      max_output_tokens: mode === 'report' ? 1600 : 1100,
    });

    const candidateContent = result?.candidate_content;
    if (candidateContent) contents.push(candidateContent);

    const calls = Array.isArray(result?.function_calls) ? result.function_calls : [];
    if (!calls.length) {
      const text = String(result?.text || '').trim();
      if (!text) throw new Error('Empty Gemini response');
      return { answer: text, source: 'gemini', mode };
    }

    const call = calls[0];
    let toolResponse;
    try {
      toolResponse = await executeAssistantTool(call.name, call.args);
    } catch (err) {
      toolResponse = { error: err?.message || 'tool_failed' };
    }

    contents.push({
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: call.name,
            response: { result: toolResponse },
            id: call.id || undefined,
          },
        },
      ],
    });
  }

  const lastText = contents
    .slice()
    .reverse()
    .find((c) => c?.role === 'model')
    ?.parts?.map((p) => p?.text || '')
    .join('\n')
    .trim();
  return { answer: lastText || 'Aucune reponse produite.', source: 'gemini', mode };
}

function rangeSum(arr, start, end) {
  let s = 0;
  for (let i = Math.max(0, start); i <= Math.min(arr.length - 1, end); i += 1) s += Number(arr[i] || 0);
  return s;
}

function makeVersionTag(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `v${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`;
}

function runPythonScript(scriptName, payload) {
  if (pythonDisabled) {
    const err = new Error(pythonDisabled.message);
    err.code = pythonDisabled.code;
    err.details = pythonDisabled.details;
    throw err;
  }

  const cmd = resolvePythonCommand();
  if (!cmd) {
    const err = new Error(pythonDisabled?.message || 'Python introuvable');
    err.code = pythonDisabled?.code || 'PYTHON_UNAVAILABLE';
    err.details = pythonDisabled?.details || null;
    throw err;
  }

  fs.mkdirSync(AI_TMP_DIR, { recursive: true });
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const inputPath = path.join(AI_TMP_DIR, `${scriptName.replace('.py', '')}_${stamp}_in.json`);
  const outputPath = path.join(AI_TMP_DIR, `${scriptName.replace('.py', '')}_${stamp}_out.json`);
  const scriptPath = path.join(AI_PY_DIR, scriptName);

  fs.writeFileSync(inputPath, JSON.stringify(payload), 'utf8');
  const proc = spawnSync(cmd.bin, [...(cmd.baseArgs || []), scriptPath, '--input', inputPath, '--output', outputPath], {
    // In some locked-down Windows environments, piping stdio can fail with EPERM.
    // We rely on the JSON output file for results.
    stdio: ['ignore', 'ignore', 'ignore'],
    cwd: process.cwd(),
    windowsHide: true,
  });

  try {
    if (proc.error) {
      const msg = `Python spawn failed (${proc.error.code || 'UNKNOWN'}): ${proc.error.message || scriptName}`;
      pythonDisabled = {
        code: 'PYTHON_UNAVAILABLE',
        message: msg,
        details: 'Backend IA: configurez `AI_PYTHON_BIN` vers un python executable, ou lancez via `backend/docker-compose.yml`.',
      };
      const err = new Error(msg);
      err.code = pythonDisabled.code;
      err.details = pythonDisabled.details;
      throw err;
    }
    if (proc.status !== 0) {
      throw new Error(`Python script failed: ${scriptName}`);
    }
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Python script did not produce output: ${scriptName}`);
    }
    const raw = fs.readFileSync(outputPath, 'utf8');
    return JSON.parse(raw);
  } finally {
    try { fs.unlinkSync(inputPath); } catch (_) {}
    try { fs.unlinkSync(outputPath); } catch (_) {}
  }
}

function expectedDailySignal(features) {
  const avg7 = Number(features?.avg_exit_7d || 0);
  const avg30 = Number(features?.avg_exit_30d || 0);
  const trend = Number(features?.trend_exit_14d || 0);
  return Math.max(0, avg7 * 0.55 + avg30 * 0.35 + Math.max(0, trend) * 0.10);
}

function fallbackPredictStockoutOne(features, horizonDays) {
  const horizon = Math.max(1, Math.min(30, asPositiveInt(horizonDays, 7)));
  const stockAnchor = Number(features?.stock_anchor || 0);
  const threshold = Math.max(0, Number(features?.seuil_minimum || 0));
  const avg30 = Number(features?.avg_exit_30d || 0);
  const vol30 = Number(features?.volatility_exit_30d || 0);
  const trend = Number(features?.trend_exit_14d || 0);
  const lead = Math.max(1, Number(features?.supplier_lead_time_days || 7));

  const daily = expectedDailySignal(features);
  const expectedNeed = daily * horizon;
  const projectedStockEnd = stockAnchor - expectedNeed;
  const daysCover = safeDiv(stockAnchor, Math.max(daily, 0.1), 9999);
  const cv = safeDiv(vol30, Math.max(avg30, 0.1), 0);

  const stockBelowThreshold = stockAnchor <= threshold ? 1 : 0;
  const projectedBelowThreshold = projectedStockEnd <= threshold ? 1 : 0;
  const coverPressure = clamp(safeDiv(Math.max(0, horizon - daysCover), Math.max(1, horizon), 0), 0, 1);
  const variabilityPressure = clamp(safeDiv(cv, 1.5, 0), 0, 1);
  const trendPressure = clamp(safeDiv(Math.max(0, trend), Math.max(avg30, 0.1), 0), 0, 1);
  const leadPressure = lead >= 10 ? 1 : clamp(safeDiv(lead - 4, 10, 0), 0, 1);

  const score = clamp(
    stockBelowThreshold * 0.30
      + projectedBelowThreshold * 0.22
      + coverPressure * 0.20
      + variabilityPressure * 0.15
      + trendPressure * 0.08
      + leadPressure * 0.05,
    0,
    1
  );

  const probability = Number((score * 100).toFixed(3));
  const level = score >= 0.7 ? 'eleve' : score >= 0.4 ? 'moyen' : 'faible';

  const factors = [];
  if (stockBelowThreshold >= 1) factors.push('stock inferieur ou egal au seuil');
  if (projectedBelowThreshold >= 1) factors.push('projection fin horizon sous seuil');
  if (coverPressure > 0.25) factors.push('couverture de stock insuffisante');
  if (trendPressure > 0.20) factors.push('tendance de sorties haussiere');
  if (variabilityPressure > 0.30) factors.push('consommation instable');
  if (!factors.length) factors.push('profil stable et couverture acceptable');

  const safetyStock = Math.max(threshold, daily * Math.max(7, lead) * (0.35 + cv * 0.25));
  const recommended = Math.max(0, Math.round(expectedNeed + safetyStock - stockAnchor));

  return {
    product_id: features?.product_id,
    code_product: features?.product_code,
    product_name: features?.product_name,
    risk_level: level,
    risk_probability: probability,
    projected_stock_end: Number(projectedStockEnd.toFixed(3)),
    expected_need: Number(expectedNeed.toFixed(3)),
    days_cover_estimate: Number(daysCover.toFixed(3)),
    recommended_order_qty: recommended,
    factors,
    current_stock: Number(features?.current_stock || 0),
    seuil_minimum: threshold,
    horizon_days: horizon,
  };
}

function fallbackPredictStockout(items, horizonDays) {
  const predictions = (Array.isArray(items) ? items : []).map((x) => fallbackPredictStockoutOne(x, horizonDays));
  predictions.sort((a, b) => Number(b.risk_probability || 0) - Number(a.risk_probability || 0));
  return predictions;
}

function fallbackPredictConsumptionOne(features, horizonDays) {
  const horizon = Math.max(1, Math.min(30, asPositiveInt(horizonDays, 14)));
  const daily = expectedDailySignal(features);
  const vol30 = Number(features?.volatility_exit_30d || 0);
  const trend = Number(features?.trend_exit_14d || 0);

  const expected = Math.max(0, daily * horizon);
  const spread = Math.max(1, (vol30 + Math.abs(trend) * 0.30) * Math.max(1, horizon / 7));
  const low = Math.max(0, expected - spread);
  const high = expected + spread;
  const confidence = clamp(1 - safeDiv(spread, expected + 1, 0), 0.35, 0.97);

  return {
    product_id: features?.product_id,
    code_product: features?.product_code,
    product_name: features?.product_name,
    horizon_days: horizon,
    expected_quantity: Number(expected.toFixed(3)),
    expected_daily: Number(daily.toFixed(6)),
    prediction_interval_low: Number(low.toFixed(3)),
    prediction_interval_high: Number(high.toFixed(3)),
    confidence_score: Number(confidence.toFixed(4)),
    pred_qty_j7: Number((daily * 7).toFixed(3)),
    pred_qty_j14: Number((daily * 14).toFixed(3)),
    current_stock: Number(features?.current_stock || 0),
  };
}

function fallbackPredictConsumption(items, horizonDays) {
  const predictions = (Array.isArray(items) ? items : []).map((x) => fallbackPredictConsumptionOne(x, horizonDays));
  predictions.sort((a, b) => Number(b.expected_quantity || 0) - Number(a.expected_quantity || 0));
  return predictions;
}

function fallbackPredictAnomalyOne(features) {
  const avg7 = Number(features?.avg_exit_7d || 0);
  const avg30 = Number(features?.avg_exit_30d || 0);
  const vol30 = Number(features?.volatility_exit_30d || 0);
  const trend = Number(features?.trend_exit_14d || 0);
  const entries14 = Number(features?.entries_14d || 0);
  const exits14 = Number(features?.exits_14d || 0);
  const daysCover = Number(features?.days_cover_estimate || 0);

  const spikeRatio = safeDiv(avg7, Math.max(avg30, 0.1), 1);
  const variabilityRatio = safeDiv(vol30, Math.max(avg30, 0.1), 0);
  const flowRatio = safeDiv(exits14, Math.max(entries14, 0.1), 0);

  const score = clamp(
    (spikeRatio - 1) * 0.42
      + Math.max(0, trend) * 0.10
      + variabilityRatio * 0.25
      + Math.max(0, flowRatio - 1) * 0.18
      + (daysCover < 7 ? 0.05 : 0),
    0,
    1
  );

  const factors = [];
  if (spikeRatio > 1.35) factors.push('sorties 7j superieures a la tendance 30j');
  if (variabilityRatio > 0.50) factors.push('variabilite elevee');
  if (flowRatio > 1.20) factors.push('sorties > entrees sur 14j');
  if (trend > 0) factors.push('tendance haussiere');
  if (!factors.length) factors.push('comportement de sortie stable');

  const level = score >= 0.70 ? 'high' : score >= 0.45 ? 'medium' : 'low';

  return {
    product_id: features?.product_id,
    code_product: features?.product_code,
    product_name: features?.product_name,
    anomaly_score: Number((score * 100).toFixed(3)),
    risk_level: level,
    is_anomaly: Boolean(score >= 0.50),
    reason: factors[0],
    factors,
  };
}

function fallbackPredictAnomaly(items) {
  const predictions = (Array.isArray(items) ? items : []).map((x) => fallbackPredictAnomalyOne(x));
  predictions.sort((a, b) => Number(b.anomaly_score || 0) - Number(a.anomaly_score || 0));
  return predictions;
}

function urgencyFromSignals(risk, daysCover, anomaly) {
  const r = Number(risk || 0);
  const d = Number(daysCover || 9999);
  const a = Number(anomaly || 0);
  if (r >= 70 || d <= 3 || a >= 70) return 'critique';
  if (r >= 45 || d <= 7 || a >= 50) return 'haute';
  return 'normale';
}

function riskLevelFromRisk(risk) {
  const r = Number(risk || 0);
  if (r >= 70) return 'eleve';
  if (r >= 40) return 'moyen';
  return 'faible';
}

function buildSupplierLeadTimeMap(stockEntries) {
  const byProduct = new Map();
  for (const e of stockEntries) {
    const pid = String(e.product || '');
    if (!pid) continue;
    const deliveryDate = e.delivery_date ? new Date(e.delivery_date) : null;
    const createdAt = e.createdAt ? new Date(e.createdAt) : null;
    if (!deliveryDate || !createdAt) continue;
    const leadDays = Math.round((deliveryDate.getTime() - createdAt.getTime()) / DAY_MS);
    if (!Number.isFinite(leadDays) || leadDays < 0 || leadDays > 365) continue;
    if (!byProduct.has(pid)) byProduct.set(pid, []);
    byProduct.get(pid).push(leadDays);
  }
  const avg = new Map();
  for (const [pid, arr] of byProduct.entries()) avg.set(pid, Number(mean(arr).toFixed(2)));
  return avg;
}

async function buildAIContext() {
  const [products, history, stockEntries] = await Promise.all([
    Product.find({ validation_status: 'approved' })
      .select('_id code_product name family quantity_current seuil_minimum')
      .lean(),
    History.find({
      action_type: { $in: ['entry', 'exit'] },
      product: { $ne: null },
    })
      .select('product action_type quantity date_action')
      .sort({ date_action: 1 })
      .lean(),
    StockEntry.find({ canceled: false })
      .select('product delivery_date createdAt')
      .lean(),
  ]);

  const productsById = new Map(products.map((p) => [String(p._id), p]));
  const allDates = history.map((h) => startOfDay(h.date_action).getTime());
  const minDate = allDates.length ? new Date(Math.min(...allDates)) : startOfDay(new Date());
  const maxDate = startOfDay(new Date());
  const dates = [];
  for (let d = minDate.getTime(); d <= maxDate.getTime(); d += DAY_MS) dates.push(new Date(d));
  const dateKeys = dates.map((d) => dayKey(d));

  const dayIndexByKey = new Map(dateKeys.map((k, idx) => [k, idx]));
  const dailySeriesByProduct = new Map();
  for (const p of products) {
    const n = dates.length;
    dailySeriesByProduct.set(String(p._id), {
      dates: [...dateKeys],
      entries: new Array(n).fill(0),
      exits: new Array(n).fill(0),
      suffixEntries: new Array(n).fill(0),
      suffixExits: new Array(n).fill(0),
    });
  }

  for (const h of history) {
    const pid = String(h.product || '');
    const s = dailySeriesByProduct.get(pid);
    if (!s) continue;
    const idx = dayIndexByKey.get(dayKey(h.date_action));
    if (idx === undefined) continue;
    if (h.action_type === 'entry') s.entries[idx] += Number(h.quantity || 0);
    if (h.action_type === 'exit') s.exits[idx] += Number(h.quantity || 0);
  }

  for (const s of dailySeriesByProduct.values()) {
    let se = 0;
    let sx = 0;
    for (let i = s.entries.length - 1; i >= 0; i -= 1) {
      se += Number(s.entries[i] || 0);
      sx += Number(s.exits[i] || 0);
      s.suffixEntries[i] = se;
      s.suffixExits[i] = sx;
    }
  }

  return {
    products,
    productsById,
    dailySeriesByProduct,
    supplierLeadTimeByProduct: buildSupplierLeadTimeMap(stockEntries),
  };
}

function buildRecentFeatures(ctx, pid, anchorIndex, overrideStock = null) {
  const series = ctx.dailySeriesByProduct.get(pid);
  if (!series || !series.dates.length) return null;
  const { entries, exits, dates, suffixEntries, suffixExits } = series;
  const product = ctx.productsById.get(pid);
  if (!product) return null;

  const i = Math.min(anchorIndex, dates.length - 1);
  const currentStock = Number(overrideStock !== null ? overrideStock : product.quantity_current || 0);
  const futureEntries = i + 1 < entries.length ? suffixEntries[i + 1] : 0;
  const futureExits = i + 1 < exits.length ? suffixExits[i + 1] : 0;
  const stockAtAnchor = currentStock + futureExits - futureEntries;

  const last7 = exits.slice(Math.max(0, i - 6), i + 1);
  const last30 = exits.slice(Math.max(0, i - 29), i + 1);
  const prev7 = exits.slice(Math.max(0, i - 13), Math.max(0, i - 6));
  const ent14 = entries.slice(Math.max(0, i - 13), i + 1);

  const avg7 = mean(last7);
  const avg30 = mean(last30);
  const prev7Avg = mean(prev7);
  const trend14 = avg7 - prev7Avg;
  const vol30 = std(last30, avg30);
  const entries14 = ent14.reduce((acc, v) => acc + Number(v || 0), 0);
  const exits14 = rangeSum(exits, i - 13, i);
  const daysCover = safeDiv(stockAtAnchor, Math.max(avg7, 0.1), 9999);
  const seuil = Number(product.seuil_minimum || 0);
  const stockRatio = safeDiv(stockAtAnchor, Math.max(seuil, 1), 0);

  let daysSinceLastEntry = 999;
  for (let k = i; k >= 0; k -= 1) {
    if (Number(entries[k] || 0) > 0) {
      daysSinceLastEntry = i - k;
      break;
    }
  }

  return {
    product_id: pid,
    date_anchor: dates[i],
    product_code: product.code_product,
    product_name: product.name,
    family: product.family,
    stock_anchor: Number(stockAtAnchor.toFixed(4)),
    seuil_minimum: seuil,
    avg_exit_7d: Number(avg7.toFixed(4)),
    avg_exit_30d: Number(avg30.toFixed(4)),
    trend_exit_14d: Number(trend14.toFixed(4)),
    volatility_exit_30d: Number(vol30.toFixed(4)),
    entries_14d: Number(entries14.toFixed(4)),
    exits_14d: Number(exits14.toFixed(4)),
    days_since_last_entry: daysSinceLastEntry,
    stock_to_threshold_ratio: Number(stockRatio.toFixed(4)),
    days_cover_estimate: Number(daysCover.toFixed(4)),
    supplier_lead_time_days: Number(ctx.supplierLeadTimeByProduct.get(pid) || 0),
    current_stock: Number(product.quantity_current || 0),
  };
}

function buildDatasetRowsForProduct(ctx, pid, maxLookbackDays) {
  const series = ctx.dailySeriesByProduct.get(pid);
  if (!series) return { stockoutRows: [], consumptionRows: [] };
  const { dates, entries, exits } = series;
  const product = ctx.productsById.get(pid);
  if (!product) return { stockoutRows: [], consumptionRows: [] };

  const start = Math.max(30, dates.length - maxLookbackDays);
  const lastIdxFor7 = dates.length - 8;
  const lastIdxFor14 = dates.length - 15;
  if (start > lastIdxFor7) return { stockoutRows: [], consumptionRows: [] };

  const stockoutRows = [];
  const consumptionRows = [];

  for (let i = start; i <= lastIdxFor7; i += 1) {
    const base = buildRecentFeatures(ctx, pid, i);
    if (!base) continue;
    const futureEntries7 = rangeSum(entries, i + 1, i + 7);
    const futureExits7 = rangeSum(exits, i + 1, i + 7);
    const stockEnd7 = base.stock_anchor + futureEntries7 - futureExits7;
    const ruptureLabel = stockEnd7 <= Number(product.seuil_minimum || 0) ? 1 : 0;
    stockoutRows.push({
      ...base,
      target_stockout_j7: ruptureLabel,
      target_future_exit_7d: Number(futureExits7.toFixed(4)),
      target_future_exit_14d: Number(rangeSum(exits, i + 1, i + 14).toFixed(4)),
      data_source: 'real',
    });
  }

  if (start <= lastIdxFor14) {
    for (let i = start; i <= lastIdxFor14; i += 1) {
      const base = buildRecentFeatures(ctx, pid, i);
      if (!base) continue;
      const futureExits7 = rangeSum(exits, i + 1, i + 7);
      const futureExits14 = rangeSum(exits, i + 1, i + 14);
      consumptionRows.push({
        ...base,
        target_consommation_7d: Number(futureExits7.toFixed(4)),
        target_consommation_14d: Number(futureExits14.toFixed(4)),
        data_source: 'real',
      });
    }
  }

  return { stockoutRows, consumptionRows };
}

function generateSyntheticFallbackRows(ctx) {
  const stockoutRows = [];
  const consumptionRows = [];
  const now = new Date();
  const products = ctx.products.length ? ctx.products : [{
    _id: 'synthetic-1',
    code_product: 'SYN-001',
    name: 'Produit Synthetic 1',
    family: 'economat',
    quantity_current: 120,
    seuil_minimum: 20,
  }];

  for (const p of products) {
    const pid = String(p._id);
    const seuil = Number(p.seuil_minimum || 10);
    const supplierLeadTime = Number(ctx.supplierLeadTimeByProduct.get(pid) || 7);
    for (let i = 0; i < 90; i += 1) {
      const phase = i / 10;
      const avg7 = Math.max(0.1, 4 + Math.sin(phase) * 2 + (i % 5) * 0.2);
      const avg30 = Math.max(0.1, avg7 * (0.85 + (i % 4) * 0.05));
      const trend = Number((avg7 - avg30).toFixed(4));
      const vol = Number((Math.max(0.1, avg7 * 0.35)).toFixed(4));
      const entries14 = Number((20 + (i % 6) * 5).toFixed(4));
      const exits14 = Number((avg7 * 14).toFixed(4));
      const stockAnchor = Number((seuil * 1.2 + avg7 * (5 + (i % 12))).toFixed(4));
      const daysCover = safeDiv(stockAnchor, Math.max(avg7, 0.1), 9999);
      const stockRatio = safeDiv(stockAnchor, Math.max(seuil, 1), 0);
      const target7 = Number((avg7 * 7 + Math.max(0, trend) * 1.5).toFixed(4));
      const target14 = Number((avg7 * 14 + Math.max(0, trend) * 3).toFixed(4));
      const label = stockAnchor - target7 <= seuil ? 1 : 0;
      const base = {
        product_id: pid,
        date_anchor: dayKey(addDays(now, -120 + i)),
        product_code: p.code_product || `SYN-${String(i + 1).padStart(3, '0')}`,
        product_name: p.name || `Produit Synthetic ${i + 1}`,
        family: p.family || 'economat',
        stock_anchor: stockAnchor,
        seuil_minimum: seuil,
        avg_exit_7d: Number(avg7.toFixed(4)),
        avg_exit_30d: Number(avg30.toFixed(4)),
        trend_exit_14d: trend,
        volatility_exit_30d: vol,
        entries_14d: entries14,
        exits_14d: exits14,
        days_since_last_entry: i % 18,
        stock_to_threshold_ratio: Number(stockRatio.toFixed(4)),
        days_cover_estimate: Number(daysCover.toFixed(4)),
        supplier_lead_time_days: supplierLeadTime,
        current_stock: Number(p.quantity_current || 0),
      };
      stockoutRows.push({
        ...base,
        target_stockout_j7: label,
        target_future_exit_7d: target7,
        target_future_exit_14d: target14,
        data_source: 'synthetic',
      });
      consumptionRows.push({
        ...base,
        target_consommation_7d: target7,
        target_consommation_14d: target14,
        data_source: 'synthetic',
      });
    }
  }
  return { stockoutRows, consumptionRows };
}

function buildPredictionItems(ctx, productIds = null) {
  const productFilter = Array.isArray(productIds) ? new Set(productIds.map(String)) : null;
  const items = [];
  for (const p of ctx.products) {
    const pid = String(p._id);
    if (productFilter && !productFilter.has(pid)) continue;
    const series = ctx.dailySeriesByProduct.get(pid);
    if (!series || !series.dates.length) continue;
    const features = buildRecentFeatures(ctx, pid, series.dates.length - 1);
    if (!features) continue;
    items.push(features);
  }
  return items;
}

async function trainAndBuildDatasets(options = {}) {
  const lookbackDays = Math.min(730, asPositiveInt(options.lookback_days, 240));
  const ctx = await buildAIContext();

  const stockoutRows = [];
  const consumptionRows = [];
  for (const p of ctx.products) {
    const pid = String(p._id);
    const rows = buildDatasetRowsForProduct(ctx, pid, lookbackDays);
    stockoutRows.push(...rows.stockoutRows);
    consumptionRows.push(...rows.consumptionRows);
  }

  const initiallyHadRealData = stockoutRows.length > 0 && consumptionRows.length > 0;
  if (!stockoutRows.length || !consumptionRows.length) {
    const synthetic = generateSyntheticFallbackRows(ctx);
    if (!stockoutRows.length) stockoutRows.push(...synthetic.stockoutRows);
    if (!consumptionRows.length) consumptionRows.push(...synthetic.consumptionRows);
  }

  fs.mkdirSync(AI_DATA_DIR, { recursive: true });
  const now = new Date();
  const versionTag = makeVersionTag(now);
  const trainResult = runPythonScript('train_all.py', {
    version_tag: versionTag,
    base_dir: AI_DATA_DIR,
    stockout_rows: stockoutRows,
    consumption_rows: consumptionRows,
    split_ratio: 0.8,
  });

  const metrics = {
    generated_at: now.toISOString(),
    ...(trainResult?.metrics || {}),
  };
  const backtesting = {
    generated_at: now.toISOString(),
    ...(trainResult?.backtesting || {}),
  };

  const realStockoutRows = stockoutRows.filter((r) => r.data_source === 'real').length;
  const realConsumptionRows = consumptionRows.filter((r) => r.data_source === 'real').length;
  const builtCounts = trainResult?.counts || {};
  const builtQuality = trainResult?.quality || {};

  const registry = {
    trained_at: now.toISOString(),
    model_version: versionTag,
    lookback_days: lookbackDays,
    model_files: {
      build_features: 'ai_py/00_build_features.py',
      stockout: 'ai_py/02_stockout_risk_classifier.py',
      consumption: 'ai_py/01_consumption_forecast.py',
      anomaly: 'ai_py/03_anomaly_detector.py',
      adaptive_threshold: 'ai_py/04_adaptive_threshold_model.py',
      behavioral_classification: 'ai_py/05_behavioral_classification.py',
      operational_intelligence: 'ai_py/06_operational_intelligence_score.py',
      copilot: 'ai_py/07_copilot_decision_engine.py',
      orchestrator: 'ai_py/train_all.py',
      chatbot: 'ai_py/chatbot_responsable.py',
    },
    models: {
      stockout_risk_classifier_v1: {
        type: 'classification',
        language: 'python',
        algorithm: 'heuristic_classifier_python',
        train_rows: stockoutRows.length,
      },
      consumption_forecast_v1: {
        type: 'regression',
        language: 'python',
        algorithm: 'weighted_trend_regression_python',
        train_rows: consumptionRows.length,
      },
      anomaly_detector_v1: {
        type: 'anomaly_detection',
        language: 'python',
        algorithm: 'heuristic_anomaly_detector_python',
        train_rows: Number(builtCounts.anomaly_rows || stockoutRows.length),
      },
      adaptive_threshold_v1: {
        type: 'hybrid',
        language: 'python',
        algorithm: 'formula_data_hybrid_python',
        train_rows: Number(builtCounts.adaptive_rows || stockoutRows.length),
      },
      behavioral_classification_v1: {
        type: 'classification',
        language: 'python',
        algorithm: 'behavioral_scoring_classifier_python',
        train_rows: Number(builtCounts.adaptive_rows || stockoutRows.length),
      },
      operational_intelligence_score_v1: {
        type: 'scoring',
        language: 'python',
        algorithm: 'composite_operational_score_python',
        train_rows: Number(builtCounts.adaptive_rows || stockoutRows.length),
      },
      copilot_decision_engine_v1: {
        type: 'decision_engine',
        language: 'python',
        algorithm: 'hybrid_rules_plus_models_python',
        train_rows: Number(builtCounts.stockout_rows || stockoutRows.length),
      },
    },
    datasets: trainResult?.files || {},
    stats: {
      products_count: ctx.products.length,
      stockout_rows: Number(builtCounts.stockout_rows || stockoutRows.length),
      consumption_rows: Number(builtCounts.consumption_rows || consumptionRows.length),
      adaptive_rows: Number(builtCounts.adaptive_rows || stockoutRows.length),
      anomaly_rows: Number(builtCounts.anomaly_rows || stockoutRows.length),
      stockout_real_rows: realStockoutRows,
      consumption_real_rows: realConsumptionRows,
      synthetic_fallback_used: !initiallyHadRealData,
    },
    data_quality: {
      real_ratio_stockout: Number((
        Number.isFinite(Number(builtQuality.real_ratio_stockout))
          ? Number(builtQuality.real_ratio_stockout)
          : safeDiv(realStockoutRows, Math.max(1, stockoutRows.length), 0)
      ).toFixed(4)),
      real_ratio_consumption: Number((
        Number.isFinite(Number(builtQuality.real_ratio_consumption))
          ? Number(builtQuality.real_ratio_consumption)
          : safeDiv(realConsumptionRows, Math.max(1, consumptionRows.length), 0)
      ).toFixed(4)),
      recommendation: String(
        builtQuality.recommendation
        || ((!initiallyHadRealData || realStockoutRows < 200 || realConsumptionRows < 200)
          ? 'Collecter plus de mouvements reels pour fiabiliser les modeles.'
          : 'Qualite data acceptable.')
      ),
    },
  };

  return { registry, files: trainResult?.files || {}, metrics, backtesting };
}

async function predictStockout(options = {}) {
  const horizonDays = Math.min(30, asPositiveInt(options.horizon_days, 7));
  const key = makeCacheKey('predict_stockout', { horizon_days: horizonDays, product_ids: options.product_ids || null });
  return cachedAsync(key, async () => {
    const ctx = await buildAIContext();
    const items = buildPredictionItems(ctx, options.product_ids);
    try {
      const result = runPythonScript('02_stockout_risk_classifier.py', {
        mode: 'predict',
        horizon_days: horizonDays,
        items,
      });
      return Array.isArray(result.predictions) ? result.predictions : [];
    } catch (_) {
      return fallbackPredictStockout(items, horizonDays);
    }
  });
}

async function predictConsumption(options = {}) {
  const horizonDays = Math.min(30, asPositiveInt(options.horizon_days, 14));
  const key = makeCacheKey('predict_consumption', { horizon_days: horizonDays, product_ids: options.product_ids || null });
  return cachedAsync(key, async () => {
    const ctx = await buildAIContext();
    const items = buildPredictionItems(ctx, options.product_ids);
    try {
      const result = runPythonScript('01_consumption_forecast.py', {
        mode: 'predict',
        horizon_days: horizonDays,
        items,
      });
      return Array.isArray(result.predictions) ? result.predictions : [];
    } catch (_) {
      return fallbackPredictConsumption(items, horizonDays);
    }
  });
}

async function predictAnomaly(options = {}) {
  const key = makeCacheKey('predict_anomaly', { product_ids: options.product_ids || null });
  return cachedAsync(key, async () => {
    const ctx = await buildAIContext();
    const items = buildPredictionItems(ctx, options.product_ids);
    try {
      const result = runPythonScript('03_anomaly_detector.py', {
        mode: 'predict',
        items,
      });
      return Array.isArray(result.predictions) ? result.predictions : [];
    } catch (_) {
      return fallbackPredictAnomaly(items);
    }
  });
}

async function buildCopilotRecommendations(options = {}) {
  const horizonDays = Math.min(30, asPositiveInt(options.horizon_days, 14));
  const topN = Math.min(20, asPositiveInt(options.top_n, 10));
  const simulations = Array.isArray(options.simulations) ? options.simulations : [];
  const includeConsumption = options.include_consumption !== false;

  const cacheKey = makeCacheKey('copilot_reco', {
    horizon_days: horizonDays,
    top_n: topN,
    include_consumption: includeConsumption,
    simulations,
  });
  const cached = getCache(cacheKey);
  if (cached !== null) return cached;

  const ctx = await buildAIContext();
  const items = buildPredictionItems(ctx);

  let stockout = [];
  let consumption = [];
  let anomalies = [];
  let pythonSignals = null;

  try {
    stockout = runPythonScript('02_stockout_risk_classifier.py', {
      mode: 'predict',
      horizon_days: horizonDays,
      items,
    }).predictions || [];
    consumption = includeConsumption
      ? (runPythonScript('01_consumption_forecast.py', {
        mode: 'predict',
        horizon_days: horizonDays,
        items,
      }).predictions || [])
      : [];
    anomalies = runPythonScript('03_anomaly_detector.py', {
      mode: 'predict',
      items,
    }).predictions || [];

    const adaptiveThreshold = runPythonScript('04_adaptive_threshold_model.py', {
      mode: 'predict',
      items,
    }).predictions || [];
    const behavior = runPythonScript('05_behavioral_classification.py', {
      mode: 'predict',
      items,
    }).predictions || [];
    const intelligence = runPythonScript('06_operational_intelligence_score.py', {
      mode: 'predict',
      items,
      stockout_predictions: stockout,
      anomaly_predictions: anomalies,
      behavior_predictions: behavior,
    });

    pythonSignals = { adaptiveThreshold, behavior, intelligence };
  } catch (_) {
    stockout = fallbackPredictStockout(items, horizonDays);
    consumption = includeConsumption ? fallbackPredictConsumption(items, horizonDays) : [];
    anomalies = fallbackPredictAnomaly(items);
  }

  const curves = [];
  const consumptionByPid = new Map(consumption.map((x) => [String(x.product_id), x]));
  const topForCurves = [...stockout]
    .sort((a, b) => Number(b.risk_probability || 0) - Number(a.risk_probability || 0))
    .slice(0, topN);
  const maxCurveCount = Math.min(10, Math.max(5, topN));
  for (const x of topForCurves.slice(0, maxCurveCount)) {
    const series = ctx.dailySeriesByProduct.get(String(x.product_id));
    if (!series) continue;
    const n = series.dates.length;
    const start = Math.max(0, n - 30);
    const labels = series.dates.slice(start, n);
    const historyExit = series.exits.slice(start, n).map((v) => Number(v || 0));
    const c = consumptionByPid.get(String(x.product_id));
    const dailyValueRaw = Number.isFinite(Number(c?.expected_daily))
      ? Number(c.expected_daily)
      : Number(Number(x?.expected_need || 0) / Math.max(1, horizonDays));
    const dailyValue = Number.isFinite(dailyValueRaw) ? dailyValueRaw : 0;
    const daily = Number(dailyValue.toFixed(4));
    const forecastLabels = [];
    const forecastValues = [];
    const lastDate = new Date(`${series.dates[n - 1]}T00:00:00.000Z`);
    for (let i = 1; i <= 14; i += 1) {
      forecastLabels.push(dayKey(addDays(lastDate, i)));
      forecastValues.push(daily);
    }
    curves.push({
      product_id: x.product_id,
      code_product: x.code_product,
      product_name: x.product_name,
      history_30d: { labels, values: historyExit },
      forecast_14d: { labels: forecastLabels, values: forecastValues },
    });
  }

  if (pythonSignals) {
    const response = runPythonScript('07_copilot_decision_engine.py', {
      generated_at: new Date().toISOString(),
      horizon_days: horizonDays,
      top_n: topN,
      stockout_predictions: stockout,
      consumption_predictions: consumption,
      anomaly_predictions: anomalies,
      adaptive_threshold_predictions: pythonSignals.adaptiveThreshold,
      behavior_predictions: pythonSignals.behavior,
      intelligence_scores: pythonSignals.intelligence,
      simulations,
      model_switches: {
        consumption_enabled: includeConsumption,
      },
      dashboard_curves: curves,
    });
    setCache(cacheKey, response);
    return response;
  }

  const consumptionMap = new Map(consumption.map((x) => [String(x.product_id), x]));
  const anomalyMap = new Map(anomalies.map((x) => [String(x.product_id), x]));

  const merged = stockout.map((row) => {
    const pid = String(row?.product_id || '');
    const c = consumptionMap.get(pid) || {};
    const a = anomalyMap.get(pid) || {};

    const risk = Number(row?.risk_probability || 0);
    const anomalyScore = Number(a?.anomaly_score || 0);
    const daysCover = Number(row?.days_cover_estimate || 9999);
    const expectedNeed = Number.isFinite(Number(c?.expected_quantity))
      ? Number(c.expected_quantity)
      : Number(row?.expected_need || 0);
    const stockAnchor = Number(row?.current_stock || 0);
    const threshold = Number(row?.seuil_minimum || 0);
    const recommendedThreshold = threshold;
    const baseReco = Math.round(Number(row?.recommended_order_qty || 0));
    const thresholdReco = Math.round(Math.max(0, recommendedThreshold - stockAnchor));
    const quantityReco = Math.max(baseReco, thresholdReco);

    const explanationParts = [];
    const factors = Array.isArray(row?.factors) ? row.factors : [];
    if (factors.length) explanationParts.push(factors.slice(0, 2).map(String).join(', '));
    if (a?.reason) explanationParts.push(String(a.reason));
    if (!explanationParts.length) explanationParts.push('risque calcule (mode local)');

    return {
      ...row,
      risk_probability: Number(risk.toFixed(3)),
      risk_level: riskLevelFromRisk(risk),
      anomaly_score: Number(anomalyScore.toFixed(3)),
      behavior_class: 'Stable',
      recommended_threshold: Number(recommendedThreshold.toFixed(3)),
      expected_need: Number(expectedNeed.toFixed(3)),
      recommended_order_qty: quantityReco,
      urgency: urgencyFromSignals(risk, daysCover, anomalyScore),
      operational_intelligence_score: 0,
      explanation: explanationParts.join(' + '),
    };
  });

  merged.sort((a, b) => {
    const r = Number(b.risk_probability || 0) - Number(a.risk_probability || 0);
    if (r) return r;
    const an = Number(b.anomaly_score || 0) - Number(a.anomaly_score || 0);
    if (an) return an;
    return Number(b.recommended_order_qty || 0) - Number(a.recommended_order_qty || 0);
  });

  const top = merged.slice(0, topN);
  const actionPlan = top.map((item, idx) => ({
    rank: idx + 1,
    product_id: item.product_id,
    code_product: item.code_product,
    product_name: item.product_name,
    urgency: item.urgency,
    action: `Commander ${Number(item.recommended_order_qty || 0)} unite(s)`,
    why: item.explanation,
    risk_probability: item.risk_probability,
  }));

  const topMap = new Map(top.map((x) => [String(x.product_id), x]));
  const simulationResults = [];
  for (const sim of simulations) {
    const pid = String(sim?.product_id || '');
    const orderQty = Number(sim?.order_qty);
    if (!pid || !Number.isFinite(orderQty) || orderQty < 0) continue;

    const base = topMap.get(pid) || merged.find((x) => String(x.product_id) === pid);
    if (!base) continue;

    const riskBefore = Number(base.risk_probability || 0);
    const expectedNeedBase = Math.max(1, Number(base.expected_need || 1));
    const projectedStockBefore = Number(base.projected_stock_end || 0);
    const riskDrop = Math.min(90, safeDiv(orderQty, expectedNeedBase, 0) * 55);
    const riskAfter = clamp(riskBefore - riskDrop, 0, 100);

    simulationResults.push({
      product_id: pid,
      code_product: base.code_product,
      product_name: base.product_name,
      order_qty: Number(orderQty.toFixed(3)),
      risk_before_pct: Number(riskBefore.toFixed(3)),
      risk_after_pct: Number(riskAfter.toFixed(3)),
      projected_stock_end_before: Number(projectedStockBefore.toFixed(3)),
      projected_stock_end_after: Number((projectedStockBefore + orderQty).toFixed(3)),
    });
  }

  const heatmap = top.map((item) => ({
    product_id: item.product_id,
    product_name: item.product_name,
    risk_probability: item.risk_probability,
    anomaly_score: item.anomaly_score,
    behavior_class: item.behavior_class,
    color: Number(item.risk_probability || 0) >= 70 ? 'red' : Number(item.risk_probability || 0) >= 40 ? 'orange' : 'green',
  }));

  const response = {
    generated_at: new Date().toISOString(),
    horizon_days: horizonDays,
    top_risk_products: top,
    action_plan: actionPlan,
    simulations: simulationResults,
    heatmap_criticality: heatmap,
    operational_intelligence: {
      global_score: 0,
      global_level: 'A renforcer',
    },
    dashboard_curves: curves,
    model_switches: {
      consumption_enabled: includeConsumption,
    },
  };
  setCache(cacheKey, response);
  return response;
}

async function askResponsableAssistant(options = {}) {
  const question = String(options.question || '').trim();
  if (!question) return { answer: 'Question vide.' };

  const history = Array.isArray(options.history) ? options.history : [];
  const providedContext = options.context && typeof options.context === 'object' ? options.context : null;
  const useGemini = options.use_gemini !== false;
  const strictGemini = options.strict_gemini === true;
  const mode = String(options.mode || 'chat').toLowerCase() === 'report' ? 'report' : 'chat';

  let context = providedContext;
  if (!context) {
    const [stockout, consumption, anomalies, copilot] = await Promise.all([
      predictStockout({ horizon_days: 7 }),
      predictConsumption({ horizon_days: 14 }),
      predictAnomaly({}),
      buildCopilotRecommendations({ horizon_days: 14, top_n: 5, simulations: [] }),
    ]);
    context = {
      stockout_top: stockout.slice(0, 5),
      consumption_top: consumption.slice(0, 5),
      anomaly_top: anomalies.slice(0, 5),
      action_plan: Array.isArray(copilot?.action_plan) ? copilot.action_plan.slice(0, 5) : [],
      metrics: options.metrics || {},
    };
  }

  const geminiConfigured = isGeminiConfigured();
  const allowGemini = useGemini && geminiConfigured;

  const topItems = (arr, key, maxItems) => {
    if (!Array.isArray(arr)) return [];
    return [...arr]
      .sort((a, b) => Number(b?.[key] || 0) - Number(a?.[key] || 0))
      .slice(0, maxItems);
  };

  const pct = (v) => `${Number(v || 0).toFixed(1)}%`;
  const qty = (v) => String(Math.round(Number(v || 0)));

  const findFocusProduct = (q, stockoutTop) => {
    const query = String(q || '').toLowerCase().trim();
    if (!query) return null;
    for (const item of stockoutTop) {
      const name = String(item?.product_name || '').toLowerCase().trim();
      const code = String(item?.code_product || '').toLowerCase().trim();
      if ((name && query.includes(name)) || (code && query.includes(code))) return item;
    }
    return null;
  };

  const buildContextText = (ctx) => {
    const stockoutTop = topItems(ctx?.stockout_top, 'risk_probability', 7);
    const consumptionTop = topItems(ctx?.consumption_top, 'expected_quantity', 7);
    const anomalyTop = topItems(ctx?.anomaly_top, 'anomaly_score', 7);
    const actionPlan = Array.isArray(ctx?.action_plan) ? ctx.action_plan : [];
    const metrics = ctx && typeof ctx === 'object' && ctx.metrics && typeof ctx.metrics === 'object' ? ctx.metrics : {};

    const compact = {
      stockout_top: stockoutTop.map((x) => ({
        product_name: x.product_name,
        code_product: x.code_product,
        risk_probability: x.risk_probability,
        recommended_order_qty: x.recommended_order_qty,
        current_stock: x.current_stock,
        seuil_minimum: x.seuil_minimum,
        factors: Array.isArray(x.factors) ? x.factors : [],
        explanation: x.explanation || '',
      })),
      consumption_top: consumptionTop.map((x) => ({
        product_name: x.product_name,
        code_product: x.code_product,
        expected_quantity: x.expected_quantity,
        expected_daily: x.expected_daily,
      })),
      anomaly_top: anomalyTop.map((x) => ({
        product_name: x.product_name,
        anomaly_score: x.anomaly_score,
        risk_level: x.risk_level,
        reason: x.reason,
      })),
      action_plan: actionPlan.slice(0, 7),
      metrics,
    };

    return `CONTEXTE OPERATOIRE (donnees reelles + predictions):\n${JSON.stringify(compact, null, 2)}`;
  };

  const buildPriorityLines = (ctx, maxItems = 3) => {
    const stockoutTop = topItems(ctx?.stockout_top, 'risk_probability', maxItems);
    const lines = stockoutTop.map((item) => {
      const name = item?.product_name || item?.code_product || 'Produit';
      return `- ${name}: risque ${pct(item?.risk_probability)}, commande conseillee ${qty(item?.recommended_order_qty)} unite(s).`;
    });
    return lines.length ? lines : ['- Aucun produit critique detecte pour le moment.'];
  };

  const fallbackChatAnswer = async (q, ctx) => {
    const query = String(q || '').toLowerCase();
    const stockoutAll = Array.isArray(ctx?.stockout_top) ? ctx.stockout_top : [];
    const stockoutTop = topItems(stockoutAll, 'risk_probability', 5);
    const anomalyTop = topItems(ctx?.anomaly_top, 'anomaly_score', 5);
    const actionPlan = Array.isArray(ctx?.action_plan) ? ctx.action_plan : [];
    const metrics = ctx && typeof ctx === 'object' && ctx.metrics && typeof ctx.metrics === 'object' ? ctx.metrics : {};

    const normalize = (s) => String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const queryNorm = normalize(query);
    const isMostlyDots = queryNorm.replace(/[.\s]/g, '').length === 0;
    if (isMostlyDots) {
      return [
        'Je peux aider sur:',
        '- produits critiques (cette semaine)',
        '- pourquoi un produit est en alerte',
        '- plan de commande priorise',
        '- mini-rapport executif',
      ].join('\n');
    }

    const findInActionPlan = (rawQ) => {
      const qn = normalize(rawQ);
      if (!qn) return null;
      for (const step of actionPlan) {
        const candidates = [
          step?.product_name,
          step?.name,
          step?.product,
          step?.title,
          step?.code_product,
        ].map(normalize).filter(Boolean);
        if (candidates.some((c) => qn.includes(c))) return step;
      }
      return null;
    };

    const findInStockout = (rawQ) => {
      const qn = normalize(rawQ);
      if (!qn) return null;
      for (const item of stockoutAll) {
        const name = normalize(item?.product_name);
        const code = normalize(item?.code_product);
        if ((name && qn.includes(name)) || (code && qn.includes(code))) return item;
      }
      return null;
    };

    // If user explicitly asks for a 5-line summary, keep it short even in fallback mode.
    const wantsSummary = queryNorm.includes('resum') || queryNorm.includes('resume') || queryNorm.includes('synth');
    const wantsFiveLines = /\b5\b/.test(queryNorm) || queryNorm.includes('cinq') || queryNorm.includes('5 lignes');
    if (wantsSummary && wantsFiveLines) {
      const top = stockoutTop[0] || null;
      const topName = top?.product_name || top?.code_product || 'Aucun produit critique';
      const topRisk = top ? pct(top?.risk_probability) : '-';
      const topQty = top ? qty(top?.recommended_order_qty) : '0';
      const actions = actionPlan.slice(0, 2).map((step) => (
        `${step?.product_name || 'Produit'}: ${step?.action || 'Action'} (urgence ${step?.urgency || 'normale'})`
      ));
      while (actions.length < 2) actions.push('Aucune action urgente detectee.');

      return [
        `Critiques: ${stockoutTop.length}, Anomalies: ${anomalyTop.length}.`,
        `Priorite: ${topName} (risque ${topRisk}, commande ${topQty} u).`,
        `Action 1: ${actions[0]}.`,
        `Action 2: ${actions[1]}.`,
        `Prochaine etape: verifier stock physique + lancer commande si besoin.`,
      ].join('\n');
    }

    const wantsTopCritiques = queryNorm.includes('plus critique')
      || queryNorm.includes('plus critiques')
      || queryNorm.includes('top')
      || queryNorm.includes('priorite')
      || queryNorm.includes('critiques cette semaine')
      || queryNorm.includes('cette semaine');
    if (wantsTopCritiques) {
      const topList = stockoutTop.slice(0, 5);
      if (!topList.length && !actionPlan.length) {
        return 'Aucun produit critique detecte sur la periode recente.';
      }
      const lines = ['Top produits critiques (fallback):'];
      for (const item of topList) {
        const name = item?.product_name || item?.code_product || 'Produit';
        lines.push(`- ${name}: risque ${pct(item?.risk_probability)}, commande ${qty(item?.recommended_order_qty)} u.`);
      }
      if (actionPlan.length) {
        lines.push('', 'Actions immediates:');
        for (const step of actionPlan.slice(0, 3)) {
          lines.push(`- ${step?.product_name || 'Produit'}: ${step?.action || 'Action'} (urgence ${step?.urgency || 'normale'}).`);
        }
      }
      return lines.join('\n');
    }

    const askedPlanItem = findInActionPlan(q);
    const askedStockoutItem = findInStockout(q);
    const askedName = askedPlanItem?.product_name || askedStockoutItem?.product_name || null;

    const wantsWhy = queryNorm.includes('pourquoi') || queryNorm.includes('alerte') || queryNorm.includes('risque');
    if (wantsWhy && askedName) {
      const stockItem = askedStockoutItem || findFocusProduct(q, stockoutAll);
      if (stockItem) {
        const name = stockItem?.product_name || stockItem?.code_product || 'Produit';
        const factors = Array.isArray(stockItem?.factors) ? stockItem.factors : [];
        const why = factors.length
          ? factors.slice(0, 4).map(String).join(', ')
          : (stockItem?.explanation ? String(stockItem.explanation) : 'Signal combine (stock + tendance).');
        return [
          `Pourquoi "${name}" est en alerte:`,
          `- Risque estime: ${pct(stockItem?.risk_probability)}.`,
          `- Stock/seuil: ${qty(stockItem?.current_stock)} / ${qty(stockItem?.seuil_minimum)}.`,
          `- Facteurs: ${why}.`,
          `- Action: commander ${qty(stockItem?.recommended_order_qty)} unite(s) si besoin.`,
        ].join('\n');
      }

      // If the product is part of the action plan but not present in stockout_top,
      // we can still explain using the action_plan metadata (why/action/urgency).
      if (askedPlanItem) {
        const name = askedPlanItem?.product_name || askedPlanItem?.name || askedPlanItem?.code_product || askedName;
        const why = askedPlanItem?.why ? String(askedPlanItem.why) : 'Signal combine (stock + tendance).';
        return [
          `Pourquoi "${name}" est en alerte:`,
          `- Raison: ${why}.`,
          askedPlanItem?.risk_probability !== undefined ? `- Risque estime: ${pct(askedPlanItem.risk_probability)}.` : null,
          askedPlanItem?.urgency ? `- Urgence: ${String(askedPlanItem.urgency)}.` : null,
          askedPlanItem?.action ? `- Action: ${String(askedPlanItem.action)}.` : null,
        ].filter(Boolean).join('\n');
      }

      return [
        `Le produit "${askedName}" apparait dans le plan d'action, mais je n'ai pas assez de details chiffres dans le contexte pour expliquer precisement.`,
        `Action proposee: ${askedPlanItem?.action || 'Verifier et lancer une commande si necessaire'}.`,
        `Conseil: ouvrir la fiche produit (stock actuel, seuil, sorties) puis relancer la question.`,
      ].join('\n');
    }

    // "Pourquoi X ?" mais X n'est pas dans stockout_top: tente via action_plan (why) + consommation/anomalies.
    if (wantsWhy && !askedName) {
      const planItem = findInActionPlan(q);
      if (planItem) {
        const name = planItem?.product_name || planItem?.name || planItem?.code_product || 'Produit';
        const why = planItem?.why ? String(planItem.why) : 'Signal combine (stock + tendance).';
        return [
          `Pourquoi "${name}" est prioritaire:`,
          `- Raison: ${why}.`,
          planItem?.risk_probability !== undefined ? `- Risque estime: ${pct(planItem.risk_probability)}.` : null,
          planItem?.action ? `- Action: ${String(planItem.action)}.` : null,
        ].filter(Boolean).join('\n');
      }

      const lookup = await findProductSnapshotByQuestion(q);
      if (lookup?.product) {
        const p = lookup.product;
        const a = lookup.alert;
        return [
          `Pourquoi "${p.name || p.code_product || 'Produit'}" est en alerte:`,
          `- Stock/seuil: ${qty(p.quantity_current)} / ${qty(p.seuil_minimum)}.`,
          a?.message ? `- Signal: ${String(a.message)}` : '- Signal: baisse de stock ou sortie anormale.',
          `- Statut: ${p.status || '-'}.`,
          `- Action: verifier stock physique + lancer commande si besoin.`,
        ].join('\n');
      }
      return 'Pour expliquer une alerte, indique le nom exact du produit (ex: "Pourquoi Câble électrique ?").';
    }

    const focus = findFocusProduct(q, stockoutTop) || (stockoutTop[0] || null);
    const lines = ['Je te fais un point clair et actionnable.'];

    if (query.includes('anomal')) {
      if (anomalyTop.length) {
        const top = anomalyTop[0];
        lines.push(`Anomalie principale: ${top.product_name || 'Produit'} (${pct(top.anomaly_score)}).`);
        if (top.reason) lines.push(`Cause probable: ${top.reason}.`);
      } else {
        lines.push('Aucune anomalie forte detectee sur la periode recente.');
      }
    } else if (query.includes('metri') || query.includes('modele') || query.includes('qualite')) {
      const st = metrics?.stockout_j7 || {};
      const co = metrics?.consumption_j14 || {};
      lines.push(
        `Fiabilite actuelle: Rupture F1=${st?.f1 ?? '-'}, AUC=${st?.auc ?? '-'}; Conso MAE=${co?.mae ?? '-'}, MAPE=${co?.mape ?? '-'}%.`
      );
    } else if (wantsSummary) {
      lines.push(`Critiques: ${stockoutTop.length}, Anomalies: ${anomalyTop.length}.`);
      const top = stockoutTop[0];
      if (top) {
        lines.push(`Priorite: ${top.product_name || 'Produit'} (risque ${pct(top.risk_probability)}).`);
      } else {
        lines.push('Priorite: aucune urgence forte detectee.');
      }
    } else if (focus) {
      lines.push(`Produit prioritaire: ${focus.product_name || 'Produit'} (${pct(focus.risk_probability)}).`);
      const factors = Array.isArray(focus.factors) ? focus.factors : [];
      if (factors.length) lines.push(`Pourquoi: ${factors.slice(0, 3).map(String).join(', ')}.`);
      else if (focus.explanation) lines.push(`Pourquoi: ${focus.explanation}.`);
    } else {
      lines.push('Aucun signal critique detecte pour le moment.');
    }

    lines.push('', 'Actions immediates:');
    if (actionPlan.length) {
      for (const step of actionPlan.slice(0, 3)) {
        lines.push(`- ${step?.product_name || 'Produit'}: ${step?.action || 'Action'} (urgence ${step?.urgency || 'normale'}).`);
      }
    } else {
      for (const fallbackLine of buildPriorityLines(ctx, 3)) lines.push(fallbackLine);
    }

    lines.push('', 'Si tu veux, je peux aussi te generer un mini-rapport exportable maintenant.');
    return lines.join('\n');
  };

  const fallbackReportAnswer = (q, ctx) => {
    const now = `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;
    const stockoutTop = topItems(ctx?.stockout_top, 'risk_probability', 5);
    const anomalyTop = topItems(ctx?.anomaly_top, 'anomaly_score', 3);
    const actionPlan = Array.isArray(ctx?.action_plan) ? ctx.action_plan : [];
    const metrics = ctx && typeof ctx === 'object' && ctx.metrics && typeof ctx.metrics === 'object' ? ctx.metrics : {};
    const st = metrics?.stockout_j7 || {};
    const co = metrics?.consumption_j14 || {};

    const lines = [
      `# Mini-rapport stock (${now})`,
      '',
      '## Resume executif',
    ];

    if (stockoutTop.length) {
      const top = stockoutTop[0];
      lines.push(`- Priorite la plus critique: ${top.product_name || 'Produit'} avec un risque de ${pct(top.risk_probability)}.`);
    } else {
      lines.push('- Aucun produit critique detecte a cet instant.');
    }

    lines.push('', '## Top priorites');
    for (const item of stockoutTop.slice(0, 5)) {
      const name = item?.product_name || item?.code_product || 'Produit';
      lines.push(`- ${name}: risque ${pct(item.risk_probability)}, commande recommandee ${qty(item.recommended_order_qty)} unite(s).`);
    }
    if (!stockoutTop.length) lines.push('- Aucune priorite a forte criticite.');

    lines.push('', '## Actions recommandees (24h)');
    if (actionPlan.length) {
      for (const step of actionPlan.slice(0, 5)) {
        lines.push(`- ${step?.product_name || 'Produit'}: ${step?.action || 'Action'} (urgence ${step?.urgency || 'normale'}).`);
      }
    } else {
      lines.push(
        '- Verifier le stock physique des references critiques.',
        '- Lancer les commandes sur les produits a risque eleve.',
        '- Relancer la prediction apres toute entree importante.'
      );
    }

    lines.push(
      '',
      '## Qualite modele',
      `- Rupture J+7: F1=${st?.f1 ?? '-'}, AUC=${st?.auc ?? '-'}`,
      `- Consommation J+14: MAE=${co?.mae ?? '-'}, MAPE=${co?.mape ?? '-'}%`
    );

    if (anomalyTop.length) {
      lines.push('', '## Anomalies a surveiller');
      for (const item of anomalyTop) {
        lines.push(`- ${item?.product_name || 'Produit'}: score ${pct(item?.anomaly_score)} (niveau ${item?.risk_level || '-'}).`);
      }
    }

    lines.push('', '## Note', '- Ce rapport est genere automatiquement a partir des predictions et historiques disponibles.');
    return lines.join('\n');
  };

  const contextText = buildContextText(context);

  const normalizedQuestion = question.toLowerCase();
  const wantsFiveLines =
    (normalizedQuestion.includes('resume') || normalizedQuestion.includes('résume') || normalizedQuestion.includes('resum'))
    && (normalizedQuestion.includes('5') || normalizedQuestion.includes('cinq') || normalizedQuestion.includes('5 lignes'));
  const wantsWhy =
    normalizedQuestion.includes('pourquoi')
    || normalizedQuestion.includes('raison')
    || normalizedQuestion.includes('alerte')
    || normalizedQuestion.includes('risque');
  const wantsTop =
    normalizedQuestion.includes('plus critique')
    || normalizedQuestion.includes('plus critiques')
    || normalizedQuestion.includes('cette semaine')
    || normalizedQuestion.includes('top')
    || normalizedQuestion.includes('priorite')
    || normalizedQuestion.includes('priorité');

  const modeInstruction = mode === 'report'
    ? 'MODE=REPORT. Produis un mini-rapport markdown structure, concret, avec sections et puces.'
    : [
      'MODE=CHAT. Reponds de maniere conversationnelle, concise et utile.',
      'Regle prioritaire: repondre EXACTEMENT a la question de l’utilisateur (ne pas sortir un mini-rapport generique si on te demande "pourquoi").',
      wantsFiveLines ? 'Contrainte: repondre en exactement 5 lignes, pas plus.' : null,
      wantsWhy ? 'Si la question est un "pourquoi", explique SPECIFIQUEMENT le produit/alerte demande(e) en 4-6 puces max (cause, indicateurs, action immediate, controle).' : null,
      wantsTop ? 'Si la question demande les plus critiques, liste 3-5 produits max avec risque + action.' : null,
    ].filter(Boolean).join(' ');

  const prompt = `${modeInstruction}\n\n${contextText}\n\nQuestion utilisateur:\n${question}`;
  const systemInstruction = mode === 'report'
    ? [
      'Tu es un copilote stock pour un responsable. Tu rediges des mini-rapports executifs en francais.',
      'Contraintes: format markdown, sections courtes, actions priorisees, chiffres du contexte uniquement, pas de blabla, pas d’invention.',
    ].join(' ')
    : [
      'Tu es un assistant stock conversationnel en francais.',
      'Tu parles de facon naturelle, claire, professionnelle et humaine.',
      'Toujours: repondre a la question precise avant d’ajouter des recommandations.',
      'Si l’utilisateur pose un "pourquoi" sur un produit, reponds SPECIFIQUEMENT sur ce produit.',
      'Si l’utilisateur demande un resume (ex: "en 5 lignes"), respecte strictement la contrainte de longueur.',
      'Ne jamais inventer des donnees absentes du contexte.',
      'Tu as acces a des outils (lecture seule) pour interroger le stock et les alertes. Utilise-les si ca aide a repondre avec des chiffres reels.',
    ].join(' ');

  try {
    if (!allowGemini) throw new Error('Gemini disabled');

    try {
      return await runGeminiAgent({
        question,
        history,
        system_instruction: systemInstruction,
        mode,
        context,
      });
    } catch (agentErr) {
      const result = await generateGeminiContent({
        prompt,
        history,
        system_instruction: systemInstruction,
        temperature: mode === 'report' ? 0.25 : 0.45,
        max_output_tokens: mode === 'report' ? 1600 : 1100,
      });

      const text = String(result?.text || '').trim();
      if (!text) throw new Error(`Empty Gemini response: ${agentErr?.message || 'agent_failed'}`);
      return { answer: text, source: 'gemini', mode };
    }
  } catch (err) {
    if (allowGemini && strictGemini) {
      const e = new Error('Gemini call failed');
      e.code = 'GEMINI_ERROR';
      e.details = String(err?.message || err).slice(0, 1200);
      throw e;
    }
    const answer = mode === 'report'
      ? fallbackReportAnswer(question, context)
      : await fallbackChatAnswer(question, context);
    return { answer, source: 'fallback', mode };
  }
}

module.exports = {
  trainAndBuildDatasets,
  predictStockout,
  predictConsumption,
  predictAnomaly,
  buildCopilotRecommendations,
  askResponsableAssistant,
  makeVersionTag,
  getPythonRuntimeStatus,
};
