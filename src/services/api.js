// BLOC 1 - Choix de l'adresse de l'API.
// En production on peut utiliser REACT_APP_API_URL.
// En developpement, React appelle simplement /api grace au proxy.
function computeDefaultApiBase() {
  const fromEnv = String(process.env.REACT_APP_API_URL || "").trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  // Dev default: use CRA proxy (`package.json#proxy`) so mobile devices on LAN work
  // without CORS issues (frontend calls same-origin `/api/...`).
  return "/api";
}

export const API_BASE = computeDefaultApiBase();

function normalizeApiPath(path) {
  const raw = String(path || "");
  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  if (API_BASE.endsWith("/api") && withLeadingSlash === "/api") return "/";
  if (API_BASE.endsWith("/api") && withLeadingSlash.startsWith("/api/")) {
    return withLeadingSlash.slice(4);
  }
  return withLeadingSlash;
}

// BLOC 2 - Lecture des delais d'attente.
// Ces fonctions evitent qu'une requete reste bloquee trop longtemps.
function readTimeoutEnv(name, fallback, { min = 2_000, max = 300_000 } = {}) {
  const raw = String(process.env[name] || "").trim();
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

const API_TIMEOUT_MS = readTimeoutEnv("REACT_APP_API_TIMEOUT_MS", 180_000, {
  min: 10_000,
  max: 300_000,
});

const AUTH_API_TIMEOUT_MS = readTimeoutEnv("REACT_APP_AUTH_API_TIMEOUT_MS", 45_000, {
  min: 8_000,
  max: 120_000,
});

const LONG_API_TIMEOUT_MS = readTimeoutEnv("REACT_APP_LONG_API_TIMEOUT_MS", 300_000, {
  min: API_TIMEOUT_MS,
  max: 600_000,
});

const API_CACHE_TTL_MS = 45 * 1000;
const API_CACHE_MAX_ITEMS = 60;
const PERF_STORAGE_KEY = "api_perf_metrics_v1";
const PERF_EVENT_NAME = "api-perf-updated";
const AUTH_LOGOUT_EVENT_NAME = "auth-logout";

// BLOC 3 - Cache et mesures de performance.
// Le frontend garde temporairement certaines reponses GET et mesure la vitesse des appels API.
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

// BLOC 4 - Fonctions utilitaires du client API.
// Elles gerent le cache, les pauses de retry, les tokens et les erreurs lisibles.
function makeCacheKey(path) {
  const token = getAuthToken();
  const authKey = token ? "auth" : "anon";
  return `GET|${authKey}|${path}`;
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function computeGetRetryDelayMs(attemptIndex) {
  // Small jitter to avoid thundering herd; keep UX responsive.
  const base = attemptIndex === 0 ? 250 : 450;
  const jitter = Math.floor(Math.random() * 150);
  return base + jitter;
}

function getRequestTimeoutMs(path) {
  const key = String(path || "");
  if (key === "/auth/login" || key === "/auth/refresh" || key === "/auth/logout" || key === "/auth/logout-refresh") {
    return AUTH_API_TIMEOUT_MS;
  }
  if (
    key.startsWith("/ai/models/train") ||
    key.startsWith("/ai/alerts/rebuild") ||
    key.startsWith("/ai/alerts/refresh") ||
    key.startsWith("/ai/copilot/recommendations") ||
    key.startsWith("/reports/") ||
    key.includes("/import") ||
    key.includes("/export")
  ) {
    return LONG_API_TIMEOUT_MS;
  }
  return API_TIMEOUT_MS;
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
  const raw = typeof data.raw === "string" ? data.raw : "";
  const rawHint = raw.trim().startsWith("<!DOCTYPE") || raw.trim().startsWith("<html")
    ? "Reponse HTML recue. Verifiez API_BASE / proxy (backend)"
    : "";
  const suffix = [reason, details, rawHint].filter(Boolean).join(" | ");
  return new Error(suffix ? `${base}: ${suffix}` : base);
}

async function readJsonOrText(res) {
  const contentType = String(res?.headers?.get?.("content-type") || "").toLowerCase();
  const text = await res.text().catch(() => "");
  const looksJson = contentType.includes("application/json") || contentType.includes("+json");
  if (looksJson) {
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { error: "invalid_json", raw: text.slice(0, 400), content_type: contentType };
    }
  }
  if (!text) return {};
  return { error: "non_json_response", raw: text.slice(0, 400), content_type: contentType };
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

let refreshInFlight = null;

// BLOC 5 - Rafraichissement du token.
// Si le token d'acces expire, cette fonction essaie de demander un nouveau token au backend.
async function refreshAccessTokenOnce() {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), AUTH_API_TIMEOUT_MS)
      : null;
    try {
      const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller ? controller.signal : undefined,
        body: JSON.stringify(refreshToken ? { refreshToken } : {}),
      });
      const refreshData = await refreshRes.json().catch(() => ({}));

      if (refreshRes.ok && refreshData.token) {
        sessionStorage.setItem("token", refreshData.token);
        return { ok: true, token: refreshData.token };
      }

      if (!refreshRes.ok) {
        const refreshReason = typeof refreshData?.error === "string" ? refreshData.error : "";
        triggerAuthLogout(refreshReason || "Session expiree. Veuillez vous reconnecter.");
      }

      return { ok: false };
    } catch {
      return { ok: false };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

// BLOC 6 - Fonction centrale pour toutes les requetes JSON.
// Tous les get/post/put/patch/delete passent ici: token, timeout, cache, erreurs et retry.
async function requestInternal(path, method, payload, opts = {}) {
  const requestPath = normalizeApiPath(path);
  const retriedAuth = Boolean(opts?.retriedAuth);
  const networkRetries = Math.max(0, Number(opts?.networkRetries || 0));

  const normalizedMethod = String(method || "GET").toUpperCase();
  const cacheableGet = normalizedMethod === "GET" && !payload;
  const headers = { "Content-Type": "application/json" };
  const token = getAuthToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (cacheableGet) {
    const cacheKey = makeCacheKey(requestPath);
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
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const requestTimeoutMs = getRequestTimeoutMs(requestPath);
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), requestTimeoutMs)
    : null;

  try {
    res = await fetch(`${API_BASE}${requestPath}`, {
      method: normalizedMethod,
      headers,
      credentials: "include",
      body: payload ? JSON.stringify(payload) : undefined,
      signal: controller ? controller.signal : undefined,
    });
    data = await readJsonOrText(res);
  } catch (err) {
    const latencyMs = Math.max(0, Math.round(nowMs() - startedAt));
    recordNetworkResult({ latencyMs, failed: true });

    const message = String(err?.message || "");
    const isAbort = String(err?.name || "") === "AbortError";
    const canRetryGet =
      cacheableGet &&
      networkRetries < 1 &&
      (message.includes("Failed to fetch") ||
        message.includes("NetworkError") ||
        message.toLowerCase().includes("fetch") ||
        isAbort);

    if (canRetryGet) {
      await waitMs(computeGetRetryDelayMs(networkRetries));
      return requestInternal(requestPath, normalizedMethod, payload, {
        ...opts,
        networkRetries: networkRetries + 1,
      });
    }

    if (isAbort) {
      const timeoutErr = new Error(
        "Operation plus lente que prevu. Verifiez la connexion ou l'etat du serveur, puis reessayez."
      );
      timeoutErr.cause = err;
      timeoutErr.debug = {
        kind: "timeout",
        path: requestPath,
        api_base: API_BASE,
        timeout_ms: requestTimeoutMs,
        latency_ms: latencyMs,
      };
      throw timeoutErr;
    }

    if (
      message.includes("Failed to fetch") ||
      message.includes("NetworkError") ||
      message.toLowerCase().includes("fetch")
    ) {
      const netErr = new Error("Impossible de contacter le serveur. Veuillez réessayer.");
      netErr.cause = err;
      netErr.debug = {
        kind: "network",
        path: requestPath,
        api_base: API_BASE,
        latency_ms: latencyMs,
      };
      throw netErr;
    }

    throw err;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  const latencyMs = Math.max(0, Math.round(nowMs() - startedAt));

  // Only attempt refresh when we *were* authenticated (token present).
  // Otherwise, a legitimate 401 from public endpoints like `/auth/login`
  // would incorrectly trigger a refresh call and surface confusing errors
  // (ex: "refreshToken obligatoire").
  if (res.status === 401 && token && !retriedAuth && requestPath !== "/auth/refresh") {
    const refreshed = await refreshAccessTokenOnce();
    if (refreshed?.ok && refreshed.token) {
      return requestInternal(requestPath, normalizedMethod, payload, {
        ...opts,
        retriedAuth: true,
      });
    }
  }

  if (res.status === 401 && token) {
    const reason = typeof data?.error === "string" ? data.error : "";
    triggerAuthLogout(reason || "Session expiree. Veuillez vous reconnecter.");
  }

  if (!res.ok) {
    recordNetworkResult({ latencyMs, failed: true });
    const err = buildApiError(data);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  if (cacheableGet) {
    saveGetCache(makeCacheKey(requestPath), data);
  } else if (normalizedMethod !== "GET") {
    clearGetCache();
  }

  recordNetworkResult({ latencyMs, failed: false });
  return data;
}

// BLOC 7 - Acces aux mesures de performance API.
// Ces fonctions permettent aux pages de lire ou ecouter les statistiques des appels API.
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

// BLOC 8 - Raccourcis REST utilises par les pages.
// Au lieu d'ecrire fetch partout, les pages utilisent get, post, put, patch ou del.
export function post(path, payload) {
  return requestInternal(path, "POST", payload);
}

export function get(path) {
  return requestInternal(path, "GET");
}

export function put(path, payload) {
  return requestInternal(path, "PUT", payload);
}

export function patch(path, payload) {
  return requestInternal(path, "PATCH", payload);
}

export function del(path, payload) {
  return requestInternal(path, "DELETE", payload);
}

// BLOC 9 - Envoi de fichiers.
// Cette partie utilise FormData au lieu de JSON pour envoyer images, PDF ou pieces jointes.
async function uploadFileInternal(path, file, fieldName, retried = false) {
  const requestPath = normalizeApiPath(path);
  const token = getAuthToken();
  const formData = new FormData();
  formData.append(fieldName, file);

  const startedAt = nowMs();
  const res = await fetch(`${API_BASE}${requestPath}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    credentials: "include",
    body: formData,
  });

  if (res.status === 401 && token && !retried && requestPath !== "/auth/refresh") {
    const refreshed = await refreshAccessTokenOnce();
    if (refreshed?.ok && refreshed.token) {
      return uploadFileInternal(requestPath, file, fieldName, true);
    }
  }

  const latencyMs = Math.max(0, Math.round(nowMs() - startedAt));
  const data = await readJsonOrText(res);

  if (res.status === 401 && token) {
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
