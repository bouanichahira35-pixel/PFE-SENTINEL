import React, { useEffect, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { colors } from '../../ui/theme';
import { ProductsRepo, type ProductRow } from '../../core/db/productsRepo';
import { FdsService } from '../../core/services/fdsService';

export function ProductScreen(props: { productId: string; onBack: () => void; onStockIn: (productId: string) => void; onStockOut: (productId: string) => void }) {
  const [item, setItem] = useState<ProductRow | null>(null);
  const [msg, setMsg] = useState('');
  const [loadingFds, setLoadingFds] = useState(false);

  useEffect(() => {
    (async () => {
      const row = await ProductsRepo.getById(props.productId).catch(() => null);
      setItem(row);
    })();
  }, [props.productId]);

  const openFds = async () => {
    if (!item) return;
    setMsg('');
    setLoadingFds(true);
    try {
      await FdsService.openOrDownload(item);
    } catch (e: any) {
      setMsg(e?.message || 'Erreur FDS');
    } finally {
      setLoadingFds(false);
    }
  };

  return (
    <Screen title="Produit" onBack={props.onBack} scroll>
      {!item ? (
        <Text style={{ color: colors.muted }}>Produit introuvable</Text>
      ) : (
        <Card>
          <Text style={styles.name}>{item.name || item.codeProduct}</Text>
          <Text style={styles.meta}>{item.codeProduct} {item.category ? `• ${item.category}` : ''}</Text>
          {msg ? <Text style={styles.err}>{msg}</Text> : null}
          <View style={{ height: 10 }} />
          <Button title="Ouvrir FDS (PDF)" onPress={openFds} loading={loadingFds} variant="ghost" />
          <View style={{ height: 10 }} />
          <Button title="Entrée stock (offline)" onPress={() => props.onStockIn(item.id)} />
          <Button title="Sortie stock (offline)" onPress={() => props.onStockOut(item.id)} style={{ marginTop: 10 }} />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { color: colors.text, fontWeight: '900', fontSize: 16 },
  meta: { color: colors.muted, marginTop: 4 },
  err: { color: colors.danger, marginTop: 10, fontWeight: '800' },
});
