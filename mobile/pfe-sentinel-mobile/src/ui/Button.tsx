// BLOC 1 - Role du fichier.
// Ce fichier fournit un composant UI mobile reutilisable pour Button.
// Point de vigilance: garder la compatibilite avec la synchronisation offline et les types TypeScript.

import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { colors } from './theme';

export function Button(props: {
  title: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'ghost' | 'danger';
  style?: ViewStyle;
}) {
  const variant = props.variant || 'primary';
  const disabled = Boolean(props.disabled) || Boolean(props.loading);
  const spinnerColor = variant === 'ghost' ? colors.accent : colors.text;
  return (
    <Pressable
      onPress={props.onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'ghost' && styles.ghost,
        variant === 'danger' && styles.danger,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        props.style,
      ]}
    >
      {props.loading ? <ActivityIndicator color={spinnerColor} /> : <Text style={[styles.text, variant === 'ghost' && styles.textGhost]}>{props.title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  ghost: { backgroundColor: 'transparent', borderColor: colors.border },
  danger: { backgroundColor: colors.danger, borderColor: colors.danger },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  text: { color: colors.text, fontWeight: '800' },
  textGhost: { color: colors.text },
});
