// BLOC 1 - Role du fichier.
// Ce fichier affiche un ecran mobile pour MissionScreen.
// Point de vigilance: garder la compatibilite avec la synchronisation offline et les types TypeScript.

import React, { useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { colors } from '../../ui/theme';
import { ProductsService } from '../../core/services/productsService';
import { LocationsService } from '../../core/services/locationsService';

export function MissionScreen(props: { onBack: () => void }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const run = async () => {
    setLoading(true);
    setMsg('');
    try {
      const a = await ProductsService.refresh();
      const b = await LocationsService.refresh();
      setMsg(`OK: ${a.count} produits, ${b.count} emplacements`);
    } catch (e: any) {
      setMsg(e?.message || 'Erreur préchargement');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen title="Mission" onBack={props.onBack} scroll>
      <Card>
        <Text style={styles.t}>Préchargement avant départ</Text>
        <Text style={styles.sub}>Télécharge produits + emplacements pour usage offline.</Text>
        {msg ? <Text style={[styles.sub, { marginTop: 8, color: msg.startsWith('OK') ? colors.ok : colors.danger }]}>{msg}</Text> : null}
        <View style={{ height: 12 }} />
        <Button title="Rafraîchir maintenant" onPress={run} loading={loading} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  t: { color: colors.text, fontWeight: '900', fontSize: 16 },
  sub: { color: colors.muted, marginTop: 6 },
});
