const crypto = require('crypto');
const IdempotencyKey = require('../models/IdempotencyKey');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const PROTECTED_PREFIXES = ['/api/requests', '/api/stock', '/api/products'];
const TTL_SECONDS = Number(process.env.IDEMPOTENCY_TTL_SECONDS || 600);

function isProtectedPath(pathname) {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function buildFingerprint(req, idemKey) {
  const userScope = req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`;
  const raw = `${idemKey}|${req.method}|${req.path}|${userScope}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function idempotencyGuard(req, res, next) {
  try {
    if (!MUTATING_METHODS.has(req.method)) return next();
    if (!isProtectedPath(req.path)) return next();

    const idemKey = String(req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || '').trim();
    if (!idemKey) return next();

    const fingerprint = buildFingerprint(req, idemKey);
    const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);

    await IdempotencyKey.create({
      fingerprint,
      idem_key: idemKey,
      method: req.method,
      path: req.path,
      user: req.user?.id || undefined,
      client_ip: req.ip,
      expires_at: expiresAt,
    });

    return next();
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        error: 'Requete dupliquee detectee',
        details: 'Utilisez une nouvelle idempotency key ou attendez expiration de la fenetre anti-doublon.',
      });
    }
    return next(err);
  }
}

module.exports = idempotencyGuard;
