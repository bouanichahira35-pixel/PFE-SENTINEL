require('../loadEnv');

const { spawn, spawnSync } = require('child_process');
const axios = require('axios');

const TEST_PORT = Number(process.env.GUARDRAILS_TEST_PORT || 5012);
const API_BASE = `http://127.0.0.1:${TEST_PORT}/api`;

function deriveMongoUriForTest(baseUri, suffix) {
  const uri = String(baseUri || '').trim();
  if (!uri) return uri;
  const parts = uri.split('?');
  const base = parts[0];
  const query = parts.length > 1 ? `?${parts.slice(1).join('?')}` : '';
  const idx = base.lastIndexOf('/');
  if (idx < 0 || idx === base.length - 1) return uri;
  const dbName = base.slice(idx + 1);
  const nextDb = `${dbName}${suffix}`;
  return `${base.slice(0, idx + 1)}${nextDb}${query}`;
}

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
  const testDbUri = deriveMongoUriForTest(process.env.MONGODB_URI, `_test_${TEST_PORT}`);
  const seedRun = spawnSync(process.execPath, ['seed-human-users.js'], {
    cwd: process.cwd(),
    env: { ...process.env, MONGODB_URI: testDbUri },
    stdio: 'ignore',
  });
  if (seedRun.status !== 0) {
    throw new Error('Unable to seed human users for guardrails test');
  }

  const env = {
    ...process.env,
    MONGODB_URI: testDbUri,
    PORT: String(TEST_PORT),
    AI_AUTO_TRAIN_ON_BOOT: 'false',
    // Tests run in parallel with local UI sessions; avoid revoking sessions unexpectedly.
    SINGLE_SESSION_MODE: 'false',
  };

  const server = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'ignore', 'ignore'],
  });

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
      delivery_note_number: `GUARD-BL-${uniq}`,
      date_entry: new Date().toISOString(),
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
        note: 'Should fail before validation',
      });
      throw new Error('Serve without validated status unexpectedly succeeded');
    } catch (err) {
      expectHttpStatus(err, 400);
      const details = String(err?.response?.data?.details || '');
      const detailsLower = details.toLowerCase();
      assert(
        (detailsLower.includes('decision') || detailsLower.includes('validation') || detailsLower.includes('responsable'))
          && detailsLower.includes('requise avant service'),
        `Unexpected serve-guard error: ${details || 'empty'}`
      );
    }

    const launchOptions = (await respApi.get('/inventory/launch/options')).data;
    const magasinierId = String(launchOptions?.magasiniers?.[0]?._id || '');
    assert(Boolean(magasinierId), 'Inventory launch options must expose at least one magasinier');

    const inventory = (await respApi.post('/inventory/inventories', {
      type_inventaire: 'TOURNANT',
      product_id: product._id,
      magasinier_ids: [magasinierId],
      date_prevue: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      commentaire: 'Guardrail: inventory must be cancelled, not deleted',
      bloquer_mouvements: true,
      notifications_activees: false,
    })).data?.inventory;
    assert(Boolean(inventory?._id), 'Inventory must be created for delete guardrail check');

    try {
      await respApi.delete(`/inventory/responsable/inventories/${inventory._id}`);
      throw new Error('Inventory delete unexpectedly succeeded');
    } catch (err) {
      expectHttpStatus(err, 409);
      const code = String(err?.response?.data?.code || '');
      assert(code === 'INVENTORY_DELETE_DISABLED', `Expected INVENTORY_DELETE_DISABLED, got ${code || 'empty'}`);
    }

    const afterDeleteAttempt = (await respApi.get('/inventory/inventories', { params: { status: 'A_FAIRE' } })).data;
    const stillActive = (afterDeleteAttempt?.inventories || []).find((item) => String(item._id) === String(inventory._id));
    assert(Boolean(stillActive), 'Inventory must remain after rejected delete attempt');

    await respApi.post(`/inventory/responsable/inventories/${inventory._id}/cancel`, {
      motif: 'Guardrail cancel instead of delete',
    });
    const cancelledInventory = (await respApi.get('/inventory/inventories', { params: { status: 'ANNULE' } })).data;
    const retained = (cancelledInventory?.inventories || []).find((item) => String(item._id) === String(inventory._id));
    assert(Boolean(retained), 'Cancelled inventory must be retained in inventory history');
    assert(String(retained.status) === 'ANNULE', 'Cancelled inventory must have ANNULE status');

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
