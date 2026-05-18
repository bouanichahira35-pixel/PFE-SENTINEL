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

