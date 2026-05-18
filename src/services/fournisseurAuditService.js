import { getFournisseurHistory } from './fournisseurService';

const LOCAL_AUDIT_KEY = 'supplier_local_audit_v1';

function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function readLocalAudit() {
  if (typeof window === 'undefined') return {};
  const raw = localStorage.getItem(LOCAL_AUDIT_KEY);
  const parsed = raw ? safeJsonParse(raw, {}) : {};
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function writeLocalAudit(next) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify(next || {}));
  } catch {
    // ignore
  }
}

export function appendLocalAudit(supplierId, entry) {
  const sid = String(supplierId || '').trim();
  if (!sid) return;
  const now = new Date().toISOString();
  const all = readLocalAudit();
  const list = Array.isArray(all[sid]) ? all[sid] : [];
  list.unshift({
    id: `local-${Date.now()}`,
    createdAt: now,
    ...entry,
  });
  all[sid] = list.slice(0, 200);
  writeLocalAudit(all);
}

export function getLocalAudit(supplierId) {
  const sid = String(supplierId || '').trim();
  if (!sid) return [];
  const all = readLocalAudit();
  return Array.isArray(all[sid]) ? all[sid] : [];
}

export async function getMergedSupplierHistory(supplierId, { limit = 50 } = {}) {
  const sid = String(supplierId || '').trim();
  if (!sid) throw new Error('supplier id manquant');
  const [remote, local] = await Promise.all([
    getFournisseurHistory(sid, { limit }).catch(() => ({ items: [] })),
    Promise.resolve(getLocalAudit(sid)),
  ]);
  const merged = [
    ...(Array.isArray(remote?.items) ? remote.items : []),
    ...(Array.isArray(local) ? local : []),
  ];
  merged.sort((a, b) => {
    const da = new Date(a?.createdAt || a?.created_at || 0).getTime();
    const db = new Date(b?.createdAt || b?.created_at || 0).getTime();
    return db - da;
  });
  return merged.slice(0, Math.max(1, Number(limit || 50)));
}

