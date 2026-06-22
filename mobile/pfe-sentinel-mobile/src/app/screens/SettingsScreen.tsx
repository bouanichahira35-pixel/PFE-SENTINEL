// BLOC 1 - Role du fichier.
// Ce fichier affiche un ecran mobile pour SettingsScreen.
// Point de vigilance: garder la compatibilite avec la synchronisation offline et les types TypeScript.

import React, { useEffect, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Screen } from '../../ui/Screen';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { colors } from '../../ui/theme';
import { SettingsStore } from '../../core/settings/settingsStore';

export function SettingsScreen(props: { onBack: () => void }) {
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [site, setSite] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [isValidUrl, setIsValidUrl] = useState(true);

  useEffect(() => {
    (async () => {
      setApiBaseUrl(await SettingsStore.getApiBaseUrl());
      setSite(await SettingsStore.getActiveSite());
    })();
  }, []);

  useEffect(() => {
    const u = String(apiBaseUrl || '').trim();
    setIsValidUrl(!u || u.toLowerCase().startsWith('http://') || u.toLowerCase().startsWith('https://'));
  }, [apiBaseUrl]);

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      if (!isValidUrl) throw new Error('URL invalide. Format attendu: http://... ou https://...');
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
    <Screen title="Paramètres" onBack={props.onBack} scroll>
      <Card>
        <Text style={styles.subtitle}>URL backend (serveur du PC)</Text>
        <Text style={styles.help}>Android Emulator: http://10.0.2.2:5000</Text>
        <Text style={styles.help}>Téléphone (même Wi‑Fi): http://IP_DU_PC:5000</Text>
        <View style={{ height: 12 }} />

        <Input label="URL backend" value={apiBaseUrl} onChangeText={setApiBaseUrl} placeholder="http://10.0.2.2:5000" autoCorrect={false} />
        {!isValidUrl ? <Text style={styles.err}>URL invalide (http://... ou https://...)</Text> : null}
        <Input label="Site actif" value={site} onChangeText={setSite} placeholder="SITE-DEFAULT" autoCorrect={false} />
        {msg ? <Text style={[styles.msg, { color: msg === 'Enregistré' ? colors.ok : colors.warn }]}>{msg}</Text> : null}
        <Button title="Enregistrer" onPress={save} loading={saving} disabled={!isValidUrl} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: { color: colors.text, fontWeight: '900', fontSize: 16 },
  help: { color: colors.muted, marginTop: 6 },
  err: { color: colors.warn, marginBottom: 10, fontWeight: '800' },
  msg: { marginBottom: 10, fontWeight: '800' },
});
