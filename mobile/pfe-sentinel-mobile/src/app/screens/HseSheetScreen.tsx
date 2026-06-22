// BLOC 1 - Role du fichier.
// Ce fichier affiche un ecran mobile pour HseSheetScreen.
// Point de vigilance: garder la compatibilite avec la synchronisation offline et les types TypeScript.

import React, { useEffect, useMemo, useState } from 'react';
import { Text, View, StyleSheet, Pressable } from 'react-native';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { colors } from '../../ui/theme';
import { Input } from '../../ui/Input';
import { ProductsRepo, type ProductRow } from '../../core/db/productsRepo';
import type { HseAcknowledgement, StockOutDraft } from '../../core/stock/stockOutDraft';
import { formatProductLabel } from '../lib/productDisplay';

const CHECKS = [
  'Produit vérifié avant sortie',
  'Consignes HSE lues',
  'EPI disponibles',
  'Bénéficiaire informé',
];

export function HseSheetScreen(props: {
  draft: StockOutDraft;
  onBack: () => void;
  onConfirmed: (ack: HseAcknowledgement) => void;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [comment, setComment] = useState('');
  const [product, setProduct] = useState<ProductRow | null>(null);

  const allChecked = useMemo(() => CHECKS.every((item) => checked[item]), [checked]);
  const riskLevel = props.draft.quantity >= 10 || Boolean(props.draft.photoBase64) ? 'sensitive' : 'standard';

  useEffect(() => {
    ProductsRepo.getById(props.draft.productId).then(setProduct).catch(() => setProduct(null));
  }, [props.draft.productId]);

  const toggle = (item: string) => {
    setChecked((prev) => ({ ...prev, [item]: !prev[item] }));
  };

  const confirm = () => {
    props.onConfirmed({
      acknowledgedAtLocal: new Date().toISOString(),
      riskLevel,
      checklist: CHECKS.slice(),
      comment: comment.trim() || undefined,
    });
  };

  return (
    <Screen title="Contrôle HSE" onBack={props.onBack} scroll>
      <Card>
        <Text style={styles.title}>Validation sécurité avant sortie</Text>
        <Text style={styles.meta}>Produit: {formatProductLabel(product, props.draft.productId)} • Quantité: {props.draft.quantity}</Text>
        <Text style={[styles.badge, riskLevel === 'sensitive' ? styles.sensitive : styles.standard]}>
          Risque {riskLevel === 'sensitive' ? 'sensible' : 'standard'}
        </Text>

        <View style={{ height: 12 }} />
        {CHECKS.map((item) => (
          <Pressable key={item} onPress={() => toggle(item)} style={styles.checkRow}>
            <View style={[styles.box, checked[item] && styles.boxOn]}>
              <Text style={styles.boxText}>{checked[item] ? '✓' : ''}</Text>
            </View>
            <Text style={styles.checkText}>{item}</Text>
          </Pressable>
        ))}

        <Input label="Commentaire HSE (optionnel)" value={comment} onChangeText={setComment} placeholder="Observation terrain..." />
        <Button title="Confirmer HSE et passer à la signature" onPress={confirm} disabled={!allChecked} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 16, fontWeight: '900' },
  meta: { color: colors.muted, marginTop: 6, marginBottom: 10 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, fontWeight: '900', overflow: 'hidden' },
  standard: { color: colors.ok, backgroundColor: '#052e1a' },
  sensitive: { color: colors.warn, backgroundColor: '#3a2503' },
  checkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  box: { width: 26, height: 26, borderRadius: 6, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  boxOn: { backgroundColor: colors.ok, borderColor: colors.ok },
  boxText: { color: colors.text, fontWeight: '900' },
  checkText: { color: colors.text, flex: 1, fontWeight: '700' },
});
