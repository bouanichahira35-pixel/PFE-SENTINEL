// BLOC 1 - Role du fichier.
// Ce fichier affiche un ecran mobile pour LoginScreen.
// Point de vigilance: garder la compatibilite avec la synchronisation offline et les types TypeScript.

import React, { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { Screen } from '../../ui/Screen';
import { HeaderAction } from '../../ui/HeaderAction';
import { Card } from '../../ui/Card';
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
    <Screen title="Connexion" scroll right={<HeaderAction title="Paramètres" onPress={props.onOpenSettings} />}>
      <Card>
        <Text style={styles.h1}>PFE-SENTINEL</Text>
        <Text style={styles.hint}>Même compte que l’application web.</Text>

        <Input
          label="Identifiant"
          value={identifier}
          onChangeText={setIdentifier}
          placeholder="Adresse mail, nom ou téléphone"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          returnKeyType="next"
        />
        <Input
          label="Mot de passe"
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
          autoCorrect={false}
          autoComplete="password"
          textContentType="password"
          returnKeyType="done"
          onSubmitEditing={onSubmit}
        />

        {error ? <Text style={styles.err}>{error}</Text> : null}

        <Button title="Se connecter" onPress={onSubmit} loading={loading} disabled={!identifier.trim() || !password.trim()} />
        <Text style={styles.tip}>En cas de problème, vérifie l’URL du backend dans Paramètres.</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { color: colors.text, fontSize: 20, fontWeight: '900', marginBottom: 4 },
  hint: { color: colors.muted, marginBottom: 16 },
  err: { color: colors.danger, marginBottom: 10, fontWeight: '700' },
  tip: { color: colors.muted, marginTop: 10 },
});
