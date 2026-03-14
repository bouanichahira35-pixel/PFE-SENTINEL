const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

const API_CACHE_TTL_MS = 45 * 1000;
const API_CACHE_MAX_ITEMS = 60;
const PERF_STORAGE_KEY = "api_perf_metrics_v1";
const PERF_EVENT_NAME = "api-perf-updated";
const AUTH_LOGOUT_EVENT_NAME = "auth-logout";

const responseCache = new Map();

const defaultPerfMetrics = {
  total_requests: 0,
  network_requests: 0,
  cached_requests: 0,
  failed_requests: 0,
  total_network_latency_ms: 0,
  avg_latency_ms: 0,
  last_latency_ms: 0,
  cache_entries: 0,
  last_updated_at: null,
};

let perfMetrics = { ...defaultPerfMetrics };

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function readPerfMetrics() {
  if (typeof window === "undefined") return { ...defaultPerfMetrics };
  try {
    const raw = sessionStorage.getItem(PERF_STORAGE_KEY);
    if (!raw) return { ...defaultPerfMetrics };
    const parsed = JSON.parse(raw);
    return {
      ...defaultPerfMetrics,
      ...parsed,
    };
  } catch {
    return { ...defaultPerfMetrics };
  }
}

function writePerfMetrics(next) {
  perfMetrics = { ...defaultPerfMetrics, ...next };
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(PERF_STORAGE_KEY, JSON.stringify(perfMetrics));
      window.dispatchEvent(new CustomEvent(PERF_EVENT_NAME, { detail: perfMetrics }));
    } catch {
      // metrics persistence should never break API calls
    }
  }
}

function updatePerfMetrics(patch = {}) {
  const next = {
    ...perfMetrics,
    ...patch,
    cache_entries: responseCache.size,
    last_updated_at: new Date().toISOString(),
  };
  const networkRequests = Number(next.network_requests || 0);
  const totalLatency = Number(next.total_network_latency_ms || 0);
  next.avg_latency_ms = networkRequests > 0
    ? Number((totalLatency / networkRequests).toFixed(1))
    : 0;
  writePerfMetrics(next);
}

perfMetrics = readPerfMetrics();

function makeCacheKey(path) {
  const token = getAuthToken();
  const authKey = token ? "auth" : "anon";
  return `GET|${authKey}|${path}`;
}

function clearGetCache() {
  responseCache.clear();
  updatePerfMetrics({ cache_entries: 0 });
}

function saveGetCache(key, data) {
  responseCache.set(key, {
    expires_at: Date.now() + API_CACHE_TTL_MS,
    data,
  });
  while (responseCache.size > API_CACHE_MAX_ITEMS) {
    const oldestKey = responseCache.keys().next().value;
    if (!oldestKey) break;
    responseCache.delete(oldestKey);
  }
  updatePerfMetrics({ cache_entries: responseCache.size });
}

function getAuthToken() {
  return sessionStorage.getItem("token") || localStorage.getItem("token") || "";
}

function getRefreshToken() {
  return sessionStorage.getItem("refreshToken") || localStorage.getItem("refreshToken") || "";
}

function triggerAuthLogout(reason) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(AUTH_LOGOUT_EVENT_NAME, { detail: { reason } }));
  } catch {
    // logout signaling should never break API calls
  }
}

function buildApiError(data) {
  const reason = typeof data.reason === "string" ? data.reason : "";
  const details = Array.isArray(data.details)
    ? data.details.join(", ")
    : (typeof data.details === "string" ? data.details : "");
  const base = data.error || "Erreur API";
  const suffix = [reason, details].filter(Boolean).join(" | ");
  return new Error(suffix ? `${base}: ${suffix}` : base);
}

function recordCacheHit() {
  updatePerfMetrics({
    total_requests: Number(perfMetrics.total_requests || 0) + 1,
    cached_requests: Number(perfMetrics.cached_requests || 0) + 1,
  });
}

function recordNetworkResult({ latencyMs = 0, failed = false }) {
  updatePerfMetrics({
    total_requests: Number(perfMetrics.total_requests || 0) + 1,
    network_requests: Number(perfMetrics.network_requests || 0) + 1,
    failed_requests: Number(perfMetrics.failed_requests || 0) + (failed ? 1 : 0),
    total_network_latency_ms: Number(perfMetrics.total_network_latency_ms || 0) + Number(latencyMs || 0),
    last_latency_ms: Number(latencyMs || 0),
  });
}

async function request(path, method, payload, retried = false) {
  const normalizedMethod = String(method || "GET").toUpperCase();
  const cacheableGet = normalizedMethod === "GET" && !payload;
  const headers = { "Content-Type": "application/json" };
  const token = getAuthToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (cacheableGet) {
    const cacheKey = makeCacheKey(path);
    const cached = responseCache.get(cacheKey);
    if (cached && cached.expires_at > Date.now()) {
      recordCacheHit();
      return cached.data;
    }
    if (cached) responseCache.delete(cacheKey);
  }

  const startedAt = nowMs();
  let res;
  let data;

  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: normalizedMethod,
      headers,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    data = await res.json().catch(() => ({}));
  } catch (err) {
    const latencyMs = Math.max(0, Math.round(nowMs() - startedAt));
    recordNetworkResult({ latencyMs, failed: true });
    throw err;
  }

  const latencyMs = Math.max(0, Math.round(nowMs() - startedAt));

  if (res.status === 401 && !retried && path !== "/auth/refresh") {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      const refreshData = await refreshRes.json().catch(() => ({}));
      if (refreshRes.ok && refreshData.token) {
        sessionStorage.setItem("token", refreshData.token);
        return request(path, normalizedMethod, payload, true);
      }

      if (!refreshRes.ok) {
        const refreshReason = typeof refreshData?.error === "string" ? refreshData.error : "";
        triggerAuthLogout(refreshReason || "Session expiree. Veuillez vous reconnecter.");
      }
    }
  }

  if ((res.status === 401 || res.status === 403) && token) {
    const reason = typeof data?.error === "string" ? data.error : "";
    triggerAuthLogout(reason || "Session expiree. Veuillez vous reconnecter.");
  }

  if (!res.ok) {
    recordNetworkResult({ latencyMs, failed: true });
    throw buildApiError(data);
  }

  if (cacheableGet) {
    saveGetCache(makeCacheKey(path), data);
  } else if (normalizedMethod !== "GET") {
    clearGetCache();
  }

  recordNetworkResult({ latencyMs, failed: false });
  return data;
}

export function getApiPerfMetrics() {
  return { ...perfMetrics };
}

export function subscribeApiPerf(onMetrics) {
  if (typeof window === "undefined" || typeof onMetrics !== "function") return () => {};
  const handler = (event) => {
    const payload = event?.detail && typeof event.detail === "object"
      ? event.detail
      : getApiPerfMetrics();
    onMetrics({ ...payload });
  };
  window.addEventListener(PERF_EVENT_NAME, handler);
  return () => window.removeEventListener(PERF_EVENT_NAME, handler);
}

export function post(path, payload) {
  return request(path, "POST", payload);
}

export function get(path) {
  return request(path, "GET");
}

export function put(path, payload) {
  return request(path, "PUT", payload);
}

export function patch(path, payload) {
  return request(path, "PATCH", payload);
}

async function uploadFileInternal(path, file, fieldName, retried = false) {
  const token = getAuthToken();
  const formData = new FormData();
  formData.append(fieldName, file);

  const startedAt = nowMs();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  if (res.status === 401 && !retried && path !== "/auth/refresh") {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      const refreshData = await refreshRes.json().catch(() => ({}));
      if (refreshRes.ok && refreshData.token) {
        sessionStorage.setItem("token", refreshData.token);
        return uploadFileInternal(path, file, fieldName, true);
      }

      if (!refreshRes.ok) {
        const refreshReason = typeof refreshData?.error === "string" ? refreshData.error : "";
        triggerAuthLogout(refreshReason || "Session expiree. Veuillez vous reconnecter.");
      }
    }
  }

  const latencyMs = Math.max(0, Math.round(nowMs() - startedAt));
  const data = await res.json().catch(() => ({}));

  if ((res.status === 401 || res.status === 403) && token) {
    const reason = typeof data?.error === "string" ? data.error : "";
    triggerAuthLogout(reason || "Session expiree. Veuillez vous reconnecter.");
  }

  if (!res.ok) {
    recordNetworkResult({ latencyMs, failed: true });
    throw buildApiError(data);
  }
  clearGetCache();
  recordNetworkResult({ latencyMs, failed: false });
  return data;
}

export async function uploadFile(path, file, fieldName = "file") {
  return uploadFileInternal(path, file, fieldName, false);
}
