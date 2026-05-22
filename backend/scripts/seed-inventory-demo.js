require('../loadEnv');

require('../db');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Laboratory = require('../models/Laboratory');
const Location = require('../models/Location');
const { Inventory } = require('../models/Inventory');
const InventoryLine = require('../models/InventoryLine');

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

async function upsertUser({ email, username, role }) {
  const hash = await bcrypt.hash('123456', 10);
  await User.updateOne(
    { email },
    {
      $set: {
        username,
        email,
        telephone: '+21698123456',
        role,
        status: 'active',
        password_hash: hash,
      },
    },
    { upsert: true }
  );
  return User.findOne({ email }).select('_id username role status').lean();
}

async function upsertCategory({ name, parent_family, is_sensitive }) {
  await Category.updateOne(
    { name },
    {
      $set: {
        name,
        parent_family,
        lifecycle_status: 'active',
        is_sensitive: Boolean(is_sensitive),
      },
    },
    { upsert: true }
  );
  return Category.findOne({ name }).select('_id name parent_family is_sensitive lifecycle_status').lean();
}

async function upsertLab({ code, name, created_by }) {
  return Laboratory.findOneAndUpdate(
    { code },
    { $set: { code, name, active: true, created_by } },
    { upsert: true, new: true }
  ).lean();
}

async function upsertZone({ code, name, created_by }) {
  return Location.findOneAndUpdate(
    { code },
    { $set: { code, name, active: true, created_by } },
    { upsert: true, new: true }
  ).lean();
}

async function upsertProduct({ code_product, name, family, category, emplacement, quantity_current, seuil_minimum, qr_code_value }) {
  await Product.updateOne(
    { code_product },
    {
      $set: {
        code_product,
        name,
        family,
        category: category || null,
        emplacement: emplacement || '',
        quantity_current: Number(quantity_current || 0),
        seuil_minimum: Number(seuil_minimum || 0),
        qr_code_value: qr_code_value || code_product,
        lifecycle_status: 'active',
        validation_status: 'approved',
      },
      $setOnInsert: {
        unite: 'Unite',
      },
    },
    { upsert: true }
  );
  return Product.findOne({ code_product }).select('_id code_product name family category emplacement quantity_current qr_code_value').lean();
}

async function createInventoryIfMissing({ reference, fields, lines }) {
  const exists = await Inventory.findOne({ reference }).select('_id reference status').lean();
  if (exists) return { created: false, inventory: exists };

  const inv = await Inventory.create({ reference, ...fields });
  const inventoryId = inv._id;

  const lineDocs = (Array.isArray(lines) ? lines : []).map((l) => ({
    inventory_id: inventoryId,
    product_id: l.product_id,
    quantite_theorique_initiale: Math.max(0, Math.floor(Number(l.quantite_theorique_initiale || 0))),
    quantite_comptee: l.quantite_comptee === null || l.quantite_comptee === undefined ? null : Math.max(0, Math.floor(Number(l.quantite_comptee || 0))),
    ecart: null,
    valeur_ecart: null,
    motif_ecart: l.motif_ecart || '',
    observation_magasinier: l.observation_magasinier || '',
    observation_responsable: l.observation_responsable || '',
    is_counted: Boolean(l.is_counted),
    is_verified_by_magasinier: Boolean(l.is_verified_by_magasinier),
    requires_recount: Boolean(l.requires_recount),
    recount_count: Number(l.recount_count || 0),
    last_recount_at: l.last_recount_at || null,
    previous_quantite_comptee: l.previous_quantite_comptee ?? null,
    emplacement_id: l.emplacement_id || '',
    stock_id: l.stock_id || '',
  }));

  if (lineDocs.length) {
    await InventoryLine.insertMany(lineDocs, { ordered: false });
  }

  return { created: true, inventory: { _id: inv._id, reference: inv.reference, status: inv.status } };
}

async function run() {
  const responsable = await upsertUser({ email: 'responsable.demo@test.com', username: 'responsable_demo', role: 'responsable' });
  const magasinier = await upsertUser({ email: 'magasinier.demo@test.com', username: 'magasinier_demo', role: 'magasinier' });

  const lab = await upsertLab({ code: 'MAG-01', name: 'Magasin Central', created_by: responsable?._id });
  const zone = await upsertZone({ code: 'ZONE-A', name: 'Zone A - EPI', created_by: responsable?._id });

  const catEpi = await upsertCategory({ name: 'EPI', parent_family: 'economat', is_sensitive: false });
  const catChim = await upsertCategory({ name: 'Produits sensibles', parent_family: 'produit_chimique', is_sensitive: true });

  const products = [];
  products.push(await upsertProduct({ code_product: 'EPI-CSK-001', name: 'Casque sécurité', family: 'economat', category: catEpi?._id, emplacement: 'ZONE-A / R1', quantity_current: 12, seuil_minimum: 2 }));
  products.push(await upsertProduct({ code_product: 'LAB-GNT-002', name: 'Gants nitrile', family: 'consommable_laboratoire', category: catEpi?._id, emplacement: 'ZONE-A / R2', quantity_current: 40, seuil_minimum: 10 }));
  products.push(await upsertProduct({ code_product: 'ELE-CAB-003', name: 'Câble électrique', family: 'economat', category: catEpi?._id, emplacement: 'ZONE-A / R3', quantity_current: 25, seuil_minimum: 5 }));
  products.push(await upsertProduct({ code_product: 'MEC-FIL-004', name: 'Filtre huile', family: 'economat', category: catEpi?._id, emplacement: 'ZONE-A / R4', quantity_current: 8, seuil_minimum: 2 }));
  products.push(await upsertProduct({ code_product: 'MEC-JOI-005', name: 'Joint torique', family: 'economat', category: catEpi?._id, emplacement: 'ZONE-A / R5', quantity_current: 60, seuil_minimum: 15 }));
  products.push(await upsertProduct({ code_product: 'SEC-EXT-006', name: 'Extincteur recharge', family: 'economat', category: catEpi?._id, emplacement: 'ZONE-A / R6', quantity_current: 5, seuil_minimum: 1 }));
  products.push(await upsertProduct({ code_product: 'BUR-A4-007', name: 'Papier A4', family: 'economat', category: catEpi?._id, emplacement: 'ZONE-A / R7', quantity_current: 120, seuil_minimum: 30 }));
  products.push(await upsertProduct({ code_product: 'CHM-ABS-008', name: 'Absorbant industriel', family: 'produit_chimique', category: catChim?._id, emplacement: 'ZONE-A / R8', quantity_current: 14, seuil_minimum: 4 }));

  const byCode = new Map(products.filter(Boolean).map((p) => [String(p.code_product), p]));

  const baseFields = {
    type_inventaire: 'TOURNANT',
    status: 'A_FAIRE',
    magasin_id: lab?._id,
    zone_id: zone?._id,
    famille_id: 'economat',
    categorie_id: catEpi?._id,
    responsable_id: responsable?._id,
    magasinier_id: magasinier?._id,
    date_lancement: daysFromNow(-1),
    date_prevue: daysFromNow(0),
    bloquer_mouvements: false,
    notifications_activees: true,
    commentaire: 'Inventaire démo (PFE)',
    movement_blocked: false,
    submitted_at: null,
    validated_at: null,
    validated_by: null,
    rejected_at: null,
    rejected_by: null,
    recount_requested_at: null,
    recount_requested_by: null,
    motif_recomptage: '',
    motif_rejet: '',
  };

  // 1) Mission active EN_COURS (magasinier)
  await createInventoryIfMissing({
    reference: 'INV-DEMO-ENCOURS',
    fields: { ...baseFields, status: 'EN_COURS', date_prevue: daysFromNow(0), date_lancement: daysFromNow(-1) },
    lines: [
      { product_id: byCode.get('EPI-CSK-001')?._id, quantite_theorique_initiale: 12, quantite_comptee: 11, observation_magasinier: '1 utilisé', is_counted: true },
      { product_id: byCode.get('LAB-GNT-002')?._id, quantite_theorique_initiale: 40, quantite_comptee: 40, observation_magasinier: '', is_counted: true, is_verified_by_magasinier: true },
      { product_id: byCode.get('ELE-CAB-003')?._id, quantite_theorique_initiale: 25, quantite_comptee: null, observation_magasinier: '', is_counted: false },
      { product_id: byCode.get('MEC-FIL-004')?._id, quantite_theorique_initiale: 8, quantite_comptee: null, observation_magasinier: '', is_counted: false },
      { product_id: byCode.get('MEC-JOI-005')?._id, quantite_theorique_initiale: 60, quantite_comptee: 62, observation_magasinier: 'Boîte ouverte', is_counted: true },
    ].filter((l) => l.product_id),
  });

  // 2) Mission active PLANIFIE (A_FAIRE)
  await createInventoryIfMissing({
    reference: 'INV-DEMO-PLANIFIE',
    fields: { ...baseFields, status: 'A_FAIRE', date_prevue: daysFromNow(1), date_lancement: daysFromNow(0) },
    lines: [
      { product_id: byCode.get('SEC-EXT-006')?._id, quantite_theorique_initiale: 5, quantite_comptee: null, is_counted: false },
      { product_id: byCode.get('BUR-A4-007')?._id, quantite_theorique_initiale: 120, quantite_comptee: null, is_counted: false },
      { product_id: byCode.get('CHM-ABS-008')?._id, quantite_theorique_initiale: 14, quantite_comptee: null, is_counted: false },
    ].filter((l) => l.product_id),
  });

  // 3) Mission RECOMPTAGE_DEMANDE (A_RECOMPTER)
  const recountRequestedAt = new Date();
  await createInventoryIfMissing({
    reference: 'INV-DEMO-RECOMPTAGE',
    fields: {
      ...baseFields,
      status: 'A_RECOMPTER',
      date_prevue: daysFromNow(0),
      date_lancement: daysFromNow(-2),
      recount_requested_at: recountRequestedAt,
      recount_requested_by: responsable?._id,
      motif_recomptage: 'Écart important constaté sur articles sensibles.',
    },
    lines: [
      { product_id: byCode.get('CHM-ABS-008')?._id, quantite_theorique_initiale: 14, quantite_comptee: 9, observation_magasinier: 'Manque probable', observation_responsable: 'Recompter / vérifier stockage', requires_recount: true, is_counted: true },
      { product_id: byCode.get('SEC-EXT-006')?._id, quantite_theorique_initiale: 5, quantite_comptee: 5, observation_magasinier: '', observation_responsable: '', requires_recount: false, is_counted: true },
    ].filter((l) => l.product_id),
  });

  // 4) Inventaire soumis A_VALIDER (responsable)
  await createInventoryIfMissing({
    reference: 'INV-DEMO-A_VALIDER',
    fields: {
      ...baseFields,
      status: 'A_VALIDER',
      date_prevue: daysFromNow(-1),
      date_lancement: daysFromNow(-3),
      submitted_at: daysFromNow(-1),
    },
    lines: [
      { product_id: byCode.get('EPI-CSK-001')?._id, quantite_theorique_initiale: 12, quantite_comptee: 12, is_counted: true },
      { product_id: byCode.get('LAB-GNT-002')?._id, quantite_theorique_initiale: 40, quantite_comptee: 38, is_counted: true, observation_magasinier: '2 utilisés' }, // mineur
      { product_id: byCode.get('CHM-ABS-008')?._id, quantite_theorique_initiale: 14, quantite_comptee: 7, is_counted: true, observation_magasinier: 'Stock non trouvé en zone' }, // critique
    ].filter((l) => l.product_id),
  });

  // eslint-disable-next-line no-console
  console.log('SEED_INVENTORY_DEMO_OK', {
    responsable: responsable?.username,
    magasinier: magasinier?.username,
    lab: lab?.code,
    zone: zone?.code,
    inventories: ['INV-DEMO-ENCOURS', 'INV-DEMO-PLANIFIE', 'INV-DEMO-RECOMPTAGE', 'INV-DEMO-A_VALIDER'],
    products: products.length,
  });
}

run()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('SEED_INVENTORY_DEMO_FAILED', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch (_) {
      // ignore
    }
  });

