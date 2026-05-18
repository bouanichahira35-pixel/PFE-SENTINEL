import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

let db: SQLiteDatabase | null = null;

export function getDb(): SQLiteDatabase {
  if (!db) db = openDatabaseSync('pfe_sentinel_mobile.db');
  return db;
}

export async function initDb(): Promise<void> {
  const database = getDb();

  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY NOT NULL,
      code_product TEXT,
      name TEXT,
      category TEXT,
      fds_file_url TEXT,
      fds_local_path TEXT,
      updated_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_products_code ON products(code_product);

    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT,
      updated_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_locations_name ON locations(name);

    CREATE TABLE IF NOT EXISTS outbox_events (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_outbox_status_created ON outbox_events(status, created_at);
  `);
}

