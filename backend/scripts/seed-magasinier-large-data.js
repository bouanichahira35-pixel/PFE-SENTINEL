require('../loadEnv');

const bcrypt = require('bcryptjs');
require('../db');

const mongoose = require('mongoose');
const User = require('../models/User');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Request = require('../models/Request');
const StockEntry = require('../models/StockEntry');
const StockExit = require('../models/StockExit');
const History = require('../models/History');
const Supplier = require('../models/Supplier');
const {
  HUMANIZED_CORE_USERS,
  HUMANIZED_PRODUCTS,
  HUMANIZED_SUPPLIERS,
  HUMANIZED_USERS,
} = require('../data/humanizedCatalogue');

const PRODUCT_COUNT = Math.max(10, Number(process.env.SEED_PRODUCTS || 100));
const OPS_PER_PRODUCT = Math.max(2, Number(process.env.SEED_OPS_PER_PRODUCT || 4));

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(items) {
  return items[randomInt(0, items.length - 1)];
}

function pastDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(randomInt(8, 16), randomInt(0, 55), 0, 0);
  return d;
}

function computeProductStatus(quantityCurrent, seuilMinimum) {
  if (quantityCurrent <= 0) return 'rupture';
  if (quantityCurrent <= seuilMinimum) return 'sous_seuil';
  return 'ok';
}

function productCode(index, product) {
  const prefixByFamily = {
    economat: 'ECO',
    produit_chimique: 'CHM',
    gaz: 'GAZ',
    consommable_laboratoire: 'LAB',
    consommable_informatique: 'INF',
  };
  return `${prefixByFamily[product.family] || 'PRD'}-HUM-${String(index + 1).padStart(4, '0')}`;
}

async function ensureUser({ role, username, email, telephone, password }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedUsername = String(username || '').trim();
  const existing = await User.findOne({
    $or: [
      { email: normalizedEmail },
      { username: normalizedUsername },
    ],
  }).select('_id username email role telephone').lean();

  const password_hash = await bcrypt.hash(password, 10);
  if (existing?._id) {
    const patch = {
      username: normalizedUsername,
      telephone,
      role,
      status: 'active',
      password_hash,
    };
    const emailOwner = normalizedEmail
      ? await User.findOne({ email: normalizedEmail }).select('_id').lean()
      : null;
    if (!emailOwner?._id || String(emailOwner._id) === String(existing._id)) {
      patch.email = normalizedEmail;
    }
    await User.updateOne({ _id: existing._id }, { $set: patch });
    return User.findById(existing._id).select('_id username email role telephone').lean();
  }

  const created = await User.create({
    username: normalizedUsername,
    email: normalizedEmail,
    password_hash,
    role,
    telephone,
    status: 'active',
  });
  return created.toObject();
}

async function ensureCoreUsers() {
  const byRole = new Map(HUMANIZED_CORE_USERS.map((user) => [user.role, user]));

  const responsableSeed = byRole.get('responsable');
  const responsable = await ensureUser({
    role: 'responsable',
    username: responsableSeed.username,
    email: responsableSeed.email,
    telephone: responsableSeed.telephone,
    password: process.env[responsableSeed.passwordEnv] || responsableSeed.fallbackPassword,
  });

  const magasinierSeed = byRole.get('magasinier');
  const magasinier = await ensureUser({
    role: 'magasinier',
    username: magasinierSeed.username,
    email: magasinierSeed.email,
    telephone: magasinierSeed.telephone,
    password: process.env[magasinierSeed.passwordEnv] || magasinierSeed.fallbackPassword,
  });

  const demandeurs = [];
  for (const person of HUMANIZED_USERS) {
    // eslint-disable-next-line no-await-in-loop
    demandeurs.push(await ensureUser({
      ...person,
      role: 'demandeur',
      password: process.env.TEST_DEMANDEUR_PASSWORD || 'ChangeMe_Demandeur_123',
    }));
  }

  return { responsable, magasinier, demandeurs };
}

async function ensureCategory(product, createdById) {
  const isSensitive = product.family === 'produit_chimique' || product.family === 'gaz';
  return Category.findOneAndUpdate(
    { name: product.category },
    {
      $set: {
        name: product.category,
        description: `Catalogue operationnel ${product.category.toLowerCase()}`,
        parent_family: product.family,
        lifecycle_status: 'active',
        is_sensitive: isSensitive,
        requires_fds: product.family === 'produit_chimique',
        requires_lot_tracking: isSensitive,
      },
      $setOnInsert: { created_by: createdById },
    },
    { upsert: true, returnDocument: 'after' }
  ).lean();
}

async function ensureSuppliers(createdById) {
  const suppliers = [];
  for (const supplier of HUMANIZED_SUPPLIERS) {
    // eslint-disable-next-line no-await-in-loop
    const doc = await Supplier.findOneAndUpdate(
      { name: supplier.name },
      {
        $set: {
          ...supplier,
          status: 'ACTIF',
          last_verification_date: pastDate(randomInt(5, 60)),
        },
        $setOnInsert: { created_by: createdById },
      },
      { upsert: true, returnDocument: 'after' }
    ).lean();
    suppliers.push(doc);
  }
  return suppliers;
}

async function ensureProducts({ responsable, magasinier }) {
  const selected = HUMANIZED_PRODUCTS.slice(0, Math.min(PRODUCT_COUNT, HUMANIZED_PRODUCTS.length));
  const products = [];

  for (let i = 0; i < selected.length; i += 1) {
    const item = selected[i];
    const category = await ensureCategory(item, magasinier._id); // eslint-disable-line no-await-in-loop
    const baseStock = randomInt(Math.max(item.threshold + 3, 12), Math.max(item.threshold * 5, 60));
    const quantity = i % 11 === 0 ? Math.max(0, item.threshold - randomInt(0, 2)) : baseStock;
    const code = productCode(i, item);

    // eslint-disable-next-line no-await-in-loop
    const product = await Product.findOneAndUpdate(
      { code_product: code },
      {
        $set: {
          code_product: code,
          name: item.name,
          description: `Article catalogue humanise: ${item.name}.`,
          category: category?._id,
          family: item.family,
          unite: item.unit,
          emplacement: item.location,
          stock_initial_year: quantity,
          quantity_current: quantity,
          seuil_minimum: item.threshold,
          status: computeProductStatus(quantity, item.threshold),
          lifecycle_status: 'active',
          validation_status: 'approved',
          qr_code_value: `QR-${code}`,
          validated_by: responsable._id,
        },
        $setOnInsert: {
          created_by: magasinier._id,
        },
      },
      { upsert: true, returnDocument: 'after' }
    ).lean();

    products.push(product);
  }

  return products;
}

async function seedOperationalTrace({ products, suppliers, magasinier, demandeurs }) {
  const today = new Date().toISOString().slice(0, 10);
  const seedTag = `humanized_catalogue_${today}`;
  const existing = await StockEntry.findOne({ entry_number: { $regex: `^BE-HUM-${today.replace(/-/g, '')}` } }).select('_id').lean();
  if (existing) return { skipped: true, entries: 0, exits: 0, requests: 0, history: 0 };

  const selected = products.slice(0, Math.min(products.length, 24));
  const entryDocs = [];
  const exitDocs = [];
  const requestDocs = [];
  const historyDocs = [];

  for (let pIndex = 0; pIndex < selected.length; pIndex += 1) {
    const product = selected[pIndex];
    let stock = Number(product.quantity_current || 0);

    for (let op = 0; op < OPS_PER_PRODUCT; op += 1) {
      const opDate = pastDate(randomInt(1, 75));
      const supplier = pick(suppliers);
      const forceEntry = stock <= Number(product.seuil_minimum || 0) + 2 || op % 2 === 0;

      if (forceEntry) {
        const qtyIn = randomInt(6, 30);
        stock += qtyIn;
        const entryNumber = `BE-HUM-${today.replace(/-/g, '')}-${String(pIndex).padStart(2, '0')}-${op}`;

        entryDocs.push({
          entry_number: entryNumber,
          product: product._id,
          quantity: qtyIn,
          unit_price: randomInt(8, 900),
          submission_duration_ms: randomInt(12000, 52000),
          purchase_order_number: `PO-HUM-${String(pIndex + 1).padStart(3, '0')}`,
          delivery_note_number: `BL-${supplier.name.slice(0, 3).toUpperCase()}-${randomInt(1000, 9999)}`,
          entry_mode: pick(['manual', 'supplier_number', 'supplier_qr']),
          delivery_date: opDate,
          service_requester: 'Magasin central',
          supplier: supplier.name,
          commercial_name: product.name,
          reference_code: product.code_product,
          lot_number: `LOT-${today.replace(/-/g, '')}-${pIndex}-${op}`,
          lot_qr_value: `LOTQR-${product.code_product}-${op}`,
          date_entry: opDate,
          magasinier: magasinier._id,
          canceled: false,
          createdAt: opDate,
          updatedAt: opDate,
        });

        historyDocs.push({
          action_type: 'entry',
          user: magasinier._id,
          product: product._id,
          quantity: qtyIn,
          date_action: opDate,
          source: 'system',
          description: `Reception catalogue humanise: ${qtyIn} ${product.unite || 'unite'} de ${product.name}`,
          status_after: computeProductStatus(stock, product.seuil_minimum),
          actor_role: 'magasinier',
          correlation_id: `${seedTag}_entry_${product.code_product}_${op}`,
        });
      } else {
        const qtyOut = Math.max(1, Math.min(randomInt(1, 10), stock));
        const demandeur = pick(demandeurs);
        const exitNumber = `BP-HUM-${today.replace(/-/g, '')}-${String(pIndex).padStart(2, '0')}-${op}`;
        stock -= qtyOut;

        exitDocs.push({
          exit_number: exitNumber,
          withdrawal_paper_number: `BS-HUM-${randomInt(1000, 9999)}`,
          product: product._id,
          quantity: qtyOut,
          submission_duration_ms: randomInt(9000, 48000),
          direction_laboratory: pick(['Forage', 'Production', 'HSE', 'Laboratoire', 'Maintenance']),
          beneficiary: pick(['Equipe puits A', 'Atelier maintenance', 'Laboratoire controle', 'Base vie', 'Equipe HSE']),
          demandeur: demandeur._id,
          date_exit: opDate,
          exit_mode: pick(['manual', 'fifo_qr', 'internal_bond']),
          fifo_reference: `FIFO-${product.code_product}-${op}`,
          note: `Sortie operationnelle catalogue humanise`,
          magasinier: magasinier._id,
          canceled: false,
          createdAt: opDate,
          updatedAt: opDate,
        });

        requestDocs.push({
          demandeur: demandeur._id,
          product: product._id,
          quantity_requested: qtyOut,
          direction_laboratory: 'Production',
          beneficiary: 'Equipe terrain',
          priority: qtyOut > 6 ? 'urgent' : 'normal',
          status: pick(['pending', 'validated', 'served', 'received']),
          date_request: opDate,
          note: `Besoin operationnel pour ${product.name}`,
          processed_by: magasinier._id,
        });

        historyDocs.push({
          action_type: 'exit',
          user: magasinier._id,
          product: product._id,
          quantity: qtyOut,
          date_action: opDate,
          source: 'system',
          description: `Sortie catalogue humanise: ${qtyOut} ${product.unite || 'unite'} de ${product.name}`,
          status_after: computeProductStatus(stock, product.seuil_minimum),
          actor_role: 'magasinier',
          correlation_id: `${seedTag}_exit_${product.code_product}_${op}`,
        });
      }
    }

    await Product.updateOne( // eslint-disable-line no-await-in-loop
      { _id: product._id },
      {
        $set: {
          quantity_current: stock,
          status: computeProductStatus(stock, product.seuil_minimum),
          updatedAt: new Date(),
        },
      }
    );
  }

  if (entryDocs.length) await StockEntry.insertMany(entryDocs, { ordered: false });
  if (exitDocs.length) await StockExit.insertMany(exitDocs, { ordered: false });
  if (requestDocs.length) await Request.insertMany(requestDocs, { ordered: false });
  if (historyDocs.length) await History.insertMany(historyDocs, { ordered: false });

  return {
    skipped: false,
    entries: entryDocs.length,
    exits: exitDocs.length,
    requests: requestDocs.length,
    history: historyDocs.length,
  };
}

async function run() {
  const mongoReady = await mongoose.waitForMongoReady({ timeoutMs: 15_000 });
  if (!mongoReady.ok) throw new Error(`Mongo indisponible: ${mongoReady.reason}`);

  const { responsable, magasinier, demandeurs } = await ensureCoreUsers();
  const suppliers = await ensureSuppliers(responsable._id);
  const products = await ensureProducts({ responsable, magasinier });
  const trace = await seedOperationalTrace({ products, suppliers, magasinier, demandeurs });

  // eslint-disable-next-line no-console
  console.log('SEED_HUMANIZED_CATALOGUE_OK', {
    products: products.length,
    suppliers: suppliers.length,
    demandeurs: demandeurs.length,
    trace,
  });
}

run()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('SEED_HUMANIZED_CATALOGUE_FAILED', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch (_) {
      // ignore
    }
  });
