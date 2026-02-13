const router = require('express').Router();
const Product = require('../models/Product');
const Category = require('../models/Category');
const Sequence = require('../models/Sequence');
const requireAuth = require('../middlewares/requireAuth');
const requireRole = require('../middlewares/requireRole');

function computeStatus(quantity, seuil) {
  const q = Number(quantity || 0);
  const s = Number(seuil || 0);
  if (q <= 0) return 'rupture';
  if (q <= s) return 'sous_seuil';
  return 'ok';
}

function normalizeFamily(value) {
  if (!value) return null;

  const map = {
    economat: 'economat',
    'produit chimique': 'produit_chimique',
    produit_chimique: 'produit_chimique',
    gaz: 'gaz',
    'consommable informatique': 'consommable_informatique',
    consommable_informatique: 'consommable_informatique',
    'consommable laboratoire': 'consommable_laboratoire',
    consommable_laboratoire: 'consommable_laboratoire',
  };

  const key = String(value).trim().toLowerCase();
  return map[key] || null;
}

async function getOrCreateCategory({ categoryId, categoryName, userId }) {
  if (categoryId) {
    const category = await Category.findById(categoryId);
    if (category) return category;
    return null;
  }

  if (!categoryName) return null;

  const normalizedName = String(categoryName).trim();
  if (!normalizedName) return null;

  const existing = await Category.findOne({ name: normalizedName });
  if (existing) return existing;

  return Category.create({
    name: normalizedName,
    description: `${normalizedName} (cree automatiquement)`,
    created_by: userId,
  });
}

async function getNextProductCode() {
  const year = new Date().getFullYear();
  const counterName = `product_code_${year}`;

  const counter = await Sequence.findOneAndUpdate(
    { counter_name: counterName },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  return `PRD-${year}-${String(counter.seq).padStart(4, '0')}`;
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const filter = {};

    if (req.query.family) {
      const family = normalizeFamily(req.query.family);
      if (family) filter.family = family;
    }

    if (req.query.validation_status) {
      filter.validation_status = req.query.validation_status;
    }

    if (req.query.category) {
      filter.category = req.query.category;
    }

    const items = await Product.find(filter)
      .populate('category')
      .sort({ createdAt: -1 });

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

router.post('/', requireAuth, requireRole('magasinier', 'responsable'), async (req, res) => {
  try {
    const family = normalizeFamily(req.body.family);
    if (!family) {
      return res.status(400).json({ error: 'family invalide (economat, produit_chimique, gaz, consommable_informatique, consommable_laboratoire)' });
    }

    const category = await getOrCreateCategory({
      categoryId: req.body.category,
      categoryName: req.body.category_name,
      userId: req.user.id,
    });

    if (!category) {
      return res.status(400).json({ error: 'category ou category_name obligatoire' });
    }

    const quantityCurrent = Number(req.body.quantity_current || 0);
    const seuilMinimum = Number(req.body.seuil_minimum || 0);

    const payload = {
      code_product: req.body.code_product || (await getNextProductCode()),
      name: req.body.name,
      description: req.body.description,
      category: category._id,
      family,
      emplacement: req.body.emplacement,
      stock_initial_year: Number(req.body.stock_initial_year || 0),
      chemical_class: req.body.chemical_class,
      physical_state: req.body.physical_state,
      fds_attachment: req.body.fds_attachment,
      gas_pressure: req.body.gas_pressure,
      gas_purity: req.body.gas_purity,
      quantity_current: quantityCurrent,
      seuil_minimum: seuilMinimum,
      status: computeStatus(quantityCurrent, seuilMinimum),
      qr_code_value: req.body.qr_code_value,
      image_product: req.body.image_product,
      created_by: req.user.id,
      validation_status: req.body.validation_status || 'pending',
    };

    if (!payload.name) {
      return res.status(400).json({ error: 'name obligatoire' });
    }

    const item = await Product.create(payload);
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create product', details: err.message });
  }
});

router.put('/:id', requireAuth, requireRole('magasinier', 'responsable'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (req.body.family) {
      const family = normalizeFamily(req.body.family);
      if (!family) return res.status(400).json({ error: 'family invalide' });
      product.family = family;
    }

    if (req.body.category || req.body.category_name) {
      const category = await getOrCreateCategory({
        categoryId: req.body.category,
        categoryName: req.body.category_name,
        userId: req.user.id,
      });
      if (!category) return res.status(400).json({ error: 'category invalide' });
      product.category = category._id;
    }

    const editableFields = [
      'name',
      'description',
      'emplacement',
      'stock_initial_year',
      'chemical_class',
      'physical_state',
      'fds_attachment',
      'gas_pressure',
      'gas_purity',
      'qr_code_value',
      'image_product',
      'validation_status',
      'seuil_minimum',
      'quantity_current',
    ];

    editableFields.forEach((field) => {
      if (req.body[field] !== undefined) product[field] = req.body[field];
    });

    product.status = computeStatus(product.quantity_current, product.seuil_minimum);

    await product.save();
    res.json(product);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update product', details: err.message });
  }
});

module.exports = router;
