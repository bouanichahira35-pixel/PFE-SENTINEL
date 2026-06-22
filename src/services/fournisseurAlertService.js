// BLOC 1 - Role du fichier.
// Ce fichier organise les appels API ou la logique frontend partagee pour fournisseurAlertService.
// Point de vigilance: modifier avec prudence car ce fichier peut etre importe par plusieurs modules.

import { get, patch } from './api';

export const ALERT_STATUS = Object.freeze({
  NON_TRAITEE: 'NON_TRAITEE',
  EN_COURS: 'EN_COURS',
  TRAITEE: 'TRAITEE',
  IGNOREE: 'IGNOREE',
});

export function alertPill(priority) {
  const p = String(priority || '').toUpperCase();
  if (p === 'ELEVEE') return { text: 'Critique', className: 'pill critique' };
  if (p === 'MOYENNE') return { text: 'Moyenne', className: 'pill moyen' };
  if (p === 'FAIBLE') return { text: 'Faible', className: 'pill faible' };
  return { text: priority || '-', className: 'pill' };
}

export async function listFournisseurAlerts({
  status = ALERT_STATUS.NON_TRAITEE,
  supplierId = '',
  limit = 50,
  page = 1,
} = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', String(status));
  if (supplierId) params.set('supplier', String(supplierId));
  params.set('limit', String(limit || 50));
  params.set('page', String(page || 1));
  const res = await get(`/supplier-alerts?${params.toString()}`);
  return res;
}

export async function updateFournisseurAlertStatus(id, status, { comment = '' } = {}) {
  const aid = String(id || '').trim();
  if (!aid) throw new Error('alert id manquant');
  const res = await patch(`/supplier-alerts/${encodeURIComponent(aid)}/status`, { status, comment });
  return res;
}

export function alertActionRoute(alert) {
  const supplierId = String(alert?.supplier?._id || alert?.supplier || '').trim();
  if (!supplierId) return '/responsable/fournisseurs';
  const type = String(alert?.type || '').toUpperCase();
  if (type.includes('DOCUMENT') || type.includes('FICHE_INCOMPLETE')) return `/responsable/fournisseurs/${supplierId}/documents`;
  if (type.includes('RETARD') || type.includes('INCIDENT') || type.includes('FIABILITE')) return `/responsable/fournisseurs/${supplierId}/incidents`;
  if (type.includes('DOUBLON')) return `/responsable/fournisseurs/${supplierId}`;
  return `/responsable/fournisseurs/${supplierId}`;
}

