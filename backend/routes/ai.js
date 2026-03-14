const router = require('express').Router();
const AIAlert = require('../models/AIAlert');
const AIPrediction = require('../models/AIPrediction');
const AppSetting = require('../models/AppSetting');
const AIRecommendationTrace = require('../models/AIRecommendationTrace');
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
} = require('../services/aiModelService');

const AI_SETTINGS_DEFAULT = Object.freeze({
  predictionsEnabled: true,
  alertesAuto: true,
  analyseConsommation: true,
});

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
  if (req.user?.role !== 'responsable') {
    res.status(403).json({ error: 'Acces refuse (responsable uniquement)' });
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

function ensureConsumptionAnalysisEnabled(config, res) {
  if (config?.analyseConsommation !== false) return true;
  res.status(409).json({
    error: 'Analyse de consommation desactivee',
    details: 'Activez "Analyse de consommation" dans Parametres > Intelligence Artificielle.',
  });
  return false;
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
    const items = await AIAlert.find().populate('product').sort({ detected_at: -1, createdAt: -1 });
    return res.json(items);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch AI alerts', details: err.message });
  }
});

router.get('/predictions', requireAuth, async (req, res) => {
  try {
    const items = await AIPrediction.find().populate('product').sort({ createdAt: -1 });
    return res.json(items);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch AI predictions', details: err.message });
  }
});

router.get('/models/status', requireAuth, async (req, res) => {
  try {
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
    const metrics = await getSettingValue('ai_models_metrics_v2', null);
    return res.json({ ok: true, metrics: metrics || null });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch model metrics', details: err.message });
  }
});

router.get('/models/backtesting', requireAuth, async (req, res) => {
  try {
    const backtesting = await getSettingValue('ai_models_backtesting_v2', null);
    return res.json({ ok: true, backtesting: backtesting || null });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch backtesting', details: err.message });
  }
});

router.get('/models/versions', requireAuth, async (req, res) => {
  try {
    const versions = await getSettingValue('ai_model_versions_v2', []);
    return res.json({ ok: true, versions: Array.isArray(versions) ? versions : [] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch model versions', details: err.message });
  }
});

router.get('/gemini/status', requireAuth, async (req, res) => {
  try {
    return res.json({
      ok: true,
      configured: isGeminiConfigured(),
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
    if (!ensureResponsable(req, res)) return;
    const aiConfig = await getAiConfig();
    if (!ensureAiPredictionsEnabled(aiConfig, res)) return;
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
          error: 'Training locked by governance interval',
          details: `Attendez ${Math.ceil((minIntervalMs - elapsedMs) / 60000)} minute(s) ou utilisez force=true.`,
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

router.post('/assistant/ask', requireAuth, strictBody(['question', 'history', 'mode']), async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;
    const aiConfig = await getAiConfig();
    if (!ensureAiPredictionsEnabled(aiConfig, res)) return;
    const geminiConfigured = isGeminiConfigured();

    const questionRaw = String(req.body?.question || '').trim();
    if (!questionRaw) return res.status(400).json({ error: 'question obligatoire' });
    const mode = String(req.body?.mode || 'chat').toLowerCase() === 'report' ? 'report' : 'chat';
    const signals = await buildAssistantSignals({
      includeConsumption: aiConfig.analyseConsommation !== false,
    });

    const assistant = await askResponsableAssistant({
      question: questionRaw,
      history: Array.isArray(req.body?.history) ? req.body.history : [],
      use_gemini: geminiConfigured,
      strict_gemini: geminiConfigured,
      mode,
      context: {
        stockout_top: signals.stockout.slice(0, 5),
        consumption_top: signals.consumption.slice(0, 5),
        anomaly_top: signals.anomaly.slice(0, 5),
        action_plan: Array.isArray(signals.copilot?.action_plan) ? signals.copilot.action_plan.slice(0, 5) : [],
        metrics: signals.metrics || {},
      },
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
    const signals = await buildAssistantSignals({
      includeConsumption: aiConfig.analyseConsommation !== false,
    });

    const assistant = await askResponsableAssistant({
      question: transcript,
      history: Array.isArray(req.body?.history) ? req.body.history : [],
      use_gemini: true,
      strict_gemini: false,
      mode,
      context: {
        stockout_top: signals.stockout.slice(0, 5),
        consumption_top: signals.consumption.slice(0, 5),
        anomaly_top: signals.anomaly.slice(0, 5),
        action_plan: Array.isArray(signals.copilot?.action_plan) ? signals.copilot.action_plan.slice(0, 5) : [],
        metrics: signals.metrics || {},
      },
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

module.exports = router;
