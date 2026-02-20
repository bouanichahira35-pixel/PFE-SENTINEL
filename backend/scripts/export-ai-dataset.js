require('dotenv').config();
const mongoose = require('../db');
const AppSetting = require('../models/AppSetting');
const { trainAndBuildDatasets } = require('../services/aiModelService');

async function run() {
  const lookbackDays = Math.min(730, Math.max(30, Number(process.argv[2] || 240)));
  const { registry, metrics, backtesting } = await trainAndBuildDatasets({ lookback_days: lookbackDays });
  await AppSetting.findOneAndUpdate(
    { setting_key: 'ai_models_registry_v2' },
    { $set: { setting_value: registry } },
    { upsert: true }
  );
  await AppSetting.findOneAndUpdate(
    { setting_key: 'ai_models_metrics_v2' },
    { $set: { setting_value: metrics } },
    { upsert: true }
  );
  await AppSetting.findOneAndUpdate(
    { setting_key: 'ai_models_backtesting_v2' },
    { $set: { setting_value: backtesting } },
    { upsert: true }
  );
  console.log('AI datasets exported and registry updated.');
  console.log(JSON.stringify(registry.datasets, null, 2));
}

run()
  .then(async () => {
    await mongoose.connection.close();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('AI dataset export failed:', err);
    await mongoose.connection.close();
    process.exit(1);
  });
