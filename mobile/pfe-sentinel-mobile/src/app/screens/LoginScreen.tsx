import React, { useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { colors } from '../../ui/theme';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { AuthService } from '../../core/services/authService';
import { SessionStore, type Session } from '../../core/session/sessionStore';

export function LoginScreen(props: {
  onLogin: (session: Session) => void;
  onOpenSettings: () => void;
}) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      const session = await AuthService.login({ identifier, password });
      await SessionStore.set(session);
      props.onLogin(session);
    } catch (e: any) {
      setError(e?.message || 'Erreur login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.h1}>Connexion</Text>
      <Text style={styles.hint}>Même compte que l’application web.</Text>

      <Input label="Identifiant (email/username/tel)" value={identifier} onChangeText={setIdentifier} placeholder="ex: user@etap.tn" />
      <Input label="Mot de passe" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />

      {error ? <Text style={styles.err}>{error}</Text> : null}

      <Button title="Se connecter" onPress={onSubmit} loading={loading} />
      <Button title="Paramètres (URL backend)" onPress={props.onOpenSettings} variant="ghost" style={{ marginTop: 10 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  h1: { color: colors.text, fontSize: 20, fontWeight: '900', marginBottom: 4 },
  hint: { color: colors.muted, marginBottom: 16 },
  err: { color: colors.danger, marginBottom: 10, fontWeight: '700' },
});

