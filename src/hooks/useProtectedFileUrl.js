import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../services/api';

const API_ORIGIN = String(API_BASE || '').replace(/\/api\/?$/, '');

function resolveAbsoluteUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${String(path).startsWith('/') ? '' : '/'}${path}`;
}

function getAccessToken() {
  return sessionStorage.getItem('token') || localStorage.getItem('token') || '';
}

async function tryRefreshAccessToken() {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.token) return '';
  sessionStorage.setItem('token', data.token);
  localStorage.removeItem('token');
  return String(data.token || '');
}

export default function useProtectedFileUrl(filePath) {
  const [objectUrl, setObjectUrl] = useState('');
  const activeUrlRef = useRef('');

  useEffect(() => {
    const absolute = resolveAbsoluteUrl(filePath);
    const isLocalApiFile = absolute && absolute.startsWith(API_ORIGIN);
    if (!absolute) {
      setObjectUrl('');
      return undefined;
    }

    if (!isLocalApiFile) {
      setObjectUrl(absolute);
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      const token = getAccessToken();
      if (!token) {
        setObjectUrl('');
        return;
      }

      const doFetch = async (accessToken) =>
        fetch(absolute, {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` },
          credentials: 'include',
          signal: controller.signal,
        });

      let res = await doFetch(token);
      if (res.status === 401) {
        const refreshed = await tryRefreshAccessToken();
        if (refreshed) {
          res = await doFetch(refreshed);
        }
      }

      if (!res.ok) {
        setObjectUrl('');
        return;
      }

      const blob = await res.blob();
      if (cancelled) return;

      const nextUrl = URL.createObjectURL(blob);
      const prevUrl = activeUrlRef.current;
      activeUrlRef.current = nextUrl;
      setObjectUrl(nextUrl);
      if (prevUrl) URL.revokeObjectURL(prevUrl);
    }

    load().catch(() => setObjectUrl(''));

    return () => {
      cancelled = true;
      controller.abort();
      const prevUrl = activeUrlRef.current;
      activeUrlRef.current = '';
      if (prevUrl) URL.revokeObjectURL(prevUrl);
    };
  }, [filePath]);

  return objectUrl;
}

