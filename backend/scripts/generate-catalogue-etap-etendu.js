const fs = require('fs');
const path = require('path');

function esc(value) {
  const s = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  if (s.includes(';') || s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowToLine(row) {
  return [
    'category_name',
    'category_description',
    'category_audiences',
    'product_name',
    'product_description',
    'family',
    'unite',
    'seuil_minimum',
    'emplacement',
  ].map((k) => esc(row[k])).join(';');
}

function makeCategory(name, description, audiences, emplacement) {
  return { name, description, audiences, emplacement };
}

function addProducts(out, category, products) {
  for (const p of products) {
    out.push({
      category_name: category.name,
      category_description: category.description,
      category_audiences: category.audiences,
      product_name: p.name,
      product_description: p.description || '',
      family: p.family || 'economat',
      unite: p.unite || 'Unite',
      seuil_minimum: Number.isFinite(Number(p.seuil_minimum)) ? Math.max(0, Math.floor(Number(p.seuil_minimum))) : 0,
      emplacement: p.emplacement || category.emplacement,
    });
  }
}

function main() {
  const categories = [
    makeCategory('Bureautique', 'Consommables bureautiques (papier, classement, impression).', 'bureautique', 'Dépôt - Bureautique'),
    makeCategory('Ménage', "Produits d'entretien et consommables de nettoyage.", 'menage', 'Dépôt - Entretien'),
    makeCategory('HSE', "Équipements de protection individuelle et sécurité.", '', 'Dépôt - HSE'),
    makeCategory('Maintenance', 'Pièces et consommables de maintenance mécanique.', 'petrole', 'Atelier - Maintenance'),
    makeCategory('Instrumentation', 'Capteurs, transmetteurs et accessoires d’instrumentation.', 'petrole', 'Magasin - Instrumentation'),
    makeCategory('Électricité', 'Appareillage électrique, câbles et protections.', 'petrole', 'Magasin - Électricité'),
    makeCategory('Laboratoire', 'Consommables et réactifs de laboratoire.', '', 'Labo - Stock'),
    makeCategory('Gaz Techniques', 'Gaz industriels, détendeurs et accessoires.', 'petrole', 'Zone - Gaz'),
    makeCategory('Site Pétrole', 'Consommables d’exploitation site (oilfield).', 'petrole', 'Site - Dépôt'),
    makeCategory('Tuyauterie', 'Raccords, brides, joints, flexibles, robinetterie.', 'petrole', 'Magasin - Tuyauterie'),
  ];

  const out = [];

  addProducts(out, categories[0], [
    { name: 'Papier A4 80g (ramette 500)', unite: 'Ramette', seuil_minimum: 20 },
    { name: 'Papier A3 80g (ramette 500)', unite: 'Ramette', seuil_minimum: 10 },
    { name: 'Toner imprimante (noir)', unite: 'Unite', seuil_minimum: 3 },
    { name: 'Toner imprimante (cyan)', unite: 'Unite', seuil_minimum: 2 },
    { name: 'Toner imprimante (magenta)', unite: 'Unite', seuil_minimum: 2 },
    { name: 'Toner imprimante (jaune)', unite: 'Unite', seuil_minimum: 2 },
    { name: 'Stylos bille bleus (boîte)', unite: 'Boite', seuil_minimum: 10 },
    { name: 'Marqueurs permanents (boîte)', unite: 'Boite', seuil_minimum: 6 },
    { name: 'Classeurs A4 (unité)', unite: 'Unite', seuil_minimum: 15 },
    { name: 'Chemises cartonnées (lot)', unite: 'Boite', seuil_minimum: 8 },
  ]);

  addProducts(out, categories[1], [
    { name: 'Détergent multi-surfaces (bidon 5L)', family: 'produit_chimique', unite: 'Bidon', seuil_minimum: 6 },
    { name: 'Eau de javel (bidon 5L)', family: 'produit_chimique', unite: 'Bidon', seuil_minimum: 6 },
    { name: 'Désinfectant (bidon 5L)', family: 'produit_chimique', unite: 'Bidon', seuil_minimum: 5 },
    { name: 'Sacs poubelle 100L (rouleau)', unite: 'Unite', seuil_minimum: 10 },
    { name: 'Gants ménage (boîte)', unite: 'Boite', seuil_minimum: 10 },
  ]);

  addProducts(out, categories[2], [
    { name: 'Casque de sécurité', unite: 'Unite', seuil_minimum: 10 },
    { name: 'Lunettes de protection', unite: 'Unite', seuil_minimum: 15 },
    { name: 'Gants anti-coupure', unite: 'Paire', seuil_minimum: 20 },
    { name: 'Chaussures de sécurité', unite: 'Paire', seuil_minimum: 12 },
    { name: 'Masque FFP2', unite: 'Boite', seuil_minimum: 8 },
    { name: 'Bouchons anti-bruit', unite: 'Boite', seuil_minimum: 6 },
  ]);

  // Maintenance: bolts, bearings, belts, seals, lubricants.
  const boltSizes = ['M6', 'M8', 'M10', 'M12', 'M16', 'M20'];
  const boltGrades = ['8.8', '10.9'];
  const bearingRefs = ['6204', '6205', '6206', '6305', '6306'];
  const belts = ['A', 'B', 'C'];
  const lubricants = [
    { name: 'Graisse industrielle (cartouche)', family: 'produit_chimique', unite: 'Unite', seuil_minimum: 10 },
    { name: 'Huile hydraulique ISO 46 (bidon 20L)', family: 'produit_chimique', unite: 'Bidon', seuil_minimum: 4 },
    { name: 'Dégraissant industriel (bidon 5L)', family: 'produit_chimique', unite: 'Bidon', seuil_minimum: 6 },
  ];
  const maint = [];
  for (const s of boltSizes) {
    for (const g of boltGrades) {
      maint.push({ name: `Boulon hexagonal ${s} classe ${g}`, unite: 'Boite', seuil_minimum: 5 });
      maint.push({ name: `Ecrou ${s} classe ${g}`, unite: 'Boite', seuil_minimum: 5 });
      maint.push({ name: `Rondelle ${s}`, unite: 'Boite', seuil_minimum: 5 });
    }
  }
  for (const r of bearingRefs) {
    maint.push({ name: `Roulement ${r}`, unite: 'Unite', seuil_minimum: 6 });
  }
  for (const t of belts) {
    for (let i = 25; i <= 80; i += 5) {
      maint.push({ name: `Courroie trapézoïdale ${t}-${i}`, unite: 'Unite', seuil_minimum: 4 });
    }
  }
  addProducts(out, categories[3], [...maint, ...lubricants]);

  // Instrumentation: sensors and transmitters.
  const ranges = ['0-10 bar', '0-25 bar', '0-100 bar'];
  const temps = ['0-100°C', '0-200°C', '0-400°C'];
  const instr = [];
  for (const r of ranges) {
    instr.push({ name: `Transmetteur pression ${r}`, unite: 'Unite', seuil_minimum: 2 });
    instr.push({ name: `Manomètre ${r}`, unite: 'Unite', seuil_minimum: 3 });
  }
  for (const t of temps) {
    instr.push({ name: `Sonde température ${t}`, unite: 'Unite', seuil_minimum: 2 });
    instr.push({ name: `Thermomètre industriel ${t}`, unite: 'Unite', seuil_minimum: 2 });
  }
  addProducts(out, categories[4], instr);

  // Électricité: breakers and cables.
  const breakers = [6, 10, 16, 20, 32, 40, 63];
  const cableSections = ['1.5mm²', '2.5mm²', '4mm²', '6mm²', '10mm²', '16mm²'];
  const elec = [];
  for (const a of breakers) {
    elec.push({ name: `Disjoncteur ${a}A`, unite: 'Unite', seuil_minimum: 5 });
  }
  for (const s of cableSections) {
    elec.push({ name: `Câble électrique ${s} (bobine)`, unite: 'Bobine', seuil_minimum: 2 });
  }
  addProducts(out, categories[5], elec);

  // Laboratory: reagents and consumables (examples).
  addProducts(out, categories[6], [
    { name: 'Isopropanol (bouteille 1L)', family: 'produit_chimique', unite: 'Unite', seuil_minimum: 8 },
    { name: 'Acide chlorhydrique (bouteille 1L)', family: 'produit_chimique', unite: 'Unite', seuil_minimum: 6 },
    { name: 'Acide sulfurique (bouteille 1L)', family: 'produit_chimique', unite: 'Unite', seuil_minimum: 4 },
    { name: 'Flacons échantillons (50ml)', family: 'consommable_laboratoire', unite: 'Boite', seuil_minimum: 10 },
    { name: 'Gants nitrile (boîte)', unite: 'Boite', seuil_minimum: 10 },
    { name: 'Filtres seringue (boîte)', family: 'consommable_laboratoire', unite: 'Boite', seuil_minimum: 6 },
  ]);

  // Gaz techniques.
  const gases = ['Azote', 'Oxygène', 'Argon', 'CO2'];
  const gas = [];
  for (const g of gases) {
    gas.push({ name: `${g} (bouteille)`, family: 'gaz', unite: 'Unite', seuil_minimum: 2 });
    gas.push({ name: `Détendeur ${g}`, unite: 'Unite', seuil_minimum: 2 });
  }
  addProducts(out, categories[7], gas);

  // Site pétrole: filters, absorbents, hoses, etc.
  const site = [];
  const filterTypes = ['huile', 'air', 'carburant'];
  for (const ft of filterTypes) {
    for (let i = 1; i <= 20; i += 1) {
      site.push({ name: `Filtre ${ft} (référence site) ${String(i).padStart(2, '0')}`, unite: 'Unite', seuil_minimum: 6 });
    }
  }
  site.push({ name: 'Absorbants hydrocarbures (kit)', unite: 'Boite', seuil_minimum: 5 });
  site.push({ name: 'Rubalise / signalisation (rouleau)', unite: 'Unite', seuil_minimum: 6 });
  addProducts(out, categories[8], site);

  // Tuyauterie: valves, flanges, gaskets, fittings.
  const dn = ['DN15', 'DN25', 'DN40', 'DN50', 'DN80', 'DN100'];
  const pressure = ['PN16', 'PN40'];
  const tube = [];
  for (const d of dn) {
    for (const p of pressure) {
      tube.push({ name: `Bride ${d} ${p}`, unite: 'Unite', seuil_minimum: 4 });
      tube.push({ name: `Joint spiralé ${d} ${p}`, unite: 'Unite', seuil_minimum: 10 });
      tube.push({ name: `Vanne papillon ${d} ${p}`, unite: 'Unite', seuil_minimum: 2 });
      tube.push({ name: `Clapet anti-retour ${d} ${p}`, unite: 'Unite', seuil_minimum: 2 });
    }
  }
  addProducts(out, categories[9], tube);

  // Limit to ~320 lines for demo/import.
  const maxLines = 320;
  const trimmed = out.slice(0, maxLines);

  const header = [
    'category_name',
    'category_description',
    'category_audiences',
    'product_name',
    'product_description',
    'family',
    'unite',
    'seuil_minimum',
    'emplacement',
  ].join(';');

  const csv = [header, ...trimmed.map(rowToLine)].join('\n') + '\n';
  const outPath = path.join(__dirname, '..', '..', 'docs', 'catalogue_produits_petrolier_etap_etendu.csv');
  fs.writeFileSync(outPath, csv, 'utf8');

  // eslint-disable-next-line no-console
  console.log('CATALOGUE_GENERATED_OK', { out: path.basename(outPath), lines: trimmed.length });
}

main();

