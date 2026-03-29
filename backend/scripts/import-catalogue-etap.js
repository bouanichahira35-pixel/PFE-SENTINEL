require('../loadEnv');
const mongoose = require('../db');

const fs = require('fs');
const path = require('path');

const Category = require('../models/Category');
const Product = require('../models/Product');
const User = require('../models/User');
const Sequence = require('../models/Sequence');

function parseCsvLine(line) {
  // Very small CSV parser for ';' with optional quotes.
  const out = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch === ';') {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((v) => String(v || '').trim());
}

async function getNextProductCode() {
  const year = new Date().getFullYear();
  const counterName = `product_code_${year}`;

  const counter = await Sequence.findOneAndUpdate(
    { counter_name: counterName },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true }
  );

  return `PRD-${year}-${String(counter.seq).padStart(4, '0')}`;
}

function normalizeAudiences(raw) {
  const allowed = new Set(['bureautique', 'menage', 'petrole']);
  const list = String(raw || '')
    .split('|')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .filter((v) => allowed.has(v));
  return Array.from(new Set(list));
}

function normalizeFamily(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (['economat', 'produit_chimique', 'gaz', 'consommable_laboratoire'].includes(v)) return v;
  // Default to economat for catalogue items.
  return 'economat';
}

async function run() {
  const argFileIndex = process.argv.findIndex((a) => a === '--file');
  const argFile = argFileIndex >= 0 ? process.argv[argFileIndex + 1] : '';
  const fileName = String(argFile || 'catalogue_produits_petrolier_etap_exemples.csv').trim();
  const csvPath = path.isAbsolute(fileName)
    ? fileName
    : path.join(__dirname, '..', '..', 'docs', fileName);
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV introuvable: ${csvPath}`);
  }

  const responsable = await User.findOne({ role: 'responsable', status: 'active' }).select('_id username role').lean();
  const actorId = responsable?._id || null;

  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  if (lines.length < 2) throw new Error('CSV vide');

  const header = parseCsvLine(lines[0]);
  const idx = (name) => header.indexOf(name);
  const requiredCols = [
    'category_name',
    'category_description',
    'category_audiences',
    'product_name',
    'product_description',
    'family',
    'unite',
    'seuil_minimum',
    'emplacement',
  ];
  for (const c of requiredCols) {
    if (idx(c) < 0) throw new Error(`Colonne manquante: ${c}`);
  }

  let categoriesCreated = 0;
  let categoriesUpdated = 0;
  let productsCreated = 0;
  let productsSkipped = 0;

  for (const line of lines.slice(1)) {
    const row = parseCsvLine(line);
    if (!row.length) continue;

    const categoryName = row[idx('category_name')] || '';
    const categoryDesc = row[idx('category_description')] || '';
    const categoryAudiences = normalizeAudiences(row[idx('category_audiences')]);

    const productName = row[idx('product_name')] || '';
    const productDesc = row[idx('product_description')] || '';
    const family = normalizeFamily(row[idx('family')]);
    const unite = row[idx('unite')] || 'Unite';
    const seuilMin = Number(row[idx('seuil_minimum')] || 0);
    const emplacement = row[idx('emplacement')] || '';

    if (!categoryName || !productName) continue;

    let category = await Category.findOne({ name: categoryName });
    if (!category) {
      category = await Category.create({
        name: categoryName,
        description: categoryDesc,
        audiences: categoryAudiences,
        created_by: actorId || undefined,
      });
      categoriesCreated += 1;
    } else {
      category.description = categoryDesc || category.description || '';
      category.audiences = categoryAudiences;
      await category.save();
      categoriesUpdated += 1;
    }

    const existing = await Product.findOne({ name: productName, category: category._id }).select('_id').lean();
    if (existing) {
      productsSkipped += 1;
      continue;
    }

    const code = await getNextProductCode();
    const qr = `QR-${code}`;
    const payload = {
      code_product: code,
      name: productName,
      description: productDesc,
      category: category._id,
      category_proposal: '',
      family,
      unite,
      emplacement,
      stock_initial_year: 0,
      quantity_current: 0,
      seuil_minimum: Number.isFinite(seuilMin) ? Math.max(0, Math.floor(seuilMin)) : 0,
      status: 'ok',
      qr_code_value: qr,
      created_by: actorId || undefined,
      validated_by: actorId || undefined,
      validation_status: 'approved',
    };

    await Product.create(payload);
    productsCreated += 1;
  }

  // eslint-disable-next-line no-console
  console.log('IMPORT_CATALOGUE_OK', {
    categoriesCreated,
    categoriesUpdated,
    productsCreated,
    productsSkipped,
    csv: path.basename(csvPath),
  });
}

run()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('IMPORT_CATALOGUE_FAILED', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch (_) {
      // ignore
    }
  });
