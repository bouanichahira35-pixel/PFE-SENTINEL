import React, { useEffect, useMemo, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
import { colors } from '../../ui/theme';
import { OutboxRepo } from '../../core/db/outboxRepo';
import { SyncService } from '../../core/services/syncService';
import { SyncStateStore } from '../../core/settings/syncStateStore';
import { SessionStore } from '../../core/session/sessionStore';

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
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [last, setLast] = useState<{ at: number | null; summary: string | null }>({ at: null, summary: null });

  const lastLabel = useMemo(() => {
    if (!last.at) return '—';
    return new Date(last.at).toLocaleString();
  }, [last.at]);

  const refresh = async () => {
    const p = await OutboxRepo.countPending().catch(() => 0);
    setPending(p);
    const st = await SyncStateStore.get().catch(() => ({ lastSyncAt: null, lastSyncSummary: null }));
    setLast({ at: st.lastSyncAt, summary: st.lastSyncSummary });
  };

  useEffect(() => {
    refresh();
    const unsub = NetInfo.addEventListener((state) => setOnline(Boolean(state.isConnected)));
    const t = setInterval(refresh, 1500);
    return () => {
      unsub();
      clearInterval(t);
    };
  }, []);

  const doSync = async () => {
    setSyncing(true);
    try {
      await SyncService.pushPending();
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
      title="Dashboard"
      right={
        <Text style={{ color: online ? colors.ok : colors.warn, fontWeight: '900' }}>
          {online ? 'ONLINE' : 'OFFLINE'}
        </Text>
      }
    >
      <View style={styles.card}>
        <Text style={styles.k}>Outbox en attente</Text>
        <Text style={styles.v}>{pending}</Text>
        <Text style={styles.meta}>Dernière sync: {lastLabel}</Text>
        {last.summary ? <Text style={styles.meta}>{last.summary}</Text> : null}
        <Button title="Synchroniser maintenant" onPress={doSync} loading={syncing} disabled={!online || pending === 0} />
      </View>

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
  card: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 14, padding: 12 },
  k: { color: colors.muted, fontWeight: '800' },
  v: { color: colors.text, fontSize: 28, fontWeight: '900', marginTop: 4, marginBottom: 4 },
  meta: { color: colors.muted, marginBottom: 6 },
});
