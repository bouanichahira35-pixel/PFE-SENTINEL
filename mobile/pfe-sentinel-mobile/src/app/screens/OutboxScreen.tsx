// BLOC 1 - Role du fichier.
// Ce fichier affiche un ecran mobile pour OutboxScreen.
// Point de vigilance: garder la compatibilite avec la synchronisation offline et les types TypeScript.

import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View, StyleSheet } from 'react-native';
import { Screen } from '../../ui/Screen';
import { colors } from '../../ui/theme';
import { OutboxRepo, type OutboxRow } from '../../core/db/outboxRepo';
import { formatSyncSummary, SyncService } from '../../core/services/syncService';
import { HeaderAction } from '../../ui/HeaderAction';

export function OutboxScreen(props: { onBack: () => void; onOpenDetail: (id: string) => void }) {
  const [items, setItems] = useState<OutboxRow[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    const rows = await OutboxRepo.listRecent(120).catch(() => []);
    setItems(rows);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const doSync = async () => {
    setSyncing(true);
    setMsg('');
    try {
      const result = await SyncService.pushPending();
      setMsg(formatSyncSummary(result));
    } catch (e: any) {
      setMsg(e?.message || 'Erreur synchronisation');
    } finally {
      setSyncing(false);
      load();
    }
  };

  return (
    <Screen
      title="Outbox"
      onBack={props.onBack}
      right={<HeaderAction title={syncing ? 'Sync...' : 'Sync'} onPress={doSync} disabled={syncing} />}
    >
      {msg ? <Text style={[styles.msg, { color: msg.includes('Erreur') || msg.includes('attente') || msg.includes('faible') ? colors.warn : colors.ok }]}>{msg}</Text> : null}
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => props.onOpenDetail(item.id)}>
            <Text style={styles.name}>{item.type}</Text>
            <Text style={styles.meta}>
              {item.status.toUpperCase()} • {new Date(item.createdAt).toLocaleString()}
            </Text>
            {item.lastError ? <Text style={styles.err}>{item.lastError}</Text> : null}
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  msg: { marginBottom: 10, fontWeight: '800' },
  row: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 12, padding: 12 },
  name: { color: colors.text, fontWeight: '900' },
  meta: { color: colors.muted, marginTop: 4 },
  err: { color: colors.warn, marginTop: 6, fontWeight: '700' },
});
