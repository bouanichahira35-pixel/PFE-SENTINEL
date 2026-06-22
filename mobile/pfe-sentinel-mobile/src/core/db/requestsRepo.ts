// BLOC 1 - Role du fichier.
// Ce fichier gere la persistance locale mobile des demandes demandeur.
// Point de vigilance: toute mutation offline doit garder un event_id pour reconciler la synchronisation.

import { getDb } from './db';

export type RequestLocalState = 'synced' | 'pending' | 'error' | 'conflict';

export type RequestRow = {
  id: string;
  remoteId: string | null;
  productId: string;
  productName: string;
  productCode: string;
  quantityRequested: number;
  directionLaboratory: string;
  priority: 'normal' | 'urgent' | 'critical';
  note: string;
  status: string;
  localState: RequestLocalState;
  receiptToken: string;
  eventId: string | null;
  createdAt: number;
  updatedAt: number;
};

function nowMs() {
  return Date.now();
}

export const RequestsRepo = {
  async upsertRemoteMany(items: any[]): Promise<number> {
    const db = getDb();
    const now = nowMs();
    let count = 0;

    await db.withTransactionAsync(async () => {
      for (const item of items || []) {
        const remoteId = String(item?._id || item?.id || '').trim();
        const productId = String(item?.product?._id || item?.product?.id || item?.product || '').trim();
        if (!remoteId || !productId) continue;
        const localId = remoteId;
        const productName = String(item?.product?.name || item?.productName || 'Produit');
        const productCode = String(item?.product?.code_product || item?.productCode || '-');
        await db.runAsync(
          `INSERT INTO requests (
            id, remote_id, product_id, product_name, product_code, quantity_requested,
            direction_laboratory, priority, note, status, local_state, receipt_token,
            event_id, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, NULL, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            remote_id=excluded.remote_id,
            product_id=excluded.product_id,
            product_name=excluded.product_name,
            product_code=excluded.product_code,
            quantity_requested=excluded.quantity_requested,
            direction_laboratory=excluded.direction_laboratory,
            priority=excluded.priority,
            note=excluded.note,
            status=excluded.status,
            local_state=CASE
              WHEN requests.local_state='pending' THEN requests.local_state
              ELSE 'synced'
            END,
            receipt_token=excluded.receipt_token,
            updated_at=excluded.updated_at`,
          [
            localId,
            remoteId,
            productId,
            productName,
            productCode,
            Number(item?.quantity_requested || item?.quantityRequested || 0),
            String(item?.direction_laboratory || item?.directionLaboratory || ''),
            normalizePriority(item?.priority),
            String(item?.note || ''),
            normalizeStatus(item?.status),
            String(item?.receipt_token || item?.receiptToken || ''),
            parseRemoteDate(item?.date_request || item?.createdAt) || now,
            now,
          ]
        );
        count += 1;
      }
    });

    return count;
  },

  async insertLocalDraft(input: {
    id: string;
    eventId: string;
    productId: string;
    productName: string;
    productCode: string;
    quantityRequested: number;
    directionLaboratory: string;
    priority: 'normal' | 'urgent' | 'critical';
    note?: string;
  }): Promise<void> {
    const db = getDb();
    const createdAt = nowMs();
    await db.runAsync(
      `INSERT INTO requests (
        id, remote_id, product_id, product_name, product_code, quantity_requested,
        direction_laboratory, priority, note, status, local_state, receipt_token,
        event_id, created_at, updated_at
      )
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', '', ?, ?, ?)`,
      [
        input.id,
        input.productId,
        input.productName,
        input.productCode,
        input.quantityRequested,
        input.directionLaboratory,
        input.priority,
        String(input.note || ''),
        input.eventId,
        createdAt,
        createdAt,
      ]
    );
  },

  async list(input: { q?: string; status?: string; limit?: number } = {}): Promise<RequestRow[]> {
    const db = getDb();
    const limit = Math.max(1, Math.min(300, Math.floor(Number(input.limit || 120))));
    const q = String(input.q || '').trim().toLowerCase();
    const status = String(input.status || 'all').trim().toLowerCase();
    const filters: string[] = [];
    const params: any[] = [];

    if (status && status !== 'all') {
      filters.push('status=?');
      params.push(status);
    }
    if (q) {
      filters.push('(lower(product_name) LIKE ? OR lower(product_code) LIKE ? OR lower(id) LIKE ? OR lower(remote_id) LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM requests ${where} ORDER BY updated_at DESC LIMIT ?`,
      [...params, limit]
    );
    return rows.map(mapRow);
  },

  async getById(id: string): Promise<RequestRow | null> {
    const db = getDb();
    const row = await db.getFirstAsync<any>(`SELECT * FROM requests WHERE id=? LIMIT 1`, [String(id)]);
    return row ? mapRow(row) : null;
  },

  async markSyncedByEvent(eventId: string, remoteId: string, status: string): Promise<void> {
    const db = getDb();
    const now = nowMs();
    const row = await db.getFirstAsync<any>(`SELECT * FROM requests WHERE event_id=? LIMIT 1`, [String(eventId)]);
    if (!row) return;
    const oldId = String(row.id);
    const nextStatus = normalizeStatus(status);
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `DELETE FROM requests WHERE id=? AND id<>?`,
        [String(remoteId), oldId]
      );
      await db.runAsync(
        `DELETE FROM requests WHERE remote_id=? AND id<>?`,
        [String(remoteId), oldId]
      );
      await db.runAsync(
        `UPDATE requests
         SET remote_id=?, id=?, status=?, local_state='synced', event_id=NULL, updated_at=?
         WHERE id=?`,
        [String(remoteId), String(remoteId), nextStatus, now, oldId]
      );
    });
  },

  async markLocalStateByEvent(eventId: string, localState: RequestLocalState, status?: string): Promise<void> {
    const db = getDb();
    const now = nowMs();
    await db.runAsync(
      `UPDATE requests
       SET local_state=?, status=COALESCE(?, status), updated_at=?
       WHERE event_id=?`,
      [localState, status ? normalizeStatus(status) : null, now, String(eventId)]
    );
  },

  async markPendingMutation(input: {
    id: string;
    eventId: string;
    status?: string;
    quantityRequested?: number;
    directionLaboratory?: string;
    priority?: 'normal' | 'urgent' | 'critical';
    note?: string;
  }): Promise<void> {
    const db = getDb();
    const current = await this.getById(input.id);
    if (!current) throw new Error('Demande locale introuvable');
    const now = nowMs();
    await db.runAsync(
      `UPDATE requests
       SET quantity_requested=?,
           direction_laboratory=?,
           priority=?,
           note=?,
           status=?,
           local_state='pending',
           event_id=?,
           updated_at=?
       WHERE id=?`,
      [
        input.quantityRequested !== undefined ? Number(input.quantityRequested) : current.quantityRequested,
        input.directionLaboratory !== undefined ? String(input.directionLaboratory || '') : current.directionLaboratory,
        input.priority !== undefined ? normalizePriority(input.priority) : current.priority,
        input.note !== undefined ? String(input.note || '') : current.note,
        input.status ? normalizeStatus(input.status) : current.status,
        input.eventId,
        now,
        input.id,
      ]
    );
  },
};

function mapRow(row: any): RequestRow {
  return {
    id: String(row.id),
    remoteId: row.remote_id ? String(row.remote_id) : null,
    productId: String(row.product_id || ''),
    productName: String(row.product_name || ''),
    productCode: String(row.product_code || ''),
    quantityRequested: Number(row.quantity_requested || 0),
    directionLaboratory: String(row.direction_laboratory || ''),
    priority: normalizePriority(row.priority),
    note: String(row.note || ''),
    status: normalizeStatus(row.status),
    localState: normalizeLocalState(row.local_state),
    receiptToken: String(row.receipt_token || ''),
    eventId: row.event_id ? String(row.event_id) : null,
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
  };
}

function normalizePriority(value: any): 'normal' | 'urgent' | 'critical' {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'urgent') return 'urgent';
  if (raw === 'critical' || raw === 'tres_urgent' || raw === 'tres_urgente') return 'critical';
  return 'normal';
}

function normalizeStatus(value: any): string {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'accepted') return 'validated';
  if (raw === 'refused') return 'rejected';
  return raw || 'pending';
}

function normalizeLocalState(value: any): RequestLocalState {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'pending' || raw === 'error' || raw === 'conflict') return raw;
  return 'synced';
}

function parseRemoteDate(value: any): number | null {
  const t = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
}
