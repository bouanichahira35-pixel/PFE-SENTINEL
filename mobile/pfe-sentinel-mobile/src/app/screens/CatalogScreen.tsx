import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View, StyleSheet } from 'react-native';
import { Screen } from '../../ui/Screen';
import { Input } from '../../ui/Input';
import { colors } from '../../ui/theme';
import { ProductsRepo, type ProductRow } from '../../core/db/productsRepo';

export function CatalogScreen(props: { onBack: () => void; onOpenProduct: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<ProductRow[]>([]);

  const load = async () => {
    const rows = await ProductsRepo.list({ q, limit: 120 }).catch(() => []);
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
    <Screen title="Catalogue" onBack={props.onBack}>
      <Input label="Recherche" value={q} onChangeText={setQ} placeholder="nom ou code produit" />
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => props.onOpenProduct(item.id)}>
            <Text style={styles.name}>{item.name || item.codeProduct}</Text>
            <Text style={styles.meta}>{item.codeProduct} {item.category ? `• ${item.category}` : ''}</Text>
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
