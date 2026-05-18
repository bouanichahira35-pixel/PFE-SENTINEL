const { normalizeEmail, normalizePhone } = require('../utils/validation');

const SUPPLIER_STATUS = Object.freeze({
  ACTIF: 'ACTIF',
  INACTIF: 'INACTIF',
  SUSPENDU: 'SUSPENDU',
  A_VERIFIER: 'A_VERIFIER',
});

const RELIABILITY_LEVEL = Object.freeze({
  FIABLE: 'FIABLE',
  MOYEN: 'MOYEN',
  A_SURVEILLER: 'A_SURVEILLER',
  NON_EVALUE: 'NON_EVALUE',
});

const ALERT_TYPE = Object.freeze({
  FICHE_INCOMPLETE: 'FICHE_INCOMPLETE',
  DOUBLON_POTENTIEL: 'DOUBLON_POTENTIEL',
  FOURNISSEUR_SUSPENDU: 'FOURNISSEUR_SUSPENDU',
  FOURNISSEUR_INACTIF: 'FOURNISSEUR_INACTIF',
  FICHE_ANCIENNE: 'FICHE_ANCIENNE',
  FIABILITE_FAIBLE: 'FIABILITE_FAIBLE',
});

const ALERT_PRIORITY = Object.freeze({
  FAIBLE: 'FAIBLE',
  MOYENNE: 'MOYENNE',
  ELEVEE: 'ELEVEE',
});

const ALERT_STATUS = Object.freeze({
  NON_TRAITEE: 'NON_TRAITEE',
  EN_COURS: 'EN_COURS',
  TRAITEE: 'TRAITEE',
  IGNOREE: 'IGNOREE',
});

function normalizeSupplierStatus(value) {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  const s = raw.toUpperCase();
  if (s === 'ACTIF' || s === 'ACTIVE') return SUPPLIER_STATUS.ACTIF;
  if (s === 'INACTIF' || s === 'INACTIVE') return SUPPLIER_STATUS.INACTIF;
  if (s === 'SUSPENDU' || s === 'SUSPENDED') return SUPPLIER_STATUS.SUSPENDU;
  if (s === 'A_VERIFIER' || s === 'A-VERIFIER' || s === 'A VERIFIER' || s === 'TO_VERIFY') return SUPPLIER_STATUS.A_VERIFIER;
  if (raw === 'active') return SUPPLIER_STATUS.ACTIF;
  if (raw === 'inactive') return SUPPLIER_STATUS.INACTIF;
  return null;
}

function normalizeReliabilityLevel(value) {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  const s = raw.toUpperCase();
  if (s === RELIABILITY_LEVEL.FIABLE) return RELIABILITY_LEVEL.FIABLE;
  if (s === RELIABILITY_LEVEL.MOYEN) return RELIABILITY_LEVEL.MOYEN;
  if (s === RELIABILITY_LEVEL.A_SURVEILLER) return RELIABILITY_LEVEL.A_SURVEILLER;
  if (s === RELIABILITY_LEVEL.NON_EVALUE || s === 'NON_EVALUEE') return RELIABILITY_LEVEL.NON_EVALUE;
  return null;
}

function isActiveSupplierStatus(value) {
  const n = normalizeSupplierStatus(value);
  return n === SUPPLIER_STATUS.ACTIF;
}

function computeSupplierProfileQuality(supplier, { require_main_contact = false } = {}) {
  const missing = [];
  const email = normalizeEmail(supplier?.email);
  const phone = normalizePhone(supplier?.phone);
  const status = normalizeSupplierStatus(supplier?.status);
  const domain = String(supplier?.domain || '').trim();
  const mainContact = String(supplier?.main_contact || '').trim();

  if (!email) missing.push('email');
  if (!phone) missing.push('phone');
  if (!status) missing.push('status');
  if (!domain) missing.push('domain');
  if (require_main_contact && !mainContact) missing.push('main_contact');

  const normalizedStatus = status || undefined;
  let state = 'complete';
  if (missing.length) state = 'incomplete';
  if (normalizedStatus === SUPPLIER_STATUS.A_VERIFIER) state = 'a_verifier';

  return {
    state, // complete | incomplete | a_verifier
    missing_fields: missing,
    is_complete: missing.length === 0,
    normalized_status: normalizedStatus,
  };
}

function monthsAgo(date) {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return (Date.now() - d.getTime()) / (30 * 24 * 60 * 60 * 1000);
}

function buildSupplierAlerts({ supplier, potential_duplicates = [], require_main_contact = false } = {}) {
  const alerts = [];
  const supplierId = String(supplier?._id || '').trim();
  const name = String(supplier?.name || '').trim() || 'Fournisseur';

  const quality = computeSupplierProfileQuality(supplier, { require_main_contact });
  if (quality.missing_fields.length) {
    alerts.push({
      type: ALERT_TYPE.FICHE_INCOMPLETE,
      priority: ALERT_PRIORITY.MOYENNE,
      message: `La fiche du fournisseur ${name} est incomplète. Veuillez compléter les informations nécessaires.`,
      dedupe_key: supplierId ? `${supplierId}:FICHE_INCOMPLETE:${quality.missing_fields.sort().join(',')}` : '',
    });
  }

  if (Array.isArray(potential_duplicates) && potential_duplicates.length) {
    alerts.push({
      type: ALERT_TYPE.DOUBLON_POTENTIEL,
      priority: ALERT_PRIORITY.ELEVEE,
      message: `Un fournisseur similaire existe déjà dans le système. Veuillez vérifier avant de continuer.`,
      dedupe_key: supplierId ? `${supplierId}:DOUBLON_POTENTIEL` : '',
    });
  }

  const status = normalizeSupplierStatus(supplier?.status);
  if (status === SUPPLIER_STATUS.SUSPENDU) {
    alerts.push({
      type: ALERT_TYPE.FOURNISSEUR_SUSPENDU,
      priority: ALERT_PRIORITY.ELEVEE,
      message: `Le fournisseur ${name} est suspendu. Une vérification est recommandée.`,
      dedupe_key: supplierId ? `${supplierId}:FOURNISSEUR_SUSPENDU` : '',
    });
  }

  if (status === SUPPLIER_STATUS.INACTIF) {
    alerts.push({
      type: ALERT_TYPE.FOURNISSEUR_INACTIF,
      priority: ALERT_PRIORITY.MOYENNE,
      message: `Le fournisseur ${name} est désactivé. Il reste conservé dans l'historique.`,
      dedupe_key: supplierId ? `${supplierId}:FOURNISSEUR_INACTIF` : '',
    });
  }

  const reliability = normalizeReliabilityLevel(supplier?.reliability_level);
  if (reliability === RELIABILITY_LEVEL.A_SURVEILLER) {
    alerts.push({
      type: ALERT_TYPE.FIABILITE_FAIBLE,
      priority: ALERT_PRIORITY.MOYENNE,
      message: `Le fournisseur ${name} est marqué comme à surveiller.`,
      dedupe_key: supplierId ? `${supplierId}:FIABILITE_FAIBLE` : '',
    });
  }

  const lastVerif = supplier?.last_verification_date || null;
  const refDate = lastVerif || supplier?.createdAt || null;
  const ageMonths = monthsAgo(refDate);
  if (typeof ageMonths === 'number' && ageMonths > 6) {
    alerts.push({
      type: ALERT_TYPE.FICHE_ANCIENNE,
      priority: ALERT_PRIORITY.FAIBLE,
      message: `Les informations du fournisseur ${name} n'ont pas été vérifiées depuis plus de 6 mois.`,
      dedupe_key: supplierId ? `${supplierId}:FICHE_ANCIENNE` : '',
    });
  }

  return { quality, alerts };
}

module.exports = {
  SUPPLIER_STATUS,
  RELIABILITY_LEVEL,
  ALERT_TYPE,
  ALERT_PRIORITY,
  ALERT_STATUS,
  normalizeSupplierStatus,
  normalizeReliabilityLevel,
  isActiveSupplierStatus,
  supplierStatusQuery: (value) => {
    const normalized = normalizeSupplierStatus(value);
    if (!normalized) return null;
    if (normalized === SUPPLIER_STATUS.ACTIF) return { $in: ['ACTIF', 'active'] };
    if (normalized === SUPPLIER_STATUS.INACTIF) return { $in: ['INACTIF', 'inactive'] };
    return normalized;
  },
  computeSupplierProfileQuality,
  buildSupplierAlerts,
};
