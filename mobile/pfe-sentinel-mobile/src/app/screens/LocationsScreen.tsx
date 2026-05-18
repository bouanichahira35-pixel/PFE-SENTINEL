import React, { useEffect, useState } from 'react';
import { FlatList, Text, View, StyleSheet } from 'react-native';
import { Screen } from '../../ui/Screen';
import { Input } from '../../ui/Input';
import { colors } from '../../ui/theme';
import { LocationsRepo, type LocationRow } from '../../core/db/locationsRepo';

export function LocationsScreen(props: { onBack: () => void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<LocationRow[]>([]);

  const load = async () => {
    const rows = await LocationsRepo.list({ q, limit: 200 }).catch(() => []);
    setItems(rows);
  };

  useEffect(() => {
    const t = setTimeout(load, 150);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    load();
  }, []);

  return (
    <Screen title="Emplacements" onBack={props.onBack}>
      <Input label="Recherche" value={q} onChangeText={setQ} placeholder="nom emplacement" />
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>{item.id.slice(-6)}</Text>
          </View>
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

