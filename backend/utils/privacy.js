const crypto = require('crypto');

function getPiiHashSecret() {
  const explicit = String(process.env.PII_HASH_SECRET || '').trim();
  if (explicit) return explicit;
  const fallback = String(process.env.JWT_SECRET || '').trim();
  return fallback || '';
}

function hmacSha256(value) {
  const secret = getPiiHashSecret();
  if (!secret) return '';
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  return crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

function maskEmail(email) {
  const raw = String(email || '').trim().toLowerCase();
  const at = raw.indexOf('@');
  if (at <= 0) return raw ? '***' : '';
  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  const first = local[0] || '*';
  const maskedLocal = local.length <= 1 ? '*' : `${first}${'*'.repeat(Math.min(6, Math.max(1, local.length - 1)))}`;
  return `${maskedLocal}@${domain}`;
}

function maskPhone(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/[^\d+]/g, '');
  if (!digits) return '***';
  if (digits.length <= 5) return '***';
  const prefix = digits.slice(0, 4);
  const suffix = digits.slice(-2);
  return `${prefix}${'*'.repeat(Math.min(10, Math.max(3, digits.length - 6)))}${suffix}`;
}

module.exports = {
  hmacSha256,
  maskEmail,
  maskPhone,
};

