require('../loadEnv');

const { spawnSync } = require('child_process');
require('../db');
const mongoose = require('mongoose');

const AppSetting = require('../models/AppSetting');

async function run() {
  // 0) Seed test users (including admin) for demos/tests.
  const seedUsers = spawnSync(process.execPath, ['seed-human-users.js'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (seedUsers.status !== 0) {
    throw new Error(`Seed users failed (exit=${seedUsers.status})`);
  }

  // 1) Force-enable AI features for demos.
  await AppSetting.findOneAndUpdate(
    { setting_key: 'ai_config' },
    {
      $set: {
        setting_value: {
          predictionsEnabled: true,
          alertesAuto: true,
          analyseConsommation: true,
        },
      },
    },
    { upsert: true, returnDocument: 'after' }
  );

  // 2) Seed enough data so the dashboard has curves/alerts.
  const seed = spawnSync(process.execPath, ['scripts/seed-magasinier-large-data.js'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (seed.status !== 0) {
    throw new Error(`Seed failed (exit=${seed.status})`);
  }

  const seedAnomalies = spawnSync(process.execPath, ['scripts/seed-critical-anomalies.js'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (seedAnomalies.status !== 0) {
    throw new Error(`Seed critical anomalies failed (exit=${seedAnomalies.status})`);
  }

  // eslint-disable-next-line no-console
  console.log('DEMO_SETUP_OK', {
    users: 'seed-human',
    ai_config: 'enabled',
    seed: 'magasinier-large + anomalies',
  });
}

run()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('DEMO_SETUP_FAILED', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch (_) {
      // ignore
    }
  });
