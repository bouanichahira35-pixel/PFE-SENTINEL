export const ROLES = Object.freeze({
  DEMANDEUR: 'demandeur',
  MAGASINIER: 'magasinier',
  RESPONSABLE: 'responsable',
  ADMIN: 'admin',
});

export const KNOWN_ROLES = Object.freeze(Object.values(ROLES));

export const HOME_PATH_BY_ROLE = Object.freeze({
  [ROLES.DEMANDEUR]: '/demandeur',
  [ROLES.MAGASINIER]: '/magasinier',
  [ROLES.RESPONSABLE]: '/responsable',
  [ROLES.ADMIN]: '/admin',
});

export function isKnownRole(role) {
  return KNOWN_ROLES.includes(role);
}
