require('../loadEnv');

const { spawn, spawnSync } = require('child_process');
const axios = require('axios');

const TEST_PORT = Number(process.env.AI_CHATBOT_TEST_PORT || 5013);
const API_BASE = `http://127.0.0.1:${TEST_PORT}/api`;

function getTestEnv(name, fallbackForLocal) {
  const value = String(process.env[name] || '').trim();
  if (value) return value;

  const isCi = String(process.env.CI || '').toLowerCase() === 'true';
  if (isCi || fallbackForLocal === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return fallbackForLocal;
}

const CREDS = {
  magasinier: {
    identifier: getTestEnv('TEST_MAGASINIER_EMAIL', 'magasinier@example.local'),
    password: getTestEnv('TEST_MAGASINIER_PASSWORD', 'ChangeMe_Magasinier_123'),
  },
  responsable: {
    identifier: getTestEnv('TEST_RESPONSABLE_EMAIL', 'responsable@example.local'),
    password: getTestEnv('TEST_RESPONSABLE_PASSWORD', 'ChangeMe_Responsable_123'),
  },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectHttpStatus(err, status) {
  const code = Number(err?.response?.status || 0);
  if (code !== status) {
    throw new Error(`Unexpected HTTP status=${code}, expected=${status}`);
  }
}

async function waitForHealth(client, retries = 60) {
  for (let i = 0; i < retries; i += 1) {
    try {
      const { data } = await client.get('/health');
      const status = String(data?.status || '').toLowerCase();
      if (status === 'ok' || status === 'degraded') return;
    } catch {
      // retry
    }
    await sleep(1000);
  }
  throw new Error('API health timeout');
}

async function login(client, creds) {
  const { data } = await client.post('/auth/login', creds);
  return data?.token;
}

async function run() {
  const seedRun = spawnSync(process.execPath, ['seed-human-users.js'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'ignore',
  });
  if (seedRun.status !== 0) {
    throw new Error('Unable to seed human users for ai/chatbot test');
  }

  const env = {
    ...process.env,
    PORT: String(TEST_PORT),
    AI_AUTO_TRAIN_ON_BOOT: 'false',
    MAIL_QUEUE_ENABLED: 'false',
    GEMINI_API_KEY: '',
  };

  const server = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  const client = axios.create({ baseURL: API_BASE, timeout: 20000 });
  let respApi = null;
  let originalAiConfig = null;

  try {
    await waitForHealth(client);

    const [respToken, magToken] = await Promise.all([
      login(client, CREDS.responsable),
      login(client, CREDS.magasinier),
    ]);

    respApi = axios.create({
      baseURL: API_BASE,
      timeout: 20000,
      headers: { Authorization: `Bearer ${respToken}` },
    });
    const magApi = axios.create({
      baseURL: API_BASE,
      timeout: 20000,
      headers: { Authorization: `Bearer ${magToken}` },
    });

    const aiConfigResponse = await respApi.get('/settings/ai/config');
    const currentAiConfig = aiConfigResponse?.data?.value || {};
    originalAiConfig = {
      predictionsEnabled: currentAiConfig?.predictionsEnabled !== false,
      alertesAuto: currentAiConfig?.alertesAuto !== false,
      analyseConsommation: currentAiConfig?.analyseConsommation !== false,
    };

    const statusResp = (await respApi.get('/ai/assistant/status')).data;
    assert(statusResp?.ok === true, 'assistant status should return ok=true');
    assert(typeof statusResp?.capabilities?.assistant_ask?.enabled === 'boolean', 'assistant_ask capability missing');
    assert(typeof statusResp?.capabilities?.assistant_voice_ask?.enabled === 'boolean', 'assistant_voice_ask capability missing');

    try {
      await magApi.get('/ai/assistant/status');
      throw new Error('assistant status should be responsable-only');
    } catch (err) {
      expectHttpStatus(err, 403);
    }

    await respApi.patch('/settings/ai/config', {
      predictionsEnabled: false,
      alertesAuto: true,
      analyseConsommation: true,
    });

    try {
      await respApi.post('/ai/predict/stockout', { horizon_days: 7 });
      throw new Error('predict/stockout should be blocked when predictionsEnabled=false');
    } catch (err) {
      expectHttpStatus(err, 409);
    }

    try {
      await respApi.post('/ai/assistant/ask', {
        question: 'Test blocage',
        history: [],
        mode: 'chat',
      });
      throw new Error('assistant/ask should be blocked when predictionsEnabled=false');
    } catch (err) {
      expectHttpStatus(err, 409);
    }

    await respApi.patch('/settings/ai/config', {
      predictionsEnabled: true,
      alertesAuto: true,
      analyseConsommation: false,
    });

    try {
      await respApi.post('/ai/predict/consumption', { horizon_days: 14 });
      throw new Error('predict/consumption should be blocked when analyseConsommation=false');
    } catch (err) {
      expectHttpStatus(err, 409);
    }

    const copilotResp = (await respApi.post('/ai/copilot/recommendations', {
      horizon_days: 14,
      top_n: 5,
      simulations: [],
    })).data;
    assert(copilotResp?.ok === true, 'copilot recommendations should return ok=true');
    assert(copilotResp?.ai_config?.analyseConsommation === false, 'copilot should expose analyseConsommation=false');
    assert(Array.isArray(copilotResp?.top_risk_products), 'copilot top_risk_products should be an array');

    const askResp = (await respApi.post('/ai/assistant/ask', {
      question: 'Donne moi un resume des priorites stock.',
      history: [],
      mode: 'chat',
    })).data;
    assert(askResp?.ok === true, 'assistant ask should return ok=true');
    assert(String(askResp?.answer || '').trim().length > 0, 'assistant answer should not be empty');
    assert(Array.isArray(askResp?.partial_warnings), 'assistant partial_warnings should be an array');

    const statusWhenConsumptionDisabled = (await respApi.get('/ai/assistant/status')).data;
    assert(
      statusWhenConsumptionDisabled?.capabilities?.predict_consumption?.enabled === false,
      'assistant status should expose predict_consumption=false when analyseConsommation=false'
    );
    assert(
      statusWhenConsumptionDisabled?.capabilities?.assistant_ask?.enabled === true,
      'assistant ask should stay enabled when predictionsEnabled=true'
    );

    // eslint-disable-next-line no-console
    console.log('AI_CHATBOT_CONFIG_OK');
  } finally {
    if (respApi && originalAiConfig) {
      try {
        await respApi.patch('/settings/ai/config', originalAiConfig);
      } catch (_) {
        // ignore restore errors in cleanup
      }
    }
    server.kill('SIGTERM');
  }
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('AI_CHATBOT_CONFIG_FAILED', err?.response?.data || err?.message || err);
  process.exit(1);
});
