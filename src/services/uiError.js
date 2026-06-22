// BLOC 1 - Role du fichier.
// Ce fichier organise les appels API ou la logique frontend partagee pour uiError.
// Point de vigilance: modifier avec prudence car ce fichier peut etre importe par plusieurs modules.

function isProd() {
  return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
}

function isRecord(value) {
  return value !== null && typeof value === 'object';
}

function extractUiText(value, seen = new Set()) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (!isRecord(value) || seen.has(value)) return '';

  seen.add(value);

  const keys = [
    'user_message',
    'userMessage',
    'message',
    'error',
    'title',
    'detail',
    'reason',
  ];

  for (const key of keys) {
    const text = extractUiText(value[key], seen);
    if (text) return text;
  }

  if (Array.isArray(value.details)) {
    for (const item of value.details) {
      const text = extractUiText(item, seen);
      if (text) return text;
    }
  }

  if (Array.isArray(value.errors)) {
    for (const item of value.errors) {
      const text = extractUiText(item, seen);
      if (text) return text;
    }
  }

  return '';
}

function looksTechnical(message) {
  const m = String(message || '').toLowerCase();
  if (!m) return false;
  return (
    m.includes('[object object]') ||
    m.includes('object object') ||
    m.includes('http://') ||
    m.includes('https://') ||
    m.includes('/api/') ||
    m.includes('api_base') ||
    m.includes('proxy') ||
    m.includes('react_app') ||
    m.includes('mongodb') ||
    m.includes('port ') ||
    m.includes('stack') ||
    m.includes('<!doctype') ||
    m.includes('<html') ||
    m.includes('invalid_json') ||
    m.includes('non_json_response') ||
    m.includes('failed to fetch') ||
    m.includes('networkerror')
  );
}

function clampMessage(message, maxLen = 160) {
  const raw = extractUiText(message).trim().replace(/\s+/g, ' ');
  if (!raw) return '';
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, Math.max(0, maxLen - 1)).trim()}…`;
}

export function sanitizeUiText(message, fallback = 'Une erreur est survenue.') {
  const safe = clampMessage(message);
  if (!safe) return fallback;
  if (looksTechnical(safe)) return fallback;
  return safe;
}

export function getUiErrorMessage(err, fallback = 'Une erreur est survenue.') {
  const status = Number(err?.status || 0);
  const message = extractUiText(err).trim();

  if (!isProd()) {
    try {
      // eslint-disable-next-line no-console
      console.warn('[uiError]', { status, message, err });
    } catch {
      // ignore
    }
  }

  if (status === 401) return 'Session expiree. Veuillez vous reconnecter.';
  if (status === 403) return 'Acces refuse.';
  if (status === 404) return fallback || 'Ressource introuvable.';
  if (status === 429) return 'Trop de requetes. Reessayez dans un instant.';
  if (status >= 500) return fallback || 'Erreur serveur. Reessayez.';

  return sanitizeUiText(message, fallback);
}
