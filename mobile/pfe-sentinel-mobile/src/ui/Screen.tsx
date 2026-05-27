import React from 'react';
import { SafeAreaView, View, Text, StyleSheet, Pressable, ScrollView, Platform, KeyboardAvoidingView } from 'react-native';
import { colors } from './theme';

export function Screen(props: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
  scroll?: boolean;
  contentStyle?: any;
  children: React.ReactNode;
}) {
  const contentStyle = props.scroll ? [styles.scrollBody, props.contentStyle] : [styles.body, props.contentStyle];
  const content = props.scroll ? (
    <ScrollView style={styles.flex} contentContainerStyle={contentStyle} keyboardShouldPersistTaps="handled">
      {props.children}
    </ScrollView>
  ) : (
    <View style={contentStyle}>{props.children}</View>
  );

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {props.onBack ? (
            <Pressable onPress={props.onBack} style={styles.backBtn}>
              <Text style={styles.backText}>←</Text>
            </Pressable>
          ) : null}
          <Text style={styles.title}>{props.title}</Text>
        </View>
        {props.right ? <View style={styles.headerRight}>{props.right}</View> : null}
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  headerRight: { alignItems: 'flex-end' },
  backBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  backText: { color: colors.text, fontWeight: '900' },
  title: { color: colors.text, fontSize: 16, fontWeight: '900' },
  body: { flex: 1, padding: 14 },
  scrollBody: { flexGrow: 1, padding: 14 },
});
