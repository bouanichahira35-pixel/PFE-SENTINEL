// BLOC 1 - Role du fichier.
// Ce fichier affiche le formulaire mobile de creation de demande produit.
// Point de vigilance: la creation est offline-first et part dans l'outbox.

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../ui/Screen';
import { Card } from '../../ui/Card';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { colors } from '../../ui/theme';
import { ProductsRepo, type ProductRow } from '../../core/db/productsRepo';
import { RequestsService, type RequestPriority } from '../../core/services/requestsService';

export function NewRequestScreen(props: { productId: string; onBack: () => void; onDone: () => void }) {
  const [product, setProduct] = useState<ProductRow | null>(null);
  const [qty, setQty] = useState('1');
  const [direction, setDirection] = useState('');
  const [priority, setPriority] = useState<RequestPriority>('normal');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const quantity = useMemo(() => Number(qty), [qty]);

  useEffect(() => {
    ProductsRepo.getById(props.productId).then(setProduct).catch(() => setProduct(null));
  }, [props.productId]);

  const save = async () => {
    setMsg('');
    setSaving(true);
    try {
      await RequestsService.createOffline({
        productId: props.productId,
        quantityRequested: quantity,
        directionLaboratory: direction,
        priority,
        note,
      });
      setMsg('Demande enregistree hors ligne. Elle sera envoyee a la prochaine synchronisation.');
      setTimeout(props.onDone, 450);
    } catch (e: any) {
      setMsg(e?.message || 'Creation impossible');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen title="Nouvelle demande" onBack={props.onBack} scroll>
      <Card>
        <Text style={styles.label}>Produit</Text>
        <Text style={styles.product}>{product?.name || product?.codeProduct || props.productId}</Text>
        <Text style={styles.meta}>{product?.codeProduct || '-'} {product?.category ? `- ${product.category}` : ''}</Text>
      </Card>

      <View style={{ height: 12 }} />
      <Card>
        <Input label="Quantite demandee" value={qty} onChangeText={setQty} keyboardType="numeric" />
        <Input label="Direction / laboratoire" value={direction} onChangeText={setDirection} placeholder="Ex: Direction forage" />
        <Text style={styles.label}>Urgence</Text>
        <View style={styles.priorityRow}>
          {(['normal', 'urgent', 'critical'] as RequestPriority[]).map((p) => (
            <Button
              key={p}
              title={p === 'critical' ? 'Tres urgent' : p === 'urgent' ? 'Urgent' : 'Normal'}
              onPress={() => setPriority(p)}
              variant={priority === p ? 'primary' : 'ghost'}
              style={styles.priorityBtn}
            />
          ))}
        </View>
        <Input label="Motif / commentaire" value={note} onChangeText={setNote} placeholder="Motif de la demande..." multiline numberOfLines={3} />
        {msg ? <Text style={[styles.msg, { color: msg.includes('hors ligne') ? colors.ok : colors.danger }]}>{msg}</Text> : null}
        <Button title="Enregistrer offline" onPress={save} loading={saving} disabled={!product} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.muted, fontWeight: '800', marginBottom: 6 },
  product: { color: colors.text, fontWeight: '900', fontSize: 16 },
  meta: { color: colors.muted, marginTop: 4 },
  priorityRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  priorityBtn: { flex: 1, paddingHorizontal: 6 },
  msg: { marginBottom: 10, fontWeight: '800' },
});
