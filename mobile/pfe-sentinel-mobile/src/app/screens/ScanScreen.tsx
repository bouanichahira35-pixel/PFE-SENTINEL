import React, { useMemo, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Screen } from '../../ui/Screen';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { colors } from '../../ui/theme';
import { ProductsRepo } from '../../core/db/productsRepo';

export function ScanScreen(props: { onBack: () => void; onOpenProduct: (id: string) => void }) {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const cleaned = useMemo(() => String(code || '').trim(), [code]);

  const find = async () => {
    setMsg('');
    const row = await ProductsRepo.findByCode(cleaned.toUpperCase()).catch(() => null);
    if (!row) {
      setMsg('Produit introuvable (offline). Précharge la mission.');
      return;
    }
    props.onOpenProduct(row.id);
  };

  return (
    <Screen title="Scan (manuel)" onBack={props.onBack}>
      <View style={styles.card}>
        <Text style={styles.sub}>Mode simple: entrer un code produit (offline).</Text>
        <Input label="Code produit" value={code} onChangeText={setCode} placeholder="ex: PRD-001" />
        {msg ? <Text style={styles.msg}>{msg}</Text> : null}
        <Button title="Rechercher" onPress={find} disabled={!cleaned} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 14, padding: 12 },
  sub: { color: colors.muted, marginBottom: 10 },
  msg: { color: colors.warn, marginBottom: 10, fontWeight: '800' },
});

