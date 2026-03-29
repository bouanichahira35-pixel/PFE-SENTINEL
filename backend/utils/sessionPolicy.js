function getSessionInactivityMs() {
  // Default: 2 hours of inactivity (pragmatic for business apps).
  // Can be tightened via SESSION_INACTIVITY_MS in production.
  const fallback = 2 * 60 * 60 * 1000;
  const raw = Number(process.env.SESSION_INACTIVITY_MS || fallback);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.max(5 * 60 * 1000, raw);
}

function formatInactivityMessage(ms) {
  const minutes = Math.max(1, Math.round(Number(ms || 0) / 60000));
  return `Session expirée après ${minutes} minute(s) d’inactivité. Merci de vous reconnecter.`;
}

module.exports = {
  getSessionInactivityMs,
  formatInactivityMessage,
};

