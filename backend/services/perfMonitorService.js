const MAX_EVENTS = Math.max(500, Number(process.env.PERF_MONITOR_MAX_EVENTS || 2500));
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

const state = {
  events: [],
};

function nowMs() {
  return Date.now();
}

function stripQuery(url) {
  const raw = String(url || '');
  const idx = raw.indexOf('?');
  return idx >= 0 ? raw.slice(0, idx) : raw;
}

function normalizePath(path) {
  const clean = stripQuery(path)
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/, '');

  const parts = clean.split('/').filter(Boolean);
  const normalized = parts.map((p) => {
    if (/^[0-9a-f]{24}$/i.test(p)) return ':id';
    if (/^\d+$/.test(p)) return ':n';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p)) return ':uuid';
    return p.slice(0, 80);
  });
  return `/${normalized.join('/')}`;
}

function pushEvent(evt) {
  state.events.push(evt);
  if (state.events.length > MAX_EVENTS) {
    state.events.splice(0, state.events.length - MAX_EVENTS);
  }
}

function record({ method, path, status, duration_ms }) {
  const ts = nowMs();
  pushEvent({
    ts,
    method: String(method || 'GET').toUpperCase().slice(0, 8),
    path: normalizePath(path || '/'),
    status: Number(status || 0),
    duration_ms: Math.max(0, Math.round(Number(duration_ms || 0))),
  });
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

function summarize({ window_ms = DEFAULT_WINDOW_MS, limit = 8 } = {}) {
  const windowMs = Math.max(10 * 1000, Number(window_ms || DEFAULT_WINDOW_MS));
  const since = nowMs() - windowMs;
  const rows = state.events.filter((e) => e.ts >= since);

  const byKey = new Map();
  for (const e of rows) {
    const key = `${e.method} ${e.path}`;
    const acc = byKey.get(key) || {
      key,
      method: e.method,
      path: e.path,
      count: 0,
      errors: 0,
      durations: [],
      last_ts: 0,
      last_status: null,
    };
    acc.count += 1;
    if (e.status >= 500) acc.errors += 1;
    acc.durations.push(e.duration_ms);
    acc.last_ts = Math.max(acc.last_ts, e.ts);
    acc.last_status = e.status;
    byKey.set(key, acc);
  }

  const items = Array.from(byKey.values()).map((x) => {
    const avg = x.durations.length ? x.durations.reduce((a, b) => a + b, 0) / x.durations.length : 0;
    const p95 = percentile(x.durations, 0.95);
    const p99 = percentile(x.durations, 0.99);
    const max = x.durations.length ? Math.max(...x.durations) : 0;
    return {
      key: x.key,
      method: x.method,
      path: x.path,
      count: x.count,
      error_count: x.errors,
      error_rate_pct: Number(((x.errors / Math.max(1, x.count)) * 100).toFixed(1)),
      avg_ms: Number(avg.toFixed(1)),
      p95_ms: p95,
      p99_ms: p99,
      max_ms: max,
      last_status: x.last_status,
      last_ts: x.last_ts ? new Date(x.last_ts).toISOString() : null,
    };
  });

  const topSlow = [...items]
    .sort((a, b) => Number(b.p95_ms || 0) - Number(a.p95_ms || 0))
    .slice(0, Math.max(3, Math.min(20, Number(limit || 8))));

  const topErrors = [...items]
    .filter((x) => x.error_count > 0)
    .sort((a, b) => b.error_count - a.error_count)
    .slice(0, Math.max(3, Math.min(20, Number(limit || 8))));

  return {
    ok: true,
    window_ms: windowMs,
    since: new Date(since).toISOString(),
    total_events: rows.length,
    total_routes: items.length,
    top_slow: topSlow,
    top_errors: topErrors,
  };
}

module.exports = {
  record,
  summarize,
  normalizePath,
};

