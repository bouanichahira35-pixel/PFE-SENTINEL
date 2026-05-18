import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View, StyleSheet } from 'react-native';
import { Screen } from '../../ui/Screen';
import { colors } from '../../ui/theme';
import { OutboxRepo, type OutboxRow } from '../../core/db/outboxRepo';
import { Button } from '../../ui/Button';
import { SyncService } from '../../core/services/syncService';

export function OutboxScreen(props: { onBack: () => void; onOpenDetail: (id: string) => void }) {
  const [items, setItems] = useState<OutboxRow[]>([]);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    const rows = await OutboxRepo.listRecent(120).catch(() => []);
    setItems(rows);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, []);

  const doSync = async () => {
    setSyncing(true);
    try {
      await SyncService.pushPending();
    } finally {
      setSyncing(false);
      load();
    }
  };

  return (
    <Screen
      title="Outbox"
      onBack={props.onBack}
      right={<Button title="Sync" onPress={doSync} loading={syncing} variant="ghost" />}
    >
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
  row: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 12, padding: 12 },
  name: { color: colors.text, fontWeight: '900' },
  meta: { color: colors.muted, marginTop: 4 },
  err: { color: colors.warn, marginTop: 6, fontWeight: '700' },
});

