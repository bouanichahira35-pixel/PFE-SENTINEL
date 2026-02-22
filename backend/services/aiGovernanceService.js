const AppSetting = require('../models/AppSetting');
const { trainAndBuildDatasets } = require('./aiModelService');
const logger = require('../utils/logger');

let intervalRef = null;

async function getSettingValue(key, fallback = null) {
  const item = await AppSetting.findOne({ setting_key: key }).lean();
  return item?.setting_value ?? fallback;
}

async function setSettingValue(key, value) {
  return AppSetting.findOneAndUpdate(
    { setting_key: key },
    { $set: { setting_value: value } },
    { returnDocument: 'after', upsert: true }
  );
}

function normalizeGovernance(raw) {
  return {
    min_training_interval_minutes: Number(raw?.min_training_interval_minutes || process.env.AI_MIN_TRAINING_INTERVAL_MINUTES || 360),
    auto_training_enabled: raw?.auto_training_enabled !== false && String(process.env.AI_AUTO_TRAINING_ENABLED || 'true') !== 'false',
    auto_training_every_minutes: Number(raw?.auto_training_every_minutes || process.env.AI_AUTO_TRAINING_EVERY_MINUTES || 360),
    max_versions_kept: Number(raw?.max_versions_kept || process.env.AI_MAX_VERSIONS_KEPT || 20),
  };
}

async function appendVersionSnapshot(registry, metrics, backtesting, maxVersions) {
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
      source: 'auto-training-job',
    },
    ...(Array.isArray(history) ? history : []),
  ].slice(0, Math.max(5, Number(maxVersions || 20)));
  await setSettingValue('ai_model_versions_v2', next);
}

async function runGovernedAutoTrain() {
  const governanceRaw = await getSettingValue('ai_governance_v2', null);
  const governance = normalizeGovernance(governanceRaw || {});
  if (!governance.auto_training_enabled) return;

  await setSettingValue('ai_governance_v2', governance);

  const registry = await getSettingValue('ai_models_registry_v2', null);
  const lastTrain = registry?.trained_at ? new Date(registry.trained_at) : null;
  const minIntervalMs = governance.min_training_interval_minutes * 60 * 1000;
  if (lastTrain && Number.isFinite(lastTrain.getTime())) {
    const elapsed = Date.now() - lastTrain.getTime();
    if (elapsed < minIntervalMs) return;
  }

  const lookbackDays = Number(process.env.AI_AUTO_TRAIN_LOOKBACK_DAYS || 240);
  const { registry: nextRegistry, metrics, backtesting } = await trainAndBuildDatasets({ lookback_days: lookbackDays });
  await setSettingValue('ai_models_registry_v2', nextRegistry);
  await setSettingValue('ai_models_metrics_v2', metrics);
  await setSettingValue('ai_models_backtesting_v2', backtesting);
  await appendVersionSnapshot(nextRegistry, metrics, backtesting, governance.max_versions_kept);
  logger.info({
    model_version: nextRegistry.model_version,
    trained_at: nextRegistry.trained_at,
  }, '[AI] Auto-training completed');
}

function startAiAutoTrainingJob() {
  if (intervalRef) return;
  const everyMinutes = Number(process.env.AI_AUTO_TRAINING_EVERY_MINUTES || 360);
  const intervalMs = Math.max(5, everyMinutes) * 60 * 1000;
  intervalRef = setInterval(() => {
    runGovernedAutoTrain().catch((err) => {
      logger.warn({ err: err?.message || err }, '[AI] Auto-training failed');
    });
  }, intervalMs);

  if (String(process.env.AI_AUTO_TRAIN_ON_BOOT || 'true') === 'true') {
    runGovernedAutoTrain().catch((err) => {
      logger.warn({ err: err?.message || err }, '[AI] Auto-training boot run failed');
    });
  }
}

module.exports = { startAiAutoTrainingJob, runGovernedAutoTrain };
