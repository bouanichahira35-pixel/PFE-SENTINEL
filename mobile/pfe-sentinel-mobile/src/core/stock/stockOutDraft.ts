// BLOC 1 - Role du fichier.
// Ce fichier participe a l'application mobile autour de stockOutDraft.
// Point de vigilance: garder la compatibilite avec la synchronisation offline et les types TypeScript.

export type StockOutDraft = {
  productId: string;
  quantity: number;
  beneficiary?: string;
  directionLaboratory?: string;
  note?: string;
  site: string;
  photoBase64?: string;
  meta: any;
};

export type HseAcknowledgement = {
  acknowledgedAtLocal: string;
  riskLevel: 'standard' | 'sensitive';
  checklist: string[];
  comment?: string;
};

