require('../loadEnv');

const { spawn, spawnSync } = require('child_process');
const axios = require('axios');

const TEST_PORT = Number(process.env.CRITICAL_TEST_PORT || 5011);
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
  demandeur: {
    identifier: getTestEnv('TEST_DEMANDEUR_EMAIL', 'demandeur@example.local'),
    password: getTestEnv('TEST_DEMANDEUR_PASSWORD', 'ChangeMe_Demandeur_123'),
    role: 'demandeur',
  },
  magasinier: {
    identifier: getTestEnv('TEST_MAGASINIER_EMAIL', 'magasinier@example.local'),
    password: getTestEnv('TEST_MAGASINIER_PASSWORD', 'ChangeMe_Magasinier_123'),
    role: 'magasinier',
  },
  responsable: {
    identifier: getTestEnv('TEST_RESPONSABLE_EMAIL', 'responsable@example.local'),
    password: getTestEnv('TEST_RESPONSABLE_PASSWORD', 'ChangeMe_Responsable_123'),
    role: 'responsable',
  },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(client, retries = 60) {
  for (let i = 0; i < retries; i += 1) {
    try {
      const { data } = await client.get('/health');
      if (['ok', 'degraded'].includes(String(data?.status || '').toLowerCase())) return;
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
  // Ensure known test users/passwords exist before login checks.
  const seedRun = spawnSync(process.execPath, ['seed-human-users.js'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'ignore',
  });
  if (seedRun.status !== 0) {
    throw new Error('Unable to seed human users for critical flow test');
  }

  const env = {
    ...process.env,
    PORT: String(TEST_PORT),
    AI_AUTO_TRAIN_ON_BOOT: 'false',
  };
  const server = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  const client = axios.create({ baseURL: API_BASE, timeout: 15000 });

  try {
    await waitForHealth(client);

    const [respToken, magToken, demToken] = await Promise.all([
      login(client, CREDS.responsable),
      login(client, CREDS.magasinier),
      login(client, CREDS.demandeur),
    ]);

    const respApi = axios.create({ baseURL: API_BASE, headers: { Authorization: `Bearer ${respToken}` } });
    const magApi = axios.create({ baseURL: API_BASE, headers: { Authorization: `Bearer ${magToken}` } });
    const demApi = axios.create({ baseURL: API_BASE, headers: { Authorization: `Bearer ${demToken}` } });

    const uniq = Date.now();
    const qrValue = `AUTO-QR-${uniq}`;
    const productPayload = {
      name: `Auto Produit ${uniq}`,
      category_name: 'AutoTest',
      family: 'economat',
      quantity_current: 0,
      seuil_minimum: 2,
      stock_initial_year: 0,
      qr_code_value: qrValue,
      validation_status: 'approved',
    };
    const createdProduct = (await respApi.post('/products', productPayload)).data;

    const entryPayload = {
      product: createdProduct._id,
      quantity: 30,
      unit_price: 1,
      supplier: 'Auto Supplier',
    };
    await magApi.post('/stock/entries', entryPayload);

    const createdRequest = (await demApi.post('/requests', {
      product: createdProduct._id,
      quantity_requested: 5,
      direction_laboratory: 'DSP',
      beneficiary: 'Auto Beneficiary',
      note: 'Auto critical flow',
    })).data;

    await respApi.patch(`/requests/${createdRequest._id}/validate`, { status: 'validated' });
    await magApi.patch(`/requests/${createdRequest._id}/prepare`, {});

    const createdExit = (await magApi.post('/stock/exits', {
      product: createdProduct._id,
      quantity: 5,
      direction_laboratory: 'DSP',
      beneficiary: 'Auto Beneficiary',
      demandeur: createdRequest.demandeur,
      request: createdRequest._id,
    })).data;

    await magApi.patch(`/requests/${createdRequest._id}/serve`, {
      stock_exit_id: createdExit._id,
      note: 'Served by auto test',
    });

    const historyResponse = (await respApi.get('/history', { params: { request: createdRequest._id, limit: 100 } })).data;
    const historyItems = Array.isArray(historyResponse) ? historyResponse : (historyResponse?.items || []);

    const hasExit = historyItems.some((h) => h.action_type === 'exit');
    const hasServed = historyItems.some((h) => h.action_type === 'request' && h.status_after === 'served');
    if (!hasExit || !hasServed) {
      throw new Error('History flow check failed (missing exit or served event)');
    }

    // eslint-disable-next-line no-console
    console.log('CRITICAL_FLOW_OK');
  } finally {
    server.kill('SIGTERM');
  }
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('CRITICAL_FLOW_FAILED', err?.response?.data || err?.message || err);
  process.exit(1);
});
