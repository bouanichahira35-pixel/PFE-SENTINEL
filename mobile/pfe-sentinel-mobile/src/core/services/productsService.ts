// BLOC 1 - Role du fichier.
// Ce fichier gere un service mobile lie a productsService.
// Point de vigilance: garder la compatibilite avec la synchronisation offline et les types TypeScript.

import { ProductsRepo } from '../db/productsRepo';
import { apiJson } from './apiClient';

export const ProductsService = {
  async refresh(): Promise<{ count: number }> {
    const json = await apiJson<any>('/api/products');
    if (!Array.isArray(json)) throw new Error('Réponse produits invalide');
    const count = await ProductsRepo.upsertMany(json);
    return { count };
  },
};

