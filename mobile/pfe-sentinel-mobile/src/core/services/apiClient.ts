// BLOC 1 - Role du fichier.
// Ce fichier gere un service mobile lie a apiClient.
// Point de vigilance: garder la compatibilite avec la synchronisation offline et les types TypeScript.

import { SettingsStore } from '../settings/settingsStore';
import { SessionStore, type Session } from '../session/sessionStore';

type ApiInit = RequestInit & {
  auth?: boolean;
  retryOnUnauthorized?: boolean;
  timeoutMs?: number;
  networkRetries?: number;
};

let refreshInFlight: Promise<string> | null = null;
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_NETWORK_RETRIES = 3;

function waitMs(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function isNetworkFailure(err: any) {
  const name = String(err?.name || '');
  const message = String(err?.message || '').toLowerCase();
  return (
    name === 'AbortError' ||
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('timeout') ||
    message.includes('connexion')
  );
}

function toFriendlyNetworkError(err: any) {
  const isTimeout = String(err?.name || '') === 'AbortError' || String(err?.message || '').toLowerCase().includes('timeout');
  const friendly = new Error(isTimeout ? 'Connexion trop lente. Les donnees restent en attente.' : 'Connexion instable. Les donnees restent en attente.');
  (friendly as any).cause = err;
  (friendly as any).isTransientNetwork = true;
  return friendly;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  if (typeof AbortController === 'undefined') return fetch(url, init);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.max(2_000, timeoutMs));
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithRetries(
  url: string,
  init: RequestInit,
  options: { timeoutMs?: number; networkRetries?: number } = {}
): Promise<Response> {
  const timeoutMs = Math.max(2_000, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS));
  const retryCount = Math.min(MAX_NETWORK_RETRIES, Math.max(0, Number(options.networkRetries || 0)));
  let lastErr: any = null;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      return await fetchWithTimeout(url, init, timeoutMs);
    } catch (err: any) {
      lastErr = err;
      if (!isNetworkFailure(err) || attempt >= retryCount) break;
      await waitMs(300 + attempt * 500);
    }
  }

  throw isNetworkFailure(lastErr) ? toFriendlyNetworkError(lastErr) : lastErr;
}

async function readJsonSafe(res: Response): Promise<any> {
  const text = await res.text().catch(() => '');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function asErrorMessage(input: any, fallback: string) {
  const msg = input?.error || input?.message || '';
  if (typeof msg === 'string' && msg.trim()) return msg.trim();
  return fallback;
}

async function refreshAccessToken(session: Session): Promise<string> {
  if (!session.refreshToken) throw new Error('Session expirée. Veuillez vous reconnecter.');

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const baseUrl = await SettingsStore.getApiBaseUrl();
      const res = await fetchWithRetries(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      }, { timeoutMs: DEFAULT_TIMEOUT_MS, networkRetries: 1 });
      const json = await readJsonSafe(res);
      if (!res.ok) throw new Error(asErrorMessage(json, 'Refresh échoué'));
      const token = typeof json?.token === 'string' ? json.token.trim() : '';
      if (!token) throw new Error('Réponse refresh invalide');
      return token;
    })().finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

async function getAuthHeaders(): Promise<{ Authorization: string }> {
  const session = await SessionStore.get();
  if (!session?.token) throw new Error('Session absente');
  return { Authorization: `Bearer ${session.token}` };
}

export async function apiFetch(path: string, init: ApiInit = {}): Promise<Response> {
  const {
    auth: authOption,
    retryOnUnauthorized: retryOption,
    timeoutMs,
    networkRetries,
    headers: initHeaders,
    ...fetchInit
  } = init;
  const auth = authOption !== false;
  const retryOnUnauthorized = retryOption !== false;
  const baseUrl = await SettingsStore.getApiBaseUrl();
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    ...(initHeaders && typeof initHeaders === 'object' ? (initHeaders as any) : {}),
  };

  if (auth) {
    const authHeaders = await getAuthHeaders();
    headers.Authorization = authHeaders.Authorization;
  }

  const res = await fetchWithRetries(url, { ...fetchInit, headers }, { timeoutMs, networkRetries });
  if (!auth || !retryOnUnauthorized || res.status !== 401) return res;

  const session = await SessionStore.get();
  if (!session?.token) return res;

  const nextToken = await refreshAccessToken(session);
  await SessionStore.set({ ...session, token: nextToken });

  const retryHeaders: Record<string, string> = { ...headers, Authorization: `Bearer ${nextToken}` };
  return fetchWithRetries(url, { ...fetchInit, headers: retryHeaders }, { timeoutMs, networkRetries });
}

export async function apiJson<T = any>(path: string, init: ApiInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  const json = await readJsonSafe(res);
  if (!res.ok) throw new Error(asErrorMessage(json, `HTTP ${res.status}`));
  return json as T;
}
