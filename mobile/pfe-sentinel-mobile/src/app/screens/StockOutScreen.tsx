import React, { useMemo, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Screen } from '../../ui/Screen';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { colors } from '../../ui/theme';
import { DeviceInfo } from '../../core/device/deviceInfo';
import { SettingsStore } from '../../core/settings/settingsStore';
import { PhotoService } from '../../core/services/photoService';
import type { StockOutDraft } from '../../core/stock/stockOutDraft';

export function StockOutScreen(props: {
  productId: string;
  onBack: () => void;
  onReady: (draft: StockOutDraft) => void;
}) {
  const [qty, setQty] = useState('1');
  const [beneficiary, setBeneficiary] = useState('');
  const [direction, setDirection] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);

  const quantity = useMemo(() => Number(qty), [qty]);

  const takePhoto = async () => {
    setMsg('');
    try {
      const p = await PhotoService.takePhoto();
      if (!p?.base64) {
        setMsg('Photo annulee');
        return;
      }
      setPhotoBase64(p.base64);
      setMsg('Photo ajoutee');
    } catch (e: any) {
      setMsg(e?.message || 'Erreur photo');
    }
  };

  const continueToHse = async () => {
    setMsg('');
    setSaving(true);
    try {
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Quantite invalide');
      const meta = await DeviceInfo.getEventMeta();
      const site = await SettingsStore.getActiveSite();

      props.onReady({
        site,
        productId: props.productId,
        quantity,
        beneficiary: beneficiary.trim() || undefined,
        directionLaboratory: direction.trim() || undefined,
        note: note.trim() || undefined,
        photoBase64: photoBase64 || undefined,
        meta,
      });
    } catch (e: any) {
      setMsg(e?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen title="Sortie stock" onBack={props.onBack}>
      <View style={styles.card}>
        <Text style={styles.meta}>Produit: {props.productId.slice(-6)}</Text>
        <Input label="Quantite" value={qty} onChangeText={setQty} keyboardType="numeric" />
        <Input label="Beneficiaire" value={beneficiary} onChangeText={setBeneficiary} placeholder="Nom du beneficiaire" />
        <Input label="Direction / laboratoire" value={direction} onChangeText={setDirection} placeholder="Ex: Laboratoire HSE" />
        <Input label="Note" value={note} onChangeText={setNote} placeholder="Motif ou observation terrain" />
        {msg ? <Text style={[styles.msg, { color: msg.includes('Photo ajoutee') ? colors.ok : colors.warn }]}>{msg}</Text> : null}
        <Button title={photoBase64 ? 'Photo preuve ajoutee' : 'Ajouter une photo preuve'} onPress={takePhoto} variant="ghost" />
        <View style={{ height: 10 }} />
        <Button title="Continuer vers controle HSE" onPress={continueToHse} loading={saving} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 14, padding: 12 },
  meta: { color: colors.muted, marginBottom: 8 },
  msg: { marginBottom: 10, fontWeight: '800' },
});

