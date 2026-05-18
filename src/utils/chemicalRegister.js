function normalizeBase(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export const CHEMICAL_CLASS_OPTIONS = [
  'Tous',
  'Inflammable',
  'Corrosif',
  'Toxique',
  'Irritant',
  'Comburant',
  "Dangereux pour l’environnement",
  'Non renseignée',
];

export const PHYSICAL_STATE_OPTIONS = [
  'Tous',
  'Liquide',
  'Solide',
  'Gaz',
  'Poudre',
  'Pâte',
  'Non renseigné',
];

export const FDS_FILTER_OPTIONS = ['Tous', 'Disponible', 'Manquante'];

export function normalizeChemicalClass(value) {
  const raw = normalizeBase(value);
  if (!raw) return 'Non renseignée';

  if (raw.includes('inflam') || raw.includes('flammable')) return 'Inflammable';
  if (raw.includes('corros')) return 'Corrosif';
  if (raw.includes('tox')) return 'Toxique';
  if (raw.includes('irrit')) return 'Irritant';
  if (raw.includes('combur')) return 'Comburant';
  if (raw.includes('environ') || raw.includes('aquatique') || raw.includes('pollu')) return "Dangereux pour l’environnement";

  return 'Non renseignée';
}

export function normalizePhysicalState(value) {
  const raw = normalizeBase(value);
  if (!raw) return 'Non renseigné';

  if (raw.includes('liquid')) return 'Liquide';
  if (raw.includes('solid')) return 'Solide';
  if (raw === 'gaz' || raw.includes('gas') || raw.includes('gazeux')) return 'Gaz';
  if (raw.includes('poud')) return 'Poudre';
  if (raw.includes('pate') || raw.includes('pâte') || raw.includes('paste')) return 'Pâte';

  return 'Non renseigné';
}

export function computeChemicalRegisterSignals(row) {
  const chemicalClass = normalizeChemicalClass(row?.chemical_class);
  const physicalState = normalizePhysicalState(row?.physical_state);
  const hasFds = Boolean(row?.fds?.file_url);
  const missingClass = chemicalClass === 'Non renseignée';
  const missingState = physicalState === 'Non renseigné';
  const missingFds = !hasFds;

  const sensitive = ['Inflammable', 'Corrosif', 'Toxique', 'Comburant'].includes(chemicalClass);

  const qty = Number(row?.quantite_restante ?? row?.quantity_available ?? row?.quantity_current ?? 0);
  const seuil = Number(row?.seuil_minimum ?? 0);
  const highStockThreshold = Math.max(50, Math.floor(seuil * 5));
  const highStock = Number.isFinite(qty) && qty >= highStockThreshold;

  const lotsExpiring = Math.max(0, Math.floor(Number(row?.lots_expiring_30d || 0))) > 0;

  const lastMovementAt = row?.last_movement_at ? new Date(row.last_movement_at) : null;
  const lastMovementTs = lastMovementAt && !Number.isNaN(lastMovementAt.getTime()) ? lastMovementAt.getTime() : 0;
  const recentMovement = lastMovementTs > 0 && Date.now() - lastMovementTs <= 7 * 24 * 60 * 60 * 1000;

  const needsComplete = missingFds || missingClass || missingState;
  const watchSignals = highStock || lotsExpiring || recentMovement;

  const status = sensitive
    ? 'Sensible'
    : needsComplete
      ? 'À compléter'
      : watchSignals
        ? 'À surveiller'
        : 'Conforme';

  return {
    chemicalClass,
    physicalState,
    hasFds,
    missingFds,
    missingClass,
    missingState,
    sensitive,
    lotsExpiring,
    highStock,
    recentMovement,
    needsComplete,
    watchSignals,
    status,
  };
}

