const { record } = require('../services/perfMonitorService');
const { onIncident } = require('../services/adminIncidentService');

function perfMonitor(req, res, next) {
  const startedAt = Date.now();

  const url = String(req.originalUrl || req.url || '');
  if (!url.startsWith('/api/')) return next();

  res.on('finish', () => {
    try {
      const durationMs = Date.now() - startedAt;
      record({
        method: req.method,
        path: url,
        status: res.statusCode,
        duration_ms: durationMs,
      });

      const slowMs = Number(process.env.ADMIN_INCIDENT_SLOW_MS || 2000);
      if (res.statusCode >= 500 || durationMs >= slowMs) {
        setImmediate(() => {
          onIncident({
            method: req.method,
            path: url,
            status: res.statusCode,
            duration_ms: durationMs,
          }).catch(() => {});
        });
      }
    } catch {
      // monitoring must never break requests
    }
  });

  return next();
}

module.exports = perfMonitor;
