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

