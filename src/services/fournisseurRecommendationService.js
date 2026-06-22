// BLOC 1 - Role du fichier.
// Ce fichier organise les appels API ou la logique frontend partagee pour fournisseurRecommendationService.
// Point de vigilance: modifier avec prudence car ce fichier peut etre importe par plusieurs modules.

import { get, post } from './api';

export async function recommendFournisseurs({ productId, quantity } = {}) {
  const pid = String(productId || '').trim();
  if (!pid) throw new Error('productId manquant');
  // `quantity` is optional for the backend recommendation endpoint (currently product-only),
  // but kept in signature for UI parity.
  const res = await get(`/suppliers/recommendation?product_id=${encodeURIComponent(pid)}`);
  return res;
}

export async function createCommandeFromRecommendation({
  supplierId,
  productId,
  quantity,
  source = 'recommandation',
} = {}) {
  const pid = String(productId || '').trim();
  const sid = String(supplierId || '').trim();
  const qty = Number(quantity);
  if (!pid) throw new Error('productId manquant');
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('quantite invalide');

  const payload = {
    product_id: pid,
    quantity: qty,
    supplier_id: sid || undefined,
    note: `Commande creee via ${source}.`,
    decision_title: 'Commande IA (fournisseur recommande)',
    decision_kind: 'supplier_recommendation',
    decision_level: 'info',
  };
  const created = await post('/purchase-orders/quick', payload);
  return created;
}

