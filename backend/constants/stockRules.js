// BLOC 1 - Role du fichier.
// Ce fichier centralise des constantes backend pour stockRules.
// Point de vigilance: modifier avec prudence car ce fichier peut etre importe par plusieurs modules.

const STOCK_RULES_DEFAULT = Object.freeze({
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

function asBool(value, fallback) {
  if (value === undefined) return fallback;
  return Boolean(value);
}

function asInt(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n);
}

function sanitizeStockRulesConfig(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const next = { ...STOCK_RULES_DEFAULT };

  next.seuilAlerte = asInt(raw.seuilAlerte, next.seuilAlerte);
  next.joursInactivite = asInt(raw.joursInactivite, next.joursInactivite);

  next.autoriserProduitsSansSeuil = asBool(raw.autoriserProduitsSansSeuil, next.autoriserProduitsSansSeuil);
  next.bloquerSortiesStockInsuffisant = asBool(raw.bloquerSortiesStockInsuffisant, next.bloquerSortiesStockInsuffisant);
  next.activerAlertesAutomatiques = asBool(raw.activerAlertesAutomatiques, next.activerAlertesAutomatiques);

  // Feature removed: never require responsable validation on new product creation.
  next.validationObligatoireNouveauxProduits = false;

  next.validationApresModificationSeuil = asBool(raw.validationApresModificationSeuil, next.validationApresModificationSeuil);
  next.validationApresChangementCategorie = asBool(raw.validationApresChangementCategorie, next.validationApresChangementCategorie);
  next.produitsIncompletsEnAverifier = asBool(raw.produitsIncompletsEnAverifier, next.produitsIncompletsEnAverifier);

  next.alerteStockSousSeuil = asBool(raw.alerteStockSousSeuil, next.alerteStockSousSeuil);
  next.alerteRuptureStock = asBool(raw.alerteRuptureStock, next.alerteRuptureStock);
  next.alerteProduitInactif = asBool(raw.alerteProduitInactif, next.alerteProduitInactif);
  next.alerteProduitSansFournisseur = asBool(raw.alerteProduitSansFournisseur, next.alerteProduitSansFournisseur);
  next.alerteProduitSansUniteOuCategorie = asBool(
    raw.alerteProduitSansUniteOuCategorie,
    next.alerteProduitSansUniteOuCategorie
  );

  // Hard validation / bounds
  if (!Number.isFinite(next.seuilAlerte) || next.seuilAlerte < 0) next.seuilAlerte = STOCK_RULES_DEFAULT.seuilAlerte;
  if (!Number.isFinite(next.joursInactivite) || next.joursInactivite < 1) next.joursInactivite = STOCK_RULES_DEFAULT.joursInactivite;

  return next;
}

function diffStockRules(before, after) {
  const b = sanitizeStockRulesConfig(before);
  const a = sanitizeStockRulesConfig(after);
  const keys = Object.keys(STOCK_RULES_DEFAULT);
  const changes = [];
  for (const key of keys) {
    if (b[key] !== a[key]) {
      changes.push({ key, before: b[key], after: a[key] });
    }
  }
  return changes;
}

module.exports = {
  STOCK_RULES_DEFAULT,
  sanitizeStockRulesConfig,
  diffStockRules,
};
