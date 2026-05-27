import NetInfo from '@react-native-community/netinfo';

import { OutboxRepo } from '../db/outboxRepo';
import { SyncStateStore } from '../settings/syncStateStore';
import { SessionStore } from '../session/sessionStore';
import { apiFetch } from './apiClient';

export type SyncResult = {
  sent: number;
  failed: number;
  deferred: number;
  pending: number;
  weakConnection: boolean;
};

export function describeConnectionState(state: any): { canSync: boolean; weak: boolean; label: 'ONLINE' | 'FAIBLE' | 'OFFLINE' } {
  const connected = state?.isConnected !== false;
  const reachable = state?.isInternetReachable !== false;
  if (!connected || !reachable) return { canSync: false, weak: false, label: 'OFFLINE' };

  const details = state?.details || {};
  const cellularGeneration = String(details?.cellularGeneration || '').toLowerCase();
  const weak = Boolean(details?.isConnectionExpensive) || cellularGeneration === '2g' || cellularGeneration === '3g';
  return { canSync: true, weak, label: weak ? 'FAIBLE' : 'ONLINE' };
}

export const SyncService = {
  async pushPending(): Promise<SyncResult> {
    const net = await NetInfo.fetch();
    const connection = describeConnectionState(net);
    const pendingBefore = await OutboxRepo.countPending().catch(() => 0);

    if (!connection.canSync) {
      const summary = pendingBefore > 0
        ? `${pendingBefore} operation(s) gardee(s) en attente.`
        : 'Aucune operation en attente.';
      await SyncStateStore.set({ lastSyncAt: Date.now(), lastSyncSummary: summary });
      return { sent: 0, failed: 0, deferred: pendingBefore, pending: pendingBefore, weakConnection: false };
    }

    const session = await SessionStore.get();
    if (!session?.token) throw new Error('Session absente');

    const pending = await OutboxRepo.listPendingEvents(connection.weak ? 12 : 50);

    let sent = 0;
    let failed = 0;
    let deferred = 0;
    const startedAt = Date.now();
    await SyncStateStore.set({
      lastSyncAt: startedAt,
      lastSyncSummary: connection.weak ? 'Connexion faible: synchronisation progressive...' : 'Synchronisation en cours...',
    });

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
          timeoutMs: connection.weak ? 30_000 : 18_000,
          networkRetries: connection.weak ? 3 : 1,
        });

        const json = await res.json().catch(() => ({}));
        if (res.status === 408 || res.status === 429 || res.status >= 500) {
          const retryMsg = String(json?.error || json?.message || `HTTP ${res.status}`);
          throw makeTransientSyncError(retryMsg);
        }
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

        const rejected = Array.isArray(json?.rejected) ? json.rejected : [];
        const accepted = Array.isArray(json?.accepted) ? json.accepted : [];
        const isRejected = rejected.some((x: any) => String(x?.id || '') === e.id);
        const isAccepted = accepted.some((x: any) => String(x?.id || '') === e.id);

        if (isRejected && !isAccepted) {
          const errMsg = String(rejected.find((x: any) => String(x?.id || '') === e.id)?.error || 'Rejete cote serveur');
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
        if (isTransientSyncError(err, msg)) {
          await OutboxRepo.markRetryPending(e.id, msg);
          deferred += 1;
          break;
        }

        const classified = classifySyncError(msg);
        if (classified === 'conflict') await OutboxRepo.markConflict(e.id, msg);
        else await OutboxRepo.markError(e.id, msg);
        failed += 1;
      }
    }

    const pendingAfter = await OutboxRepo.countPending().catch(() => Math.max(0, pendingBefore - sent));
    const summary = formatSyncSummary({ sent, failed, deferred, pending: pendingAfter, weakConnection: connection.weak });
    await SyncStateStore.set({ lastSyncAt: Date.now(), lastSyncSummary: summary });
    return { sent, failed, deferred, pending: pendingAfter, weakConnection: connection.weak };
  },
};

export function formatSyncSummary(result: SyncResult): string {
  const parts = [`${result.sent} envoye(s)`];
  if (result.failed > 0) parts.push(`${result.failed} en erreur`);
  if (result.deferred > 0 || result.pending > 0) parts.push(`${result.pending || result.deferred} en attente`);
  const prefix = result.weakConnection ? 'Connexion faible: ' : '';
  return `${prefix}${parts.join(', ')}`;
}

function classifySyncError(message: string): 'error' | 'conflict' {
  const m = String(message || '').toLowerCase();
  if (m.includes('deja') || m.includes('duplicate')) return 'conflict';
  if (m.includes('insuffisant') || (m.includes('stock') && m.includes('insuff'))) return 'conflict';
  if (m.includes('archive') || m.includes('indisponible')) return 'conflict';
  if (m.includes('409')) return 'conflict';
  return 'error';
}

function makeTransientSyncError(message: string) {
  const err = new Error(message || 'Connexion instable. Les donnees restent en attente.');
  (err as any).isTransientSync = true;
  return err;
}

function isTransientSyncError(err: any, message: string) {
  if (err?.isTransientSync || err?.isTransientNetwork) return true;
  const m = String(message || '').toLowerCase();
  return (
    m.includes('connexion') ||
    m.includes('network') ||
    m.includes('timeout') ||
    m.includes('trop lente') ||
    m.includes('instable') ||
    m.includes('http 408') ||
    m.includes('http 429') ||
    /^http 5\d\d/.test(m)
  );
}
