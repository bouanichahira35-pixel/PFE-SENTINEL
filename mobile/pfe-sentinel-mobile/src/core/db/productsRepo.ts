// BLOC 1 - Role du fichier.
// Ce fichier gere la persistance locale mobile pour productsRepo.
// Point de vigilance: garder la compatibilite avec la synchronisation offline et les types TypeScript.

import { getDb } from './db';

export type ProductRow = {
  id: string;
  codeProduct: string;
  name: string;
  category: string;
  fdsFileUrl: string | null;
  fdsLocalPath: string | null;
};

export const ProductsRepo = {
  async upsertMany(items: any[]): Promise<number> {
    const db = getDb();
    let count = 0;
    const now = Date.now();

    await db.withTransactionAsync(async () => {
      for (const it of items) {
        const id = String(it?._id || it?.id || '').trim();
        if (!id) continue;
        const code = String(it?.code_product || it?.codeProduct || '').trim();
        const name = String(it?.name || '').trim();
        const category = String(it?.category?.name || it?.category || '').trim();
        const fdsFileUrl = it?.fds_file_url || it?.fdsFileUrl || it?.fds_file || null;
        await db.runAsync(
          `INSERT INTO products (id, code_product, name, category, fds_file_url, fds_local_path, updated_at)
           VALUES (?, ?, ?, ?, ?, COALESCE((SELECT fds_local_path FROM products WHERE id=?), NULL), ?)
           ON CONFLICT(id) DO UPDATE SET
             code_product=excluded.code_product,
             name=excluded.name,
             category=excluded.category,
             fds_file_url=excluded.fds_file_url,
             updated_at=excluded.updated_at`,
          [id, code, name, category, fdsFileUrl ? String(fdsFileUrl) : null, id, now]
        );
        count += 1;
      }
    });

    return count;
  },

  async list(input: { q?: string; limit?: number } = {}): Promise<ProductRow[]> {
    const db = getDb();
    const limit = Math.max(1, Math.min(300, Math.floor(Number(input.limit || 120))));
    const q = String(input.q || '').trim();
    let rows: any[] = [];
    if (!q) {
      rows = await db.getAllAsync<any>(
        `SELECT * FROM products ORDER BY name ASC LIMIT ?`,
        [limit]
      );
    } else {
      const like = `%${q.toLowerCase()}%`;
      rows = await db.getAllAsync<any>(
        `SELECT * FROM products
         WHERE lower(name) LIKE ? OR lower(code_product) LIKE ?
         ORDER BY name ASC LIMIT ?`,
        [like, like, limit]
      );
    }
    return rows.map(mapRow);
  },

  async getById(id: string): Promise<ProductRow | null> {
    const db = getDb();
    const row = await db.getFirstAsync<any>(`SELECT * FROM products WHERE id=? LIMIT 1`, [id]);
    return row ? mapRow(row) : null;
  },

  async findByCode(code: string): Promise<ProductRow | null> {
    const db = getDb();
    const c = String(code || '').trim();
    if (!c) return null;
    const row = await db.getFirstAsync<any>(
      `SELECT * FROM products WHERE code_product=? LIMIT 1`,
      [c]
    );
    return row ? mapRow(row) : null;
  },

  async setFdsLocalPath(id: string, localPath: string): Promise<void> {
    const db = getDb();
    await db.runAsync(`UPDATE products SET fds_local_path=?, updated_at=? WHERE id=?`, [
      String(localPath || '').trim(),
      Date.now(),
      String(id),
    ]);
  },
};

function mapRow(row: any): ProductRow {
  return {
    id: String(row.id),
    codeProduct: String(row.code_product || ''),
    name: String(row.name || ''),
    category: String(row.category || ''),
    fdsFileUrl: row.fds_file_url ? String(row.fds_file_url) : null,
    fdsLocalPath: row.fds_local_path ? String(row.fds_local_path) : null,
  };
}
