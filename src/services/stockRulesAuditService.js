// BLOC 1 - Role du fichier.
// Ce fichier organise les appels API ou la logique frontend partagee pour stockRulesAuditService.
// Point de vigilance: modifier avec prudence car ce fichier peut etre importe par plusieurs modules.

import { loadStockRulesHistory } from './stockRulesService';

export async function fetchStockRulesHistory({ limit = 50 } = {}) {
  return loadStockRulesHistory({ limit });
}

