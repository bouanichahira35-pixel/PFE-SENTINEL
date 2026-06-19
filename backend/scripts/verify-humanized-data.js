require('../loadEnv');

const mongoose = require('../db');
const User = require('../models/User');
const Product = require('../models/Product');
const StockEntry = require('../models/StockEntry');
const StockExit = require('../models/StockExit');

async function run() {
  const ready = await mongoose.waitForMongoReady({ timeoutMs: 15_000 });
  if (!ready.ok) throw new Error(`Mongo indisponible: ${ready.reason}`);

  const report = {
    localUsers: await User.countDocuments({ email: /(example\.local|pfe\.local|sentinel\.local|test\.com)$/i }),
    seedProducts: await Product.countDocuments({
      $or: [
        { code_product: /^SEED/ },
        { name: /Produit Seed/i },
      ],
    }),
    humanProducts: await Product.countDocuments({ code_product: /^(ECO|CHM|GAZ|LAB|INF)-HUM-/ }),
    humanEntries: await StockEntry.countDocuments({ entry_number: /^BE-HUM-/ }),
    humanExits: await StockExit.countDocuments({ exit_number: /^BP-HUM-/ }),
  };

  // eslint-disable-next-line no-console
  console.log('VERIFY_HUMANIZED_DATA_OK', report);

  if (report.localUsers !== 0 || report.seedProducts !== 0) {
    throw new Error('Des donnees demo anciennes restent visibles.');
  }
}

run()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('VERIFY_HUMANIZED_DATA_FAILED', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch (_) {
      // ignore
    }
  });
