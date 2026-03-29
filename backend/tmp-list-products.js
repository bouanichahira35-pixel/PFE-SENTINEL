require('./loadEnv');
const mongoose = require('./db');
const Product = require('./models/Product');

async function main() {
  const rawLimit = Number(process.argv[2] || 50);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(500, Math.floor(rawLimit))) : 50;

  const products = await Product.find({})
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select('code_product name quantity seuil family category validation_status createdAt updatedAt')
    .lean();

  process.stdout.write(`${JSON.stringify(products, null, 2)}\n`);
}

main()
  .catch((err) => {
    console.error('FAILED_TO_LIST_PRODUCTS', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch (_) {
      // ignore
    }
  });

