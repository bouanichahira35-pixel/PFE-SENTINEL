const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const Product = require('../models/Product');
const History = require('../models/History');
const StockEntry = require('../models/StockEntry');

const AI_DATA_DIR = path.join(process.cwd(), 'data', 'ai');
const AI_PY_DIR = path.join(process.cwd(), 'ai_py');
const AI_TMP_DIR = path.join(AI_DATA_DIR, '_tmp');
const PYTHON_BIN = process.env.AI_PYTHON_BIN || 'python';
const DAY_MS = 24 * 60 * 60 * 1000;

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
  fs.mkdirSync(AI_TMP_DIR, { recursive: true });
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const inputPath = path.join(AI_TMP_DIR, `${scriptName.replace('.py', '')}_${stamp}_in.json`);
  const outputPath = path.join(AI_TMP_DIR, `${scriptName.replace('.py', '')}_${stamp}_out.json`);
  const scriptPath = path.join(AI_PY_DIR, scriptName);

  fs.writeFileSync(inputPath, JSON.stringify(payload), 'utf8');
  const proc = spawnSync(PYTHON_BIN, [scriptPath, '--input', inputPath, '--output', outputPath], {
    encoding: 'utf8',
    cwd: process.cwd(),
  });

  try {
    if (proc.status !== 0) {
      throw new Error(proc.stderr || proc.stdout || `Python script failed: ${scriptName}`);
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
  const datasetsResult = runPythonScript('dataset_builder.py', {
    version_tag: versionTag,
    base_dir: AI_DATA_DIR,
    stockout_rows: stockoutRows,
    consumption_rows: consumptionRows,
  });
  const metricsStockout = runPythonScript('stockout_model.py', {
    mode: 'evaluate',
    split_ratio: 0.8,
    rows: stockoutRows,
  });
  const metricsConsumption = runPythonScript('consumption_model.py', {
    mode: 'evaluate',
    split_ratio: 0.8,
    rows: consumptionRows,
  });
  const metricsAnomaly = runPythonScript('anomaly_model.py', {
    mode: 'evaluate',
    split_ratio: 0.8,
    rows: stockoutRows,
  });

  const metrics = {
    generated_at: now.toISOString(),
    stockout_j7: metricsStockout.metrics,
    consumption_j14: metricsConsumption.metrics,
    anomaly_detection: metricsAnomaly.metrics,
  };
  const backtesting = {
    generated_at: now.toISOString(),
    stockout_j7: metricsStockout.backtesting,
    consumption_j14: metricsConsumption.backtesting,
    anomaly_detection: metricsAnomaly.backtesting,
  };

  const realStockoutRows = stockoutRows.filter((r) => r.data_source === 'real').length;
  const realConsumptionRows = consumptionRows.filter((r) => r.data_source === 'real').length;

  const registry = {
    trained_at: now.toISOString(),
    model_version: versionTag,
    lookback_days: lookbackDays,
    model_files: {
      stockout: 'ai_py/stockout_model.py',
      consumption: 'ai_py/consumption_model.py',
      dataset_builder: 'ai_py/dataset_builder.py',
      anomaly: 'ai_py/anomaly_model.py',
      chatbot: 'ai_py/chatbot_responsable.py',
    },
    models: {
      stockout_j7_v1: {
        type: 'classification',
        language: 'python',
        algorithm: 'heuristic_classifier_python',
        train_rows: stockoutRows.length,
      },
      consumption_j14_v1: {
        type: 'regression',
        language: 'python',
        algorithm: 'weighted_trend_regression_python',
        train_rows: consumptionRows.length,
      },
      anomaly_detection_v1: {
        type: 'anomaly_detection',
        language: 'python',
        algorithm: 'heuristic_anomaly_detector_python',
        train_rows: stockoutRows.length,
      },
    },
    datasets: datasetsResult.files,
    stats: {
      products_count: ctx.products.length,
      stockout_rows: stockoutRows.length,
      consumption_rows: consumptionRows.length,
      stockout_real_rows: realStockoutRows,
      consumption_real_rows: realConsumptionRows,
      synthetic_fallback_used: !initiallyHadRealData,
    },
    data_quality: {
      real_ratio_stockout: Number(safeDiv(realStockoutRows, Math.max(1, stockoutRows.length), 0).toFixed(4)),
      real_ratio_consumption: Number(safeDiv(realConsumptionRows, Math.max(1, consumptionRows.length), 0).toFixed(4)),
      recommendation: (!initiallyHadRealData || realStockoutRows < 200 || realConsumptionRows < 200)
        ? 'Collecter plus de mouvements reels pour fiabiliser les modeles.'
        : 'Qualite data acceptable.',
    },
  };

  return { registry, files: datasetsResult.files, metrics, backtesting };
}

async function predictStockout(options = {}) {
  const horizonDays = Math.min(30, asPositiveInt(options.horizon_days, 7));
  const productFilter = Array.isArray(options.product_ids) ? new Set(options.product_ids.map(String)) : null;
  const ctx = await buildAIContext();
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
  const result = runPythonScript('stockout_model.py', {
    mode: 'predict',
    horizon_days: horizonDays,
    items,
  });
  return Array.isArray(result.predictions) ? result.predictions : [];
}

async function predictConsumption(options = {}) {
  const horizonDays = Math.min(30, asPositiveInt(options.horizon_days, 14));
  const productFilter = Array.isArray(options.product_ids) ? new Set(options.product_ids.map(String)) : null;
  const ctx = await buildAIContext();
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
  const result = runPythonScript('consumption_model.py', {
    mode: 'predict',
    horizon_days: horizonDays,
    items,
  });
  return Array.isArray(result.predictions) ? result.predictions : [];
}

async function predictAnomaly(options = {}) {
  const productFilter = Array.isArray(options.product_ids) ? new Set(options.product_ids.map(String)) : null;
  const ctx = await buildAIContext();
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
  const result = runPythonScript('anomaly_model.py', {
    mode: 'predict',
    items,
  });
  return Array.isArray(result.predictions) ? result.predictions : [];
}

async function buildCopilotRecommendations(options = {}) {
  const horizonDays = Math.min(30, asPositiveInt(options.horizon_days, 14));
  const topN = Math.min(20, asPositiveInt(options.top_n, 10));
  const simulations = Array.isArray(options.simulations) ? options.simulations : [];

  const [stockout, consumption, anomalies, ctx] = await Promise.all([
    predictStockout({ horizon_days: horizonDays }),
    predictConsumption({ horizon_days: horizonDays }),
    predictAnomaly({}),
    buildAIContext(),
  ]);

  const consumptionByPid = new Map(consumption.map((x) => [String(x.product_id), x]));
  const anomalyByPid = new Map(anomalies.map((x) => [String(x.product_id), x]));
  const merged = stockout.map((s) => {
    const c = consumptionByPid.get(String(s.product_id));
    const a = anomalyByPid.get(String(s.product_id));
    const anomalyFact = a?.is_anomaly ? `anomalie ${a.anomaly_score}%` : null;
    const factors = Array.isArray(s.factors) ? [...s.factors] : [];
    if (anomalyFact) factors.push(anomalyFact);
    return {
      ...s,
      expected_need: c?.expected_quantity ?? s.expected_need ?? 0,
      urgency: s.days_cover_estimate <= 3 ? 'critique' : s.days_cover_estimate <= 7 ? 'haute' : 'normale',
      anomaly_score: a?.anomaly_score ?? 0,
      explanation: factors.join(' + '),
    };
  }).sort((a, b) => Number(b.risk_probability || 0) - Number(a.risk_probability || 0));

  const top = merged.slice(0, topN);
  const actionPlan = top.map((x, idx) => ({
    rank: idx + 1,
    product_id: x.product_id,
    code_product: x.code_product,
    product_name: x.product_name,
    urgency: x.urgency,
    action: `Commander ${x.recommended_order_qty} unite(s)`,
    why: x.explanation,
  }));

  const simulationResults = [];
  for (const s of simulations) {
    const pid = String(s?.product_id || '');
    const qty = Number(s?.order_qty || 0);
    if (!pid || !Number.isFinite(qty) || qty < 0) continue;
    const series = ctx.dailySeriesByProduct.get(pid);
    if (!series || !series.dates.length) continue;
    const base = buildRecentFeatures(ctx, pid, series.dates.length - 1);
    if (!base) continue;
    const before = runPythonScript('stockout_model.py', {
      mode: 'predict',
      horizon_days: horizonDays,
      items: [base],
    }).predictions?.[0];
    const after = runPythonScript('stockout_model.py', {
      mode: 'predict',
      horizon_days: horizonDays,
      items: [{ ...base, stock_anchor: Number(base.stock_anchor || 0) + qty }],
    }).predictions?.[0];
    if (!before || !after) continue;
    simulationResults.push({
      product_id: pid,
      code_product: before.code_product,
      product_name: before.product_name,
      order_qty: qty,
      risk_before_pct: before.risk_probability,
      risk_after_pct: after.risk_probability,
      projected_stock_end_before: before.projected_stock_end,
      projected_stock_end_after: after.projected_stock_end,
    });
  }

  const curves = [];
  const maxCurveCount = Math.min(10, Math.max(5, topN));
  for (const x of top.slice(0, maxCurveCount)) {
    const series = ctx.dailySeriesByProduct.get(String(x.product_id));
    if (!series) continue;
    const n = series.dates.length;
    const start = Math.max(0, n - 30);
    const labels = series.dates.slice(start, n);
    const historyExit = series.exits.slice(start, n).map((v) => Number(v || 0));
    const c = consumptionByPid.get(String(x.product_id));
    const daily = Number((Number(c?.expected_daily || 0)).toFixed(4));
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

  return {
    generated_at: new Date().toISOString(),
    horizon_days: horizonDays,
    top_risk_products: top,
    action_plan: actionPlan,
    simulations: simulationResults,
    dashboard_curves: curves,
  };
}

async function askResponsableAssistant(options = {}) {
  const question = String(options.question || '').trim();
  if (!question) return { answer: 'Question vide.' };

  const history = Array.isArray(options.history) ? options.history : [];
  const providedContext = options.context && typeof options.context === 'object' ? options.context : null;
  const useGemini = options.use_gemini !== false;
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

  const result = runPythonScript('chatbot_responsable.py', {
    question,
    history,
    context,
    use_gemini: useGemini,
    mode,
  });
  return {
    answer: String(result?.answer || ''),
    source: result?.source || 'fallback',
    mode: result?.mode || mode,
  };
}

module.exports = {
  trainAndBuildDatasets,
  predictStockout,
  predictConsumption,
  predictAnomaly,
  buildCopilotRecommendations,
  askResponsableAssistant,
  makeVersionTag,
};
