import NetInfo from '@react-native-community/netinfo';

import { OutboxRepo } from '../db/outboxRepo';
import { SyncStateStore } from '../settings/syncStateStore';
import { SessionStore } from '../session/sessionStore';
import { apiFetch } from './apiClient';

export const SyncService = {
  async pushPending(): Promise<{ sent: number; failed: number }> {
    const net = await NetInfo.fetch();
    if (!net.isConnected) throw new Error('Pas de réseau (offline)');

    const session = await SessionStore.get();
    if (!session?.token) throw new Error('Session absente');

    const pending = await OutboxRepo.listPendingEvents(50);

    let sent = 0;
    let failed = 0;
    const startedAt = Date.now();
    await SyncStateStore.set({ lastSyncAt: startedAt, lastSyncSummary: 'Synchronisation en cours...' });

    for (const e of pending) {
      try {
        const payload = JSON.parse(e.payloadJson);
        const eventTimeDevice = payload?.meta?.time?.createdAtDeviceIso;

        const res = await apiFetch('/api/sync/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            events: [
              {
                id: e.id,
                type: e.type,
                site: payload?.site || undefined,
                event_time_device: typeof eventTimeDevice === 'string' ? eventTimeDevice : undefined,
                payload,
                createdAtLocal: new Date(e.createdAt).toISOString(),
              },
            ],
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

        const rejected = Array.isArray(json?.rejected) ? json.rejected : [];
        const accepted = Array.isArray(json?.accepted) ? json.accepted : [];
        const isRejected = rejected.some((x: any) => String(x?.id || '') === e.id);
        const isAccepted = accepted.some((x: any) => String(x?.id || '') === e.id);

        if (isRejected && !isAccepted) {
          const errMsg = String(rejected.find((x: any) => String(x?.id || '') === e.id)?.error || 'Rejeté côté serveur');
          const classified = classifySyncError(errMsg);
          if (classified === 'conflict') await OutboxRepo.markConflict(e.id, errMsg);
          else await OutboxRepo.markError(e.id, errMsg);
          failed += 1;
          continue;
        }

        await OutboxRepo.markSent(e.id);
        sent += 1;
      } catch (err: any) {
        const msg = err?.message || 'Sync error';
        const classified = classifySyncError(msg);
        if (classified === 'conflict') await OutboxRepo.markConflict(e.id, msg);
        else await OutboxRepo.markError(e.id, msg);
        failed += 1;
      }
    }

    const summary = `Dernière sync: ${sent} envoyés, ${failed} en erreur`;
    await SyncStateStore.set({ lastSyncAt: Date.now(), lastSyncSummary: summary });
    return { sent, failed };
  },
};

function classifySyncError(message: string): 'error' | 'conflict' {
  const m = String(message || '').toLowerCase();
  if (m.includes('déjà') || m.includes('deja') || m.includes('duplicate')) return 'conflict';
  if (m.includes('insuffisant') || (m.includes('stock') && m.includes('insuff'))) return 'conflict';
  if (m.includes('archive') || m.includes('indisponible')) return 'conflict';
  if (m.includes('409')) return 'conflict';
  return 'error';
}

