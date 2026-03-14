require('../loadEnv');
const mongoose = require('../db');

const { spawn, spawnSync } = require('child_process');
const axios = require('axios');
const bcrypt = require('bcryptjs');

const User = require('../models/User');
const PasswordReset = require('../models/PasswordReset');

const TEST_PORT = Number(process.env.AUTH_RECOVERY_TEST_PORT || 5013);
const API_BASE = `http://127.0.0.1:${TEST_PORT}/api`;
const OTP_CODE = '123456';

function getTestEnv(name, fallbackForLocal) {
  const value = String(process.env[name] || '').trim();
  if (value) return value;

  const isCi = String(process.env.CI || '').toLowerCase() === 'true';
  if (isCi || fallbackForLocal === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return fallbackForLocal;
}

const ACTORS = [
  {
    role: 'demandeur',
    legacyRole: 'viewer',
    identifier: getTestEnv('TEST_DEMANDEUR_EMAIL', 'demandeur@example.local'),
    basePassword: getTestEnv('TEST_DEMANDEUR_PASSWORD', 'ChangeMe_Demandeur_123'),
  },
  {
    role: 'magasinier',
    legacyRole: 'stock_manager',
    identifier: getTestEnv('TEST_MAGASINIER_EMAIL', 'magasinier@example.local'),
    basePassword: getTestEnv('TEST_MAGASINIER_PASSWORD', 'ChangeMe_Magasinier_123'),
  },
  {
    role: 'responsable',
    legacyRole: 'admin_app',
    identifier: getTestEnv('TEST_RESPONSABLE_EMAIL', 'responsable@example.local'),
    basePassword: getTestEnv('TEST_RESPONSABLE_PASSWORD', 'ChangeMe_Responsable_123'),
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function seedUsersOrThrow() {
  const seedRun = spawnSync('node', ['seed-human-users.js'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'ignore',
  });

  if (seedRun.status !== 0) {
    throw new Error('Unable to seed human users');
  }
}

async function applyLegacyRolesAndStatus() {
  for (const actor of ACTORS) {
    const email = String(actor.identifier || '').trim().toLowerCase();
    const update = await User.updateOne(
      { email },
      {
        $set: {
          role: actor.legacyRole,
          status: 'actif',
        },
      }
    );

    assert(update.matchedCount > 0, `Missing user for ${actor.role} (${email})`);
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

async function login(client, { identifier, password, role }) {
  const { data } = await client.post('/auth/login', { identifier, password, role });
  return data;
}

async function runForgotPasswordCycle(client, actor, index) {
  const email = String(actor.identifier || '').trim().toLowerCase();

  const requestResp = await client.post('/auth/forgot-password/request', {
    email,
    role: actor.role,
  });

  assert(requestResp.status === 200, `Forgot request failed for ${actor.role}`);

  const requestData = requestResp?.data || {};
  const otpFromApi = typeof requestData.dev_otp === 'string' ? requestData.dev_otp : '';

  const user = await User.findOne({ email }).select('_id email role status').lean();
  assert(user?._id, `User not found for forgot flow: ${actor.role}`);

  let otpForVerify = otpFromApi;

  if (!otpForVerify) {
    const reset = await PasswordReset.findOne({ user: user._id, status: 'valid' }).sort({ createdAt: -1 });
    assert(reset?._id, `No valid OTP reset entry for ${actor.role}`);

    const resetHash = await bcrypt.hash(OTP_CODE, 4);
    await PasswordReset.updateOne(
      { _id: reset._id },
      {
        $set: {
          reset_code: resetHash,
          expiration_date: new Date(Date.now() + 10 * 60 * 1000),
          attempts: 0,
          verified_at: null,
          status: 'valid',
        },
      }
    );

    otpForVerify = OTP_CODE;
  }

  const verifyResp = await client.post('/auth/forgot-password/verify', {
    email,
    code: otpForVerify,
    role: actor.role,
  });

  const resetToken = verifyResp?.data?.resetToken;
  assert(Boolean(resetToken), `Missing reset token for ${actor.role}`);

  const newPassword = `Reset_${actor.role}_A${index + 1}b9`;

  const resetResp = await client.post('/auth/forgot-password/reset', {
    resetToken,
    newPassword,
    confirmPassword: newPassword,
  });

  assert(resetResp.status === 200, `Password reset failed for ${actor.role}`);

  const loginAfterReset = await login(client, {
    identifier: email,
    password: newPassword,
    role: actor.role,
  });

  assert(Boolean(loginAfterReset?.token), `Login after reset failed for ${actor.role}`);
  assert(
    String(loginAfterReset?.user?.role || '').toLowerCase() === actor.role,
    `Expected normalized role ${actor.role}, got ${loginAfterReset?.user?.role || 'empty'}`
  );
}

async function run() {
  seedUsersOrThrow();
  await applyLegacyRolesAndStatus();

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

  const client = axios.create({ baseURL: API_BASE, timeout: 20000 });

  try {
    await waitForHealth(client);

    for (const actor of ACTORS) {
      const data = await login(client, {
        identifier: actor.identifier,
        password: actor.basePassword,
        role: actor.role,
      });

      assert(Boolean(data?.token), `Missing login token for ${actor.role}`);
      assert(
        String(data?.user?.role || '').toLowerCase() === actor.role,
        `Role normalization failed for ${actor.role}`
      );
    }

    for (let i = 0; i < ACTORS.length; i += 1) {
      await runForgotPasswordCycle(client, ACTORS[i], i);
    }

    // eslint-disable-next-line no-console
    console.log('AUTH_RECOVERY_OK');
  } finally {
    server.kill('SIGTERM');
    try {
      seedUsersOrThrow();
    } catch (restoreErr) {
      // eslint-disable-next-line no-console
      console.error('AUTH_RECOVERY_RESTORE_FAILED', restoreErr?.message || restoreErr);
    }
  }
}

(async () => {
  try {
    await run();
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('AUTH_RECOVERY_FAILED', err?.response?.data || err?.message || err);
    try {
      await mongoose.connection.close();
    } catch {
      // noop
    }
    process.exit(1);
  }
})();
