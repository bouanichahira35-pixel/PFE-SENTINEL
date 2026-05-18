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

