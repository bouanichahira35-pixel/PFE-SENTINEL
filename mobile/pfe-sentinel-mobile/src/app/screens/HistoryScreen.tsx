// BLOC 1 - Role du fichier.
// Ce fichier affiche un ecran mobile pour HistoryScreen.
// Point de vigilance: garder la compatibilite avec la synchronisation offline et les types TypeScript.

import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View, StyleSheet } from 'react-native';
import { Screen } from '../../ui/Screen';
import { colors } from '../../ui/theme';
import { OutboxRepo, type OutboxRow } from '../../core/db/outboxRepo';

export function HistoryScreen(props: { onBack: () => void; onOpenDetail: (id: string) => void }) {
  const [items, setItems] = useState<OutboxRow[]>([]);

  const load = async () => {
    const rows = await OutboxRepo.listRecent(200).catch(() => []);
    setItems(rows.filter((r) => r.status === 'sent'));
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <Screen title="Historique (envoyés)" onBack={props.onBack}>
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => props.onOpenDetail(item.id)}>
            <Text style={styles.name}>{item.type}</Text>
            <Text style={styles.meta}>{new Date(item.createdAt).toLocaleString()}</Text>
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
});

