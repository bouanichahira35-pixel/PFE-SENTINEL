import { loadStockRulesHistory } from './stockRulesService';

export async function fetchStockRulesHistory({ limit = 50 } = {}) {
  return loadStockRulesHistory({ limit });
}

