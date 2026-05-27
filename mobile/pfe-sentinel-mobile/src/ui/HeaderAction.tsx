import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { colors } from './theme';

export function HeaderAction(props: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={Boolean(props.disabled)}
      style={({ pressed }) => [styles.btn, pressed && !props.disabled && styles.pressed, props.disabled && styles.disabled]}
    >
      <Text style={[styles.text, props.disabled && styles.textDisabled]}>{props.title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.6 },
  text: { color: colors.muted, fontWeight: '900' },
  textDisabled: { color: colors.muted },
});
