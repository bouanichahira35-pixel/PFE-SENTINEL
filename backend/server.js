require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pinoHttp = require('pino-http');
const { rateLimit } = require('express-rate-limit');

const mongoose = require('./db');
const logger = require('./utils/logger');
const requestContext = require('./middlewares/requestContext');
const idempotencyGuard = require('./middlewares/idempotencyGuard');
const { verifyMailer, isMailConfigured } = require('./services/mailerService');
const { initMailQueue, getMailQueueHealth } = require('./services/mailQueueService');
const { startAiAutoTrainingJob } = require('./services/aiGovernanceService');
const { getQrSecretStatus } = require('./services/qrTokenService');
const { removeInformatiqueDomain } = require('./services/domainCleanupService');

const app = express();

const defaultDevOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002',
  'http://127.0.0.1:3003',
];

const configuredOrigins = String(
  process.env.FRONTEND_URLS || process.env.FRONTEND_URL || ''
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([...configuredOrigins, ...defaultDevOrigins]));
const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

function isLocalDevOrigin(origin) {
  try {
    const parsed = new URL(origin);
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
    return isHttp && isLocalHost;
  } catch {
    return false;
  }
}

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    if (!isProduction && isLocalDevOrigin(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
}));
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(requestContext);
app.use(pinoHttp({
  logger,
  genReqId: (req) => req.requestId,
  customProps: (req) => ({ request_id: req.requestId }),
}));
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
  const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  const readyState = mongoose.connection.readyState;
  const smtp = await verifyMailer();
  const mailQueue = await getMailQueueHealth();
  const qrSecretStatus = getQrSecretStatus();

  const smtpConfigured = isMailConfigured();
  const mongoConnected = readyState === 1;
  const smtpOk = smtpConfigured ? Boolean(smtp.ok) : true;
  const queueEnabled = Boolean(mailQueue?.enabled);
  const queueReady = queueEnabled ? Boolean(mailQueue?.ready) : true;
  const qrCritical = isProd ? Boolean(qrSecretStatus.ok) : true;
  const qrWarning = !qrSecretStatus.ok || Boolean(qrSecretStatus.fallback);

  const criticalIssues = [];
  const warnings = [];

  if (!mongoConnected) criticalIssues.push('mongodb_not_connected');
  if (!qrCritical) criticalIssues.push('internal_bond_qr_secret_missing');

  if (smtpConfigured && !smtpOk) warnings.push('smtp_unreachable');
  if (queueEnabled && !queueReady) warnings.push('mail_queue_not_ready');
  if (qrWarning) warnings.push('internal_bond_qr_secret_fallback_or_invalid');

  const status = criticalIssues.length > 0 ? 'unhealthy' : (warnings.length > 0 ? 'degraded' : 'ok');
  const statusCode = criticalIssues.length > 0 ? 503 : 200;
  const monitoring = status === 'unhealthy'
    ? {
      alert_level: 'critical',
      should_page: true,
      should_warn: false,
      recommendation: 'Trigger immediate incident alert (pager/on-call).',
    }
    : status === 'degraded'
      ? {
        alert_level: 'warning',
        should_page: false,
        should_warn: true,
        recommendation: 'Trigger warning alert and investigate dependencies.',
      }
      : {
        alert_level: 'none',
        should_page: false,
        should_warn: false,
        recommendation: 'No alert required.',
      };

  return res.status(statusCode).json({
    status_code: statusCode,
    request_id: req.requestId,
    status,
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || '1.0.0',
    uptime_seconds: Math.floor(process.uptime()),
    issues: {
      critical: criticalIssues,
      warnings,
    },
    monitoring,
    mongodb: {
      ready_state: readyState,
      status: stateMap[readyState] || 'unknown',
      db_name: mongoose.connection.name || null,
      critical: !mongoConnected,
    },
    smtp: {
      configured: smtpConfigured,
      ok: smtp.ok,
      reason: smtp.reason || null,
      critical: false,
    },
    queue: {
      ...mailQueue,
      critical: false,
    },
    security: {
      internal_bond_qr_secret: {
        ok: qrSecretStatus.ok,
        source: qrSecretStatus.source,
        dedicated: qrSecretStatus.dedicated,
        fallback: qrSecretStatus.fallback,
        warning: qrSecretStatus.warning,
        critical: !qrCritical,
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

async function runDomainCleanup() {
  try {
    const summary = await removeInformatiqueDomain();
    logger.info({ summary }, 'Domain cleanup applied');
  } catch (err) {
    logger.warn({ err: err?.message || err }, 'Domain cleanup skipped due to error');
  }
}

const PORT = process.env.PORT || 5000;
initMailQueue()
  .then(async () => {
    const qrSecretStatus = getQrSecretStatus();
    if (!qrSecretStatus.ok || qrSecretStatus.fallback) {
      logger.warn({
        warning: qrSecretStatus.warning || null,
        source: qrSecretStatus.source,
        fallback: qrSecretStatus.fallback,
      }, '[SECURITY] QR signing key status');
    }
    await runDomainCleanup();
    startAiAutoTrainingJob();
    app.listen(PORT, () => logger.info({ port: Number(PORT) }, 'API ready'));
  })
  .catch(async (err) => {
    logger.warn({ err: err?.message || err }, 'Mail queue init failed, server continues with fallback mail mode');
    const qrSecretStatus = getQrSecretStatus();
    if (!qrSecretStatus.ok || qrSecretStatus.fallback) {
      logger.warn({
        warning: qrSecretStatus.warning || null,
        source: qrSecretStatus.source,
        fallback: qrSecretStatus.fallback,
      }, '[SECURITY] QR signing key status');
    }
    await runDomainCleanup();
    startAiAutoTrainingJob();
    app.listen(PORT, () => logger.info({ port: Number(PORT) }, 'API ready'));
  });
