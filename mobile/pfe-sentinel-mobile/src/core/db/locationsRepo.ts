import { getDb } from './db';

export type LocationRow = {
  id: string;
  name: string;
};

export const LocationsRepo = {
  async upsertMany(items: any[]): Promise<number> {
    const db = getDb();
    let count = 0;
    const now = Date.now();
    await db.withTransactionAsync(async () => {
      for (const it of items) {
        const id = String(it?._id || it?.id || '').trim();
        if (!id) continue;
        const name = String(it?.name || '').trim();
        await db.runAsync(
          `INSERT INTO locations (id, name, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at`,
          [id, name, now]
        );
        count += 1;
      }
    });
    return count;
  },

  async list(input: { q?: string; limit?: number } = {}): Promise<LocationRow[]> {
    const db = getDb();
    const limit = Math.max(1, Math.min(400, Math.floor(Number(input.limit || 120))));
    const q = String(input.q || '').trim().toLowerCase();
    let rows: any[] = [];
    if (!q) {
      rows = await db.getAllAsync<any>(`SELECT * FROM locations ORDER BY name ASC LIMIT ?`, [limit]);
    } else {
      const like = `%${q}%`;
      rows = await db.getAllAsync<any>(
        `SELECT * FROM locations WHERE lower(name) LIKE ? ORDER BY name ASC LIMIT ?`,
        [like, limit]
      );
    }
    return rows.map((r) => ({ id: String(r.id), name: String(r.name || '') }));
  },
};

