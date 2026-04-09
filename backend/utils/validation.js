function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function asTrimmedString(value) {
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
}

function asOptionalString(value) {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s === '' ? undefined : s;
}

function asNumber(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function asPositiveNumber(value) {
  const n = asNumber(value);
  if (n === undefined) return undefined;
  if (!Number.isFinite(n) || n <= 0) return NaN;
  return n;
}

function asNonNegativeNumber(value) {
  const n = asNumber(value);
  if (n === undefined) return undefined;
  if (!Number.isFinite(n) || n < 0) return NaN;
  return n;
}

function asDate(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isValidObjectIdLike(value) {
  return typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value.trim());
}

function normalizeEmail(value) {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim().toLowerCase();
  return s === '' ? undefined : s;
}

function isValidEmail(value) {
  const s = normalizeEmail(value);
  if (!s) return false;
  // Pragmatic RFC5322-lite (good enough for enterprise apps).
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 254;
}

function normalizePhone(value) {
  if (value === undefined || value === null) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;
  // Keep + and digits, drop spaces/separators.
  const cleaned = raw.replace(/[^\d+]/g, '');
  return cleaned || undefined;
}

function isValidPhone(value) {
  const s = normalizePhone(value);
  if (!s) return false;
  // Accept E.164-ish or local digits.
  return /^(\+?\d{6,18})$/.test(s);
}

function isSafeText(value, { min = 0, max = 4000 } = {}) {
  if (value === undefined || value === null) return min === 0;
  const s = String(value);
  if (s.length < min || s.length > max) return false;
  // Block control chars and trivial HTML/script injection vectors.
  if (/[\u0000-\u001F\u007F]/.test(s)) return false;
  if (/[<>]/.test(s)) return false;
  return true;
}

function isStrongPassword(value, { min = 8, max = 64 } = {}) {
  if (typeof value !== 'string') return false;
  if (value.length < min || value.length > max) return false;
  const hasLower = /[a-z]/.test(value);
  const hasUpper = /[A-Z]/.test(value);
  const hasDigit = /\d/.test(value);
  return hasLower && hasUpper && hasDigit;
}

module.exports = {
  isBlank,
  asTrimmedString,
  asOptionalString,
  asNumber,
  asPositiveNumber,
  asNonNegativeNumber,
  asDate,
  isValidObjectIdLike,
  normalizeEmail,
  isValidEmail,
  normalizePhone,
  isValidPhone,
  isSafeText,
  isStrongPassword,
};
