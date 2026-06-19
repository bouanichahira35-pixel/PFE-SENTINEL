require('../loadEnv');

const mongoose = require('../db');
const User = require('../models/User');
const Product = require('../models/Product');
const Request = require('../models/Request');
const StockEntry = require('../models/StockEntry');
const StockExit = require('../models/StockExit');
const History = require('../models/History');
const FifoScanAudit = require('../models/FifoScanAudit');
const { Inventory } = require('../models/Inventory');
const InventoryLine = require('../models/InventoryLine');

const generatedProductCode = /^(SEED|ECO-HUM|CHM-HUM|GAZ-HUM|LAB-HUM|INF-HUM|EPI-CSK|LAB-GNT|ELE-CAB|MEC-FIL|MEC-JOI|SEC-EXT|BUR-A4|CHM-ABS)-/;
const generatedUserEmail = /(example\.local|pfe\.local|sentinel\.local|test\.com)$/i;
const generatedUserName = /(_demo|_seed_|^demandeur1$|^responsable_demo$|^magasinier_demo$|^nadia_responsable_stock$|^sofiene_magasin_central$)/i;
const generatedText = /(Produit Seed|Entree seed|Sortie seed|Sortie anormale seed|Sortie normale seed|produit de test genere|catalogue humanise|humanized catalogue)/i;
const generatedCorrelation = /^(seed_|humanized_catalogue_)/i;

async function run() {
  const ready = await mongoose.waitForMongoReady({ timeoutMs: 15_000 });
  if (!ready.ok) throw new Error(`Mongo indisponible: ${ready.reason}`);

  const products = await Product.find({
    $or: [
      { code_product: generatedProductCode },
      { name: generatedText },
      { description: generatedText },
    ],
  }).select('_id code_product name').lean();
  const productIds = products.map((product) => product._id);

  const inventories = await Inventory.find({ reference: /^INV-DEMO-/ }).select('_id reference').lean();
  const inventoryIds = inventories.map((inventory) => inventory._id);

  const report = {
    inventoryLines: inventoryIds.length ? (await InventoryLine.deleteMany({ inventory_id: { $in: inventoryIds } })).deletedCount : 0,
    inventories: (await Inventory.deleteMany({ reference: /^INV-DEMO-/ })).deletedCount,
    stockEntries: (await StockEntry.deleteMany({
      $or: [
        { product: { $in: productIds } },
        { entry_number: /^(BE-HUM|BE-\d{4}-\d|BE-ANOM)/ },
        { commercial_name: generatedText },
        { observation: generatedText },
      ],
    })).deletedCount,
    stockExits: (await StockExit.deleteMany({
      $or: [
        { product: { $in: productIds } },
        { exit_number: /^(BP-HUM|BP-\d{4}-\d|BP-ANOM)/ },
        { note: generatedText },
      ],
    })).deletedCount,
    requests: (await Request.deleteMany({
      $or: [
        { product: { $in: productIds } },
        { note: generatedText },
      ],
    })).deletedCount,
    history: 0,
    historyPreserved: await History.countDocuments({
      $or: [
        { product: { $in: productIds } },
        { correlation_id: generatedCorrelation },
        { description: generatedText },
      ],
    }),
    fifoAudits: (await FifoScanAudit.deleteMany({
      $or: [
        { product: { $in: productIds } },
        { product_code: generatedProductCode },
      ],
    })).deletedCount,
    products: productIds.length ? (await Product.deleteMany({ _id: { $in: productIds } })).deletedCount : 0,
    users: (await User.deleteMany({
      $or: [
        { email: generatedUserEmail },
        { username: generatedUserName },
      ],
    })).deletedCount,
  };

  // eslint-disable-next-line no-console
  console.log('CLEANUP_DEMO_DATA_OK', report);
}

run()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('CLEANUP_DEMO_DATA_FAILED', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch (_) {
      // ignore
    }
  });
