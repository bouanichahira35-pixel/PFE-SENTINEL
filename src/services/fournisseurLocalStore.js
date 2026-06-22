// BLOC 1 - Role du fichier.
// Ce fichier organise les appels API ou la logique frontend partagee pour fournisseurLocalStore.
// Point de vigilance: modifier avec prudence car ce fichier peut etre importe par plusieurs modules.

const DOCS_KEY = 'supplier_docs_v1';
const EVAL_KEY = 'supplier_eval_v1';

function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function readMap(key) {
  if (typeof window === 'undefined') return {};
  const raw = localStorage.getItem(key);
  const parsed = raw ? safeJsonParse(raw, {}) : {};
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function writeMap(key, value) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value || {}));
  } catch {
    // ignore
  }
}

export function getSupplierDocuments(supplierId) {
  const sid = String(supplierId || '').trim();
  if (!sid) return [];
  const map = readMap(DOCS_KEY);
  return Array.isArray(map[sid]) ? map[sid] : [];
}

export function addSupplierDocument(supplierId, doc) {
  const sid = String(supplierId || '').trim();
  if (!sid) return [];
  const map = readMap(DOCS_KEY);
  const list = Array.isArray(map[sid]) ? map[sid] : [];
  const next = [
    {
      id: `doc-${Date.now()}`,
      addedAt: new Date().toISOString(),
      status: 'Déposé',
      ...doc,
    },
    ...list,
  ].slice(0, 100);
  map[sid] = next;
  writeMap(DOCS_KEY, map);
  return next;
}

export function updateSupplierDocument(supplierId, docId, patch) {
  const sid = String(supplierId || '').trim();
  const did = String(docId || '').trim();
  if (!sid || !did) return getSupplierDocuments(sid);
  const map = readMap(DOCS_KEY);
  const list = Array.isArray(map[sid]) ? map[sid] : [];
  const next = list.map((d) => (String(d?.id) === did ? { ...d, ...patch } : d));
  map[sid] = next;
  writeMap(DOCS_KEY, map);
  return next;
}

export function removeSupplierDocument(supplierId, docId) {
  const sid = String(supplierId || '').trim();
  const did = String(docId || '').trim();
  if (!sid || !did) return getSupplierDocuments(sid);
  const map = readMap(DOCS_KEY);
  const list = Array.isArray(map[sid]) ? map[sid] : [];
  const next = list.filter((d) => String(d?.id) !== did);
  map[sid] = next;
  writeMap(DOCS_KEY, map);
  return next;
}

export function getSupplierEvaluation(supplierId) {
  const sid = String(supplierId || '').trim();
  if (!sid) return null;
  const map = readMap(EVAL_KEY);
  return map[sid] || null;
}

export function saveSupplierEvaluation(supplierId, evaluation) {
  const sid = String(supplierId || '').trim();
  if (!sid) return null;
  const map = readMap(EVAL_KEY);
  const next = {
    ...evaluation,
    updatedAt: new Date().toISOString(),
  };
  map[sid] = next;
  writeMap(EVAL_KEY, map);
  return next;
}

