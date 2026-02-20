const crypto = require('crypto');

const DEFAULT_TTL_HOURS = 24;
const DEV_FALLBACK_SECRET = 'dev-internal-bond-secret';

function toBase64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(input) {
  const normalized = String(input || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized + '==='.slice((normalized.length + 3) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function getQrSecret() {
  const dedicatedSecret = process.env.INTERNAL_BOND_QR_SECRET || process.env.QR_TOKEN_SECRET;
  if (dedicatedSecret) return dedicatedSecret;

  // In production, force an explicit QR signing key to avoid accidental weak setups.
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('INTERNAL_BOND_QR_SECRET (ou QR_TOKEN_SECRET) obligatoire en production');
  }

  return process.env.JWT_SECRET || DEV_FALLBACK_SECRET;
}

function getQrSecretStatus() {
  const dedicatedSecret = process.env.INTERNAL_BOND_QR_SECRET || process.env.QR_TOKEN_SECRET;
  if (dedicatedSecret) {
    return {
      ok: true,
      source: process.env.INTERNAL_BOND_QR_SECRET ? 'INTERNAL_BOND_QR_SECRET' : 'QR_TOKEN_SECRET',
      dedicated: true,
      fallback: false,
      warning: null,
    };
  }

  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    return {
      ok: false,
      source: 'missing',
      dedicated: false,
      fallback: true,
      warning: 'INTERNAL_BOND_QR_SECRET (ou QR_TOKEN_SECRET) manquant en production',
    };
  }

  if (process.env.JWT_SECRET) {
    return {
      ok: true,
      source: 'JWT_SECRET',
      dedicated: false,
      fallback: true,
      warning: 'QR utilise JWT_SECRET en environnement non-production',
    };
  }

  return {
    ok: true,
    source: 'DEV_FALLBACK_SECRET',
    dedicated: false,
    fallback: true,
    warning: 'QR utilise une cle de secours locale de developpement',
  };
}

function signRaw(rawPayload) {
  const secret = getQrSecret();
  return crypto.createHmac('sha256', secret).update(rawPayload).digest('base64url');
}

function signQrPayload(payload, options = {}) {
  const ttlHours = Number(options.ttl_hours || DEFAULT_TTL_HOURS);
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + Math.max(1, Math.floor(ttlHours * 3600));

  const data = {
    ...payload,
    v: 1,
    iat: nowSec,
    exp: expSec,
  };

  const rawPayload = JSON.stringify(data);
  const payloadB64 = toBase64Url(rawPayload);
  const signature = signRaw(payloadB64);
  return {
    token: `${payloadB64}.${signature}`,
    expires_at: new Date(expSec * 1000).toISOString(),
    payload: data,
  };
}

function verifyQrToken(token, options = {}) {
  const value = String(token || '').trim();
  if (!value) throw new Error('QR token vide');

  const [payloadB64, signature] = value.split('.');
  if (!payloadB64 || !signature) throw new Error('Format QR token invalide');

  const expectedSignature = signRaw(payloadB64);
  if (signature !== expectedSignature) throw new Error('Signature QR invalide');

  let payload;
  try {
    payload = JSON.parse(fromBase64Url(payloadB64));
  } catch (err) {
    throw new Error(`Payload QR invalide: ${err.message}`);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = Number(payload?.exp || 0);
  if (!Number.isFinite(expSec) || expSec <= nowSec) throw new Error('QR token expire');

  const expectedType = String(options.expected_type || '').trim();
  if (expectedType && String(payload?.type || '').trim() !== expectedType) {
    throw new Error('Type QR invalide');
  }

  return payload;
}

module.exports = {
  signQrPayload,
  verifyQrToken,
  getQrSecretStatus,
};
