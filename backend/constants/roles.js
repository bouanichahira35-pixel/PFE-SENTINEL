// BLOC 1 - Role du fichier.
// Ce fichier centralise des constantes backend pour roles.
// Point de vigilance: modifier avec prudence car ce fichier peut etre importe par plusieurs modules.

const TECHNICAL_ROLES = ['demandeur', 'magasinier', 'responsable', 'admin'];

const ROLE_ALIASES = {
  admin_app: 'admin',
  administrateur: 'admin',
  admin: 'admin',
  informatique: 'admin',
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

function getStoredRoleCandidates(role) {
  const normalized = normalizeRole(role);
  if (!normalized) return [];

  const candidates = new Set([normalized]);
  for (const [alias, mappedRole] of Object.entries(ROLE_ALIASES)) {
    if (mappedRole === normalized) {
      candidates.add(alias);
    }
  }

  return Array.from(candidates);
}

module.exports = {
  TECHNICAL_ROLES,
  normalizeRole,
  isTechnicalRole,
  getStoredRoleCandidates,
};
