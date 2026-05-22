import { get, patch, post } from './api';

export const STOCK_RULES_DEFAULT = Object.freeze({
  // General rules
  seuilAlerte: 10,
  joursInactivite: 30,
  autoriserProduitsSansSeuil: true,
  bloquerSortiesStockInsuffisant: true,
  activerAlertesAutomatiques: true,

  // Validation rules
  // Feature removed: new products are always usable immediately (no responsable validation).
  validationObligatoireNouveauxProduits: false,
  validationApresModificationSeuil: false,
  validationApresChangementCategorie: false,
  produitsIncompletsEnAverifier: true,

  // Automatic alert rules
  alerteStockSousSeuil: true,
  alerteRuptureStock: true,
  alerteProduitInactif: true,
  alerteProduitSansFournisseur: false,
  alerteProduitSansUniteOuCategorie: true,
});

function coerceBool(value, fallback) {
  if (value === undefined) return fallback;
  return Boolean(value);
}

function coerceInt(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n);
}

export function sanitizeStockRulesConfig(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const next = { ...STOCK_RULES_DEFAULT };

  next.seuilAlerte = coerceInt(raw.seuilAlerte, next.seuilAlerte);
  next.joursInactivite = coerceInt(raw.joursInactivite, next.joursInactivite);

  next.autoriserProduitsSansSeuil = coerceBool(raw.autoriserProduitsSansSeuil, next.autoriserProduitsSansSeuil);
  next.bloquerSortiesStockInsuffisant = coerceBool(
    raw.bloquerSortiesStockInsuffisant,
    next.bloquerSortiesStockInsuffisant
  );
  next.activerAlertesAutomatiques = coerceBool(raw.activerAlertesAutomatiques, next.activerAlertesAutomatiques);

  // Feature removed: never require responsable validation on new product creation.
  next.validationObligatoireNouveauxProduits = false;

  next.validationApresModificationSeuil = coerceBool(raw.validationApresModificationSeuil, next.validationApresModificationSeuil);
  next.validationApresChangementCategorie = coerceBool(raw.validationApresChangementCategorie, next.validationApresChangementCategorie);
  next.produitsIncompletsEnAverifier = coerceBool(raw.produitsIncompletsEnAverifier, next.produitsIncompletsEnAverifier);

  next.alerteStockSousSeuil = coerceBool(raw.alerteStockSousSeuil, next.alerteStockSousSeuil);
  next.alerteRuptureStock = coerceBool(raw.alerteRuptureStock, next.alerteRuptureStock);
  next.alerteProduitInactif = coerceBool(raw.alerteProduitInactif, next.alerteProduitInactif);
  next.alerteProduitSansFournisseur = coerceBool(raw.alerteProduitSansFournisseur, next.alerteProduitSansFournisseur);
  next.alerteProduitSansUniteOuCategorie = coerceBool(
    raw.alerteProduitSansUniteOuCategorie,
    next.alerteProduitSansUniteOuCategorie
  );

  if (!Number.isFinite(next.seuilAlerte) || next.seuilAlerte < 0) next.seuilAlerte = STOCK_RULES_DEFAULT.seuilAlerte;
  if (!Number.isFinite(next.joursInactivite) || next.joursInactivite < 1) next.joursInactivite = STOCK_RULES_DEFAULT.joursInactivite;

  return next;
}

export async function loadStockRulesConfig() {
  const res = await get('/settings/stock-rules/config');
  const value = sanitizeStockRulesConfig(res?.value || {});
  return { ok: true, value };
}

export async function saveStockRulesConfig(config) {
  const payload = sanitizeStockRulesConfig(config || {});
  const res = await patch('/settings/stock-rules/config', payload);
  return {
    ok: true,
    value: sanitizeStockRulesConfig(res?.value || payload),
    changes: Array.isArray(res?.changes) ? res.changes : [],
    impact: res?.impact || null,
  };
}

export async function resetStockRulesToDefault() {
  const res = await post('/settings/stock-rules/reset-default', {});
  return {
    ok: true,
    value: sanitizeStockRulesConfig(res?.value || STOCK_RULES_DEFAULT),
    changes: Array.isArray(res?.changes) ? res.changes : [],
    impact: res?.impact || null,
  };
}

export async function loadStockRulesImpact() {
  const res = await get('/settings/stock-rules/impact');
  return { ok: true, impact: res || null };
}

export async function simulateStockRulesImpact(config) {
  const payload = sanitizeStockRulesConfig(config || {});
  const res = await post('/settings/stock-rules/simulate', payload);
  return { ok: true, impact: res || null };
}

export async function applyGlobalThresholdToProductsWithoutThreshold() {
  const res = await post('/settings/stock-rules/apply-default-threshold', {});
  return { ok: true, ...res };
}

export async function loadStockRulesHistory({ limit = 50 } = {}) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  const res = await get(`/settings/stock-rules/history?${params.toString()}`);
  const items = Array.isArray(res?.items) ? res.items : [];
  return { ok: true, items };
}
