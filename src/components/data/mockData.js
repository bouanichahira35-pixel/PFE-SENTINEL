export const categories = [
  'Électronique',
  'Fournitures',
  'Mobilier',
  'Informatique',
  'Outillage',
  'Consommables'
];

export const types = [
  'Câbles',
  'Périphériques',
  'Bureautique',
  'Accessoires',
  'Équipements',
  'Matériel'
];

export const unites = [
  'Pièce',
  'Lot',
  'Boîte',
  'Carton',
  'Unité',
  'Paquet'
];

export const mockProducts = [
  { id: '1', code: 'PRD-001', nom: 'Câble HDMI 2m', categorie: 'Électronique', type: 'Câbles', quantite: 150, seuilMin: 20, unite: 'Pièce' },
  { id: '2', code: 'PRD-002', nom: 'Souris sans fil', categorie: 'Électronique', type: 'Périphériques', quantite: 8, seuilMin: 15, unite: 'Pièce' },
  { id: '3', code: 'PRD-003', nom: 'Clavier mécanique', categorie: 'Électronique', type: 'Périphériques', quantite: 0, seuilMin: 10, unite: 'Pièce' },
  { id: '4', code: 'PRD-004', nom: 'Écran 24 pouces', categorie: 'Électronique', type: 'Équipements', quantite: 45, seuilMin: 5, unite: 'Pièce' },
  { id: '5', code: 'PRD-005', nom: 'Papier A4 500 feuilles', categorie: 'Fournitures', type: 'Bureautique', quantite: 200, seuilMin: 50, unite: 'Carton' },
  { id: '6', code: 'PRD-006', nom: 'Stylos bleus (lot 50)', categorie: 'Fournitures', type: 'Bureautique', quantite: 12, seuilMin: 20, unite: 'Lot' },
  { id: '7', code: 'PRD-007', nom: 'Agrafeuse', categorie: 'Fournitures', type: 'Bureautique', quantite: 0, seuilMin: 5, unite: 'Pièce' },
  { id: '8', code: 'PRD-008', nom: 'Chaise de bureau', categorie: 'Mobilier', type: 'Équipements', quantite: 25, seuilMin: 3, unite: 'Pièce' },
  { id: '9', code: 'PRD-009', nom: 'Bureau ergonomique', categorie: 'Mobilier', type: 'Équipements', quantite: 4, seuilMin: 5, unite: 'Pièce' },
  { id: '10', code: 'PRD-010', nom: 'Lampe LED', categorie: 'Électronique', type: 'Accessoires', quantite: 60, seuilMin: 10, unite: 'Pièce' },
  { id: '11', code: 'PRD-011', nom: 'Casque audio', categorie: 'Électronique', type: 'Périphériques', quantite: 35, seuilMin: 8, unite: 'Pièce' },
  { id: '12', code: 'PRD-012', nom: 'Webcam HD', categorie: 'Informatique', type: 'Périphériques', quantite: 18, seuilMin: 10, unite: 'Pièce' },
];

export const mockHistory = [
  { id: 'H001', productId: '1', productCode: 'PRD-001', productNom: 'Câble HDMI 2m', type: 'entree', quantite: 50, stockAvant: 100, stockApres: 150, source: 'Fournisseur ABC', date: '2026-01-29 14:30', magasinier: 'Ahmed Ben Ali' },
  { id: 'H002', productId: '2', productCode: 'PRD-002', productNom: 'Souris sans fil', type: 'sortie', quantite: 7, stockAvant: 15, stockApres: 8, destination: 'Service IT', date: '2026-01-29 11:15', magasinier: 'Ahmed Ben Ali' },
  { id: 'H003', productId: '5', productCode: 'PRD-005', productNom: 'Papier A4 500 feuilles', type: 'entree', quantite: 100, stockAvant: 100, stockApres: 200, source: 'Fournisseur XYZ', date: '2026-01-28 16:45', magasinier: 'Ahmed Ben Ali' },
  { id: 'H004', productId: '3', productCode: 'PRD-003', productNom: 'Clavier mécanique', type: 'sortie', quantite: 10, stockAvant: 10, stockApres: 0, destination: 'Bureau 204', date: '2026-01-28 09:20', magasinier: 'Ahmed Ben Ali' },
];

export const getProductStatus = (quantite, seuilMin) => {
  if (quantite === 0) return 'rupture';
  if (quantite < seuilMin) return 'sous-seuil';
  return 'disponible';
};
