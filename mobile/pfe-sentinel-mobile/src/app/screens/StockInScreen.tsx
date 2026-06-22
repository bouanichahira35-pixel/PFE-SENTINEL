// BLOC 1 - Role du fichier.
// Ce fichier affiche un ecran mobile pour StockInScreen.
// Point de vigilance: garder la compatibilite avec la synchronisation offline et les types TypeScript.

import React, { useEffect, useMemo, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Screen } from '../../ui/Screen';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { colors } from '../../ui/theme';
import { DeviceInfo } from '../../core/device/deviceInfo';
import { OutboxRepo } from '../../core/db/outboxRepo';
import { randomUUID } from 'expo-crypto';
import { SettingsStore } from '../../core/settings/settingsStore';
import { ProductsRepo, type ProductRow } from '../../core/db/productsRepo';
import { formatProductLabel } from '../lib/productDisplay';

export function StockInScreen(props: { productId: string; onBack: () => void }) {
  const [qty, setQty] = useState('1');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [product, setProduct] = useState<ProductRow | null>(null);

  const quantity = useMemo(() => Number(qty), [qty]);

  useEffect(() => {
    ProductsRepo.getById(props.productId).then(setProduct).catch(() => setProduct(null));
  }, [props.productId]);

  const save = async () => {
    setMsg('');
    setSaving(true);
    try {
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Quantité invalide');
      const meta = await DeviceInfo.getEventMeta();
      const site = await SettingsStore.getActiveSite();
      const payload = {
        site,
        productId: props.productId,
        quantity,
        note: note.trim() || undefined,
        meta,
      };
      const id = randomUUID();
      await OutboxRepo.enqueue({ id, type: 'stock_entry_create', payload });
      setMsg('Ajouté à l’outbox');
    } catch (e: any) {
      setMsg(e?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen title="Entrée stock" onBack={props.onBack} scroll>
      <Card>
        <Text style={styles.meta}>Produit: {formatProductLabel(product, props.productId)}</Text>
        <Input label="Quantité" value={qty} onChangeText={setQty} keyboardType="numeric" />
        <Input label="Note (optionnel)" value={note} onChangeText={setNote} placeholder="Observation terrain..." multiline />
        {msg ? <Text style={[styles.msg, { color: msg.includes('outbox') ? colors.ok : colors.danger }]}>{msg}</Text> : null}
        <Button title="Enregistrer (offline)" onPress={save} loading={saving} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { color: colors.muted, marginBottom: 8 },
  msg: { marginBottom: 10, fontWeight: '800' },
});
