import { get, patch, post } from './api';
import { mockFournisseurs } from '../data/mockFournisseurs';

const LOCAL_SUPPLIERS_KEY = 'suppliers_local_v1';

function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function readLocalSuppliers() {
  if (typeof window === 'undefined') return [...mockFournisseurs];
  const raw = localStorage.getItem(LOCAL_SUPPLIERS_KEY);
  const parsed = raw ? safeJsonParse(raw, null) : null;
  if (Array.isArray(parsed) && parsed.length) return parsed;
  return [...mockFournisseurs];
}

function writeLocalSuppliers(items) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_SUPPLIERS_KEY, JSON.stringify(items || []));
  } catch {
    // ignore persistence failures
  }
}

function isLikelyNetworkError(err) {
  const msg = String(err?.message || '');
  return msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('fetch');
}

export const FOURNISSEUR_STATUT = Object.freeze({
  ACTIF: 'ACTIF',
  INACTIF: 'INACTIF',
  SUSPENDU: 'SUSPENDU',
  A_VERIFIER: 'A_VERIFIER',
});

export const FOURNISSEUR_FIABILITE = Object.freeze({
  FIABLE: 'FIABLE',
  MOYEN: 'MOYEN',
  A_SURVEILLER: 'A_SURVEILLER',
  CRITIQUE: 'CRITIQUE',
  NON_EVALUE: 'NON_EVALUE',
});

export function normalizeSupplierId(supplier) {
  return String(supplier?._id || supplier?.id || '').trim();
}

export async function listFournisseurs({
  page = 1,
  limit = 20,
  q = '',
  status = 'all',
  reliability = 'all',
  profile_state = 'all',
  sort = 'name',
  dir = 'asc',
} = {}) {
  try {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    if (q) params.set('q', String(q));
    if (status && status !== 'all') params.set('status', String(status));
    if (reliability && reliability !== 'all') params.set('reliability', String(reliability));
    if (profile_state && profile_state !== 'all') params.set('profile_state', String(profile_state));
    if (sort) params.set('sort', String(sort));
    if (dir) params.set('dir', String(dir));
    const res = await get(`/suppliers?${params.toString()}`);
    const items = Array.isArray(res?.items) ? res.items : (Array.isArray(res?.suppliers) ? res.suppliers : []);
    return {
      ok: true,
      items,
      total: Number(res?.total || items.length || 0),
      page: Number(res?.page || page),
      limit: Number(res?.limit || limit),
      total_pages: Number(res?.total_pages || 1),
      source: 'api',
    };
  } catch (err) {
    if (!isLikelyNetworkError(err)) throw err;
    const all = readLocalSuppliers();
    const qq = String(q || '').trim().toLowerCase();
    let filtered = all;
    if (qq) {
      filtered = filtered.filter((s) => {
        const hay = [
          s?.name,
          s?.email,
          s?.phone,
          s?.domain,
          s?.main_contact,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(qq);
      });
    }
    if (status && status !== 'all') filtered = filtered.filter((s) => String(s?.status || '').toUpperCase() === String(status).toUpperCase());
    if (reliability && reliability !== 'all') filtered = filtered.filter((s) => String(s?.reliability_level || '').toUpperCase() === String(reliability).toUpperCase());
    if (profile_state && profile_state !== 'all') filtered = filtered.filter((s) => String(s?.profile_state || '') === String(profile_state));
    const start = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
    const slice = filtered.slice(start, start + Math.max(1, Number(limit)));
    return {
      ok: true,
      items: slice,
      total: filtered.length,
      page: Number(page),
      limit: Number(limit),
      total_pages: Math.max(1, Math.ceil(filtered.length / Math.max(1, Number(limit)))),
      source: 'local',
    };
  }
}

export async function getFournisseur(id) {
  const sid = String(id || '').trim();
  if (!sid) throw new Error('supplier id manquant');
  try {
    const res = await get(`/suppliers/${encodeURIComponent(sid)}`);
    return {
      ok: true,
      supplier: res?.supplier || null,
      alerts: Array.isArray(res?.alerts) ? res.alerts : [],
      source: 'api',
    };
  } catch (err) {
    if (!isLikelyNetworkError(err)) throw err;
    const items = readLocalSuppliers();
    const supplier = items.find((s) => normalizeSupplierId(s) === sid) || null;
    return { ok: true, supplier, alerts: [], source: 'local' };
  }
}

export async function getFournisseurHistory(id, { limit = 25 } = {}) {
  const sid = String(id || '').trim();
  if (!sid) throw new Error('supplier id manquant');
  try {
    const res = await get(`/suppliers/${encodeURIComponent(sid)}/history?limit=${encodeURIComponent(String(limit || 25))}`);
    return { ok: true, items: Array.isArray(res?.items) ? res.items : [], source: 'api' };
  } catch (err) {
    if (!isLikelyNetworkError(err)) throw err;
    return { ok: true, items: [], source: 'local' };
  }
}

export async function createFournisseur(payload) {
  try {
    const created = await post('/suppliers', payload);
    return { ok: true, supplier: created, source: 'api' };
  } catch (err) {
    if (!isLikelyNetworkError(err)) throw err;
    const items = readLocalSuppliers();
    const now = new Date().toISOString();
    const doc = {
      _id: `local-${Date.now()}`,
      ...payload,
      createdAt: now,
      updatedAt: now,
      profile_state: 'incomplete',
      missing_fields: [],
    };
    items.unshift(doc);
    writeLocalSuppliers(items);
    return { ok: true, supplier: doc, source: 'local' };
  }
}

export async function updateFournisseur(id, payload) {
  const sid = String(id || '').trim();
  if (!sid) throw new Error('supplier id manquant');
  try {
    const updated = await patch(`/suppliers/${encodeURIComponent(sid)}`, payload);
    return { ok: true, supplier: updated?.supplier || updated, source: 'api' };
  } catch (err) {
    if (!isLikelyNetworkError(err)) throw err;
    const items = readLocalSuppliers();
    const idx = items.findIndex((s) => normalizeSupplierId(s) === sid);
    if (idx < 0) throw new Error('Fournisseur introuvable');
    const next = { ...items[idx], ...payload, updatedAt: new Date().toISOString() };
    items[idx] = next;
    writeLocalSuppliers(items);
    return { ok: true, supplier: next, source: 'local' };
  }
}

export async function updateFournisseurStatus(id, status, { comment = '' } = {}) {
  const sid = String(id || '').trim();
  if (!sid) throw new Error('supplier id manquant');
  try {
    const res = await patch(`/suppliers/${encodeURIComponent(sid)}/status`, { status, comment });
    return { ok: true, supplier: res?.supplier || null, source: 'api' };
  } catch (err) {
    if (!isLikelyNetworkError(err)) throw err;
    return updateFournisseur(sid, { status });
  }
}

export async function updateFournisseurReliability(id, reliability_level, { comment = '' } = {}) {
  const sid = String(id || '').trim();
  if (!sid) throw new Error('supplier id manquant');
  try {
    const res = await patch(`/suppliers/${encodeURIComponent(sid)}/reliability`, { reliability_level, comment });
    return { ok: true, supplier: res?.supplier || null, source: 'api' };
  } catch (err) {
    if (!isLikelyNetworkError(err)) throw err;
    return updateFournisseur(sid, { reliability_level });
  }
}

export async function getFournisseursStats() {
  try {
    const res = await get('/suppliers/stats');
    return { ok: true, stats: res?.stats || null, source: 'api' };
  } catch (err) {
    if (!isLikelyNetworkError(err)) throw err;
    const all = readLocalSuppliers();
    const total = all.length;
    const byStatus = (st) => all.filter((s) => String(s?.status || '').toUpperCase() === st).length;
    return {
      ok: true,
      stats: {
        total_suppliers: total,
        active_suppliers: byStatus('ACTIF'),
        inactive_suppliers: byStatus('INACTIF'),
        suspended_suppliers: byStatus('SUSPENDU'),
        to_verify_suppliers: byStatus('A_VERIFIER'),
        incomplete_profiles: all.filter((s) => String(s?.profile_state || '') === 'incomplete').length,
        open_alerts: 0,
        watch_suppliers: all.filter((s) => String(s?.reliability_level || '') === 'A_SURVEILLER').length,
      },
      source: 'local',
    };
  }
}

export async function getFournisseursRanking({ max = 200 } = {}) {
  try {
    const res = await get(`/suppliers/ranking?max=${encodeURIComponent(String(max || 200))}`);
    const items = Array.isArray(res?.ranking) ? res.ranking : [];
    return { ok: true, ranking: items, source: 'api' };
  } catch (err) {
    if (!isLikelyNetworkError(err)) throw err;
    return { ok: true, ranking: [], source: 'local' };
  }
}

export async function getFournisseurMetrics(id) {
  const sid = String(id || '').trim();
  if (!sid) throw new Error('supplier id manquant');
  try {
    const res = await get(`/suppliers/${encodeURIComponent(sid)}/metrics`);
    return { ok: true, score: res?.score ?? null, kpis: res?.kpis || null, source: 'api' };
  } catch (err) {
    if (!isLikelyNetworkError(err)) throw err;
    return { ok: true, score: null, kpis: null, source: 'local' };
  }
}

export async function listPurchaseOrders({ supplierId = '', status = '', limit = 80 } = {}) {
  try {
    const params = new URLSearchParams();
    params.set('limit', String(limit || 80));
    if (supplierId) params.set('supplier_id', String(supplierId));
    if (status) params.set('status', String(status));
    const res = await get(`/purchase-orders?${params.toString()}`);
    return { ok: true, purchase_orders: Array.isArray(res?.purchase_orders) ? res.purchase_orders : [], source: 'api' };
  } catch (err) {
    if (!isLikelyNetworkError(err)) throw err;
    return { ok: true, purchase_orders: [], source: 'local' };
  }
}

export async function getFournisseurProducts(id) {
  const sid = String(id || '').trim();
  if (!sid) throw new Error('supplier id manquant');
  try {
    const res = await get(`/suppliers/${encodeURIComponent(sid)}/products`);
    return { ok: true, links: Array.isArray(res?.links) ? res.links : [], source: 'api' };
  } catch (err) {
    if (!isLikelyNetworkError(err)) throw err;
    return { ok: true, links: [], source: 'local' };
  }
}

