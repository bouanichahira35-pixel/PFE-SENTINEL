const router = require('express').Router();
const AIAlert = require('../models/AIAlert');
const AIPrediction = require('../models/AIPrediction');
const AppSetting = require('../models/AppSetting');
const AIRecommendationTrace = require('../models/AIRecommendationTrace');
const AIAssistantTrace = require('../models/AIAssistantTrace');
const DecisionResolution = require('../models/DecisionResolution');
const DecisionAssignment = require('../models/DecisionAssignment');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Request = require('../models/Request');
const Supplier = require('../models/Supplier');
const PurchaseOrder = require('../models/PurchaseOrder');
const Notification = require('../models/Notification');
const History = require('../models/History');
const User = require('../models/User');
const requireAuth = require('../middlewares/requireAuth');
const strictBody = require('../middlewares/strictBody');
const { isGeminiConfigured, generateGeminiContent, transcribeGeminiAudio } = require('../services/geminiService');
const {
  trainAndBuildDatasets,
  predictStockout,
  predictConsumption,
  predictAnomaly,
  buildCopilotRecommendations,
  askResponsableAssistant,
  getPythonRuntimeStatus,
} = require('../services/aiModelService');
const { rebuildAiAlerts } = require('../services/alertService');

const AI_SETTINGS_DEFAULT = Object.freeze({
  predictionsEnabled: true,
  alertesAuto: true,
  analyseConsommation: true,
});

const IS_PROD = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';

function shouldExposeDiagnostics(req) {
  const debug = String(req?.query?.debug || '').trim() === '1';
  if (!debug) return false;
  if (!IS_PROD) return true;
  return String(process.env.EXPOSE_DIAGNOSTICS || '').trim().toLowerCase() === 'true';
}

function asPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

async function getSettingValue(key, fallback = null) {
  const item = await AppSetting.findOne({ setting_key: key }).lean();
  return item?.setting_value ?? fallback;
}

async function getAiConfig() {
  const cfg = await getSettingValue('ai_config', AI_SETTINGS_DEFAULT);
  return {
    predictionsEnabled: cfg?.predictionsEnabled !== false,
    alertesAuto: cfg?.alertesAuto !== false,
    analyseConsommation: cfg?.analyseConsommation !== false,
  };
}

async function setSettingValue(key, value, userId = null) {
  return AppSetting.findOneAndUpdate(
    { setting_key: key },
    { $set: { setting_value: value, updated_by: userId || undefined } },
    { returnDocument: 'after', upsert: true }
  );
}

async function getGovernance() {
  const cfg = await getSettingValue('ai_governance_v2', null);
  return {
    min_training_interval_minutes: Number(cfg?.min_training_interval_minutes || 360),
    auto_training_enabled: cfg?.auto_training_enabled !== false,
    auto_training_every_minutes: Number(cfg?.auto_training_every_minutes || 360),
    max_versions_kept: Number(cfg?.max_versions_kept || 20),
  };
}

async function appendVersionSnapshot(registry, metrics, backtesting, userId) {
  const governance = await getGovernance();
  const history = await getSettingValue('ai_model_versions_v2', []);
  const next = [
    {
      model_version: registry.model_version,
      trained_at: registry.trained_at,
      datasets: registry.datasets,
      data_quality: registry.data_quality,
      metrics,
      backtesting_summary: {
        stockout_f1: metrics?.stockout_j7?.f1 ?? null,
        stockout_auc: metrics?.stockout_j7?.auc ?? null,
        consumption_mae: metrics?.consumption_j14?.mae ?? null,
        consumption_mape: metrics?.consumption_j14?.mape ?? null,
      },
    },
    ...(Array.isArray(history) ? history : []),
  ].slice(0, Math.max(5, governance.max_versions_kept));
  await setSettingValue('ai_model_versions_v2', next, userId);
}

function ensureResponsable(req, res) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role !== 'responsable' && role !== 'admin') {
    res.status(403).json({ error: 'Acces refuse (responsable/admin uniquement)' });
    return false;
  }
  return true;
}

function ensureAdmin(req, res) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role !== 'admin') {
    res.status(403).json({ error: 'Acces refuse (admin uniquement)' });
    return false;
  }
  return true;
}

function ensureAiPredictionsEnabled(config, res) {
  if (config?.predictionsEnabled !== false) return true;
  res.status(409).json({
    error: 'Predictions IA desactivees',
    details: 'Activez "Predictions de rupture" dans Parametres > Intelligence Artificielle.',
  });
  return false;
}

function tokenize(value) {
  const raw = String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  if (!raw) return [];
  return raw
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 60);
}

function scoreCategoryMatch({ productName, productDescription, family }, category) {
  const productTokens = new Set([
    ...tokenize(productName),
    ...tokenize(productDescription),
  ]);
  const categoryTokens = new Set([
    ...tokenize(category?.name),
    ...tokenize(category?.description),
  ]);

  let score = 0;
  for (const token of productTokens) {
    if (categoryTokens.has(token)) score += 2;
  }

  // Small bias on family keywords.
  const fam = String(family || '').toLowerCase();
  if (fam && (categoryTokens.has(fam) || String(category?.name || '').toLowerCase().includes(fam))) {
    score += 1;
  }

  return score;
}

// POST /api/ai/suggest/category
// Body: { product_id? } or { name, description?, family? }
// Returns top category candidates for responsable validation screen.
router.post(
  '/suggest/category',
  requireAuth,
  strictBody(['product_id', 'name', 'description', 'family', 'top_n']),
  async (req, res) => {
    try {
      if (!ensureResponsable(req, res)) return;

      const topN = Math.max(1, Math.min(5, Number(req.body?.top_n || 3)));
      const productId = String(req.body?.product_id || '').trim();

      let name = String(req.body?.name || '').trim();
      let description = String(req.body?.description || '').trim();
      let family = String(req.body?.family || '').trim();

      if (productId) {
        const product = await Product.findById(productId).select('name description family category validation_status').lean();
        if (!product) return res.status(404).json({ error: 'Produit introuvable' });
        name = product?.name || name;
        description = product?.description || description;
        family = product?.family || family;
      }

      if (!name) {
        return res.status(400).json({ error: 'name ou product_id obligatoire' });
      }

      const categories = await Category.find().select('_id name description').lean();
      if (!categories.length) return res.json({ ok: true, candidates: [] });

      const scored = categories
        .map((c) => ({
          id: String(c._id),
          name: c.name || 'Categorie',
          score: scoreCategoryMatch({ productName: name, productDescription: description, family }, c),
        }))
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topN);

      const bestScore = scored[0]?.score || 0;
      const candidates = scored.map((row) => ({
        ...row,
        confidence: bestScore ? Math.round(Math.min(95, (row.score / bestScore) * 90 + 5)) : 0,
      }));

      return res.json({
        ok: true,
        product: { name, family: family || null },
        candidates,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to suggest category', details: err.message });
    }
  }
);

async function createAssistantTrace(payload) {
  try {
    const safePayload = {
      ...payload,
      question: String(payload?.question || '').slice(0, 4000),
      answer: String(payload?.answer || '').slice(0, 12000),
      partial_warnings: Array.isArray(payload?.partial_warnings)
        ? payload.partial_warnings.map((w) => String(w).slice(0, 300)).slice(0, 30)
        : [],
    };
    if (!safePayload.question || !safePayload.answer) return;
    await AIAssistantTrace.create(safePayload);
  } catch (_) {
    // assistant tracing must never break the user flow
  }
}

function ensureConsumptionAnalysisEnabled(config, res) {
  if (config?.analyseConsommation !== false) return true;
  res.status(409).json({
    error: 'Analyse de consommation desactivee',
    details: 'Activez "Analyse de consommation" dans Parametres > Intelligence Artificielle.',
  });
  return false;
}

function decisionLevelFromRisk(probability, underThreshold) {
  if (underThreshold || Number(probability || 0) >= 70) return 'Critique';
  if (Number(probability || 0) >= 40) return 'Moyen';
  return 'Faible';
}

function decisionId(kind, rawId) {
  return `${String(kind || 'item').trim().toLowerCase()}:${String(rawId || '').trim()}`;
}

async function loadResolvedDecisionIds() {
  const items = await DecisionResolution.find({}).select('decision_id').lean();
  return new Set((items || []).map((x) => String(x.decision_id || '')).filter(Boolean));
}

async function runSafeStep(label, task, fallbackValue) {
  try {
    const value = await task();
    return { label, ok: true, value };
  } catch (err) {
    return {
      label,
      ok: false,
      value: fallbackValue,
      error: err?.message || String(err),
    };
  }
}

async function buildAssistantSignals({ includeConsumption = true } = {}) {
  const jobs = [
    runSafeStep('metrics', () => getSettingValue('ai_models_metrics_v2', {}), {}),
    runSafeStep('stockout', () => predictStockout({ horizon_days: 7 }), []),
    runSafeStep('anomaly', () => predictAnomaly({}), []),
    runSafeStep(
      'copilot',
      () => buildCopilotRecommendations({ horizon_days: 14, top_n: 5, simulations: [], include_consumption: includeConsumption }),
      {}
    ),
  ];

  if (includeConsumption) {
    jobs.push(runSafeStep('consumption', () => predictConsumption({ horizon_days: 14 }), []));
  } else {
    jobs.push(Promise.resolve({
      label: 'consumption',
      ok: false,
      value: [],
      error: 'analyse_consommation_disabled',
    }));
  }

  const settled = await Promise.all(jobs);
  const byLabel = new Map(settled.map((item) => [item.label, item]));
  const warnings = settled
    .filter((item) => !item.ok)
    .map((item) => ({ source: item.label, reason: item.error }));

  return {
    metrics: byLabel.get('metrics')?.value || {},
    stockout: byLabel.get('stockout')?.value || [],
    consumption: byLabel.get('consumption')?.value || [],
    anomaly: byLabel.get('anomaly')?.value || [],
    copilot: byLabel.get('copilot')?.value || {},
    warnings,
  };
}

function sendGeminiUnavailable(res) {
  return res.status(503).json({
    error: 'Gemini indisponible (non configure)',
    code: 'GEMINI_NOT_CONFIGURED',
    details: 'Configurez GEMINI_API_KEY avec une cle valide (AIza...) puis redemarrez le backend.',
  });
}

function isGeminiUpstreamError(err) {
  return String(err?.code || '').toUpperCase() === 'GEMINI_ERROR';
}

function capability(enabled, reasons = []) {
  const cleanReasons = Array.from(new Set((Array.isArray(reasons) ? reasons : []).filter(Boolean)));
  return {
    enabled: Boolean(enabled),
    reasons: Boolean(enabled) ? [] : cleanReasons,
  };
}

router.get('/alerts', requireAuth, async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;
    const items = await AIAlert.find().populate('product').sort({ detected_at: -1, createdAt: -1 });
    return res.json(items);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch AI alerts', details: err.message });
  }
});

router.post('/alerts/rebuild', requireAuth, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;
    const maxProducts = Number(req.body?.max_products || 300);
    const summary = await rebuildAiAlerts({ max_products: maxProducts });
    return res.json(summary);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to rebuild AI alerts', details: err.message });
  }
});

router.get('/predictions', requireAuth, async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;
    const items = await AIPrediction.find().populate('product').sort({ createdAt: -1 });
    return res.json(items);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch AI predictions', details: err.message });
  }
});

router.get('/models/status', requireAuth, async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;
    const registry = await getSettingValue('ai_models_registry_v2', null);
    const metrics = await getSettingValue('ai_models_metrics_v2', null);
    const governance = await getGovernance();
    const config = await getAiConfig();
    return res.json({
      trained: Boolean(registry?.trained_at),
      registry: registry || null,
      metrics: metrics || null,
      governance,
      config,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch model status', details: err.message });
  }
});

router.get('/models/metrics', requireAuth, async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;
    const metrics = await getSettingValue('ai_models_metrics_v2', null);
    return res.json({ ok: true, metrics: metrics || null });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch model metrics', details: err.message });
  }
});

router.get('/models/backtesting', requireAuth, async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;
    const backtesting = await getSettingValue('ai_models_backtesting_v2', null);
    return res.json({ ok: true, backtesting: backtesting || null });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch backtesting', details: err.message });
  }
});

router.get('/models/versions', requireAuth, async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;
    const versions = await getSettingValue('ai_model_versions_v2', []);
    return res.json({ ok: true, versions: Array.isArray(versions) ? versions : [] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch model versions', details: err.message });
  }
});

router.get('/gemini/status', requireAuth, async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;
    const configured = isGeminiConfigured();
    return res.json({
      ok: true,
      configured,
      status_label: configured ? 'Assistant IA prêt' : 'Assistant IA à configurer',
      model_default: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch Gemini status', details: err.message });
  }
});

router.get('/assistant/status', requireAuth, async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;

    const aiConfig = await getAiConfig();
    const geminiConfigured = isGeminiConfigured();
    const [registry, metrics] = await Promise.all([
      getSettingValue('ai_models_registry_v2', null),
      getSettingValue('ai_models_metrics_v2', null),
    ]);

    const baseAskReasons = [];
    if (!aiConfig.predictionsEnabled) baseAskReasons.push('ai_predictions_disabled');

    const transcribeReasons = [];
    if (!geminiConfigured) transcribeReasons.push('gemini_not_configured');

    const voiceAskReasons = [];
    if (!aiConfig.predictionsEnabled) voiceAskReasons.push('ai_predictions_disabled');
    if (!geminiConfigured) voiceAskReasons.push('gemini_not_configured');

    const consumptionReasons = [];
    if (!aiConfig.predictionsEnabled) consumptionReasons.push('ai_predictions_disabled');
    if (!aiConfig.analyseConsommation) consumptionReasons.push('consumption_analysis_disabled');

    return res.json({
      ok: true,
      ai_config: aiConfig,
      gemini: {
        configured: geminiConfigured,
        model_default: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
      },
      models: {
        trained: Boolean(registry?.trained_at),
        model_version: registry?.model_version || null,
        trained_at: registry?.trained_at || null,
        metrics_ready: Boolean(metrics),
      },
      capabilities: {
        assistant_ask: capability(aiConfig.predictionsEnabled, baseAskReasons),
        assistant_report: capability(aiConfig.predictionsEnabled, baseAskReasons),
        assistant_transcribe: capability(geminiConfigured, transcribeReasons),
        assistant_voice_ask: capability(aiConfig.predictionsEnabled && geminiConfigured, voiceAskReasons),
        predict_stockout: capability(aiConfig.predictionsEnabled, ['ai_predictions_disabled']),
        predict_consumption: capability(aiConfig.predictionsEnabled && aiConfig.analyseConsommation, consumptionReasons),
        predict_anomaly: capability(aiConfig.predictionsEnabled, ['ai_predictions_disabled']),
        copilot_recommendations: capability(aiConfig.predictionsEnabled, ['ai_predictions_disabled']),
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch assistant status', details: err.message });
  }
});

router.get('/python/status', requireAuth, async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;
    const status = getPythonRuntimeStatus();
    const expose = shouldExposeDiagnostics(req);
    return res.json({
      ok: true,
      python: {
        ok: Boolean(status?.ok),
        state: status?.state || (status?.ok ? 'ready' : 'unavailable'),
        user_message: status?.user_message || '',
        code: status?.code || null,
      },
      diagnostics: expose ? status : undefined,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch python status', details: err.message });
  }
});

router.post(
  '/gemini/generate',
  requireAuth,
  strictBody(['prompt', 'history', 'model', 'temperature', 'max_output_tokens', 'system_instruction']),
  async (req, res) => {
    try {
      if (!isGeminiConfigured()) return sendGeminiUnavailable(res);

      const prompt = String(req.body?.prompt || '').trim();
      if (!prompt) return res.status(400).json({ error: 'prompt obligatoire' });
      if (prompt.length > 8000) return res.status(400).json({ error: 'prompt trop long' });

      const result = await generateGeminiContent({
        prompt,
        history: req.body?.history,
        model: req.body?.model,
        temperature: req.body?.temperature,
        max_output_tokens: req.body?.max_output_tokens,
        system_instruction: req.body?.system_instruction,
      });
      return res.json({ ok: true, ...result });
    } catch (err) {
      return res.status(500).json({ error: 'Failed Gemini generation', details: err.message });
    }
  }
);

router.post('/models/train', requireAuth, strictBody(['lookback_days', 'force']), async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;
    const aiConfig = await getAiConfig();
    if (!ensureAiPredictionsEnabled(aiConfig, res)) return;

    const pythonStatus = getPythonRuntimeStatus();
    if (!pythonStatus?.ok) {
      return res.status(409).json({
        error: 'Entraînement indisponible',
        details:
          'L’entraînement avancé n’est pas disponible sur ce serveur. Les prédictions restent disponibles en mode automatique.',
        python: {
          state: pythonStatus?.state || 'unavailable',
          code: pythonStatus?.code || 'PYTHON_UNAVAILABLE',
          message: pythonStatus?.user_message || '',
        },
      });
    }

    const force = Boolean(req.body?.force);
    const lookbackDays = Math.min(730, asPositiveInt(req.body?.lookback_days, 240));
    const governance = await getGovernance();
    const existing = await getSettingValue('ai_models_registry_v2', null);
    const lastTrain = existing?.trained_at ? new Date(existing.trained_at) : null;
    const minIntervalMs = governance.min_training_interval_minutes * 60 * 1000;

    if (!force && lastTrain && Number.isFinite(lastTrain.getTime())) {
      const elapsedMs = Date.now() - lastTrain.getTime();
      if (elapsedMs < minIntervalMs) {
        return res.status(429).json({
          error: 'Entraînement temporairement bloqué',
          details: `Réessayez dans ${Math.ceil((minIntervalMs - elapsedMs) / 60000)} minute(s).`,
          next_train_at: new Date(lastTrain.getTime() + minIntervalMs).toISOString(),
        });
      }
    }

    const { registry, metrics, backtesting } = await trainAndBuildDatasets({ lookback_days: lookbackDays });
    await setSettingValue('ai_models_registry_v2', registry, req.user.id);
    await setSettingValue('ai_models_metrics_v2', metrics, req.user.id);
    await setSettingValue('ai_models_backtesting_v2', backtesting, req.user.id);
    await appendVersionSnapshot(registry, metrics, backtesting, req.user.id);

    return res.json({
      ok: true,
      message: 'Modeles IA entraines + datasets exportes + metrics/backtesting enregistres.',
      registry,
      metrics,
      backtesting,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to train models', details: err.message });
  }
});

router.post('/predict/stockout', requireAuth, strictBody(['horizon_days', 'product_ids']), async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;
    const aiConfig = await getAiConfig();
    if (!ensureAiPredictionsEnabled(aiConfig, res)) return;

    const horizonDays = Math.min(30, asPositiveInt(req.body?.horizon_days, 7));
    const productIds = Array.isArray(req.body?.product_ids) ? req.body.product_ids : null;
    const predictions = await predictStockout({ horizon_days: horizonDays, product_ids: productIds });

    await AIPrediction.deleteMany({ prediction_type: 'rupture' });
    if (predictions.length) {
      const docs = predictions.map((p) => ({
        product: p.product_id,
        predicted_quantity: p.risk_probability,
        prediction_type: 'rupture',
        period_start: new Date(),
        period_end: new Date(Date.now() + horizonDays * 24 * 60 * 60 * 1000),
        confidence_score: 0.7,
      }));
      await AIPrediction.insertMany(docs);
    }

    return res.json({
      ok: true,
      horizon_days: horizonDays,
      count: predictions.length,
      predictions,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to predict stockout', details: err.message });
  }
});

router.post('/predict/consumption', requireAuth, strictBody(['horizon_days', 'product_ids']), async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;
    const aiConfig = await getAiConfig();
    if (!ensureAiPredictionsEnabled(aiConfig, res)) return;
    if (!ensureConsumptionAnalysisEnabled(aiConfig, res)) return;

    const horizonDays = Math.min(30, asPositiveInt(req.body?.horizon_days, 14));
    const productIds = Array.isArray(req.body?.product_ids) ? req.body.product_ids : null;
    const predictions = await predictConsumption({ horizon_days: horizonDays, product_ids: productIds });

    await AIPrediction.deleteMany({ prediction_type: 'consommation' });
    if (predictions.length) {
      const docs = predictions.map((p) => ({
        product: p.product_id,
        predicted_quantity: p.expected_quantity,
        prediction_type: 'consommation',
        period_start: new Date(),
        period_end: new Date(Date.now() + horizonDays * 24 * 60 * 60 * 1000),
        confidence_score: p.confidence_score,
      }));
      await AIPrediction.insertMany(docs);
    }

    return res.json({
      ok: true,
      horizon_days: horizonDays,
      count: predictions.length,
      predictions,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to predict consumption', details: err.message });
  }
});

router.post('/predict/anomaly', requireAuth, strictBody(['product_ids']), async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;
    const aiConfig = await getAiConfig();
    if (!ensureAiPredictionsEnabled(aiConfig, res)) return;

    const productIds = Array.isArray(req.body?.product_ids) ? req.body.product_ids : null;
    const predictions = await predictAnomaly({ product_ids: productIds });

    const anomalyAlerts = predictions
      .filter((p) => Boolean(p.is_anomaly))
      .slice(0, 100)
      .map((p) => ({
        product: p.product_id,
        alert_type: 'anomaly',
        risk_level: p.risk_level === 'high' ? 'high' : p.risk_level === 'medium' ? 'medium' : 'low',
        message: `${p.product_name || 'Produit'}: anomalie detectee (${p.anomaly_score}%).`,
        detected_at: new Date(),
        status: 'new',
        action_taken: 'model:anomaly_detection_v1',
      }));
    if (aiConfig.alertesAuto) {
      await AIAlert.deleteMany({ alert_type: 'anomaly', action_taken: 'model:anomaly_detection_v1' });
      if (anomalyAlerts.length) await AIAlert.insertMany(anomalyAlerts);
    }

    return res.json({
      ok: true,
      count: predictions.length,
      anomalies_count: anomalyAlerts.length,
      alerts_persisted: Boolean(aiConfig.alertesAuto),
      predictions,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to predict anomaly', details: err.message });
  }
});

router.post('/copilot/recommendations', requireAuth, strictBody(['horizon_days', 'top_n', 'simulations']), async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;
    const aiConfig = await getAiConfig();
    if (!ensureAiPredictionsEnabled(aiConfig, res)) return;

    const horizonDays = Math.min(30, asPositiveInt(req.body?.horizon_days, 14));
    const topN = Math.min(20, asPositiveInt(req.body?.top_n, 10));
    const simulations = Array.isArray(req.body?.simulations) ? req.body.simulations : [];
    const response = await buildCopilotRecommendations({
      horizon_days: horizonDays,
      top_n: topN,
      simulations,
      include_consumption: aiConfig.analyseConsommation !== false,
    });
    return res.json({
      ok: true,
      ai_config: aiConfig,
      ...response,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to build copilot recommendations', details: err.message });
  }
});

router.post('/copilot/apply', requireAuth, strictBody(['product_id', 'ordered_qty', 'risk_before_pct', 'risk_after_pct', 'impact_note', 'recommendation_context']), async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;
    const payload = {
      product: req.body?.product_id,
      applied_by: req.user.id,
      ordered_qty: Number(req.body?.ordered_qty || 0),
      risk_before_pct: req.body?.risk_before_pct === undefined ? undefined : Number(req.body?.risk_before_pct),
      risk_after_pct: req.body?.risk_after_pct === undefined ? undefined : Number(req.body?.risk_after_pct),
      impact_note: String(req.body?.impact_note || ''),
      recommendation_context: req.body?.recommendation_context || {},
    };
    const created = await AIRecommendationTrace.create(payload);
    return res.status(201).json({ ok: true, trace: created });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to apply recommendation trace', details: err.message });
  }
});

router.get('/copilot/applied', requireAuth, async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;
    const limit = Math.min(100, asPositiveInt(req.query?.limit, 20));
    const traces = await AIRecommendationTrace.find()
      .populate('product', 'name code_product')
      .populate('applied_by', 'username email role')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return res.json({ ok: true, traces });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch recommendation traces', details: err.message });
  }
});

router.get('/assistant/traces', requireAuth, async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;
    const limit = Math.min(100, asPositiveInt(req.query?.limit, 30));
    const items = await AIAssistantTrace.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const traces = items.map((t) => ({
      _id: t._id,
      createdAt: t.createdAt,
      mode: t.mode,
      source: t.source,
      latency_ms: t.latency_ms ?? null,
      question: t.question,
      answer: t.answer,
      gemini_configured: Boolean(t.gemini_configured),
      partial_warnings: Array.isArray(t.partial_warnings) ? t.partial_warnings : [],
      request_id: t.request_id || null,
    }));

    return res.json({ ok: true, traces });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch assistant traces', details: err.message });
  }
});

router.post('/assistant/ask', requireAuth, strictBody(['question', 'history', 'mode', 'force_gemini']), async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;
    const aiConfig = await getAiConfig();
    if (!ensureAiPredictionsEnabled(aiConfig, res)) return;
    const forceGemini = Boolean(req.body?.force_gemini);
    const geminiConfigured = isGeminiConfigured();
    if (forceGemini && !geminiConfigured) return sendGeminiUnavailable(res);
    const startedAt = Date.now();

    const questionRaw = String(req.body?.question || '').trim();
    if (!questionRaw) return res.status(400).json({ error: 'question obligatoire' });
    if (questionRaw.length > 2500) return res.status(400).json({ error: 'question trop longue (max 2500 caracteres)' });
    const mode = String(req.body?.mode || 'chat').toLowerCase() === 'report' ? 'report' : 'chat';
    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-24) : [];
    const signals = await buildAssistantSignals({
      includeConsumption: aiConfig.analyseConsommation !== false,
    });

    const assistant = await askResponsableAssistant({
      question: questionRaw,
      history,
      use_gemini: forceGemini ? true : geminiConfigured,
      strict_gemini: forceGemini ? true : geminiConfigured,
      mode,
      context: {
        stockout_top: signals.stockout.slice(0, 5),
        consumption_top: signals.consumption.slice(0, 5),
        anomaly_top: signals.anomaly.slice(0, 5),
        action_plan: Array.isArray(signals.copilot?.action_plan) ? signals.copilot.action_plan.slice(0, 5) : [],
        metrics: signals.metrics || {},
      },
    });

    await createAssistantTrace({
      user: req.user.id,
      mode: assistant.mode || mode,
      source: assistant.source || 'fallback',
      question: questionRaw,
      answer: assistant.answer || 'Aucune reponse produite.',
      latency_ms: Math.max(0, Date.now() - startedAt),
      gemini_configured: geminiConfigured,
      partial_warnings: signals.warnings,
      request_id: req.requestId || undefined,
    });

    return res.json({
      ok: true,
      answer: assistant.answer || 'Aucune reponse produite.',
      source: assistant.source || 'fallback',
      mode: assistant.mode || mode,
      ai_config: aiConfig,
      partial_warnings: signals.warnings,
      gemini_configured: geminiConfigured,
    });
  } catch (err) {
    if (isGeminiUpstreamError(err)) {
      return res.status(502).json({
        error: 'Echec appel Gemini',
        code: 'GEMINI_UPSTREAM_ERROR',
        details: err?.details || err?.message || 'Gemini a retourne une erreur',
      });
    }
    return res.status(500).json({ error: 'Failed to answer assistant request', details: err.message });
  }
});

router.post('/assistant/transcribe', requireAuth, strictBody(['audio_base64', 'mime_type', 'language']), async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;
    if (!isGeminiConfigured()) return sendGeminiUnavailable(res);

    const audioBase64 = String(req.body?.audio_base64 || '').trim();
    if (!audioBase64) return res.status(400).json({ error: 'audio_base64 obligatoire' });
    if (audioBase64.length > 12 * 1024 * 1024) {
      return res.status(413).json({ error: 'audio_base64 trop volumineux (max ~9MB audio brut)' });
    }

    const transcription = await transcribeGeminiAudio({
      audio_base64: audioBase64,
      mime_type: req.body?.mime_type,
      language: req.body?.language || 'fr-FR',
    });
    return res.json({
      ok: true,
      transcript: String(transcription?.text || '').trim(),
      stt_source: 'gemini',
      model: transcription?.model || null,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to transcribe audio', details: err.message });
  }
});

router.post('/assistant/voice-ask', requireAuth, strictBody(['audio_base64', 'mime_type', 'history', 'mode', 'language']), async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;
    const aiConfig = await getAiConfig();
    if (!ensureAiPredictionsEnabled(aiConfig, res)) return;

    if (!isGeminiConfigured()) return sendGeminiUnavailable(res);
    const startedAt = Date.now();

    const audioBase64 = String(req.body?.audio_base64 || '').trim();
    if (!audioBase64) return res.status(400).json({ error: 'audio_base64 obligatoire' });
    if (audioBase64.length > 12 * 1024 * 1024) {
      return res.status(413).json({ error: 'audio_base64 trop volumineux (max ~9MB audio brut)' });
    }

    const transcription = await transcribeGeminiAudio({
      audio_base64: audioBase64,
      mime_type: req.body?.mime_type,
      language: req.body?.language || 'fr-FR',
    });
    const transcript = String(transcription?.text || '').trim();
    if (!transcript) {
      return res.status(422).json({ error: 'Transcription vide', details: 'Aucun texte detecte dans le vocal' });
    }

    const mode = String(req.body?.mode || 'chat').toLowerCase() === 'report' ? 'report' : 'chat';
    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-24) : [];
    const signals = await buildAssistantSignals({
      includeConsumption: aiConfig.analyseConsommation !== false,
    });

    const assistant = await askResponsableAssistant({
      question: transcript,
      history,
      use_gemini: true,
      strict_gemini: true,
      mode,
      context: {
        stockout_top: signals.stockout.slice(0, 5),
        consumption_top: signals.consumption.slice(0, 5),
        anomaly_top: signals.anomaly.slice(0, 5),
        action_plan: Array.isArray(signals.copilot?.action_plan) ? signals.copilot.action_plan.slice(0, 5) : [],
        metrics: signals.metrics || {},
      },
    });

    await createAssistantTrace({
      user: req.user.id,
      mode: assistant.mode || mode,
      source: assistant.source || 'fallback',
      question: transcript,
      answer: assistant.answer || 'Aucune reponse produite.',
      latency_ms: Math.max(0, Date.now() - startedAt),
      gemini_configured: true,
      partial_warnings: signals.warnings,
      request_id: req.requestId || undefined,
    });

    return res.json({
      ok: true,
      transcript,
      stt_source: 'gemini',
      answer: assistant.answer || 'Aucune reponse produite.',
      source: assistant.source || 'fallback',
      mode: assistant.mode || mode,
      ai_config: aiConfig,
      partial_warnings: signals.warnings,
    });
  } catch (err) {
    if (isGeminiUpstreamError(err)) {
      return res.status(502).json({
        error: 'Echec appel Gemini',
        code: 'GEMINI_UPSTREAM_ERROR',
        details: err?.details || err?.message || 'Gemini a retourne une erreur',
      });
    }
    return res.status(500).json({ error: 'Failed to process voice request', details: err.message });
  }
});

router.get('/decision-inbox', requireAuth, async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;
    const aiConfig = await getAiConfig();

    const [resolvedIds, pendingProducts, pendingRequests] = await Promise.all([
      loadResolvedDecisionIds(),
      Product.find({ validation_status: 'pending' })
        .select('_id name code_product createdAt seuil_minimum created_by')
        .populate('created_by', 'username role')
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
      Request.find({ status: 'pending' })
        .select('_id product quantity_requested date_request demandeur direction_laboratory note createdAt')
        .populate('product', 'name code_product quantity_current seuil_minimum')
        .populate('demandeur', 'username role')
        .sort({ date_request: -1, createdAt: -1 })
        .limit(40)
        .lean(),
    ]);

    const items = [];

    for (const r of pendingRequests || []) {
      const did = decisionId('request_validation', r._id);
      if (resolvedIds.has(did)) continue;
      items.push({
        decision_id: did,
        kind: 'request_validation',
        level: 'Moyen',
        title: `Valider la demande ${String(r?._id || '').slice(-6).toUpperCase()}`,
        product_id: r?.product?._id || null,
        product_name: r?.product?.name || 'Produit',
        requester: r?.demandeur?.username || 'Demandeur',
        quantity: Number(r?.quantity_requested || 0),
        created_at: r?.date_request || r?.createdAt || null,
        why: [
          r?.direction_laboratory ? `Direction: ${r.direction_laboratory}` : null,
          r?.note ? `Note: ${String(r.note).slice(0, 140)}` : null,
        ].filter(Boolean),
        actions: [
          { id: 'validate', label: 'Valider', action: 'request.validate', payload: { request_id: String(r._id), status: 'validated' } },
          { id: 'reject', label: 'Rejeter', action: 'request.validate', payload: { request_id: String(r._id), status: 'rejected' } },
        ],
        resolved: false,
      });
    }

    for (const p of pendingProducts || []) {
      const did = decisionId('product_validation', p._id);
      if (resolvedIds.has(did)) continue;
      items.push({
        decision_id: did,
        kind: 'product_validation',
        level: 'Faible',
        title: `Valider le produit ${p?.code_product || ''}`.trim(),
        product_id: String(p?._id || ''),
        product_name: p?.name || 'Produit',
        created_at: p?.createdAt || null,
        why: [
          p?.created_by?.username ? `Cree par: ${p.created_by.username}` : null,
          Number.isFinite(Number(p?.seuil_minimum)) ? `Seuil min: ${Number(p.seuil_minimum)}` : null,
        ].filter(Boolean),
        actions: [
          { id: 'open', label: 'Ouvrir validations', action: 'ui.navigate', payload: { path: '/responsable/pilotage?tab=validations' } },
        ],
        resolved: false,
      });
    }

    if (aiConfig?.predictionsEnabled !== false) {
      const [stockout, anomalies, copilot] = await Promise.all([
        predictStockout({ horizon_days: 7 }).catch(() => []),
        predictAnomaly({}).catch(() => []),
        buildCopilotRecommendations({ horizon_days: 14, top_n: 10, simulations: [], include_consumption: true }).catch(() => null),
      ]);

      const stockoutTop = (Array.isArray(stockout) ? stockout : [])
        .slice()
        .sort((a, b) => Number(b?.risk_probability || 0) - Number(a?.risk_probability || 0))
        .slice(0, 12);

      for (const row of stockoutTop) {
        const pid = String(row?.product_id || '').trim();
        if (!pid) continue;
        const did = decisionId('stockout', pid);
        if (resolvedIds.has(did)) continue;

        const stock = Number(row?.current_stock ?? row?.stock_qty ?? 0);
        const seuil = Number(row?.seuil_minimum ?? row?.threshold ?? 0);
        const underThreshold = stock > 0 && stock <= seuil;
        const level = decisionLevelFromRisk(row?.risk_probability, underThreshold);

        items.push({
          decision_id: did,
          kind: 'stockout',
          level,
          title: `${row?.product_name || 'Produit'}: risque de rupture`,
          product_id: pid,
          product_name: row?.product_name || 'Produit',
          risk_probability: Number(row?.risk_probability || 0),
          evidence: {
            current_stock: stock,
            seuil_minimum: seuil,
            horizon_days: 7,
          },
          why: [
            `Risque: ${Number(row?.risk_probability || 0).toFixed(1)}% (J+7)`,
            Number.isFinite(stock) ? `Stock actuel: ${Math.round(stock)}` : null,
            Number.isFinite(seuil) ? `Seuil min: ${Math.round(seuil)}` : null,
            underThreshold ? 'Stock sous seuil' : null,
          ].filter(Boolean),
          actions: [
            { id: 'open', label: 'Ouvrir pilotage', action: 'ui.navigate', payload: { path: '/responsable/pilotage?tab=alertes' } },
            { id: 'resolve', label: 'Marquer traite', action: 'decision.resolve', payload: { decision_id: did } },
          ],
          resolved: false,
        });
      }

      const anomalyTop = (Array.isArray(anomalies) ? anomalies : [])
        .filter((x) => Boolean(x?.is_anomaly) || Number(x?.anomaly_score || 0) >= 50)
        .slice()
        .sort((a, b) => Number(b?.anomaly_score || 0) - Number(a?.anomaly_score || 0))
        .slice(0, 10);

      for (const row of anomalyTop) {
        const pid = String(row?.product_id || '').trim();
        if (!pid) continue;
        const did = decisionId('anomaly', pid);
        if (resolvedIds.has(did)) continue;

        const score = Number(row?.anomaly_score || 0);
        const level = score >= 70 ? 'Critique' : score >= 50 ? 'Moyen' : 'Faible';
        items.push({
          decision_id: did,
          kind: 'anomaly',
          level,
          title: `${row?.product_name || 'Produit'}: anomalie detectee`,
          product_id: pid,
          product_name: row?.product_name || 'Produit',
          anomaly_score: score,
          evidence: {
            anomaly_score: score,
            risk_level: row?.risk_level || null,
          },
          why: [
            `Score anomalie: ${score.toFixed(1)}%`,
            row?.risk_level ? `Niveau: ${row.risk_level}` : null,
          ].filter(Boolean),
          actions: [
            { id: 'open', label: 'Ouvrir pilotage', action: 'ui.navigate', payload: { path: '/responsable/pilotage?tab=alertes' } },
            { id: 'resolve', label: 'Marquer traite', action: 'decision.resolve', payload: { decision_id: did } },
          ],
          resolved: false,
        });
      }

      const actionPlan = Array.isArray(copilot?.action_plan) ? copilot.action_plan : [];
      for (const step of actionPlan.slice(0, 8)) {
        const pid = String(step?.product_id || '').trim();
        if (!pid) continue;
        const did = decisionId('copilot', pid);
        if (resolvedIds.has(did)) continue;
        items.push({
          decision_id: did,
          kind: 'copilot',
          level: String(step?.urgency || '').toLowerCase() === 'high' ? 'Critique' : 'Moyen',
          title: `${step?.product_name || 'Produit'}: action recommande`,
          product_id: pid,
          product_name: step?.product_name || 'Produit',
          evidence: {
            action: step?.action || null,
            urgency: step?.urgency || null,
            recommended_order_qty: step?.recommended_order_qty ?? null,
          },
          why: [
            step?.action ? `Action: ${step.action}` : null,
            Number.isFinite(Number(step?.recommended_order_qty)) ? `Commande: ${Number(step.recommended_order_qty)} unite(s)` : null,
          ].filter(Boolean),
          actions: [
            { id: 'open', label: 'Ouvrir pilotage', action: 'ui.navigate', payload: { path: '/responsable/pilotage?tab=analyse' } },
            { id: 'resolve', label: 'Marquer traite', action: 'decision.resolve', payload: { decision_id: did } },
          ],
          resolved: false,
        });
      }
    }

    // Supplier risk signals (simple + explainable KPIs).
    try {
      const suppliersActive = await Supplier.find({ status: 'active' })
        .select('_id name default_lead_time_days status')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      const supplierIds = (suppliersActive || []).map((s) => s?._id).filter(Boolean);
      if (supplierIds.length) {
        const delivered = await PurchaseOrder.find({
          supplier: { $in: supplierIds },
          status: 'delivered',
          delivered_at: { $ne: null },
        })
          .select('supplier status ordered_at promised_at delivered_at')
          .sort({ delivered_at: -1, ordered_at: -1 })
          .limit(250)
          .lean();

        const bySupplier = new Map();
        for (const po of delivered || []) {
          const sid = String(po.supplier || '');
          if (!sid) continue;
          const arr = bySupplier.get(sid) || [];
          arr.push(po);
          bySupplier.set(sid, arr);
        }

        const avg = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
        const computeKpis = (purchaseOrders) => {
          const deliveredDocs = (purchaseOrders || []).filter((po) => po && po.status === 'delivered' && po.delivered_at);
          if (!deliveredDocs.length) return { delivered_count: 0, on_time_rate: null, avg_lead_time_days: null, avg_delay_days: null };

          let onTime = 0;
          const leadTimes = [];
          const delays = [];
          for (const po of deliveredDocs) {
            const orderedAt = po.ordered_at ? new Date(po.ordered_at) : null;
            const deliveredAt = po.delivered_at ? new Date(po.delivered_at) : null;
            const promisedAt = po.promised_at ? new Date(po.promised_at) : null;
            if (!orderedAt || !deliveredAt || Number.isNaN(orderedAt.getTime()) || Number.isNaN(deliveredAt.getTime())) continue;
            const leadDays = Math.max(0, (deliveredAt.getTime() - orderedAt.getTime()) / (24 * 60 * 60 * 1000));
            leadTimes.push(leadDays);
            if (promisedAt && !Number.isNaN(promisedAt.getTime())) {
              const delayDays = (deliveredAt.getTime() - promisedAt.getTime()) / (24 * 60 * 60 * 1000);
              delays.push(delayDays);
              if (delayDays <= 0.00001) onTime += 1;
            }
          }
          const avgLead = avg(leadTimes);
          const avgDelay = avg(delays);
          const onTimeRate = delays.length ? onTime / delays.length : null;
          return {
            delivered_count: deliveredDocs.length,
            on_time_rate: onTimeRate !== null ? Number((onTimeRate * 100).toFixed(1)) : null,
            avg_lead_time_days: avgLead !== null ? Number(avgLead.toFixed(1)) : null,
            avg_delay_days: avgDelay !== null ? Number(avgDelay.toFixed(1)) : null,
          };
        };

        const computeScore = (kpis) => {
          const onTime = typeof kpis?.on_time_rate === 'number' ? kpis.on_time_rate : null;
          const avgDelay = typeof kpis?.avg_delay_days === 'number' ? kpis.avg_delay_days : null;
          let score = 50;
          if (onTime !== null) score = 0.75 * onTime + 25;
          if (avgDelay !== null && avgDelay > 0) score -= Math.min(30, avgDelay * 4);
          score = Math.max(0, Math.min(100, score));
          return Number(score.toFixed(1));
        };

        for (const s of suppliersActive || []) {
          const sid = String(s?._id || '');
          if (!sid) continue;
          const did = decisionId('supplier_risk', sid);
          if (resolvedIds.has(did)) continue;

          const hist = bySupplier.get(sid) || [];
          const kpis = computeKpis(hist);
          if (Number(kpis.delivered_count || 0) < 3) continue;

          const score = computeScore(kpis);
          const risk = score < 55 || (typeof kpis.avg_delay_days === 'number' && kpis.avg_delay_days > 2) || (typeof kpis.on_time_rate === 'number' && kpis.on_time_rate < 70);
          if (!risk) continue;

          const level = score < 40 ? 'Critique' : 'Moyen';
          items.push({
            decision_id: did,
            kind: 'supplier_risk',
            level,
            title: `Fournisseur a risque: ${s.name || 'Fournisseur'}`,
            product_id: null,
            product_name: null,
            created_at: new Date().toISOString(),
            evidence: { supplier_id: sid, score, kpis },
            why: [
              `Score: ${score}/100`,
              typeof kpis.on_time_rate === 'number' ? `A l'heure: ${kpis.on_time_rate}%` : null,
              typeof kpis.avg_delay_days === 'number' ? `Retard moyen: ${kpis.avg_delay_days}j` : null,
              typeof kpis.avg_lead_time_days === 'number' ? `Delai moyen: ${kpis.avg_lead_time_days}j` : null,
            ].filter(Boolean),
            actions: [
              { id: 'open', label: 'Ouvrir fournisseurs', action: 'ui.navigate', payload: { path: '/responsable/parametres' } },
              { id: 'resolve', label: 'Marquer traite', action: 'decision.resolve', payload: { decision_id: did } },
            ],
            resolved: false,
          });
        }
      }
    } catch (_) {
      // Supplier risk signals are best-effort and must not block the inbox.
    }

    // Sort: critical first, then by recency when available.
    const levelRank = { Critique: 3, Moyen: 2, Faible: 1 };
    items.sort((a, b) => {
      const ra = levelRank[a.level] || 0;
      const rb = levelRank[b.level] || 0;
      if (rb !== ra) return rb - ra;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });

    return res.json({
      ok: true,
      generated_at: new Date().toISOString(),
      counts: {
        total: items.length,
        critical: items.filter((x) => x.level === 'Critique').length,
        medium: items.filter((x) => x.level === 'Moyen').length,
        low: items.filter((x) => x.level === 'Faible').length,
      },
      items,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to build decision inbox', details: err.message });
  }
});

router.post('/decision-inbox/resolve', requireAuth, strictBody(['decision_id', 'note', 'kind', 'title', 'product_name', 'level']), async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;
    const rawId = String(req.body?.decision_id || '').trim();
    if (!rawId) return res.status(400).json({ error: 'decision_id obligatoire' });

    const payload = {
      decision_id: rawId.slice(0, 160),
      kind: String(req.body?.kind || '').slice(0, 60),
      title: String(req.body?.title || '').slice(0, 180),
      product_name: String(req.body?.product_name || '').slice(0, 140),
      level: String(req.body?.level || '').slice(0, 20),
      resolved_by: req.user.id,
      resolved_at: new Date(),
      note: String(req.body?.note || '').slice(0, 600),
    };

    await DecisionResolution.updateOne(
      { decision_id: payload.decision_id },
      { $setOnInsert: payload },
      { upsert: true }
    );

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to resolve decision', details: err.message });
  }
});

router.post('/decision-inbox/assign', requireAuth, strictBody(['decision_id', 'assignee_user_id', 'note', 'kind', 'title', 'product_name', 'level']), async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;

    const decisionIdValue = String(req.body?.decision_id || '').trim();
    const assigneeUserId = String(req.body?.assignee_user_id || '').trim();
    if (!decisionIdValue) return res.status(400).json({ error: 'decision_id obligatoire' });
    if (!assigneeUserId) return res.status(400).json({ error: 'assignee_user_id obligatoire' });

    const assignee = await User.findById(assigneeUserId).select('_id username role status').lean();
    if (!assignee || assignee.status !== 'active' || assignee.role !== 'magasinier') {
      return res.status(400).json({ error: 'Magasinier invalide' });
    }

    const assignmentPayload = {
      decision_id: decisionIdValue.slice(0, 160),
      kind: String(req.body?.kind || '').slice(0, 60),
      title: String(req.body?.title || '').slice(0, 180),
      product_name: String(req.body?.product_name || '').slice(0, 140),
      level: String(req.body?.level || '').slice(0, 20),
      note: String(req.body?.note || '').slice(0, 600),
      assigned_to: assignee._id,
      assigned_by: req.user.id,
      assigned_at: new Date(),
    };

    await DecisionAssignment.create(assignmentPayload);

    const title = assignmentPayload.title || 'Decision a traiter';
    const messageLines = [
      `Decision: ${title}`,
      assignmentPayload.product_name ? `Produit: ${assignmentPayload.product_name}` : null,
      assignmentPayload.level ? `Priorite: ${assignmentPayload.level}` : null,
      assignmentPayload.note ? `Note: ${assignmentPayload.note}` : null,
      `Origine: ${assignmentPayload.decision_id}`,
    ].filter(Boolean);

    await Notification.create({
      user: assignee._id,
      title: 'Nouvelle decision assignee',
      message: messageLines.join('\n'),
      type: assignmentPayload.level === 'Critique' ? 'alert' : 'info',
      is_read: false,
    });

    await History.create({
      action_type: 'decision',
      user: req.user.id,
      source: 'ui',
      description: `Decision assignee a ${assignee.username || 'magasinier'}`,
      actor_role: req.user.role,
      tags: ['decision', 'assign'],
      context: {
        decision_id: assignmentPayload.decision_id,
        kind: assignmentPayload.kind || null,
        level: assignmentPayload.level || null,
        title: assignmentPayload.title || null,
        product_name: assignmentPayload.product_name || null,
        assigned_to: String(assignee._id),
        assigned_to_username: assignee.username || null,
        note: assignmentPayload.note || null,
      },
    });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to assign decision', details: err.message });
  }
});

router.get('/decision-history', requireAuth, async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;
    const limitRaw = Number(req.query?.limit || 40);
    const limit = Number.isFinite(limitRaw) ? Math.max(10, Math.min(200, Math.floor(limitRaw))) : 40;

    const PurchaseOrder = require('../models/PurchaseOrder');

    const [assignments, resolutions, purchaseOrders] = await Promise.all([
      DecisionAssignment.find({})
        .sort({ assigned_at: -1, createdAt: -1 })
        .limit(limit)
        .populate('assigned_to', 'username role')
        .populate('assigned_by', 'username role')
        .lean(),
      DecisionResolution.find({})
        .sort({ resolved_at: -1, createdAt: -1 })
        .limit(limit)
        .populate('resolved_by', 'username role')
        .lean(),
      PurchaseOrder.find({ decision_id: { $exists: true, $ne: null } })
        .sort({ ordered_at: -1, createdAt: -1 })
        .limit(limit)
        .populate('supplier', 'name')
        .populate('created_by', 'username role')
        .populate('lines.product', 'name code_product')
        .lean(),
    ]);

    const events = [];
    for (const a of assignments || []) {
      events.push({
        kind: 'assign',
        when: a.assigned_at || a.createdAt || null,
        decision_id: a.decision_id,
        level: a.level || null,
        title: a.title || 'Decision',
        product_name: a.product_name || null,
        actor: a.assigned_by?.username || null,
        target: a.assigned_to?.username || null,
        note: a.note || null,
      });
    }
    for (const r of resolutions || []) {
      events.push({
        kind: 'resolve',
        when: r.resolved_at || r.createdAt || null,
        decision_id: r.decision_id,
        level: r.level || null,
        title: r.title || 'Decision',
        product_name: r.product_name || null,
        actor: r.resolved_by?.username || null,
        target: null,
        note: r.note || null,
      });
    }

    for (const po of purchaseOrders || []) {
      const firstLine = Array.isArray(po.lines) && po.lines.length ? po.lines[0] : null;
      const productName = firstLine?.product?.name || null;
      const label = String(po.status || '') === 'delivered' ? 'Commande recue' : 'Commande creee';
      events.push({
        kind: 'purchase_order',
        when: po.ordered_at || po.createdAt || null,
        decision_id: po.decision_id || null,
        level: null,
        title: `${label} (${po.supplier?.name || 'Fournisseur'})`,
        product_name: productName,
        actor: po.created_by?.username || null,
        target: null,
        note: `PO=${String(po._id)} statut=${po.status}`,
      });
    }

    events.sort((a, b) => new Date(b.when || 0).getTime() - new Date(a.when || 0).getTime());

    return res.json({ ok: true, events: events.slice(0, limit) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch decision history', details: err.message });
  }
});

router.get('/magasinier-inbox', requireAuth, async (req, res) => {
  try {
    if (String(req.user?.role || '') !== 'magasinier') {
      return res.status(403).json({ error: 'Acces refuse (magasinier uniquement)' });
    }

    const limitRaw = Number(req.query?.limit || 40);
    const limit = Number.isFinite(limitRaw) ? Math.max(10, Math.min(120, Math.floor(limitRaw))) : 40;

    const [assignments, preparingRequests, receivedOrders, openOrders] = await Promise.all([
      DecisionAssignment.find({ assigned_to: req.user.id })
        .sort({ assigned_at: -1, createdAt: -1 })
        .limit(limit)
        .populate('assigned_by', 'username role')
        .lean(),
      Request.find({ status: { $in: ['validated', 'preparing'] } })
        .select('_id status quantity_requested date_request demandeur direction_laboratory note createdAt priority')
        .populate('product', 'name code_product quantity_current seuil_minimum')
        .populate('demandeur', 'username role')
        .sort({ updatedAt: -1, date_request: -1, createdAt: -1 })
        .limit(limit)
        .lean(),
      PurchaseOrder.find({ status: 'delivered', received_at: { $ne: null } })
        .select('_id supplier status ordered_at promised_at delivered_at received_at decision_id')
        .populate('supplier', 'name')
        .sort({ received_at: -1, ordered_at: -1 })
        .limit(10)
        .lean(),
      PurchaseOrder.find({ status: 'ordered', received_at: { $in: [null, undefined] } })
        .select('_id supplier status ordered_at promised_at decision_id lines')
        .populate('supplier', 'name')
        .populate('lines.product', 'name code_product')
        .sort({ ordered_at: -1, createdAt: -1 })
        .limit(limit)
        .lean(),
    ]);

    const decisionIds = (assignments || []).map((a) => String(a.decision_id || '').trim()).filter(Boolean);
    const resolved = decisionIds.length
      ? await DecisionResolution.find({ decision_id: { $in: decisionIds } }).select('decision_id resolved_at').lean()
      : [];
    const resolvedSet = new Set((resolved || []).map((r) => String(r.decision_id || '')));

    const decisions = (assignments || [])
      .filter((a) => a && a.decision_id && !resolvedSet.has(String(a.decision_id)))
      .slice(0, limit)
      .map((a) => ({
        decision_id: a.decision_id,
        kind: a.kind || null,
        level: a.level || null,
        title: a.title || 'Decision',
        product_name: a.product_name || null,
        note: a.note || null,
        assigned_at: a.assigned_at || a.createdAt || null,
        assigned_by: a.assigned_by?.username || null,
      }));

    const requests = (preparingRequests || []).map((r) => {
      const priority = String(r.priority || 'normal').trim().toLowerCase();
      return {
        id: String(r._id),
        status: String(r.status || ''),
        product: {
          id: String(r.product?._id || ''),
          name: r.product?.name || 'Produit',
          code: r.product?.code_product || '-',
          stock: Number(r.product?.quantity_current || 0),
          seuil_minimum: Number(r.product?.seuil_minimum || 0),
        },
        quantity_requested: Number(r.quantity_requested || 0),
        demandeur: r.demandeur?.username || 'Demandeur',
        direction_laboratory: r.direction_laboratory || '-',
        note: r.note || '',
        priority,
        priority_label: priority === 'critical' ? 'TRES URGENT' : priority === 'urgent' ? 'URGENT' : 'NORMAL',
        created_at: r.date_request || r.createdAt || null,
      };
    });

    const purchase_orders_to_receive = (openOrders || []).map((po) => ({
      id: String(po._id),
      supplier_name: po.supplier?.name || 'Fournisseur',
      status: po.status,
      ordered_at: po.ordered_at || po.createdAt || null,
      promised_at: po.promised_at || null,
      decision_id: po.decision_id || null,
      lines: Array.isArray(po.lines)
        ? po.lines.slice(0, 6).map((l) => ({
          product_name: l.product?.name || 'Produit',
          product_code: l.product?.code_product || '-',
          quantity: Number(l.quantity || 0),
        }))
        : [],
    }));

    return res.json({
      ok: true,
      decisions,
      requests,
      purchase_orders_to_receive,
      recent_received_orders: receivedOrders || [],
      counts: {
        decisions: decisions.length,
        requests: requests.length,
        purchase_orders_to_receive: purchase_orders_to_receive.length,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to build magasinier inbox', details: err.message });
  }
});

router.post('/magasinier/decision-done', requireAuth, strictBody(['decision_id', 'note']), async (req, res) => {
  try {
    if (String(req.user?.role || '') !== 'magasinier') {
      return res.status(403).json({ error: 'Acces refuse (magasinier uniquement)' });
    }
    const did = String(req.body?.decision_id || '').trim();
    if (!did) return res.status(400).json({ error: 'decision_id obligatoire' });

    const assignment = await DecisionAssignment.findOne({ decision_id: did, assigned_to: req.user.id })
      .sort({ assigned_at: -1, createdAt: -1 })
      .lean();
    if (!assignment) return res.status(403).json({ error: 'Decision non assignee a cet utilisateur' });

    const note = String(req.body?.note || '').slice(0, 600);
    await DecisionResolution.updateOne(
      { decision_id: did },
      {
        $set: {
          decision_id: did,
          kind: assignment.kind || 'assignment_done',
          title: assignment.title || 'Decision traitee',
          product_name: assignment.product_name || '',
          level: assignment.level || null,
          resolved_by: req.user.id,
          resolved_at: new Date(),
          note,
        },
      },
      { upsert: true }
    );

    await History.create({
      action_type: 'decision',
      user: req.user.id,
      source: 'ui',
      description: 'Decision marquee terminee par magasinier',
      actor_role: req.user.role,
      tags: ['decision', 'done'],
      context: {
        decision_id: did,
        kind: assignment.kind || null,
        level: assignment.level || null,
        title: assignment.title || null,
        product_name: assignment.product_name || null,
        note: note || null,
      },
    });

    // Notify responsables.
    const responsables = await User.find({ role: 'responsable', status: 'active' }).select('_id username').limit(20).lean();
    if (responsables.length) {
      await Notification.insertMany(responsables.map((u) => ({
        user: u._id,
        title: 'Decision terminee',
        message: [
          `Decision: ${assignment.title || did}`,
          assignment.product_name ? `Produit: ${assignment.product_name}` : null,
          `Par: ${req.user.username || 'magasinier'}`,
          note ? `Note: ${note}` : null,
        ].filter(Boolean).join('\n'),
        type: assignment.level === 'Critique' ? 'alert' : 'info',
        is_read: false,
      })));
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to mark decision done', details: err.message });
  }
});

module.exports = router;
