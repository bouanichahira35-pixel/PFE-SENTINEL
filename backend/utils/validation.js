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

module.exports = {
  isBlank,
  asTrimmedString,
  asOptionalString,
  asNumber,
  asPositiveNumber,
  asNonNegativeNumber,
  asDate,
  isValidObjectIdLike,
};
