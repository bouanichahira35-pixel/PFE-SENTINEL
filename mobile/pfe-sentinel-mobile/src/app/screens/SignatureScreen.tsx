import React, { useEffect, useRef, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import SignatureCanvas, { type SignatureViewRef } from 'react-native-signature-canvas';
import { randomUUID } from 'expo-crypto';

import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { colors } from '../../ui/theme';
import { OutboxRepo } from '../../core/db/outboxRepo';
import { ProductsRepo, type ProductRow } from '../../core/db/productsRepo';
import type { HseAcknowledgement, StockOutDraft } from '../../core/stock/stockOutDraft';
import { formatProductLabel } from '../lib/productDisplay';

function stripDataUrl(dataUrl: string) {
  return String(dataUrl || '').replace(/^data:image\/png;base64,/, '').trim();
}

export function SignatureScreen(props: {
  draft: StockOutDraft;
  hseAck: HseAcknowledgement;
  onBack: () => void;
  onDone: () => void;
}) {
  const ref = useRef<SignatureViewRef>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [product, setProduct] = useState<ProductRow | null>(null);

  useEffect(() => {
    ProductsRepo.getById(props.draft.productId).then(setProduct).catch(() => setProduct(null));
  }, [props.draft.productId]);

  const saveSignature = () => {
    setMessage('');
    ref.current?.readSignature();
  };

  const onSignatureOk = async (signatureDataUrl: string) => {
    setSaving(true);
    setMessage('');
    try {
      const signaturePngBase64 = stripDataUrl(signatureDataUrl);
      if (!signaturePngBase64) throw new Error('Signature vide');

      const receiptId = `MOB-${Date.now()}-${randomUUID().slice(0, 8)}`;
      const stockEventId = randomUUID();
      const signatureEventId = randomUUID();

      await OutboxRepo.enqueue({
        id: stockEventId,
        type: 'stock_exit_create',
        payload: {
          ...props.draft,
          hse_confirmed: true,
          hse_ack: props.hseAck,
          receiptId,
          photos: props.draft.photoBase64 ? [{ label: 'preuve', base64: props.draft.photoBase64 }] : undefined,
        },
      });

      await OutboxRepo.enqueue({
        id: signatureEventId,
        type: 'delivery_signed',
        payload: {
          receiptId,
          productId: props.draft.productId,
          signaturePngBase64,
          site: props.draft.site,
          meta: props.draft.meta,
        },
      });

      setMessage('Sortie + signature ajoutées à l’outbox');
      props.onDone();
    } catch (e: any) {
      setMessage(e?.message || 'Erreur signature');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen title="Signature remise" onBack={props.onBack}>
      <Card style={{ marginBottom: 12 }}>
        <Text style={styles.title}>Signature du bénéficiaire</Text>
        <Text style={styles.meta}>Produit: {formatProductLabel(product, props.draft.productId)} • Quantité: {props.draft.quantity}</Text>
        {message ? <Text style={[styles.msg, { color: message.includes('outbox') ? colors.ok : colors.warn }]}>{message}</Text> : null}
      </Card>

      <View style={styles.signatureWrap}>
        <SignatureCanvas
          ref={ref}
          onOK={onSignatureOk}
          onEmpty={() => setMessage('Signature requise')}
          descriptionText=""
          clearText="Effacer"
          confirmText="Valider"
          imageType="image/png"
          webStyle={`
            .m-signature-pad { box-shadow: none; border: 0; }
            .m-signature-pad--body { border: 0; }
            .m-signature-pad--footer { display: none; margin: 0; }
            body,html { background: #ffffff; width: 100%; height: 100%; }
          `}
        />
      </View>

      <View style={styles.actions}>
        <Button title="Effacer" onPress={() => ref.current?.clearSignature()} variant="ghost" style={{ flex: 1 }} />
        <Button title="Ajouter à l’outbox" onPress={saveSignature} loading={saving} style={{ flex: 1, marginLeft: 10 }} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 16, fontWeight: '900' },
  meta: { color: colors.muted, marginTop: 6 },
  msg: { marginTop: 8, fontWeight: '800' },
  signatureWrap: { flex: 1, backgroundColor: '#ffffff', borderRadius: 14, overflow: 'hidden', minHeight: 320 },
  actions: { flexDirection: 'row', marginTop: 12 },
});
