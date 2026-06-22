// BLOC 1 - Role du fichier.
// Ce fichier gere un service mobile lie a locationsService.
// Point de vigilance: garder la compatibilite avec la synchronisation offline et les types TypeScript.

import { LocationsRepo } from '../db/locationsRepo';
import { apiJson } from './apiClient';

export const LocationsService = {
  async refresh(): Promise<{ count: number }> {
    const json = await apiJson<any>('/api/locations');
    if (!Array.isArray(json)) throw new Error('Réponse emplacements invalide');
    const count = await LocationsRepo.upsertMany(json);
    return { count };
  },
};

