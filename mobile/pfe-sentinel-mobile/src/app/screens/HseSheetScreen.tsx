import React, { useMemo, useState } from 'react';
import { Text, View, StyleSheet, Pressable } from 'react-native';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
import { colors } from '../../ui/theme';
import { Input } from '../../ui/Input';
import type { HseAcknowledgement, StockOutDraft } from '../../core/stock/stockOutDraft';

const CHECKS = [
  'Produit verifie avant sortie',
  'Consignes HSE lues',
  'EPI disponibles',
  'Beneficiaire informe',
];

export function HseSheetScreen(props: {
  draft: StockOutDraft;
  onBack: () => void;
  onConfirmed: (ack: HseAcknowledgement) => void;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [comment, setComment] = useState('');

  const allChecked = useMemo(() => CHECKS.every((item) => checked[item]), [checked]);
  const riskLevel = props.draft.quantity >= 10 || Boolean(props.draft.photoBase64) ? 'sensitive' : 'standard';

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
    <Screen title="Controle HSE" onBack={props.onBack}>
      <View style={styles.card}>
        <Text style={styles.title}>Validation securite avant sortie</Text>
        <Text style={styles.meta}>Produit: {props.draft.productId.slice(-6)} • Quantite: {props.draft.quantity}</Text>
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
        <Button title="Confirmer HSE et passer a la signature" onPress={confirm} disabled={!allChecked} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 14, padding: 12 },
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

