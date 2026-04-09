require('../loadEnv');

const crypto = require('crypto');
require('../db');
const mongoose = require('mongoose');

const User = require('../models/User');
const Product = require('../models/Product');
const StockExit = require('../models/StockExit');
const History = require('../models/History');

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPastDate(maxDaysAgo = 14) {
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

async function run() {
  const magasinier = await User.findOne({ role: 'magasinier', status: 'active' }).select('_id username').lean();
  const demandeurs = await User.find({ role: 'demandeur', status: 'active' }).select('_id').limit(20).lean();
  if (!magasinier || !demandeurs.length) {
    throw new Error('Aucun magasinier/demandeur actif pour seed anomalies.');
  }

  const products = await Product.find({ validation_status: 'approved' })
    .select('_id name code_product quantity_current seuil_minimum')
    .limit(20)
    .lean();
  if (!products.length) {
    throw new Error('Aucun produit approuve pour seed anomalies.');
  }

  const seedTag = `seed_critical_${new Date().toISOString().slice(0, 10)}`;
  const already = await History.findOne({ correlation_id: { $regex: seedTag } }).select('_id').lean();
  if (already) {
    // eslint-disable-next-line no-console
    console.log('SEED_CRITICAL_ANOMALIES_SKIPPED (already seeded today)');
    return;
  }

  const selected = products.slice(0, 8);
  const exitDocs = [];
  const historyDocs = [];
  const updates = [];
  const stamp = crypto.randomBytes(2).toString('hex').toUpperCase();

  for (let i = 0; i < selected.length; i += 1) {
    const product = selected[i];
    let stock = Number(product.quantity_current || 0);
    const seuil = Number(product.seuil_minimum || 0);

    // 2 normal exits
    for (let j = 0; j < 2; j += 1) {
      const qty = Math.max(1, Math.min(randomInt(2, 8), stock || 8));
      const opDate = randomPastDate(10);
      const exitId = new mongoose.Types.ObjectId();
      exitDocs.push({
        _id: exitId,
        exit_number: `BP-ANOM-${stamp}-${i}-${j}`,
        withdrawal_paper_number: `WP-ANOM-${stamp}-${i}-${j}`,
        product: product._id,
        quantity: qty,
        direction_laboratory: 'DSP',
        beneficiary: 'Equipe Critique',
        demandeur: demandeurs[randomInt(0, demandeurs.length - 1)]._id,
        date_exit: opDate,
        exit_mode: 'manual',
        note: `Sortie normale seed ${qty}`,
        magasinier: magasinier._id,
        canceled: false,
        createdAt: opDate,
        updatedAt: opDate,
      });
      historyDocs.push({
        _id: new mongoose.Types.ObjectId(),
        action_type: 'exit',
        user: magasinier._id,
        product: product._id,
        quantity: qty,
        date_action: opDate,
        source: 'system',
        description: `Sortie normale seed (${qty})`,
        status_after: 'ok',
        actor_role: 'magasinier',
        correlation_id: `${seedTag}_normal_${product.code_product}_${j}`,
      });
      stock -= qty;
    }

    // 1 weird/critical exit (big outlier)
    const anomalyQty = Math.max(12, Math.min(Math.max(stock, 0), randomInt(18, 45)));
    const anomalyDate = randomPastDate(6);
    const anomalyExitId = new mongoose.Types.ObjectId();
    exitDocs.push({
      _id: anomalyExitId,
      exit_number: `BP-ANOM-${stamp}-${i}-X`,
      withdrawal_paper_number: `WP-ANOM-${stamp}-${i}-X`,
      product: product._id,
      quantity: anomalyQty,
      direction_laboratory: 'DSP',
      beneficiary: 'Equipe Urgence',
      demandeur: demandeurs[randomInt(0, demandeurs.length - 1)]._id,
      date_exit: anomalyDate,
      exit_mode: 'manual',
      note: `Sortie anormale seed ${anomalyQty}`,
      magasinier: magasinier._id,
      canceled: false,
      createdAt: anomalyDate,
      updatedAt: anomalyDate,
    });
    historyDocs.push({
      _id: new mongoose.Types.ObjectId(),
      action_type: 'exit',
      user: magasinier._id,
      product: product._id,
      quantity: anomalyQty,
      date_action: anomalyDate,
      source: 'system',
      description: `Sortie anormale seed (${anomalyQty})`,
      status_after: 'ok',
      actor_role: 'magasinier',
      correlation_id: `${seedTag}_anomaly_${product.code_product}`,
    });
    stock -= anomalyQty;

    // Force a couple of products below seuil for rupture alerts.
    if (i < 2) stock = Math.max(0, Math.min(stock, seuil - 1));

    const nextStatus = computeProductStatus(stock, seuil);
    updates.push({
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

  if (exitDocs.length) await StockExit.insertMany(exitDocs, { ordered: false });
  if (historyDocs.length) await History.insertMany(historyDocs, { ordered: false });
  if (updates.length) await Product.bulkWrite(updates, { ordered: false });

  // eslint-disable-next-line no-console
  console.log('SEED_CRITICAL_ANOMALIES_OK', {
    exits: exitDocs.length,
    history: historyDocs.length,
    products: selected.length,
  });
}

run()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('SEED_CRITICAL_ANOMALIES_FAILED', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch (_) {
      // ignore
    }
  });
