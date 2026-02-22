const router = require('express').Router();
const Product = require('../models/Product');
const Category = require('../models/Category');
const Sequence = require('../models/Sequence');
const User = require('../models/User');
const Notification = require('../models/Notification');
const requireAuth = require('../middlewares/requireAuth');
const requirePermission = require('../middlewares/requirePermission');
const strictBody = require('../middlewares/strictBody');
const { PERMISSIONS } = require('../constants/permissions');
const History = require('../models/History');
const { logSecurityEvent } = require('../services/securityAuditService');
const { enqueueMail } = require('../services/mailQueueService');
const { getUserPreferences, canSendNotificationEmail } = require('../services/userPreferencesService');
const {
  asDate,
  asNonNegativeNumber,
  asOptionalString,
  asTrimmedString,
  isBlank,
  isValidObjectIdLike,
} = require('../utils/validation');

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
    // Compat legacy: old "informatique" inputs are remapped to a business family.
    'consommable informatique': 'consommable_laboratoire',
    consommable_informatique: 'consommable_laboratoire',
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

async function notifyCreatorOnValidationDecision(product, actorUser, fromStatus, toStatus) {
  try {
    if (!product?.created_by) return;
    const creator = await User.findById(product.created_by).select('_id email username role status').lean();
    if (!creator || creator.status !== 'active') return;

    const statusLabel = toStatus === 'approved' ? 'VALIDE' : 'REJETE';
    const actorName = actorUser?.username || 'responsable';
    const subject = `Produit ${statusLabel}: ${product.name}`;
    const text = `Votre produit ${product.name} (${product.code_product}) a ete ${statusLabel.toLowerCase()} par ${actorName}.`;

    await Notification.create({
      user: creator._id,
      title: subject,
      message: text,
      type: toStatus === 'approved' ? 'info' : 'warning',
      is_read: false,
    });

    if (!creator.email) return;
    const creatorPrefs = await getUserPreferences(creator._id);
    const creatorCategory = creator.role === 'magasinier' ? 'demandes' : 'generic';
    if (!canSendNotificationEmail(creatorPrefs, creatorCategory)) return;
    try {
      await enqueueMail({
        kind: 'product_validation',
        role: creator.role,
        to: creator.email,
        subject,
        text,
        html: `<p>${text}</p>`,
        job_id: `product_validation_${product._id}_${toStatus}_${Date.now()}`,
      });
      await logSecurityEvent({
        event_type: 'email_sent',
        user: creator._id,
        email: creator.email,
        role: creator.role,
        success: true,
        details: `Product validation email sent (${fromStatus} -> ${toStatus})`,
        after: { product_id: product._id, product_code: product.code_product, validation_status: toStatus },
      });
    } catch {
      await logSecurityEvent({
        event_type: 'email_failed',
        user: creator._id,
        email: creator.email,
        role: creator.role,
        success: false,
        details: `Product validation email failed (${fromStatus} -> ${toStatus})`,
        after: { product_id: product._id, product_code: product.code_product, validation_status: toStatus },
      });
    }
  } catch {
    // Keep validation resilient.
  }
}

async function notifyResponsablesOnPendingValidation(product, creatorUser) {
  try {
    if (!product?._id) return;
    if (String(product.validation_status || '') !== 'pending') return;

    const responsables = await User.find({ role: 'responsable', status: 'active' })
      .select('_id email username role')
      .lean();
    if (!responsables.length) return;

    const subject = `Produit soumis en attente de validation: ${product.name}`;
    const creatorName = creatorUser?.username || 'magasinier';
    const text = `Le produit ${product.name} (${product.code_product}) a ete soumis par ${creatorName} et attend votre validation.`;

    await Notification.insertMany(
      responsables.map((r) => ({
        user: r._id,
        title: subject,
        message: text,
        type: 'info',
        is_read: false,
      }))
    );

    for (const r of responsables) {
      if (!r.email) continue;
      try {
        const prefs = await getUserPreferences(r._id);
        if (!canSendNotificationEmail(prefs, 'demandes')) continue;
        await enqueueMail({
          kind: 'product_pending_validation',
          role: r.role,
          to: r.email,
          subject,
          text,
          html: `<p>${text}</p>`,
          job_id: `product_pending_${product._id}_${r._id}_${Date.now()}`,
        });
      } catch {
        // keep flow resilient
      }
    }
  } catch {
    // keep product creation resilient
  }
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
      .populate('created_by', 'username email role')
      .populate('validated_by', 'username email role')
      .sort({ createdAt: -1 });

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

router.get('/qr-check', requireAuth, async (req, res) => {
  try {
    const value = asOptionalString(req.query?.value);
    const excludeId = asOptionalString(req.query?.exclude_id);

    if (!value) {
      return res.status(400).json({ error: 'value query param obligatoire' });
    }

    const filter = { qr_code_value: value };
    if (excludeId && isValidObjectIdLike(excludeId)) {
      filter._id = { $ne: excludeId };
    }

    const existing = await Product.findOne(filter).select('_id code_product name validation_status');
    return res.json({
      exists: Boolean(existing),
      product: existing || null,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to check qr code', details: err.message });
  }
});

router.post(
  '/',
  requireAuth,
  requirePermission(PERMISSIONS.PRODUCT_CREATE),
  strictBody([
    'code_product',
    'name',
    'description',
    'category',
    'category_name',
    'family',
    'emplacement',
    'stock_initial_year',
    'chemical_class',
    'physical_state',
    'fds_attachment',
    'gas_pressure',
    'gas_purity',
    'quantity_current',
    'seuil_minimum',
    'qr_code_value',
    'image_product',
    'validation_status',
  ]),
  async (req, res) => {
  try {
    const errors = [];
    const family = normalizeFamily(req.body.family);
    if (!family) {
      errors.push('family invalide (economat, produit_chimique, gaz, consommable_laboratoire)');
    }
    const name = asTrimmedString(req.body.name);
    if (!name) errors.push('name obligatoire');
    const qrCodeValue = asOptionalString(req.body.qr_code_value);
    if (!qrCodeValue) errors.push('qr_code_value obligatoire');

    if (req.body.category && !isValidObjectIdLike(req.body.category)) {
      errors.push('category doit etre un ObjectId valide');
    }

    const quantityCurrent = asNonNegativeNumber(req.body.quantity_current);
    if (Number.isNaN(quantityCurrent)) errors.push('quantity_current doit etre un nombre >= 0');

    const seuilMinimum = asNonNegativeNumber(req.body.seuil_minimum);
    if (Number.isNaN(seuilMinimum)) errors.push('seuil_minimum doit etre un nombre >= 0');

    const stockInitial = asNonNegativeNumber(req.body.stock_initial_year);
    if (Number.isNaN(stockInitial)) errors.push('stock_initial_year doit etre un nombre >= 0');

    if (!req.body.category && isBlank(req.body.category_name)) {
      errors.push('category ou category_name obligatoire');
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const category = await getOrCreateCategory({
      categoryId: req.body.category,
      categoryName: req.body.category_name,
      userId: req.user.id,
    });

    if (!category) return res.status(400).json({ error: 'category invalide' });

    const existingQr = await Product.findOne({ qr_code_value: qrCodeValue }).select('_id code_product name');
    if (existingQr) {
      return res.status(409).json({
        error: 'QR code deja utilise',
        details: {
          product_id: existingQr._id,
          code_product: existingQr.code_product,
          name: existingQr.name,
        },
      });
    }

    const payload = {
      code_product: req.body.code_product || (await getNextProductCode()),
      name,
      description: asOptionalString(req.body.description),
      category: category._id,
      family,
      emplacement: asOptionalString(req.body.emplacement),
      stock_initial_year: stockInitial ?? 0,
      chemical_class: asOptionalString(req.body.chemical_class),
      physical_state: asOptionalString(req.body.physical_state),
      fds_attachment: req.body.fds_attachment,
      gas_pressure: asOptionalString(req.body.gas_pressure),
      gas_purity: asOptionalString(req.body.gas_purity),
      quantity_current: quantityCurrent ?? 0,
      seuil_minimum: seuilMinimum ?? 0,
      status: computeStatus(quantityCurrent ?? 0, seuilMinimum ?? 0),
      qr_code_value: qrCodeValue,
      image_product: asOptionalString(req.body.image_product),
      created_by: req.user.id,
      validation_status:
        req.user.role === 'responsable'
          ? (req.body.validation_status || 'approved')
          : 'pending',
    };

    const item = await Product.create(payload);
    await History.create({
      action_type: 'product_create',
      user: req.user.id,
      product: item._id,
      quantity: Number(item.quantity_current || 0),
      source: 'ui',
      description: `Produit cree (${item.code_product})`,
      status_after: item.validation_status,
      actor_role: req.user.role,
      tags: ['product', 'create'],
      context: {
        seuil_minimum: Number(item.seuil_minimum || 0),
        family: item.family,
        category: String(item.category),
      },
    });
    if (item.validation_status === 'pending') {
      await notifyResponsablesOnPendingValidation(item, req.user);
    }
    res.status(201).json(item);
  } catch (err) {
    if (err?.code === 11000 && err?.keyPattern?.qr_code_value) {
      return res.status(409).json({ error: 'QR code deja utilise' });
    }
    res.status(400).json({ error: 'Failed to create product', details: err.message });
  }
});

router.patch(
  '/:id/validation',
  requireAuth,
  requirePermission(PERMISSIONS.PRODUCT_VALIDATE),
  strictBody(['validation_status']),
  async (req, res) => {
    try {
      if (!isValidObjectIdLike(req.params.id)) {
        return res.status(400).json({ error: 'product id invalide' });
      }

      const status = String(req.body?.validation_status || '').trim();
      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'validation_status doit etre approved ou rejected' });
      }

      const product = await Product.findById(req.params.id);
      if (!product) return res.status(404).json({ error: 'Product not found' });

      const before = product.validation_status;
      product.validation_status = status;
      product.validated_by = req.user.id;
      await product.save();

      await History.create({
        action_type: 'validation',
        user: req.user.id,
        product: product._id,
        source: 'ui',
        description: `Validation produit: ${before} -> ${status}`,
      });
      await notifyCreatorOnValidationDecision(product, req.user, before, status);

      return res.json(product);
    } catch (err) {
      return res.status(400).json({ error: 'Failed to update validation', details: err.message });
    }
  }
);

router.put(
  '/:id',
  requireAuth,
  requirePermission(PERMISSIONS.PRODUCT_UPDATE),
  strictBody([
    'name',
    'description',
    'category',
    'category_name',
    'family',
    'emplacement',
    'stock_initial_year',
    'chemical_class',
    'physical_state',
    'fds_attachment',
    'gas_pressure',
    'gas_purity',
    'quantity_current',
    'seuil_minimum',
    'qr_code_value',
    'image_product',
    'validation_status',
    'expiry_date',
  ]),
  async (req, res) => {
  try {
    const errors = [];
    if (!isValidObjectIdLike(req.params.id)) {
      return res.status(400).json({ error: 'product id invalide' });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const beforeSnapshot = {
      name: product.name,
      seuil_minimum: Number(product.seuil_minimum || 0),
      quantity_current: Number(product.quantity_current || 0),
      validation_status: product.validation_status,
    };

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
      if (req.body[field] === undefined) return;

      if (field === 'name') {
        const value = asTrimmedString(req.body.name);
        if (!value) errors.push('name ne peut pas etre vide');
        else product.name = value;
        return;
      }

      if (field === 'quantity_current' || field === 'seuil_minimum' || field === 'stock_initial_year') {
        const n = asNonNegativeNumber(req.body[field]);
        if (Number.isNaN(n)) errors.push(`${field} doit etre un nombre >= 0`);
        else product[field] = n;
        return;
      }

      if (field === 'qr_code_value') {
        product[field] = asOptionalString(req.body[field]);
        return;
      }

      product[field] = req.body[field];
    });

    if (req.body.expiry_date !== undefined) {
      const d = asDate(req.body.expiry_date);
      if (d === null) errors.push('expiry_date invalide');
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    if (!product.qr_code_value) {
      return res.status(400).json({ error: 'qr_code_value obligatoire' });
    }

    const duplicateQr = await Product.findOne({
      _id: { $ne: product._id },
      qr_code_value: product.qr_code_value,
    }).select('_id code_product name');
    if (duplicateQr) {
      return res.status(409).json({
        error: 'QR code deja utilise',
        details: {
          product_id: duplicateQr._id,
          code_product: duplicateQr.code_product,
          name: duplicateQr.name,
        },
      });
    }

    product.status = computeStatus(product.quantity_current, product.seuil_minimum);

    await product.save();
    await History.create({
      action_type: 'product_update',
      user: req.user.id,
      product: product._id,
      quantity: Number(product.quantity_current || 0),
      source: 'ui',
      description: `Produit modifie (${product.code_product})`,
      status_before: beforeSnapshot.validation_status,
      status_after: product.validation_status,
      actor_role: req.user.role,
      tags: ['product', 'update'],
      context: {
        before: beforeSnapshot,
        after: {
          name: product.name,
          seuil_minimum: Number(product.seuil_minimum || 0),
          quantity_current: Number(product.quantity_current || 0),
          validation_status: product.validation_status,
        },
      },
    });
    res.json(product);
  } catch (err) {
    if (err?.code === 11000 && err?.keyPattern?.qr_code_value) {
      return res.status(409).json({ error: 'QR code deja utilise' });
    }
    res.status(400).json({ error: 'Failed to update product', details: err.message });
  }
});

module.exports = router;
