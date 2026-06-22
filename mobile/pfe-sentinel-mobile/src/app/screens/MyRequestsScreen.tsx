// BLOC 1 - Role du fichier.
// Ce fichier affiche la liste mobile des demandes du demandeur.
// Point de vigilance: afficher clairement les demandes offline en attente pour eviter les doublons.

import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../ui/Screen';
import { Input } from '../../ui/Input';
import { HeaderAction } from '../../ui/HeaderAction';
import { colors } from '../../ui/theme';
import { RequestsRepo, type RequestRow } from '../../core/db/requestsRepo';
import { RequestsService } from '../../core/services/requestsService';

export function MyRequestsScreen(props: { onBack: () => void; onOpenDetail: (id: string) => void }) {
  const [items, setItems] = useState<RequestRow[]>([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    const rows = await RequestsRepo.list({ q, status: filter, limit: 160 }).catch(() => []);
    setItems(rows);
  };

  useEffect(() => {
    const t = setTimeout(load, 150);
    return () => clearTimeout(t);
  }, [q, filter]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const stats = useMemo(() => {
    return {
      total: items.length,
      pendingLocal: items.filter((x) => x.localState === 'pending').length,
      served: items.filter((x) => x.status === 'served').length,
    };
  }, [items]);

  const refreshRemote = async () => {
    setRefreshing(true);
    setMsg('');
    try {
      const result = await RequestsService.refresh();
      setMsg(`${result.count} demande(s) actualisee(s)`);
      await load();
    } catch (e: any) {
      setMsg(e?.message || 'Actualisation impossible');
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen
      title="Mes demandes"
      onBack={props.onBack}
      right={<HeaderAction title={refreshing ? '...' : 'Maj'} onPress={refreshRemote} disabled={refreshing} />}
    >
      <Input label="Recherche" value={q} onChangeText={setQ} placeholder="produit, code ou reference" />
      <View style={styles.filters}>
        {[
          ['all', 'Toutes'],
          ['pending', 'Attente'],
          ['validated', 'Validees'],
          ['preparing', 'Prep.'],
          ['served', 'A confirmer'],
          ['received', 'Cloturees'],
        ].map(([value, label]) => (
          <Pressable key={value} onPress={() => setFilter(value)} style={[styles.filter, filter === value && styles.filterActive]}>
            <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.summary}>
        {stats.total} visible(s) - {stats.pendingLocal} offline - {stats.served} a confirmer
      </Text>
      {msg ? <Text style={[styles.msg, { color: msg.includes('impossible') ? colors.warn : colors.ok }]}>{msg}</Text> : null}

      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={<Text style={styles.empty}>Aucune demande locale. Actualisez en ligne ou creez une demande depuis le catalogue.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => props.onOpenDetail(item.id)}>
            <View style={styles.rowTop}>
              <Text style={styles.name}>{item.productName || item.productCode}</Text>
              <Text style={[styles.badge, badgeStyle(item)]}>{statusLabel(item.status)}</Text>
            </View>
            <Text style={styles.meta}>
              {item.remoteId ? `DEM-${item.remoteId.slice(-6).toUpperCase()}` : 'LOCAL'} - Qt: {item.quantityRequested} - {priorityLabel(item.priority)}
            </Text>
            <Text style={styles.meta}>{item.directionLaboratory || 'Direction non renseignee'}</Text>
            {item.localState !== 'synced' ? <Text style={styles.local}>{localStateLabel(item.localState)}</Text> : null}
          </Pressable>
        )}
      />
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

function priorityLabel(priority: string) {
  if (priority === 'critical') return 'Tres urgent';
  if (priority === 'urgent') return 'Urgent';
  return 'Normal';
}

function localStateLabel(state: string) {
  if (state === 'pending') return 'Operation offline en attente de sync';
  if (state === 'conflict') return 'Conflit metier a corriger';
  if (state === 'error') return 'Erreur de synchronisation';
  return '';
}

function badgeStyle(item: RequestRow) {
  if (item.localState === 'conflict' || item.status === 'rejected') return styles.badgeDanger;
  if (item.localState === 'pending' || item.status === 'pending') return styles.badgeWarn;
  if (item.status === 'received' || item.status === 'served') return styles.badgeOk;
  return styles.badgeInfo;
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  filter: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 7, paddingHorizontal: 10 },
  filterActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterText: { color: colors.text, fontWeight: '800', fontSize: 12 },
  filterTextActive: { color: colors.text },
  summary: { color: colors.muted, marginBottom: 8, fontWeight: '700' },
  msg: { marginBottom: 8, fontWeight: '800' },
  row: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 12, padding: 12 },
  rowTop: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', justifyContent: 'space-between' },
  name: { color: colors.text, fontWeight: '900', flex: 1 },
  meta: { color: colors.muted, marginTop: 4 },
  local: { color: colors.warn, marginTop: 6, fontWeight: '800' },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 30, lineHeight: 20 },
  badge: { overflow: 'hidden', borderRadius: 10, paddingVertical: 4, paddingHorizontal: 8, fontSize: 11, fontWeight: '900' },
  badgeWarn: { backgroundColor: '#3b2d12', color: colors.warn },
  badgeInfo: { backgroundColor: '#13233f', color: '#93c5fd' },
  badgeOk: { backgroundColor: '#11351f', color: colors.ok },
  badgeDanger: { backgroundColor: '#3f1515', color: colors.danger },
});
