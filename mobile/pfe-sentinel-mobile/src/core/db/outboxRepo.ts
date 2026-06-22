// BLOC 1 - Role du fichier.
// Ce fichier gere la persistance locale mobile pour outboxRepo.
// Point de vigilance: garder la compatibilite avec la synchronisation offline et les types TypeScript.

import { getDb } from './db';

export type OutboxStatus = 'pending' | 'sent' | 'error' | 'conflict';

export type OutboxRow = {
  id: string;
  type: string;
  payloadJson: string;
  status: OutboxStatus;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
};

function nowMs() {
  return Date.now();
}

export const OutboxRepo = {
  async enqueue(input: { id: string; type: string; payload: any }): Promise<void> {
    const db = getDb();
    const createdAt = nowMs();
    const payloadJson = JSON.stringify(input.payload ?? null);
    await db.runAsync(
      `INSERT INTO outbox_events (id, type, payload_json, status, last_error, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', NULL, ?, ?)`,
      [input.id, input.type, payloadJson, createdAt, createdAt]
    );
  },

  async listPendingEvents(limit = 50): Promise<OutboxRow[]> {
    const db = getDb();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM outbox_events WHERE status='pending' ORDER BY created_at ASC LIMIT ?`,
      [Math.max(1, Math.min(200, Math.floor(limit)))]
    );
    return rows.map(mapRow);
  },

  async listRecent(limit = 120): Promise<OutboxRow[]> {
    const db = getDb();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM outbox_events ORDER BY created_at DESC LIMIT ?`,
      [Math.max(1, Math.min(400, Math.floor(limit)))]
    );
    return rows.map(mapRow);
  },

  async getById(id: string): Promise<OutboxRow | null> {
    const db = getDb();
    const row = await db.getFirstAsync<any>(`SELECT * FROM outbox_events WHERE id=? LIMIT 1`, [id]);
    return row ? mapRow(row) : null;
  },

  async countPending(): Promise<number> {
    const db = getDb();
    const row = await db.getFirstAsync<any>(`SELECT COUNT(1) as c FROM outbox_events WHERE status='pending'`);
    const n = Number(row?.c ?? 0);
    return Number.isFinite(n) ? n : 0;
  },

  async markSent(id: string): Promise<void> {
    const db = getDb();
    const now = nowMs();
    await db.runAsync(
      `UPDATE outbox_events SET status='sent', last_error=NULL, updated_at=? WHERE id=?`,
      [now, id]
    );
  },

  async markError(id: string, message: string): Promise<void> {
    const db = getDb();
    const now = nowMs();
    await db.runAsync(
      `UPDATE outbox_events SET status='error', updated_at=?, last_error=? WHERE id=?`,
      [now, String(message || '').slice(0, 600), id]
    );
  },

  async markRetryPending(id: string, message: string): Promise<void> {
    const db = getDb();
    const now = nowMs();
    await db.runAsync(
      `UPDATE outbox_events SET status='pending', updated_at=?, last_error=? WHERE id=?`,
      [now, String(message || '').slice(0, 600), id]
    );
  },

  async markConflict(id: string, message: string): Promise<void> {
    const db = getDb();
    const now = nowMs();
    await db.runAsync(
      `UPDATE outbox_events SET status='conflict', updated_at=?, last_error=? WHERE id=?`,
      [now, String(message || '').slice(0, 600), id]
    );
  },
};

function mapRow(row: any): OutboxRow {
  return {
    id: String(row.id),
    type: String(row.type),
    payloadJson: String(row.payload_json),
    status: String(row.status) as OutboxStatus,
    lastError: row.last_error ? String(row.last_error) : null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}
