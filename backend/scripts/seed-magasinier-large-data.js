require('dotenv').config();

const crypto = require('crypto');
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
const FifoScanAudit = require('../models/FifoScanAudit');

const PRODUCT_COUNT = Number(process.env.SEED_PRODUCTS || 90);
const REQUEST_COUNT = Number(process.env.SEED_REQUESTS || 260);
const OPS_PER_PRODUCT = Number(process.env.SEED_OPS_PER_PRODUCT || 14);

const FAMILIES = [
  'economat',
  'produit_chimique',
  'gaz',
  'consommable_laboratoire',
];

const CATEGORY_NAMES = [
  'Papeterie',
  'Laboratoire',
  'Operationnel',
  'Maintenance',
  'Securite',
  'Gaz Techniques',
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(items) {
  return items[randomInt(0, items.length - 1)];
}

function randomPastDate(maxDaysAgo = 120) {
  const days = randomInt(1, maxDaysAgo);
  const hours = randomInt(0, 23);
  const minutes = randomInt(0, 59);
  return new Date(Date.now() - (((days * 24 + hours) * 60 + minutes) * 60 * 1000));
}

function computeProductStatus(quantityCurrent, seuilMinimum) {
  if (quantityCurrent <= 0) return 'rupture';
  if (quantityCurrent <= seuilMinimum) return 'sous_seuil';
  return 'ok';
}

async function ensureUser({ role, username, email, telephone, password }) {
  let user = await User.findOne({ email }).select('_id username email role telephone').lean();
  if (user) return user;

  const password_hash = await bcrypt.hash(password, 10);
  const created = await User.create({
    username,
    email,
    password_hash,
    role,
    telephone,
    status: 'active',
  });
  return created.toObject();
}

async function ensureCoreUsers() {
  const responsable = await ensureUser({
    role: 'responsable',
    username: 'resp_demo_seed',
    email: 'resp.demo.seed@pfe.local',
    telephone: '+21620000001',
    password: 'Responsable123',
  });

  const magasinier = await ensureUser({
    role: 'magasinier',
    username: 'mag_demo_seed',
    email: 'mag.demo.seed@pfe.local',
    telephone: '+21620000002',
    password: 'Magasinier123',
  });

  const demandeurs = [];
  for (let i = 1; i <= 12; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const demandeur = await ensureUser({
      role: 'demandeur',
      username: `demandeur_seed_${String(i).padStart(2, '0')}`,
      email: `demandeur.seed.${String(i).padStart(2, '0')}@pfe.local`,
      telephone: `+2162100${String(i).padStart(4, '0')}`,
      password: 'Demandeur123',
    });
    demandeurs.push(demandeur);
  }

  return { responsable, magasinier, demandeurs };
}

async function ensureCategories(createdById) {
  const categories = [];
  for (const name of CATEGORY_NAMES) {
    // eslint-disable-next-line no-await-in-loop
    const cat = await Category.findOneAndUpdate(
      { name },
      { $setOnInsert: { name, description: `${name} (seed)`, created_by: createdById } },
      { upsert: true, returnDocument: 'after' }
    ).lean();
    categories.push(cat);
  }
  return categories;
}

async function run() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const shortSeed = crypto.randomBytes(3).toString('hex').toUpperCase();
  const productPrefix = `SEED${stamp}${shortSeed}`;

  const { responsable, magasinier, demandeurs } = await ensureCoreUsers();
  const categories = await ensureCategories(magasinier._id);

  const products = [];
  for (let i = 1; i <= PRODUCT_COUNT; i += 1) {
    const code = `${productPrefix}-${String(i).padStart(4, '0')}`;
    const seuil = randomInt(6, 30);
    const quantity = randomInt(20, 160);
    const family = pick(FAMILIES);
    const category = pick(categories);

    products.push({
      _id: new mongoose.Types.ObjectId(),
      code_product: code,
      name: `Produit Seed ${String(i).padStart(3, '0')}`,
      description: `Produit de test genere automatiquement (${family})`,
      category: category._id,
      family,
      emplacement: `A-${randomInt(1, 12)}-${randomInt(1, 20)}`,
      stock_initial_year: quantity,
      quantity_current: quantity,
      seuil_minimum: seuil,
      status: computeProductStatus(quantity, seuil),
      validation_status: 'approved',
      created_by: magasinier._id,
      validated_by: responsable._id,
      qr_code_value: `QR-${code}`,
      createdAt: randomPastDate(150),
      updatedAt: new Date(),
    });
  }

  await Product.insertMany(products, { ordered: false });

  const entryDocs = [];
  const exitDocs = [];
  const requestDocs = [];
  const historyDocs = [];
  const fifoDocs = [];
  const productUpdates = [];
  const exitsByProduct = new Map();

  for (let pIndex = 0; pIndex < products.length; pIndex += 1) {
    const product = products[pIndex];
    let stock = Number(product.quantity_current || 0);

    historyDocs.push({
      _id: new mongoose.Types.ObjectId(),
      action_type: 'product_create',
      user: magasinier._id,
      product: product._id,
      quantity: 0,
      date_action: product.createdAt,
      source: 'system',
      description: `Produit seed cree: ${product.name}`,
      status_before: 'pending',
      status_after: 'approved',
      actor_role: 'magasinier',
      correlation_id: `seed_product_${product.code_product}`,
    });

    const exitIds = [];

    for (let i = 0; i < OPS_PER_PRODUCT; i += 1) {
      const opDate = randomPastDate(120);
      const forceEntry = stock < 12 || i % 3 === 0;

      if (forceEntry) {
        const qtyIn = randomInt(8, 45);
        stock += qtyIn;
        const entryMode = pick(['manual', 'supplier_number', 'supplier_qr']);

        entryDocs.push({
          _id: new mongoose.Types.ObjectId(),
          entry_number: `BE-${new Date().getFullYear()}-${stamp}-${pIndex}-${i}`,
          product: product._id,
          quantity: qtyIn,
          unit_price: randomInt(2, 100),
          submission_duration_ms: randomInt(9000, 65000),
          delivery_note_number: `BL-${shortSeed}-${pIndex}-${i}`,
          entry_mode: entryMode,
          delivery_date: opDate,
          service_requester: 'DSP',
          supplier: `Fournisseur ${randomInt(1, 15)}`,
          commercial_name: product.name,
          reference_code: product.code_product,
          lot_number: `LOT-${shortSeed}-${pIndex}-${i}`,
          lot_qr_value: `LOTQR-${product.code_product}-${i}`,
          date_entry: opDate,
          magasinier: magasinier._id,
          canceled: false,
          createdAt: opDate,
          updatedAt: opDate,
        });

        historyDocs.push({
          _id: new mongoose.Types.ObjectId(),
          action_type: 'entry',
          user: magasinier._id,
          product: product._id,
          quantity: qtyIn,
          date_action: opDate,
          source: 'system',
          description: `Entree seed ${qtyIn} unite(s)`,
          status_after: 'ok',
          actor_role: 'magasinier',
          correlation_id: `seed_entry_${product.code_product}_${i}`,
        });
      } else {
        const qtyOut = Math.max(1, Math.min(randomInt(2, 20), stock));
        stock -= qtyOut;
        const exitMode = pick(['manual', 'fifo_qr', 'internal_bond']);
        const exitId = new mongoose.Types.ObjectId();

        exitDocs.push({
          _id: exitId,
          exit_number: `BP-${new Date().getFullYear()}-${stamp}-${pIndex}-${i}`,
          withdrawal_paper_number: `WP-${shortSeed}-${pIndex}-${i}`,
          product: product._id,
          quantity: qtyOut,
          submission_duration_ms: randomInt(7000, 56000),
          direction_laboratory: pick(['DSP', 'FORAGE', 'SANTE', 'LAB']),
          beneficiary: pick(['Equipe A', 'Equipe B', 'Unite C', 'Laboratoire D']),
          demandeur: pick(demandeurs)._id,
          date_exit: opDate,
          scanned_lot_qr: exitMode === 'manual' ? undefined : `LOTQR-${product.code_product}-${randomInt(1, 9)}`,
          internal_bond_id: exitMode === 'internal_bond' ? `BI-${shortSeed}-${pIndex}-${i}` : undefined,
          exit_mode: exitMode,
          fifo_reference: `FIFO-${product.code_product}-${i}`,
          note: `Sortie seed ${qtyOut}`,
          magasinier: magasinier._id,
          canceled: false,
          createdAt: opDate,
          updatedAt: opDate,
        });

        exitIds.push(exitId);

        historyDocs.push({
          _id: new mongoose.Types.ObjectId(),
          action_type: 'exit',
          user: magasinier._id,
          product: product._id,
          quantity: qtyOut,
          date_action: opDate,
          source: 'system',
          description: `Sortie seed ${qtyOut} unite(s)`,
          status_after: 'ok',
          actor_role: 'magasinier',
          correlation_id: `seed_exit_${product.code_product}_${i}`,
        });

        if (exitMode !== 'manual') {
          fifoDocs.push({
            _id: new mongoose.Types.ObjectId(),
            context: 'exit_create',
            status: 'accepted',
            result: 'match',
            product: product._id,
            stock_exit: exitId,
            user: magasinier._id,
            quantity_requested: qtyOut,
            scanned_qr: `LOTQR-${product.code_product}-${i}`,
            expected_qr: `LOTQR-${product.code_product}-${i}`,
            note: 'Seed FIFO match',
            createdAt: opDate,
            updatedAt: opDate,
          });
        }

        if (Math.random() < 0.22) {
          fifoDocs.push({
            _id: new mongoose.Types.ObjectId(),
            context: 'exit_create',
            status: 'blocked',
            result: Math.random() > 0.5 ? 'mismatch' : 'no_lot',
            product: product._id,
            user: magasinier._id,
            quantity_requested: randomInt(1, 10),
            scanned_qr: `BAD-${product.code_product}-${i}`,
            expected_qr: `LOTQR-${product.code_product}-${i}`,
            note: 'Seed FIFO blocked',
            createdAt: opDate,
            updatedAt: opDate,
          });
        }
      }
    }

    exitsByProduct.set(String(product._id), exitIds);

    const nextStatus = computeProductStatus(stock, product.seuil_minimum);
    productUpdates.push({
      updateOne: {
        filter: { _id: product._id },
        update: {
          $set: {
            quantity_current: stock,
            status: nextStatus,
            updatedAt: new Date(),
          },
        },
      },
    });
  }

  for (let i = 0; i < REQUEST_COUNT; i += 1) {
    const product = pick(products);
    const demandeur = pick(demandeurs);
    const qty = randomInt(1, 12);
    const status = pick(['pending', 'accepted', 'served', 'refused']);
    const createdAt = randomPastDate(90);
    const requestId = new mongoose.Types.ObjectId();

    const requestDoc = {
      _id: requestId,
      demandeur: demandeur._id,
      product: product._id,
      quantity_requested: qty,
      direction_laboratory: pick(['DSP', 'FORAGE', 'SANTE', 'LAB']),
      beneficiary: pick(['Equipe A', 'Equipe B', 'Unite C']),
      status,
      date_request: createdAt,
      date_acceptance: status === 'accepted' || status === 'served' ? createdAt : undefined,
      date_processing: status === 'accepted' || status === 'served' || status === 'refused' ? createdAt : undefined,
      date_served: status === 'served' ? createdAt : undefined,
      processed_by: status === 'accepted' || status === 'served' || status === 'refused' ? magasinier._id : undefined,
      served_by: status === 'served' ? magasinier._id : undefined,
      note: `Demande seed ${status}`,
      createdAt,
      updatedAt: createdAt,
    };

    if (status === 'served') {
      const linkedExitIds = exitsByProduct.get(String(product._id)) || [];
      if (linkedExitIds.length) {
        requestDoc.stock_exit = pick(linkedExitIds);
      }
    }

    requestDocs.push(requestDoc);

    historyDocs.push({
      _id: new mongoose.Types.ObjectId(),
      action_type: 'request',
      user: demandeur._id,
      product: product._id,
      request: requestId,
      quantity: qty,
      date_action: createdAt,
      source: 'system',
      description: `Demande seed (${status})`,
      status_before: 'pending',
      status_after: status,
      actor_role: 'demandeur',
      correlation_id: `seed_request_${product.code_product}_${i}`,
    });
  }

  if (entryDocs.length) await StockEntry.insertMany(entryDocs, { ordered: false });
  if (exitDocs.length) await StockExit.insertMany(exitDocs, { ordered: false });
  if (fifoDocs.length) await FifoScanAudit.insertMany(fifoDocs, { ordered: false });
  if (requestDocs.length) await Request.insertMany(requestDocs, { ordered: false });
  if (historyDocs.length) await History.insertMany(historyDocs, { ordered: false });
  if (productUpdates.length) await Product.bulkWrite(productUpdates, { ordered: false });

  // eslint-disable-next-line no-console
  console.log('SEED_MAGASINIER_LARGE_DATA_OK', {
    products: products.length,
    entries: entryDocs.length,
    exits: exitDocs.length,
    requests: requestDocs.length,
    fifo_audits: fifoDocs.length,
    history: historyDocs.length,
    prefix: productPrefix,
  });
}

run()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('SEED_MAGASINIER_LARGE_DATA_FAILED', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch (_) {
      // ignore
    }
  });
