// BLOC 1 - Role du fichier.
// Ce fichier fournit un composant UI mobile reutilisable pour Input.
// Point de vigilance: garder la compatibilite avec la synchronisation offline et les types TypeScript.

import React from 'react';
import { View, Text, TextInput, StyleSheet, type TextInputProps } from 'react-native';
import { colors } from './theme';

export function Input(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  autoCorrect?: boolean;
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  multiline?: boolean;
  numberOfLines?: number;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={props.secureTextEntry}
        keyboardType={props.keyboardType}
        style={[styles.input, props.multiline && styles.multiline]}
        autoCapitalize="none"
        autoCorrect={props.autoCorrect}
        autoComplete={props.autoComplete}
        textContentType={props.textContentType}
        returnKeyType={props.returnKeyType}
        onSubmitEditing={props.onSubmitEditing}
        multiline={props.multiline}
        numberOfLines={props.numberOfLines}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { color: colors.muted, marginBottom: 6, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
});
