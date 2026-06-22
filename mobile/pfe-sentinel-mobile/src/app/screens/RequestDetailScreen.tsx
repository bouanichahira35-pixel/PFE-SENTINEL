// BLOC 1 - Role du fichier.
// Ce fichier affiche le detail et les actions offline d'une demande mobile.
// Point de vigilance: les actions doivent rester conformes au workflow web demandeur.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../ui/Screen';
import { Card } from '../../ui/Card';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { colors } from '../../ui/theme';
import { RequestsRepo, type RequestRow } from '../../core/db/requestsRepo';
import { RequestsService, type RequestPriority } from '../../core/services/requestsService';

export function RequestDetailScreen(props: { id: string; onBack: () => void }) {
  const [item, setItem] = useState<RequestRow | null>(null);
  const [qty, setQty] = useState('');
  const [direction, setDirection] = useState('');
  const [priority, setPriority] = useState<RequestPriority>('normal');
  const [note, setNote] = useState('');
  const [receiptToken, setReceiptToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    const row = await RequestsRepo.getById(props.id).catch(() => null);
    setItem(row);
    if (row) {
      setQty(String(row.quantityRequested || ''));
      setDirection(row.directionLaboratory || '');
      setPriority(row.priority);
      setNote(row.note || '');
      setReceiptToken(row.receiptToken || '');
    }
  };

  useEffect(() => {
    load();
  }, [props.id]);

  const canMutate = item?.localState === 'synced';
  const canEdit = Boolean(item?.remoteId && item.status === 'pending' && canMutate);
  const canConfirm = Boolean(item?.remoteId && item.status === 'served' && canMutate);

  const submitUpdate = async () => {
    if (!item?.remoteId) return;
    setSaving(true);
    setMsg('');
    try {
      await RequestsService.enqueueUpdate({
        requestId: item.remoteId,
        quantityRequested: Number(qty),
        directionLaboratory: direction,
        priority,
        note,
      });
      setMsg('Modification enregistree offline.');
      await load();
    } catch (e: any) {
      setMsg(e?.message || 'Modification impossible');
    } finally {
      setSaving(false);
    }
  };

  const cancel = async () => {
    if (!item?.remoteId) return;
    setSaving(true);
    setMsg('');
    try {
      await RequestsService.enqueueCancel({ requestId: item.remoteId, note });
      setMsg('Annulation enregistree offline.');
      await load();
    } catch (e: any) {
      setMsg(e?.message || 'Annulation impossible');
    } finally {
      setSaving(false);
    }
  };

  const confirmReceipt = async () => {
    if (!item?.remoteId) return;
    setSaving(true);
    setMsg('');
    try {
      await RequestsService.enqueueConfirmReceipt({ requestId: item.remoteId, receiptToken });
      setMsg('Confirmation enregistree offline.');
      await load();
    } catch (e: any) {
      setMsg(e?.message || 'Confirmation impossible');
    } finally {
      setSaving(false);
    }
  };

  if (!item) {
    return (
      <Screen title="Demande" onBack={props.onBack}>
        <Text style={{ color: colors.muted }}>Demande introuvable</Text>
      </Screen>
    );
  }

  return (
    <Screen title="Detail demande" onBack={props.onBack} scroll>
      <Card>
        <Text style={styles.ref}>{item.remoteId ? `DEM-${item.remoteId.slice(-6).toUpperCase()}` : 'Demande locale'}</Text>
        <Text style={styles.name}>{item.productName || item.productCode}</Text>
        <Text style={styles.meta}>Statut: {statusLabel(item.status)}</Text>
        <Text style={styles.meta}>Local: {localStateLabel(item.localState)}</Text>
        <Text style={styles.meta}>Creee: {new Date(item.createdAt).toLocaleString()}</Text>
      </Card>

      <View style={{ height: 12 }} />
      <Card>
        <Input label="Quantite" value={qty} onChangeText={setQty} keyboardType="numeric" />
        <Input label="Direction / laboratoire" value={direction} onChangeText={setDirection} />
        <Text style={styles.label}>Urgence</Text>
        <View style={styles.priorityRow}>
          {(['normal', 'urgent', 'critical'] as RequestPriority[]).map((p) => (
            <Button
              key={p}
              title={p === 'critical' ? 'Tres urgent' : p === 'urgent' ? 'Urgent' : 'Normal'}
              onPress={() => setPriority(p)}
              variant={priority === p ? 'primary' : 'ghost'}
              style={styles.priorityBtn}
              disabled={!canEdit}
            />
          ))}
        </View>
        <Input label="Commentaire" value={note} onChangeText={setNote} multiline numberOfLines={3} />

        {msg ? <Text style={[styles.msg, { color: msg.includes('offline') ? colors.ok : colors.danger }]}>{msg}</Text> : null}
        {item.localState !== 'synced' ? <Text style={styles.warn}>Action deja en attente: synchronisez l'outbox avant une nouvelle modification.</Text> : null}

        {canEdit ? (
          <>
            <Button title="Enregistrer modification offline" onPress={submitUpdate} loading={saving} />
            <Button title="Annuler la demande offline" onPress={cancel} loading={saving} variant="danger" style={{ marginTop: 10 }} />
          </>
        ) : (
          <Text style={styles.meta}>Modification disponible uniquement pour une demande en attente synchronisee.</Text>
        )}
      </Card>

      {item.status === 'served' ? (
        <>
          <View style={{ height: 12 }} />
          <Card>
            <Text style={styles.label}>Confirmation reception</Text>
            <Input label="Code de retrait" value={receiptToken} onChangeText={setReceiptToken} placeholder="Obligatoire si fourni par le magasinier" />
            <Button title="Confirmer reception offline" onPress={confirmReceipt} loading={saving} disabled={!canConfirm} />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    pending: 'En attente',
    validated: 'Validee',
    preparing: 'Preparation',
    served: 'Servie',
    received: 'Cloturee',
    rejected: 'Rejetee',
    cancelled: 'Annulee',
  };
  return map[status] || status;
}

function localStateLabel(state: string) {
  if (state === 'pending') return 'En attente de synchronisation';
  if (state === 'conflict') return 'Conflit metier';
  if (state === 'error') return 'Erreur';
  return 'Synchronisee';
}

const styles = StyleSheet.create({
  ref: { color: colors.accent, fontWeight: '900', marginBottom: 4 },
  name: { color: colors.text, fontWeight: '900', fontSize: 16 },
  meta: { color: colors.muted, marginTop: 6 },
  label: { color: colors.muted, fontWeight: '800', marginBottom: 6 },
  priorityRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  priorityBtn: { flex: 1, paddingHorizontal: 6 },
  msg: { marginBottom: 10, fontWeight: '800' },
  warn: { color: colors.warn, fontWeight: '800', marginBottom: 10 },
});
