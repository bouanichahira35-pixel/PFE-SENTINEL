// BLOC 1 - Role du fichier.
// Ce fichier sert de script de maintenance, seed, test ou migration pour test-stock-product-flow.
// Point de vigilance: ne pas lancer en production sans confirmer les variables .env et la base cible.

require('../loadEnv');

const { spawn, spawnSync } = require('child_process');
const axios = require('axios');

const TEST_PORT = Number(process.env.STOCK_FLOW_TEST_PORT || 5013);
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
  return `${base.slice(0, idx + 1)}${dbName}${suffix}${query}`;
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

async function fetchProduct(api, productId) {
  const { data } = await api.get('/products', { params: { include_archived: '1' } });
  const products = Array.isArray(data) ? data : (data?.items || data?.data || []);
  return products.find((item) => String(item?._id) === String(productId)) || null;
}

async function run() {
  const testDbUri = deriveMongoUriForTest(process.env.MONGODB_URI, `_test_${TEST_PORT}`);
  const seedRun = spawnSync(process.execPath, ['seed-human-users.js'], {
    cwd: process.cwd(),
    env: { ...process.env, MONGODB_URI: testDbUri },
    stdio: 'ignore',
  });
  if (seedRun.status !== 0) throw new Error('Unable to seed human users for stock flow test');

  const env = {
    ...process.env,
    MONGODB_URI: testDbUri,
    PORT: String(TEST_PORT),
    AI_AUTO_TRAIN_ON_BOOT: 'false',
    SINGLE_SESSION_MODE: 'false',
  };
  const server = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  const client = axios.create({ baseURL: API_BASE, timeout: 15000 });

  try {
    await waitForHealth(client);

    const [respToken, magToken] = await Promise.all([
      login(client, CREDS.responsable),
      login(client, CREDS.magasinier),
    ]);

    const respApi = axios.create({ baseURL: API_BASE, headers: { Authorization: `Bearer ${respToken}` }, timeout: 15000 });
    const magApi = axios.create({ baseURL: API_BASE, headers: { Authorization: `Bearer ${magToken}` }, timeout: 15000 });

    const uniq = Date.now();
    const product = (await respApi.post('/products', {
      name: `Flow Produit ${uniq}`,
      category_name: 'FlowStock',
      family: 'economat',
      unite: 'piece',
      quantity_current: 0,
      seuil_minimum: 5,
      stock_initial_year: 0,
      qr_code_value: `FLOW-QR-${uniq}`,
      validation_status: 'approved',
    })).data;

    assert(Boolean(product?._id), 'Product creation must return _id');
    const createdProduct = await fetchProduct(respApi, product._id);
    assert(Number(createdProduct?.quantity_current || 0) === 0, 'New product stock must start at 0');

    const entry = (await magApi.post('/stock/entries', {
      product: product._id,
      quantity: 30,
      unit_price: 12.5,
      supplier: 'Flow Supplier',
      delivery_note_number: `FLOW-BL-${uniq}`,
      lot_number: `FLOW-LOT-${uniq}`,
      lot_qr_value: `FLOW-LOT-QR-${uniq}`,
      date_entry: new Date().toISOString(),
      entry_mode: 'manual',
    })).data;

    assert(Boolean(entry?._id), 'Stock entry must be created');
    const afterEntry = await fetchProduct(respApi, product._id);
    assert(Number(afterEntry?.quantity_current || 0) === 30, `Expected stock 30 after entry, got ${afterEntry?.quantity_current}`);

    const exit = (await magApi.post('/stock/exits', {
      product: product._id,
      quantity: 7,
      direction_laboratory: 'DSP',
      beneficiary: 'Flow Beneficiary',
      date_exit: new Date().toISOString(),
      exit_mode: 'manual',
      note: 'Flow stock test exit',
    })).data;

    assert(Boolean(exit?._id), 'Stock exit must be created');
    const afterExit = await fetchProduct(respApi, product._id);
    assert(Number(afterExit?.quantity_current || 0) === 23, `Expected stock 23 after exit, got ${afterExit?.quantity_current}`);

    try {
      await magApi.post('/stock/exits', {
        product: product._id,
        quantity: 999,
        direction_laboratory: 'DSP',
        beneficiary: 'Flow Beneficiary',
        date_exit: new Date().toISOString(),
        exit_mode: 'manual',
      });
      throw new Error('Over-exit unexpectedly succeeded');
    } catch (err) {
      expectHttpStatus(err, 400);
      const code = String(err?.response?.data?.code || '');
      assert(code === 'STOCK_INSUFFICIENT', `Expected STOCK_INSUFFICIENT, got ${code || 'empty'}`);
    }

    const [entriesResponse, exitsResponse] = await Promise.all([
      magApi.get('/stock/entries'),
      magApi.get('/stock/exits'),
    ]);
    const entries = Array.isArray(entriesResponse.data) ? entriesResponse.data : [];
    const exits = Array.isArray(exitsResponse.data) ? exitsResponse.data : [];
    assert(entries.some((item) => String(item?._id) === String(entry._id)), 'Created entry must be listed');
    assert(exits.some((item) => String(item?._id) === String(exit._id)), 'Created exit must be listed');

    // eslint-disable-next-line no-console
    console.log(`STOCK_PRODUCT_FLOW_OK product=${product._id} entry=${entry._id} exit=${exit._id} final_stock=23`);
  } finally {
    server.kill('SIGTERM');
  }
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('STOCK_PRODUCT_FLOW_FAILED', err?.response?.data || err?.message || err);
  process.exit(1);
});
