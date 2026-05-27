import React, { useEffect, useMemo, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { colors } from '../../ui/theme';
import { OutboxRepo } from '../../core/db/outboxRepo';
import { describeConnectionState, formatSyncSummary, SyncService } from '../../core/services/syncService';
import { SyncStateStore } from '../../core/settings/syncStateStore';
import { SessionStore } from '../../core/session/sessionStore';
import { SettingsStore } from '../../core/settings/settingsStore';

export function DashboardScreen(props: {
  onOpenMission: () => void;
  onOpenOutbox: () => void;
  onOpenHistory: () => void;
  onOpenCatalog: () => void;
  onOpenScan: () => void;
  onOpenInventory: () => void;
  onOpenLocations: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}) {
  const [online, setOnline] = useState(true);
  const [connectionLabel, setConnectionLabel] = useState<'ONLINE' | 'FAIBLE' | 'OFFLINE'>('ONLINE');
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [last, setLast] = useState<{ at: number | null; summary: string | null }>({ at: null, summary: null });
  const [syncMsg, setSyncMsg] = useState<string>('');
  const [site, setSite] = useState<string>('');
  const [apiBaseUrl, setApiBaseUrl] = useState<string>('');

  const lastLabel = useMemo(() => {
    if (!last.at) return '—';
    return new Date(last.at).toLocaleString();
  }, [last.at]);

  const refresh = async () => {
    const p = await OutboxRepo.countPending().catch(() => 0);
    setPending(p);
    const st = await SyncStateStore.get().catch(() => ({ lastSyncAt: null, lastSyncSummary: null }));
    setLast({ at: st.lastSyncAt, summary: st.lastSyncSummary });
    setSite(await SettingsStore.getActiveSite().catch(() => ''));
    setApiBaseUrl(await SettingsStore.getApiBaseUrl().catch(() => ''));
  };

  useEffect(() => {
    refresh();
    const unsub = NetInfo.addEventListener((state) => {
      const connection = describeConnectionState(state);
      setOnline(connection.canSync);
      setConnectionLabel(connection.label);
    });
    const t = setInterval(refresh, 5000);
    return () => {
      unsub();
      clearInterval(t);
    };
  }, []);

  const doSync = async () => {
    setSyncing(true);
    setSyncMsg('');
    try {
      const result = await SyncService.pushPending();
      setSyncMsg(formatSyncSummary(result));
    } catch (e: any) {
      setSyncMsg(e?.message || 'Erreur synchronisation');
    } finally {
      setSyncing(false);
      refresh();
    }
  };

  const doLogout = async () => {
    await SessionStore.clear().catch(() => {});
    props.onLogout();
  };

  return (
    <Screen
      title="Tableau de bord"
      scroll
      right={
        <Text style={{ color: connectionLabel === 'ONLINE' ? colors.ok : colors.warn, fontWeight: '900' }}>
          {connectionLabel}
        </Text>
      }
    >
      <Card>
        <Text style={styles.k}>Outbox en attente</Text>
        <Text style={styles.v}>{pending}</Text>
        <Text style={styles.meta}>Site: {site || '—'}</Text>
        <Text style={styles.meta}>Backend: {apiBaseUrl || '—'}</Text>
        <Text style={styles.meta}>Dernière sync: {lastLabel}</Text>
        {last.summary ? <Text style={styles.meta}>{last.summary}</Text> : null}
        {syncMsg ? <Text style={[styles.meta, { color: syncMsg.includes('Erreur') || syncMsg.includes('attente') || syncMsg.includes('faible') ? colors.warn : colors.ok }]}>{syncMsg}</Text> : null}
        <Button title="Synchroniser maintenant" onPress={doSync} loading={syncing} disabled={!online || pending === 0} />
      </Card>

      <View style={{ height: 12 }} />
      <Button title="Mission (précharger)" onPress={props.onOpenMission} />
      <Button title="Scan (manuel)" onPress={props.onOpenScan} variant="ghost" style={{ marginTop: 10 }} />
      <Button title="Catalogue produits" onPress={props.onOpenCatalog} variant="ghost" style={{ marginTop: 10 }} />
      <Button title="Inventaire (offline)" onPress={props.onOpenInventory} variant="ghost" style={{ marginTop: 10 }} />
      <Button title="Emplacements" onPress={props.onOpenLocations} variant="ghost" style={{ marginTop: 10 }} />
      <Button title="Outbox" onPress={props.onOpenOutbox} variant="ghost" style={{ marginTop: 10 }} />
      <Button title="Historique (envoyés)" onPress={props.onOpenHistory} variant="ghost" style={{ marginTop: 10 }} />
      <Button title="Paramètres" onPress={props.onOpenSettings} variant="ghost" style={{ marginTop: 10 }} />
      <Button title="Déconnexion" onPress={doLogout} variant="danger" style={{ marginTop: 14 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  k: { color: colors.muted, fontWeight: '800' },
  v: { color: colors.text, fontSize: 28, fontWeight: '900', marginTop: 4, marginBottom: 4 },
  meta: { color: colors.muted, marginBottom: 6 },
});
