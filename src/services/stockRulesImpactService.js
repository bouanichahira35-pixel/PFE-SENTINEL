// BLOC 1 - Role du fichier.
// Ce fichier organise les appels API ou la logique frontend partagee pour stockRulesImpactService.
// Point de vigilance: modifier avec prudence car ce fichier peut etre importe par plusieurs modules.

import { loadStockRulesImpact, simulateStockRulesImpact } from './stockRulesService';

export async function fetchStockRulesImpact() {
  return loadStockRulesImpact();
}

export async function simulateImpact(config) {
  return simulateStockRulesImpact(config);
}

