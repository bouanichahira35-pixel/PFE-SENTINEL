// BLOC 1 - Role du fichier.
// Ce fichier affiche un ecran mobile pour InventoryScreen.
// Point de vigilance: garder la compatibilite avec la synchronisation offline et les types TypeScript.

import React, { useMemo, useState } from 'react';
import { FlatList, Text, View, StyleSheet } from 'react-native';
import { Screen } from '../../ui/Screen';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { colors } from '../../ui/theme';
import { ProductsRepo } from '../../core/db/productsRepo';
import { DeviceInfo } from '../../core/device/deviceInfo';
import { OutboxRepo } from '../../core/db/outboxRepo';
import { randomUUID } from 'expo-crypto';
import { SettingsStore } from '../../core/settings/settingsStore';

type Line = { productId: string; code: string; name: string; countedQty: number };

export function InventoryScreen(props: { onBack: () => void }) {
  const [code, setCode] = useState('');
  const [qty, setQty] = useState('0');
  const [lines, setLines] = useState<Line[]>([]);
  const [msg, setMsg] = useState('');
  const counted = useMemo(() => Number(qty), [qty]);

  const addLine = async () => {
    setMsg('');
    const c = String(code || '').trim().toUpperCase();
    if (!c) return;
    if (!Number.isFinite(counted) || counted < 0) {
      setMsg('Quantité invalide');
      return;
    }
    const prod = await ProductsRepo.findByCode(c).catch(() => null);
    if (!prod) {
      setMsg('Produit introuvable (offline). Précharge la mission.');
      return;
    }
    setLines((prev) => {
      const others = prev.filter((l) => l.productId !== prod.id);
      return [{ productId: prod.id, code: prod.codeProduct, name: prod.name || prod.codeProduct, countedQty: Math.floor(counted) }, ...others];
    });
    setCode('');
    setQty('0');
  };

  const saveOutbox = async () => {
    setMsg('');
    try {
      if (!lines.length) throw new Error('Aucune ligne');
      const meta = await DeviceInfo.getEventMeta();
      const site = await SettingsStore.getActiveSite();
      const payload = {
        site,
        title: `Inventaire mobile ${new Date().toLocaleDateString()}`,
        lines: lines.map((l) => ({ productId: l.productId, countedQty: l.countedQty })),
        meta,
      };
      const id = randomUUID();
      await OutboxRepo.enqueue({ id, type: 'inventory_count', payload });
      setLines([]);
      setMsg('Inventaire ajouté à l’outbox');
    } catch (e: any) {
      setMsg(e?.message || 'Erreur');
    }
  };

  return (
    <Screen title="Inventaire (offline)" onBack={props.onBack}>
      <View style={styles.card}>
        <Input label="Code produit" value={code} onChangeText={setCode} placeholder="ex: PRD-001" />
        <Input label="Quantité comptée" value={qty} onChangeText={setQty} keyboardType="numeric" />
        {msg ? <Text style={[styles.msg, { color: msg.includes('outbox') ? colors.ok : colors.warn }]}>{msg}</Text> : null}
        <Button title="Ajouter ligne" onPress={addLine} variant="ghost" />
        <View style={{ height: 10 }} />
        <Button title="Enregistrer inventaire (Outbox)" onPress={saveOutbox} disabled={!lines.length} />
      </View>

      <View style={{ height: 12 }} />
      <Text style={styles.h}>Lignes ({lines.length})</Text>
      <FlatList
        data={lines}
        keyExtractor={(it) => it.productId}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>{item.code} • compté: {item.countedQty}</Text>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 14, padding: 12 },
  msg: { marginBottom: 10, fontWeight: '800' },
  h: { color: colors.muted, fontWeight: '900', marginBottom: 8 },
  row: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 12, padding: 12 },
  name: { color: colors.text, fontWeight: '900' },
  meta: { color: colors.muted, marginTop: 4 },
});

