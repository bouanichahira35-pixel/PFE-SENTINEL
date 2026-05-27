function isProd() {
  return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
}

function looksTechnical(message) {
  const m = String(message || '').toLowerCase();
  if (!m) return false;
  return (
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
    m.includes('networkerror')
  );
}

function clampMessage(message, maxLen = 160) {
  const raw = String(message || '').trim().replace(/\s+/g, ' ');
  if (!raw) return '';
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, Math.max(0, maxLen - 1)).trim()}…`;
}

export function sanitizeUiText(message, fallback = 'Une erreur est survenue.') {
  const safe = clampMessage(String(message || ''));
  if (!safe) return fallback;
  if (looksTechnical(safe)) return fallback;
  return safe;
}

export function getUiErrorMessage(err, fallback = 'Une erreur est survenue.') {
  const status = Number(err?.status || 0);
  const message = String(err?.message || '').trim();

  if (!isProd()) {
    try {
      // eslint-disable-next-line no-console
      console.warn('[uiError]', { status, message, err });
    } catch {
      // ignore
    }
  }

  if (status === 401) return 'Session expirée. Veuillez vous reconnecter.';
  if (status === 403) return 'Accès refusé.';
  if (status === 404) return fallback || 'Ressource introuvable.';
  if (status === 429) return 'Trop de requêtes. Réessayez dans un instant.';
  if (status >= 500) return fallback || 'Erreur serveur. Réessayez.';

  return sanitizeUiText(message, fallback);
}
