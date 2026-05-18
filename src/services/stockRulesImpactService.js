import { loadStockRulesImpact, simulateStockRulesImpact } from './stockRulesService';

export async function fetchStockRulesImpact() {
  return loadStockRulesImpact();
}

export async function simulateImpact(config) {
  return simulateStockRulesImpact(config);
}

