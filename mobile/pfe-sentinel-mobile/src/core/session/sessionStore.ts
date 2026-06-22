// BLOC 1 - Role du fichier.
// Ce fichier participe a l'application mobile autour de sessionStore.
// Point de vigilance: garder la compatibilite avec la synchronisation offline et les types TypeScript.

import AsyncStorage from '@react-native-async-storage/async-storage';

export type Session = {
  token: string;
  refreshToken?: string;
  user: {
    id: string;
    username: string;
    role: string;
    email?: string;
  };
};

const KEY_SESSION = 'session.v1';

export const SessionStore = {
  async get(): Promise<Session | null> {
    const raw = await AsyncStorage.getItem(KEY_SESSION);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Session;
    } catch {
      return null;
    }
  },

  async set(session: Session): Promise<void> {
    await AsyncStorage.setItem(KEY_SESSION, JSON.stringify(session));
  },

  async clear(): Promise<void> {
    await AsyncStorage.removeItem(KEY_SESSION);
  },
};

