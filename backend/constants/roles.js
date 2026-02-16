const TECHNICAL_ROLES = ['demandeur', 'magasinier', 'responsable'];

const ROLE_ALIASES = {
  admin_app: 'responsable',
  administrateur: 'responsable',
  responsable: 'responsable',
  stock_manager: 'magasinier',
  gestionnaire: 'magasinier',
  magasinier: 'magasinier',
  viewer: 'demandeur',
  demandeur: 'demandeur',
};

function normalizeRole(role) {
  const key = String(role || '').trim().toLowerCase();
  return ROLE_ALIASES[key] || key;
}

function isTechnicalRole(role) {
  return TECHNICAL_ROLES.includes(normalizeRole(role));
}

module.exports = {
  TECHNICAL_ROLES,
  normalizeRole,
  isTechnicalRole,
};
