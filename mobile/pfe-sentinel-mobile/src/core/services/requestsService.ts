// BLOC 1 - Role du fichier.
// Ce fichier gere les demandes demandeur mobile en offline-first.
// Point de vigilance: le web reste source de verite; le mobile envoie des evenements idempotents.

import { randomUUID } from 'expo-crypto';

import { DeviceInfo } from '../device/deviceInfo';
import { OutboxRepo } from '../db/outboxRepo';
import { ProductsRepo } from '../db/productsRepo';
import { RequestsRepo } from '../db/requestsRepo';
import { SettingsStore } from '../settings/settingsStore';
import { apiJson } from './apiClient';

export type RequestPriority = 'normal' | 'urgent' | 'critical';

export const RequestsService = {
  async refresh(): Promise<{ count: number }> {
    const json = await apiJson<any>('/api/requests');
    if (!Array.isArray(json)) throw new Error('Reponse demandes invalide');
    const count = await RequestsRepo.upsertRemoteMany(json);
    return { count };
  },

  async createOffline(input: {
    productId: string;
    quantityRequested: number;
    directionLaboratory: string;
    priority: RequestPriority;
    note?: string;
  }): Promise<{ localId: string; eventId: string }> {
    const product = await ProductsRepo.getById(input.productId);
    if (!product) throw new Error('Produit introuvable dans le catalogue local');

    const quantity = Number(input.quantityRequested);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Quantite invalide');

    const direction = cleanText(input.directionLaboratory, 80);
    if (direction.length < 2) throw new Error('Direction / laboratoire obligatoire');

    const priority = normalizePriority(input.priority);
    const note = cleanText(input.note || '', 600);
    const meta = await DeviceInfo.getEventMeta();
    const site = await SettingsStore.getActiveSite();
    const eventId = randomUUID();
    const localId = `local-${eventId}`;
    const payload = {
      site,
      productId: product.id,
      quantityRequested: quantity,
      directionLaboratory: direction,
      priority,
      note: note || undefined,
      meta,
    };

    await RequestsRepo.insertLocalDraft({
      id: localId,
      eventId,
      productId: product.id,
      productName: product.name || product.codeProduct || 'Produit',
      productCode: product.codeProduct || '-',
      quantityRequested: quantity,
      directionLaboratory: direction,
      priority,
      note,
    });
    await OutboxRepo.enqueue({ id: eventId, type: 'request_create', payload });
    return { localId, eventId };
  },

  async enqueueUpdate(input: {
    requestId: string;
    quantityRequested?: number;
    directionLaboratory?: string;
    priority?: RequestPriority;
    note?: string;
  }): Promise<{ eventId: string }> {
    const eventId = randomUUID();
    const meta = await DeviceInfo.getEventMeta();
    await RequestsRepo.markPendingMutation({
      id: input.requestId,
      eventId,
      quantityRequested: input.quantityRequested,
      directionLaboratory: input.directionLaboratory ? cleanText(input.directionLaboratory, 80) : undefined,
      priority: input.priority ? normalizePriority(input.priority) : undefined,
      note: input.note !== undefined ? cleanText(input.note, 600) : undefined,
    });
    await OutboxRepo.enqueue({
      id: eventId,
      type: 'request_update',
      payload: {
        requestId: input.requestId,
        quantityRequested: input.quantityRequested,
        directionLaboratory: input.directionLaboratory ? cleanText(input.directionLaboratory, 80) : undefined,
        priority: input.priority ? normalizePriority(input.priority) : undefined,
        note: input.note !== undefined ? cleanText(input.note, 600) : undefined,
        meta,
      },
    });
    return { eventId };
  },

  async enqueueCancel(input: { requestId: string; note?: string }): Promise<{ eventId: string }> {
    const eventId = randomUUID();
    const meta = await DeviceInfo.getEventMeta();
    await RequestsRepo.markPendingMutation({
      id: input.requestId,
      eventId,
      status: 'cancelled',
      note: input.note !== undefined ? cleanText(input.note, 600) : undefined,
    });
    await OutboxRepo.enqueue({
      id: eventId,
      type: 'request_cancel',
      payload: {
        requestId: input.requestId,
        note: cleanText(input.note || '', 600) || undefined,
        meta,
      },
    });
    return { eventId };
  },

  async enqueueConfirmReceipt(input: { requestId: string; receiptToken?: string }): Promise<{ eventId: string }> {
    const eventId = randomUUID();
    const meta = await DeviceInfo.getEventMeta();
    await RequestsRepo.markPendingMutation({
      id: input.requestId,
      eventId,
      status: 'received',
    });
    await OutboxRepo.enqueue({
      id: eventId,
      type: 'request_confirm_receipt',
      payload: {
        requestId: input.requestId,
        receiptToken: cleanText(input.receiptToken || '', 40) || undefined,
        meta,
      },
    });
    return { eventId };
  },
};

function cleanText(value: string, max: number) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
}

function normalizePriority(value: any): RequestPriority {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'urgent') return 'urgent';
  if (raw === 'critical' || raw === 'tres_urgent' || raw === 'tres_urgente') return 'critical';
  return 'normal';
}
