// BLOC 1 - Role du fichier.
// Ce fichier sert de script de maintenance, seed, test ou migration pour test-auth-recovery-flow.
// Point de vigilance: ne pas lancer en production sans confirmer les variables .env et la base cible.

require('../loadEnv');
const mongoose = require('../db');

const { spawn, spawnSync } = require('child_process');
const net = require('net');
const axios = require('axios');

const User = require('../models/User');

const TEST_PORT = Number(process.env.AUTH_RECOVERY_TEST_PORT || 5013);
const SMTP_TEST_PORT = Number(process.env.AUTH_RECOVERY_SMTP_TEST_PORT || 2526);
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

const ACTORS = [
  {
    role: 'admin',
    legacyRole: 'admin',
    identifier: getTestEnv('TEST_ADMIN_EMAIL', 'admin@example.local'),
    basePassword: getTestEnv('TEST_ADMIN_PASSWORD', 'ChangeMe_Admin_123'),
  },
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
    // Legacy datasets sometimes used different labels, but `admin_app` maps to `admin`
    // (not `responsable`). Keep this actor consistent with the expected role.
    legacyRole: 'responsable',
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

function createSmtpCollector() {
  const messages = [];
  let server = null;

  function start() {
    server = net.createServer((socket) => {
      let buffer = '';
      let dataMode = false;
      let data = '';
      let current = { from: '', to: [] };

      const write = (line) => socket.write(`${line}\r\n`);
      write('220 sentinel-test-smtp ESMTP');

      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');

        while (buffer.includes('\n')) {
          const idx = buffer.indexOf('\n');
          const rawLine = buffer.slice(0, idx + 1);
          buffer = buffer.slice(idx + 1);
          const line = rawLine.replace(/\r?\n$/, '');

          if (dataMode) {
            if (line === '.') {
              messages.push({ ...current, raw: data });
              dataMode = false;
              data = '';
              current = { from: '', to: [] };
              write('250 Message accepted');
            } else {
              data += `${line}\n`;
            }
            continue;
          }

          const upper = line.toUpperCase();
          if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
            socket.write('250-sentinel-test-smtp\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n');
          } else if (upper.startsWith('AUTH')) {
            write('235 Authentication successful');
          } else if (upper.startsWith('MAIL FROM:')) {
            current.from = line.slice('MAIL FROM:'.length).trim();
            write('250 Sender ok');
          } else if (upper.startsWith('RCPT TO:')) {
            current.to.push(line.slice('RCPT TO:'.length).replace(/[<>]/g, '').trim().toLowerCase());
            write('250 Recipient ok');
          } else if (upper === 'DATA') {
            dataMode = true;
            write('354 End data with <CR><LF>.<CR><LF>');
          } else if (upper === 'RSET') {
            current = { from: '', to: [] };
            write('250 Reset ok');
          } else if (upper === 'QUIT') {
            write('221 Bye');
            socket.end();
          } else {
            write('250 OK');
          }
        }
      });
    });

    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(SMTP_TEST_PORT, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
  }

  function stop() {
    if (!server) return Promise.resolve();
    return new Promise((resolve) => server.close(() => resolve()));
  }

  async function waitForCode(to, previousCount = 0, retries = 40) {
    const normalizedTo = String(to || '').trim().toLowerCase();
    for (let i = 0; i < retries; i += 1) {
      const match = messages
        .slice(previousCount)
        .find((message) => message.to.includes(normalizedTo));
      const code = String(match?.raw || '').match(/\b(\d{6})\b/)?.[1];
      if (code) return { code, count: messages.length };
      await sleep(250);
    }
    throw new Error(`No OTP email captured for ${normalizedTo}`);
  }

  return {
    start,
    stop,
    waitForCode,
    get count() {
      return messages.length;
    },
  };
}

function seedUsersOrThrow() {
  const seedRun = spawnSync(process.execPath, ['seed-human-users.js'], {
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

async function runForgotPasswordCycle(client, smtpCollector, actor, index) {
  const email = String(actor.identifier || '').trim().toLowerCase();
  const beforeMailCount = smtpCollector.count;

  const requestResp = await client.post('/auth/forgot-password/request', {
    email,
    role: actor.role,
    channel: 'email',
  });

  assert(requestResp.status === 200, `Forgot request failed for ${actor.role}`);

  const requestData = requestResp?.data || {};
  assert(!Object.prototype.hasOwnProperty.call(requestData, 'dev_otp'), `dev_otp leaked for ${actor.role}`);

  const user = await User.findOne({ email }).select('_id email role status').lean();
  assert(user?._id, `User not found for forgot flow: ${actor.role}`);

  const captured = await smtpCollector.waitForCode(email, beforeMailCount);

  const verifyResp = await client.post('/auth/forgot-password/verify', {
    email,
    code: captured.code,
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
  const ready = await mongoose.waitForMongoReady({ timeoutMs: 15_000 });
  if (!ready.ok) {
    throw new Error(`Mongo not ready: ${ready.reason || 'unknown'}`);
  }

  seedUsersOrThrow();
  await applyLegacyRolesAndStatus();

  const env = {
    ...process.env,
    PORT: String(TEST_PORT),
    AI_AUTO_TRAIN_ON_BOOT: 'false',
    MAIL_HOST: '127.0.0.1',
    MAIL_PORT: String(SMTP_TEST_PORT),
    MAIL_SECURE: 'false',
    MAIL_USER: 'sentinel-test@example.local',
    MAIL_PASS: 'sentinel-test-password',
    MAIL_FROM: 'Sentinel Test <sentinel-test@example.local>',
  };

  const smtpCollector = createSmtpCollector();
  await smtpCollector.start();

  const server = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'ignore', 'ignore'],
  });

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
      await runForgotPasswordCycle(client, smtpCollector, ACTORS[i], i);
    }

    // eslint-disable-next-line no-console
    console.log('AUTH_RECOVERY_OK');
  } finally {
    server.kill('SIGTERM');
    await smtpCollector.stop();
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
