import React, { useEffect, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Screen } from '../../ui/Screen';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { colors } from '../../ui/theme';
import { SettingsStore } from '../../core/settings/settingsStore';

export function SettingsScreen(props: { onBack: () => void }) {
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [site, setSite] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      setApiBaseUrl(await SettingsStore.getApiBaseUrl());
      setSite(await SettingsStore.getActiveSite());
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      await SettingsStore.setApiBaseUrl(apiBaseUrl);
      await SettingsStore.setActiveSite(site);
      setMsg('Enregistré');
    } catch (e: any) {
      setMsg(e?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen title="Paramètres" onBack={props.onBack}>
      <Text style={styles.subtitle}>URL backend (ex: http://10.0.2.2:5000)</Text>
      <Input label="URL backend" value={apiBaseUrl} onChangeText={setApiBaseUrl} placeholder="http://10.0.2.2:5000" />
      <Input label="Site actif" value={site} onChangeText={setSite} placeholder="SITE-DEFAULT" />
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}
      <Button title="Enregistrer" onPress={save} loading={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: { color: colors.muted, marginBottom: 10 },
  msg: { color: colors.ok, marginBottom: 10, fontWeight: '800' },
});

