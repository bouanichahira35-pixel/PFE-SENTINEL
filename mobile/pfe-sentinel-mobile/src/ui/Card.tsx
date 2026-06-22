// BLOC 1 - Role du fichier.
// Ce fichier fournit un composant UI mobile reutilisable pour Card.
// Point de vigilance: garder la compatibilite avec la synchronisation offline et les types TypeScript.

import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { colors } from './theme';

export function Card(props: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, props.style]}>{props.children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
  },
});

