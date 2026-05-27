import React, { useEffect, useMemo, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Screen } from '../../ui/Screen';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { colors } from '../../ui/theme';
import { DeviceInfo } from '../../core/device/deviceInfo';
import { SettingsStore } from '../../core/settings/settingsStore';
import { PhotoService } from '../../core/services/photoService';
import type { StockOutDraft } from '../../core/stock/stockOutDraft';
import { ProductsRepo, type ProductRow } from '../../core/db/productsRepo';
import { formatProductLabel } from '../lib/productDisplay';

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
  const [product, setProduct] = useState<ProductRow | null>(null);

  const quantity = useMemo(() => Number(qty), [qty]);

  useEffect(() => {
    ProductsRepo.getById(props.productId).then(setProduct).catch(() => setProduct(null));
  }, [props.productId]);

  const takePhoto = async () => {
    setMsg('');
    try {
      const p = await PhotoService.takePhoto();
      if (!p?.base64) {
        setMsg('Photo annulée');
        return;
      }
      setPhotoBase64(p.base64);
      setMsg('Photo ajoutée');
    } catch (e: any) {
      setMsg(e?.message || 'Erreur photo');
    }
  };

  const continueToHse = async () => {
    setMsg('');
    setSaving(true);
    try {
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Quantité invalide');
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
    <Screen title="Sortie stock" onBack={props.onBack} scroll>
      <Card>
        <Text style={styles.meta}>Produit: {formatProductLabel(product, props.productId)}</Text>
        <Input label="Quantité" value={qty} onChangeText={setQty} keyboardType="numeric" />
        <Input label="Bénéficiaire" value={beneficiary} onChangeText={setBeneficiary} placeholder="Nom du bénéficiaire" />
        <Input label="Direction / laboratoire" value={direction} onChangeText={setDirection} placeholder="Ex: Laboratoire HSE" />
        <Input label="Note (optionnel)" value={note} onChangeText={setNote} placeholder="Motif ou observation terrain" multiline />
        {msg ? <Text style={[styles.msg, { color: msg.includes('Photo ajoutée') ? colors.ok : colors.warn }]}>{msg}</Text> : null}
        <Button title={photoBase64 ? 'Photo preuve ajoutée' : 'Ajouter une photo preuve'} onPress={takePhoto} variant="ghost" />
        <View style={{ height: 10 }} />
        <Button title="Continuer vers contrôle HSE" onPress={continueToHse} loading={saving} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { color: colors.muted, marginBottom: 8 },
  msg: { marginBottom: 10, fontWeight: '800' },
});
