// BLOC 1 - Role du fichier.
// Ce fichier fournit des donnees locales de fallback ou de demonstration pour catalogueFallback.
// Point de vigilance: modifier avec prudence car ce fichier peut etre importe par plusieurs modules.

export const fallbackSuppliers = [
  {
    _id: 'fallback-supplier-technoquip',
    name: 'Technoquip Tunisie',
    email: 'contact@technoquip.tn',
    phone: '+216 71 540 118',
    address: 'Zone industrielle Charguia II, Tunis',
    domain: 'Instrumentation et maintenance',
    main_contact: 'Karim Mansour',
    internal_note: 'Fournisseur qualifie pour capteurs, manometres et pieces de maintenance.',
    status: 'ACTIF',
    reliability_level: 'FIABLE',
    default_lead_time_days: 6,
    profile_state: 'complete',
    missing_fields: [],
  },
  {
    _id: 'fallback-supplier-sotuchim',
    name: 'Sotuchim Industrie',
    email: 'ventes@sotuchim.tn',
    phone: '+216 74 407 220',
    address: 'Route de Gabes km 7, Sfax',
    domain: 'Produits chimiques et laboratoire',
    main_contact: 'Sonia Dridi',
    internal_note: 'Verification FDS obligatoire avant reception des reactifs sensibles.',
    status: 'ACTIF',
    reliability_level: 'MOYEN',
    default_lead_time_days: 9,
    profile_state: 'complete',
    missing_fields: [],
  },
  {
    _id: 'fallback-supplier-securinor',
    name: 'Securinor Equipements',
    email: 'commercial@securinor.tn',
    phone: '+216 70 836 410',
    address: 'Parc d activites Borj Cedria, Ben Arous',
    domain: 'EPI et securite industrielle',
    main_contact: 'Nabil Gharbi',
    internal_note: 'Bon historique de livraison EPI.',
    status: 'ACTIF',
    reliability_level: 'FIABLE',
    default_lead_time_days: 5,
    profile_state: 'complete',
    missing_fields: [],
  },
];

export const fallbackApprovisionnementProducts = [
  {
    id: 'PRD-FALLBACK-001',
    nom: 'Transmetteur pression WIKA 0-10 bar 4-20 mA',
    stockActuel: 2,
    seuilMinimum: 3,
    stockSecurite: 2,
    consommationMensuelle: 4,
    prixEstime: 680,
  },
  {
    id: 'PRD-FALLBACK-002',
    nom: 'Gants anti-coupure Ansell HyFlex 11-727',
    stockActuel: 18,
    seuilMinimum: 30,
    stockSecurite: 10,
    consommationMensuelle: 45,
    prixEstime: 16,
  },
  {
    id: 'PRD-FALLBACK-003',
    nom: 'Huile hydraulique Total Azolla ZS 46 bidon 20 L',
    stockActuel: 4,
    seuilMinimum: 6,
    stockSecurite: 3,
    consommationMensuelle: 9,
    prixEstime: 190,
  },
];

export const fallbackApprovisionnementSuppliers = [
  {
    id: 'fallback-supplier-technoquip',
    nom: 'Technoquip Tunisie',
    score: 91,
    delaiMoyen: 6,
    fiabilite: 94,
    prixUnitaire: 680,
    derniereCommande: '2026-06-03',
    commandesPrecedentes: 18,
  },
  {
    id: 'fallback-supplier-securinor',
    nom: 'Securinor Equipements',
    score: 88,
    delaiMoyen: 5,
    fiabilite: 92,
    prixUnitaire: 16,
    derniereCommande: '2026-06-08',
    commandesPrecedentes: 22,
  },
  {
    id: 'fallback-supplier-sotuchim',
    nom: 'Sotuchim Industrie',
    score: 81,
    delaiMoyen: 9,
    fiabilite: 84,
    prixUnitaire: 190,
    derniereCommande: '2026-05-29',
    commandesPrecedentes: 11,
  },
];

export const catalogueCategories = [
  'Bureautique',
  'EPI',
  'Maintenance mecanique',
  'Instrumentation',
  'Electricite',
  'Laboratoire',
  'Gaz techniques',
  'Tuyauterie',
  'Exploitation site',
  'Consommables informatiques',
  'Nettoyage industriel',
  'Consignation et signalisation',
  'Pompes et etancheite',
];

export const catalogueProducts = [
  { id: '1', code: 'BUR-A4-001', nom: 'Papier A4 Navigator 80 g', categorie: 'Bureautique', type: 'Consommable', quantite: 96, seuilMin: 24, unite: 'Ramette' },
  { id: '2', code: 'HSE-CAS-011', nom: 'Casque de securite JSP EVO3 blanc', categorie: 'EPI', type: 'EPI', quantite: 14, seuilMin: 15, unite: 'Unite' },
  { id: '3', code: 'HSE-GNT-013', nom: 'Gants anti-coupure Ansell HyFlex 11-727', categorie: 'EPI', type: 'EPI', quantite: 18, seuilMin: 30, unite: 'Paire' },
  { id: '4', code: 'MEC-ROU-021', nom: 'Roulement SKF 6205-2RS1', categorie: 'Maintenance mecanique', type: 'Piece', quantite: 9, seuilMin: 8, unite: 'Unite' },
  { id: '5', code: 'MEC-HUI-030', nom: 'Huile hydraulique Total Azolla ZS 46 bidon 20 L', categorie: 'Maintenance mecanique', type: 'Produit chimique', quantite: 4, seuilMin: 6, unite: 'Bidon' },
  { id: '6', code: 'INS-PRE-031', nom: 'Transmetteur pression WIKA 0-10 bar 4-20 mA', categorie: 'Instrumentation', type: 'Capteur', quantite: 2, seuilMin: 3, unite: 'Unite' },
  { id: '7', code: 'ELE-DIS-039', nom: 'Disjoncteur Schneider Acti9 iC60N 16A', categorie: 'Electricite', type: 'Protection', quantite: 12, seuilMin: 8, unite: 'Unite' },
  { id: '8', code: 'LAB-ISO-047', nom: 'Isopropanol 99.9 pour analyse bouteille 1 L', categorie: 'Laboratoire', type: 'Reactif', quantite: 0, seuilMin: 10, unite: 'Bouteille' },
  { id: '9', code: 'GAZ-AZO-055', nom: 'Bouteille azote industriel 50 L 200 bar', categorie: 'Gaz techniques', type: 'Gaz', quantite: 3, seuilMin: 3, unite: 'Bouteille' },
  { id: '10', code: 'TUY-BRI-061', nom: 'Bride acier carbone DN50 PN16 EN1092-1', categorie: 'Tuyauterie', type: 'Raccord', quantite: 10, seuilMin: 6, unite: 'Unite' },
  { id: '11', code: 'OPS-ABS-073', nom: 'Kit absorbant hydrocarbures 120 L', categorie: 'Exploitation site', type: 'Urgence', quantite: 5, seuilMin: 4, unite: 'Kit' },
  { id: '12', code: 'OPS-FIL-071', nom: 'Filtre huile moteur Donaldson P550318', categorie: 'Exploitation site', type: 'Filtration', quantite: 7, seuilMin: 8, unite: 'Unite' },
];

export const getProductStatus = (quantite, seuilMin) => {
  if (quantite === 0) return 'rupture';
  if (quantite < seuilMin) return 'sous-seuil';
  return 'disponible';
};
