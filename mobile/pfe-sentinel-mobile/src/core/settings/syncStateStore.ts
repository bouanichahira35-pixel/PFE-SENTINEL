import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_LAST_SYNC_AT = 'sync:last_sync_at';
const KEY_LAST_SYNC_SUMMARY = 'sync:last_sync_summary';

export type LastSyncState = {
  lastSyncAt: number | null;
  lastSyncSummary: string | null;
};

export const SyncStateStore = {
  async get(): Promise<LastSyncState> {
    const [atRaw, summary] = await Promise.all([
      AsyncStorage.getItem(KEY_LAST_SYNC_AT),
      AsyncStorage.getItem(KEY_LAST_SYNC_SUMMARY),
    ]);
    const at = atRaw ? Number(atRaw) : NaN;
    return {
      lastSyncAt: Number.isFinite(at) ? at : null,
      lastSyncSummary: summary ? String(summary) : null,
    };
  },

  async set(input: { lastSyncAt?: number | null; lastSyncSummary?: string | null }): Promise<void> {
    const ops: Promise<void>[] = [];
    if (input.lastSyncAt !== undefined) {
      if (input.lastSyncAt === null) ops.push(AsyncStorage.removeItem(KEY_LAST_SYNC_AT).then(() => undefined));
      else ops.push(AsyncStorage.setItem(KEY_LAST_SYNC_AT, String(input.lastSyncAt)).then(() => undefined));
    }
    if (input.lastSyncSummary !== undefined) {
      if (input.lastSyncSummary === null) ops.push(AsyncStorage.removeItem(KEY_LAST_SYNC_SUMMARY).then(() => undefined));
      else ops.push(AsyncStorage.setItem(KEY_LAST_SYNC_SUMMARY, String(input.lastSyncSummary)).then(() => undefined));
    }
    await Promise.all(ops);
  },
};

