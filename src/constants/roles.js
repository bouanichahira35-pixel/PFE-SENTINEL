// BLOC 1 - Role du fichier.
// Ce fichier centralise des constantes frontend pour roles.
// Point de vigilance: modifier avec prudence car ce fichier peut etre importe par plusieurs modules.

export const ROLES = Object.freeze({
  DEMANDEUR: 'demandeur',
  MAGASINIER: 'magasinier',
  RESPONSABLE: 'responsable',
  ADMIN: 'admin',
});

export const KNOWN_ROLES = Object.freeze(Object.values(ROLES));

export const HOME_PATH_BY_ROLE = Object.freeze({
  [ROLES.DEMANDEUR]: '/demandeur',
  [ROLES.MAGASINIER]: '/magasinier/inbox',
  [ROLES.RESPONSABLE]: '/responsable/inventaires',
  [ROLES.ADMIN]: '/admin',
});

export function isKnownRole(role) {
  return KNOWN_ROLES.includes(role);
}
