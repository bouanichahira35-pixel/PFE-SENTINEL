export function sanitizeText(raw, { maxLen = 600 } = {}) {
  const value = String(raw ?? '');
  const withoutCtl = Array.from(value)
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code < 32 || code === 127) return ' ';
      return ch;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  const noAngles = withoutCtl.replace(/[<>]/g, '');
  if (maxLen && noAngles.length > maxLen) return noAngles.slice(0, maxLen);
  return noAngles;
}

export function isSafeText(raw, { min = 0, max = 600 } = {}) {
  const value = sanitizeText(raw, { maxLen: max });
  if (value.length < min) return false;
  if (max && value.length > max) return false;
  return true;
}

export function asPositiveInt(raw, { min = 1, max = 1000000 } = {}) {
  const n = Number.parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(n)) return NaN;
  if (n < min || n > max) return NaN;
  return n;
}

export function asNonNegativeInt(raw, { min = 0, max = 1000000 } = {}) {
  const n = Number.parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(n)) return NaN;
  if (n < min || n > max) return NaN;
  return n;
}
