// BLOC 1 - Role du fichier.
// Ce fichier affiche un ecran mobile pour OutboxDetailScreen.
// Point de vigilance: garder la compatibilite avec la synchronisation offline et les types TypeScript.

import React, { useEffect, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Screen } from '../../ui/Screen';
import { colors } from '../../ui/theme';
import { OutboxRepo, type OutboxRow } from '../../core/db/outboxRepo';

export function OutboxDetailScreen(props: { id: string; onBack: () => void }) {
  const [row, setRow] = useState<OutboxRow | null>(null);

  useEffect(() => {
    (async () => {
      const r = await OutboxRepo.getById(props.id).catch(() => null);
      setRow(r);
    })();
  }, [props.id]);

  return (
    <Screen title="Détail Outbox" onBack={props.onBack}>
      {!row ? (
        <Text style={{ color: colors.muted }}>Introuvable</Text>
      ) : (
        <View style={styles.card}>
          <Text style={styles.k}>ID</Text>
          <Text style={styles.v}>{row.id}</Text>
          <Text style={styles.k}>Type</Text>
          <Text style={styles.v}>{row.type}</Text>
          <Text style={styles.k}>Statut</Text>
          <Text style={styles.v}>{row.status}</Text>
          {row.lastError ? (
            <>
              <Text style={styles.k}>Erreur</Text>
              <Text style={[styles.v, { color: colors.warn }]}>{row.lastError}</Text>
            </>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 14, padding: 12 },
  k: { color: colors.muted, marginTop: 8, fontWeight: '800' },
  v: { color: colors.text, marginTop: 4 },
});

