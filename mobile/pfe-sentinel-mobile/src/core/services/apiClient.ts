import { SettingsStore } from '../settings/settingsStore';
import { SessionStore, type Session } from '../session/sessionStore';

type ApiInit = RequestInit & {
  auth?: boolean;
  retryOnUnauthorized?: boolean;
};

let refreshInFlight: Promise<string> | null = null;

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
      const res = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
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
  const auth = init.auth !== false;
  const retryOnUnauthorized = init.retryOnUnauthorized !== false;
  const baseUrl = await SettingsStore.getApiBaseUrl();
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    ...(init.headers && typeof init.headers === 'object' ? (init.headers as any) : {}),
  };

  if (auth) {
    const authHeaders = await getAuthHeaders();
    headers.Authorization = authHeaders.Authorization;
  }

  const res = await fetch(url, { ...init, headers });
  if (!auth || !retryOnUnauthorized || res.status !== 401) return res;

  const session = await SessionStore.get();
  if (!session?.token) return res;

  const nextToken = await refreshAccessToken(session);
  await SessionStore.set({ ...session, token: nextToken });

  const retryHeaders: Record<string, string> = { ...headers, Authorization: `Bearer ${nextToken}` };
  return fetch(url, { ...init, headers: retryHeaders });
}

export async function apiJson<T = any>(path: string, init: ApiInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  const json = await readJsonSafe(res);
  if (!res.ok) throw new Error(asErrorMessage(json, `HTTP ${res.status}`));
  return json as T;
}

