// BLOC 1 - Role du fichier.
// Ce fichier affiche un ecran mobile pour SplashScreen.
// Point de vigilance: garder la compatibilite avec la synchronisation offline et les types TypeScript.

import React, { useEffect } from 'react';
import { ActivityIndicator, Text, View, StyleSheet } from 'react-native';
import { colors } from '../../ui/theme';
import { initDb } from '../../core/db/db';
import { SessionStore } from '../../core/session/sessionStore';

export function SplashScreen(props: { onDone: (hasSession: boolean) => void }) {
  useEffect(() => {
    (async () => {
      try {
        await initDb();
      } catch {
        // keep boot resilient
      }
      const session = await SessionStore.get().catch(() => null);
      props.onDone(Boolean(session?.token));
    })();
  }, [props]);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>PFE-SENTINEL</Text>
      <Text style={styles.sub}>Initialisation...</Text>
      <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 22, fontWeight: '900' },
  sub: { color: colors.muted, marginTop: 6 },
});

