// BLOC 1 - Role du fichier.
// Ce fichier gere un service mobile lie a authService.
// Point de vigilance: garder la compatibilite avec la synchronisation offline et les types TypeScript.

import { apiJson } from './apiClient';
import { Session } from '../session/sessionStore';

export const AuthService = {
  async login(input: { identifier: string; password: string }): Promise<Session> {
    const json = await apiJson<any>('/api/auth/login', {
      method: 'POST',
      auth: false,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!json?.token || !json?.user) throw new Error('Réponse login invalide');
    return {
      token: String(json.token),
      refreshToken: json.refreshToken ? String(json.refreshToken) : undefined,
      user: {
        id: String(json.user.id),
        username: String(json.user.username),
        role: String(json.user.role),
        email: json.user.email ? String(json.user.email) : undefined,
      },
    };
  },
};

