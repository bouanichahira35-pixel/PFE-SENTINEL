require('dotenv').config();

const { spawn, spawnSync } = require('child_process');
const axios = require('axios');

const TEST_PORT = Number(process.env.GUARDRAILS_TEST_PORT || 5012);
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
  },
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
      if (status === 'ok' || status === 'degraded') return data;
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
  const seedRun = spawnSync('node', ['seed-human-users.js'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'ignore',
  });
  if (seedRun.status !== 0) {
    throw new Error('Unable to seed human users for guardrails test');
  }

  const env = {
    ...process.env,
    PORT: String(TEST_PORT),
    AI_AUTO_TRAIN_ON_BOOT: 'false',
  };

  const server = spawn('node', ['server.js'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  server.stdout.on('data', () => {});
  server.stderr.on('data', () => {});

  const client = axios.create({ baseURL: API_BASE, timeout: 15000 });

  try {
    const health = await waitForHealth(client);
    assert(['ok', 'degraded'].includes(String(health?.status || '').toLowerCase()), 'Health must be ok or degraded');
    assert(Boolean(health?.mongodb?.status), 'Health must expose mongodb status');

    try {
      await client.get('/products');
      throw new Error('Unauthorized /products call unexpectedly succeeded');
    } catch (err) {
      expectHttpStatus(err, 401);
    }

    const [responsableToken, magasinierToken, demandeurToken] = await Promise.all([
      login(client, CREDS.responsable),
      login(client, CREDS.magasinier),
      login(client, CREDS.demandeur),
    ]);

    const respApi = axios.create({ baseURL: API_BASE, headers: { Authorization: `Bearer ${responsableToken}` } });
    const magApi = axios.create({ baseURL: API_BASE, headers: { Authorization: `Bearer ${magasinierToken}` } });
    const demApi = axios.create({ baseURL: API_BASE, headers: { Authorization: `Bearer ${demandeurToken}` } });

    const uniq = Date.now();
    const product = (await respApi.post('/products', {
      name: `Guard Produit ${uniq}`,
      category_name: 'Guardrails',
      family: 'economat',
      quantity_current: 0,
      seuil_minimum: 1,
      stock_initial_year: 0,
      qr_code_value: `GUARD-QR-${uniq}`,
      validation_status: 'approved',
    })).data;

    await magApi.post('/stock/entries', {
      product: product._id,
      quantity: 10,
      unit_price: 1,
      supplier: 'Guard Supplier',
      lot_number: `LOT-${uniq}`,
      lot_qr_value: `LOT-QR-${uniq}`,
      entry_mode: 'manual',
    });

    try {
      await magApi.post('/stock/exits', {
        product: product._id,
        quantity: 1,
        scanned_lot_qr: `WRONG-QR-${uniq}`,
        exit_mode: 'fifo_qr',
      });
      throw new Error('FIFO mismatch check unexpectedly succeeded');
    } catch (err) {
      expectHttpStatus(err, 400);
      const code = String(err?.response?.data?.code || '');
      assert(code === 'VALIDATION_FAILED', `Expected VALIDATION_FAILED, got ${code || 'empty'}`);
    }

    const bond = (await magApi.post('/stock/internal-bond/generate', {
      product: product._id,
      quantity: 2,
      withdrawal_paper_number: `BOND-${uniq}`,
      direction_laboratory: 'DSP',
      beneficiary: 'Guard Beneficiary',
      valid_hours: 2,
    })).data;

    const firstExit = (await magApi.post('/stock/exits', {
      product: product._id,
      quantity: 2,
      internal_bond_token: bond.qr_value,
      exit_mode: 'internal_bond',
    })).data;
    assert(Boolean(firstExit?._id), 'First internal-bond exit must be created');

    try {
      await magApi.post('/stock/exits', {
        product: product._id,
        quantity: 2,
        internal_bond_token: bond.qr_value,
        exit_mode: 'internal_bond',
      });
      throw new Error('Internal bond replay unexpectedly succeeded');
    } catch (err) {
      expectHttpStatus(err, 409);
    }

    const reqDoc = (await demApi.post('/requests', {
      product: product._id,
      quantity_requested: 1,
      direction_laboratory: 'DSP',
      beneficiary: 'Auto Beneficiary',
      note: 'Guard workflow check',
    })).data;

    try {
      await magApi.patch(`/requests/${reqDoc._id}/serve`, {
        stock_exit_id: firstExit._id,
        note: 'Should fail before acceptance',
      });
      throw new Error('Serve without accepted status unexpectedly succeeded');
    } catch (err) {
      expectHttpStatus(err, 400);
      const details = String(err?.response?.data?.details || '');
      const detailsLower = details.toLowerCase();
      assert(
        detailsLower.includes('decision') && detailsLower.includes('requise avant service'),
        `Unexpected serve-guard error: ${details || 'empty'}`
      );
    }

    // eslint-disable-next-line no-console
    console.log('GUARDRAILS_OK');
  } finally {
    server.kill('SIGTERM');
  }
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('GUARDRAILS_FAILED', err?.response?.data || err?.message || err);
  process.exit(1);
});
