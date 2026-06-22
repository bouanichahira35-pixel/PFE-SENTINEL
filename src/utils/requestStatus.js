// BLOC 1 - Role du fichier.
// Ce fichier regroupe des fonctions utilitaires frontend autour de requestStatus.
// Point de vigilance: modifier avec prudence car ce fichier peut etre importe par plusieurs modules.

export const CANONICAL_REQUEST_STATUSES = Object.freeze([
  'pending',
  'validated',
  'preparing',
  'served',
  'received',
  'rejected',
  'cancelled',
]);

export function normalizeRequestStatus(status) {
  const key = String(status || '').trim().toLowerCase();
  if (!key) return 'pending';
  if (key === 'accepted') return 'validated';
  if (key === 'refused') return 'rejected';
  return key;
}

export function isTerminalRequestStatus(status) {
  const canon = normalizeRequestStatus(status);
  return ['served', 'received', 'rejected', 'cancelled'].includes(canon);
}
