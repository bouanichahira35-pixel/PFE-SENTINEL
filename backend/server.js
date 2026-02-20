require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

const mongoose = require('./db');
const requestContext = require('./middlewares/requestContext');
const idempotencyGuard = require('./middlewares/idempotencyGuard');
const { verifyMailer, isMailConfigured } = require('./services/mailerService');
const { initMailQueue, getMailQueueHealth } = require('./services/mailQueueService');
const { startAiAutoTrainingJob } = require('./services/aiGovernanceService');
const { getQrSecretStatus } = require('./services/qrTokenService');

const app = express();

const defaultDevOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002',
];

const configuredOrigins = String(
  process.env.FRONTEND_URLS || process.env.FRONTEND_URL || ''
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([...configuredOrigins, ...defaultDevOrigins]));

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
}));
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(requestContext);
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '2mb' }));
app.use(idempotencyGuard);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_AUTH_MAX || 100),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requetes auth, reessayez plus tard.' },
});
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_AI_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requetes IA, ralentissez le rythme.' },
});
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_CHAT_MAX || 180),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requetes chat, reessayez dans quelques instants.' },
});

app.get('/api/health', async (req, res) => {
  const stateMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  const readyState = mongoose.connection.readyState;
  const smtp = await verifyMailer();
  const mailQueue = await getMailQueueHealth();
  const qrSecretStatus = getQrSecretStatus();
  return res.json({
    status: 'ok',
    request_id: req.requestId,
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || '1.0.0',
    uptime_seconds: Math.floor(process.uptime()),
    mongodb: {
      ready_state: readyState,
      status: stateMap[readyState] || 'unknown',
      db_name: mongoose.connection.name || null,
    },
    smtp: {
      configured: isMailConfigured(),
      ok: smtp.ok,
      reason: smtp.reason || null,
    },
    queue: mailQueue,
    security: {
      internal_bond_qr_secret: {
        ok: qrSecretStatus.ok,
        source: qrSecretStatus.source,
        dedicated: qrSecretStatus.dedicated,
        fallback: qrSecretStatus.fallback,
        warning: qrSecretStatus.warning,
      },
    },
  });
});

app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/locations', require('./routes/locations'));
app.use('/api/laboratories', require('./routes/laboratories'));
app.use('/api/stock', require('./routes/stock'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/history', require('./routes/history'));
app.use('/api/ai', aiLimiter, require('./routes/ai'));
app.use('/api/chat', chatLimiter, require('./routes/chat'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/security-audit', require('./routes/security-audit'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/files', require('./routes/files'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/users', require('./routes/users'));

app.use((err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Fichier trop volumineux', request_id: req.requestId });
  }
  return next(err);
});

const PORT = process.env.PORT || 5000;
initMailQueue()
  .then(() => {
    const qrSecretStatus = getQrSecretStatus();
    if (!qrSecretStatus.ok || qrSecretStatus.fallback) {
      console.warn('[SECURITY] QR signing key status:', qrSecretStatus.warning || `source=${qrSecretStatus.source}`);
    }
    startAiAutoTrainingJob();
    app.listen(PORT, () => console.log(`API ready on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.warn('Mail queue init failed, server continues with fallback mail mode:', err?.message || err);
    const qrSecretStatus = getQrSecretStatus();
    if (!qrSecretStatus.ok || qrSecretStatus.fallback) {
      console.warn('[SECURITY] QR signing key status:', qrSecretStatus.warning || `source=${qrSecretStatus.source}`);
    }
    startAiAutoTrainingJob();
    app.listen(PORT, () => console.log(`API ready on http://localhost:${PORT}`));
  });
