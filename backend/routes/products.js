// BLOC 1 - Routeur des produits.
// Ce fichier gere le catalogue produits: liste, recherche, creation, modification et archivage.
const router = require('express').Router();
const Product = require('../models/Product');
const Category = require('../models/Category');
const Sequence = require('../models/Sequence');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Request = require('../models/Request');
const StockEntry = require('../models/StockEntry');
const StockExit = require('../models/StockExit');
const StockLot = require('../models/StockLot');
const PurchaseOrder = require('../models/PurchaseOrder');
const SupplierProduct = require('../models/SupplierProduct');
const Supplier = require('../models/Supplier');
const requireAuth = require('../middlewares/requireAuth');
const requirePermission = require('../middlewares/requirePermission');
const strictBody = require('../middlewares/strictBody');
const { PERMISSIONS } = require('../constants/permissions');
const History = require('../models/History');
const { enqueueMail } = require('../services/mailQueueService');
const { getUserPreferences, canSendNotificationEmail } = require('../services/userPreferencesService');
const { getStockRulesConfig } = require('../services/stockRulesService');
const {
  asDate,
  asNonNegativeNumber,
  asOptionalString,
  asTrimmedString,
  isBlank,
  isValidObjectIdLike,
  normalizeEmail,
  isValidEmail,
  isSafeText,
} = require('../utils/validation');

// BLOC 2 - Fonctions metier des produits.
// Elles calculent le statut stock, normalisent la famille et preparent les categories.
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

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function notifyResponsablesAboutProduct({ product, actorUser, title, message, type = 'info', emailKind }) {
  try {
    if (!product?._id) return;

    const responsables = await User.find({ role: 'responsable', status: 'active' })
      .select('_id email username role')
      .lean();
    if (!responsables.length) return;

    const actorId = String(actorUser?.id || actorUser?._id || '');
    const targets = responsables.filter((r) => String(r._id) !== actorId);
    if (!targets.length) return;

    await Notification.insertMany(
      targets.map((r) => ({
        user: r._id,
        title,
        message,
        type,
        is_read: false,
        event_type: emailKind,
      }))
    );

    for (const r of targets) {
      if (!r.email) continue;
      try {
        const prefs = await getUserPreferences(r._id);
        if (!canSendNotificationEmail(prefs, 'catalogue')) continue;
        await enqueueMail({
          kind: emailKind,
          role: r.role,
          to: r.email,
          subject: title,
          text: message,
          html: `<pre style="font-family:monospace;white-space:pre-wrap;">${escapeHtml(message)}</pre>`,
          job_id: `${emailKind}_${product._id}_${r._id}_${Date.now()}`,
        });
      } catch {
        // best-effort
      }
    }
  } catch {
    // best-effort
  }
}

async function notifyResponsablesOnNewProduct(product, creatorUser) {
  const creatorName = creatorUser?.username || creatorUser?.email || 'magasinier';
  const title = `Nouveau produit ajoute au catalogue: ${product.name || 'Produit'}`;
  const message = [
    `Produit: ${product.name || 'Produit'}`,
    product.code_product ? `Code: ${product.code_product}` : null,
    `Ajoute par: ${creatorName}`,
    product.family ? `Famille: ${product.family}` : null,
    product.unite ? `Unite: ${product.unite}` : null,
    Number.isFinite(Number(product.quantity_current)) ? `Quantite initiale: ${Number(product.quantity_current)}` : null,
    Number.isFinite(Number(product.seuil_minimum)) ? `Seuil minimum: ${Number(product.seuil_minimum)}` : null,
  ].filter(Boolean).join('\n');

  await notifyResponsablesAboutProduct({
    product,
    actorUser: creatorUser,
    title,
    message,
    type: 'info',
    emailKind: 'product_created',
  });
}

async function notifyResponsablesOnArchivedProduct(product, actorUser) {
  const actorName = actorUser?.username || actorUser?.email || 'responsable';
  const title = `Produit archive: ${product.name || 'Produit'}`;
  const message = [
    `Produit: ${product.name || 'Produit'}`,
    product.code_product ? `Code: ${product.code_product}` : null,
    `Archive par: ${actorName}`,
    product.archived_reason ? `Motif: ${product.archived_reason}` : null,
  ].filter(Boolean).join('\n');

  await notifyResponsablesAboutProduct({
    product,
    actorUser,
    title,
    message,
    type: 'warning',
    emailKind: 'product_archived',
  });
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

function isValidProductCode(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  const upper = raw.toUpperCase();
  // Pragmatic code: letters/digits + separators, 3-40 chars.
  return /^[A-Z0-9][A-Z0-9._-]{2,39}$/.test(upper);
}

function normalizeProductCode(value) {
  const raw = String(value || '').trim();
  return raw ? raw.toUpperCase() : '';
}

function sanitizeFdsAttachment(value, errors) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'object') {
    errors.push('fds_attachment invalide (objet attendu)');
    return null;
  }
  const fileName = asOptionalString(value.file_name);
  const fileUrl = asOptionalString(value.file_url);
  if (!fileName || !isSafeText(fileName, { min: 1, max: 140 })) {
    errors.push('fds_attachment.file_name invalide');
  }
  if (!fileUrl || !isSafeText(fileUrl, { min: 1, max: 220 }) || !String(fileUrl).startsWith('/api/files/download/')) {
    errors.push('fds_attachment.file_url invalide');
  }
  if (errors.length) return null;
  return { file_name: fileName, file_url: fileUrl };
}

// BLOC 3 - Liste des produits.
// GET /api/products renvoie les produits visibles selon le role, la famille, la categorie et le cycle de vie.
router.get('/', requireAuth, async (req, res) => { 
  try { 
    const filter = {}; 
    const isDemandeur = req.user?.role === 'demandeur';
    const demandeurProfile = String(req.user?.demandeur_profile || 'bureautique');
    const archivedOnly = String(req.query?.archived_only || '') === '1' && !isDemandeur;
    const includeArchived = (String(req.query?.include_archived || '') === '1' || archivedOnly) && !isDemandeur;
 
    if (req.query.family) { 
      const family = normalizeFamily(req.query.family); 
      if (family) filter.family = family; 
    } 
 
    if (req.query.validation_status && !isDemandeur) { 
      filter.validation_status = req.query.validation_status; 
    }

    if (archivedOnly) {
      filter.lifecycle_status = 'archived';
    } else if (!includeArchived) {
      filter.lifecycle_status = 'active';
    }
  
    if (isDemandeur) {
      // Cahier de charge: un produit cree est utilisable immediatement.
      // On conserve le filtrage par categories autorisees (audiences) mais on ne bloque plus sur validation_status.
      filter.lifecycle_status = 'active';
      const allowedCategories = await Category.find({
        $or: [{ audiences: { $size: 0 } }, { audiences: demandeurProfile }],
      })
        .select('_id')
        .lean();

      const allowedIds = allowedCategories.map((c) => String(c._id));
      if (!allowedIds.length) {
        return res.json([]);
      }

      if (req.query.category) {
        const requested = String(req.query.category);
        if (!allowedIds.includes(requested)) {
          return res.json([]);
        }
        filter.category = requested;
      } else {
        filter.category = { $in: allowedIds };
      }
    } else if (req.query.category) { 
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

// GET /api/products/lookup?code=PRD-2026-0001
// Lightweight product lookup for scanning/saisie terrain (magasinier forms).
// BLOC 4 - Recherche rapide produit.
// GET /api/products/lookup sert surtout au scan QR ou a la saisie terrain.
router.get('/lookup', requireAuth, async (req, res) => {
  try {
    const isDemandeur = req.user?.role === 'demandeur';
    const raw = asTrimmedString(req.query?.code);
    if (!raw) return res.status(400).json({ error: 'code requis' });

    if (!isSafeText(raw, { min: 1, max: 220 })) {
      return res.status(400).json({ error: 'code invalide' });
    }

    const archivedOnly = String(req.query?.archived_only || '') === '1' && !isDemandeur;
    const includeArchived = (String(req.query?.include_archived || '') === '1' || archivedOnly) && !isDemandeur;

    const normalized = isValidProductCode(raw) ? normalizeProductCode(raw) : null;
    const or = [];
    if (normalized) or.push({ code_product: normalized });
    // Some scanners return QR payloads or imported external ids.
    or.push({ qr_code_value: raw });
    or.push({ external_product_id: raw });

    const filter = { $or: or };
    if (archivedOnly) filter.lifecycle_status = 'archived';
    else if (!includeArchived) filter.lifecycle_status = 'active';
    if (isDemandeur) filter.lifecycle_status = 'active';

    const product = await Product.findOne(filter)
      .populate('category', 'name')
      .select('_id code_product name family unite emplacement quantity_current seuil_minimum status lifecycle_status qr_code_value image_product')
      .lean();

    if (!product) return res.status(404).json({ error: 'Produit introuvable' });

    return res.json({
      ok: true,
      product,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Lookup failed' });
  }
});

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/products/catalog?q=...&category=...&status=ok|sous_seuil|rupture&page=1&limit=20
// Paginated, lightweight catalogue endpoint (UI friendly).
// BLOC 5 - Catalogue simplifie.
// GET /api/products/catalog donne une version plus legere pour les listes et selections.
router.get('/catalog', requireAuth, async (req, res) => {
  try {
    const filterBase = {};
    const isDemandeur = req.user?.role === 'demandeur';
    const demandeurProfile = String(req.user?.demandeur_profile || 'bureautique');
    const archivedOnly = String(req.query?.archived_only || '') === '1' && !isDemandeur;
    const includeArchived = (String(req.query?.include_archived || '') === '1' || archivedOnly) && !isDemandeur;

    if (req.query.family) {
      const family = normalizeFamily(req.query.family);
      if (family) filterBase.family = family;
    }

    if (req.query.validation_status && !isDemandeur) {
      filterBase.validation_status = req.query.validation_status;
    }

    if (archivedOnly) {
      filterBase.lifecycle_status = 'archived';
    } else if (!includeArchived) {
      filterBase.lifecycle_status = 'active';
    }

    if (isDemandeur) {
      filterBase.lifecycle_status = 'active';
      const allowedCategories = await Category.find({
        $or: [{ audiences: { $size: 0 } }, { audiences: demandeurProfile }],
      })
        .select('_id')
        .lean();

      const allowedIds = allowedCategories.map((c) => String(c._id));
      if (!allowedIds.length) {
        return res.json({ ok: true, page: 1, limit: 0, total: 0, items: [] });
      }

      if (req.query.category) {
        const requested = String(req.query.category);
        if (!allowedIds.includes(requested)) {
          return res.json({ ok: true, page: 1, limit: 0, total: 0, items: [] });
        }
        filterBase.category = requested;
      } else {
        filterBase.category = { $in: allowedIds };
      }
    } else if (req.query.category && isValidObjectIdLike(req.query.category)) {
      filterBase.category = String(req.query.category);
    }

    const q = asTrimmedString(req.query?.q);
    if (q && isSafeText(q, { min: 1, max: 80 })) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filterBase.$or = [
        { code_product: rx },
        { name: rx },
      ];
    }

    const filter = { ...filterBase };

    const status = asOptionalString(req.query?.status);
    if (status === 'rupture') {
      filter.quantity_current = { $lte: 0 };
    } else if (status === 'sous_seuil') {
      filter.quantity_current = { $gt: 0 };
      filter.$expr = { $lte: ['$quantity_current', '$seuil_minimum'] };
    } else if (status === 'ok') {
      filter.$expr = { $gt: ['$quantity_current', '$seuil_minimum'] };
    }

    // Optional: near-threshold products (still OK but close to minimum threshold).
    // Used by dashboards to find "next" risks without loading full catalogue.
    const nearThreshold = String(req.query?.near_threshold || '') === '1';
    if (nearThreshold) {
      const ratio = Math.max(1.05, Math.min(2.5, Number(asNonNegativeNumber(req.query?.ratio) || 1.2)));
      filter.quantity_current = { $gt: 0 };
      filter.$expr = {
        $and: [
          { $gt: ['$quantity_current', '$seuil_minimum'] },
          { $lte: ['$quantity_current', { $multiply: ['$seuil_minimum', ratio] }] },
        ],
      };
    }

    const page = Math.max(1, Math.min(500, Math.floor(asNonNegativeNumber(req.query?.page) || 1)));
    const limit = Math.max(5, Math.min(50, Math.floor(asNonNegativeNumber(req.query?.limit) || 20)));
    const skip = (page - 1) * limit;

    const [total, itemsRaw, countsAgg] = await Promise.all([
      Product.countDocuments(filter),
      Product.find(filter)
        .populate('category', 'name')
        .select('_id code_product name category family unite emplacement quantity_current seuil_minimum lifecycle_status image_product createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.aggregate([
        { $match: filterBase },
        {
          $project: {
            quantity_current: 1,
            seuil_minimum: 1,
            computed_status: {
              $cond: [
                { $lte: ['$quantity_current', 0] },
                'rupture',
                {
                  $cond: [
                    { $lte: ['$quantity_current', '$seuil_minimum'] },
                    'sous_seuil',
                    'ok',
                  ],
                },
              ],
            },
          },
        },
        { $group: { _id: '$computed_status', n: { $sum: 1 } } },
      ]),
    ]);

    const items = itemsRaw.map((p) => ({
      ...p,
      computed_status: computeStatus(p.quantity_current, p.seuil_minimum),
    }));

    const counts = { all: 0, ok: 0, sous_seuil: 0, rupture: 0 };
    for (const row of countsAgg || []) {
      const k = String(row?._id || '');
      const n = Number(row?.n || 0);
      if (k === 'ok') counts.ok += n;
      if (k === 'sous_seuil') counts.sous_seuil += n;
      if (k === 'rupture') counts.rupture += n;
      counts.all += n;
    }

    return res.json({ ok: true, page, limit, total, counts, items });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch catalogue' });
  }
});

// GET /api/products/inactive?days=60
// Produits "inactifs" = rupture de stock OU absence de demandes sur une fenêtre récente.
// Utilisé côté Responsable pour piloter les produits à archiver / corriger.
// BLOC 6 - Produits inactifs ou archives.
// Cette route aide le responsable a voir les produits qui ne sont plus actifs.
router.get('/inactive', requireAuth, async (req, res) => {
  try {
    const days = Math.max(1, Math.min(365, Math.floor(asNonNegativeNumber(req.query?.days) || 60)));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const products = await Product.find({ lifecycle_status: 'active' })
      .populate('category')
      .sort({ createdAt: -1 })
      .lean();

    if (!products.length) return res.json({ ok: true, days, items: [] });

    const reqAgg = await Request.aggregate([
      {
        $group: {
          _id: '$product',
          last_request_at: { $max: '$date_request' },
          recent_request_count: {
            $sum: { $cond: [{ $gte: ['$date_request', since] }, 1, 0] },
          },
        },
      },
    ]);

    const statsByProduct = new Map(reqAgg.map((row) => [String(row._id), row]));

    const items = products
      .map((p) => {
        const pid = String(p?._id || '');
        const stat = statsByProduct.get(pid);
        const stockStatus = computeStatus(p?.quantity_current, p?.seuil_minimum);
        const rupture = stockStatus === 'rupture';
        const recentCount = Number(stat?.recent_request_count || 0);
        const noDemand = !rupture && recentCount <= 0;
        const reason = rupture ? 'rupture' : noDemand ? 'no_demand' : '';

        if (!reason) return null;

        return {
          ...p,
          inactive_reason: reason,
          stock_status: stockStatus,
          last_request_at: stat?.last_request_at || null,
          recent_request_count: recentCount,
        };
      })
      .filter(Boolean);

    return res.json({ ok: true, days, items });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch inactive products', details: err.message });
  }
});

// BLOC 7 - Verification QR.
// Cette route verifie si un QR code est deja utilise avant de creer un produit.
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

// BLOC 8 - Verification du nom.
// Cette route evite de creer deux produits avec le meme nom.
router.get('/name-check', requireAuth, async (req, res) => {
  try {
    const value = asOptionalString(req.query?.value);
    const excludeId = asOptionalString(req.query?.exclude_id);

    if (!value) {
      return res.status(400).json({ error: 'value query param obligatoire' });
    }

    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length < 3 || normalized.length > 80) {
      return res.status(400).json({ error: 'value invalide (3-80)' });
    }

    const filter = { name: { $regex: `^${escapeRegex(normalized)}$`, $options: 'i' } };
    if (excludeId && isValidObjectIdLike(excludeId)) {
      filter._id = { $ne: excludeId };
    }

    const existing = await Product.findOne(filter).select('_id code_product name validation_status lifecycle_status');
    return res.json({
      exists: Boolean(existing),
      product: existing || null,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to check name', details: err.message });
  }
});

// PATCH /api/products/:id/chemical-register
// Lie ou retire un produit du registre chimique sans supprimer le produit du catalogue magasinier.
router.patch(
  '/:id/chemical-register',
  requireAuth,
  requirePermission(PERMISSIONS.PRODUCT_UPDATE),
  strictBody([
    'included',
    'excluded',
    'chemical_class',
    'physical_state',
    'supplier_name',
    'supplier_email',
  ]),
  async (req, res) => {
    try {
      if (!isValidObjectIdLike(req.params.id)) {
        return res.status(400).json({ error: 'product id invalide' });
      }

      const product = await Product.findById(req.params.id);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      if (String(product.lifecycle_status || 'active') !== 'active') {
        return res.status(409).json({ error: 'Produit archive / indisponible' });
      }

      const errors = [];
      if (req.body.included !== undefined) {
        product.chemical_register_included = Boolean(req.body.included);
        if (Boolean(req.body.included)) product.chemical_register_excluded = false;
      }
      if (req.body.excluded !== undefined) {
        product.chemical_register_excluded = Boolean(req.body.excluded);
        if (Boolean(req.body.excluded)) product.chemical_register_included = false;
      }

      if (req.body.chemical_class !== undefined) {
        const next = asOptionalString(req.body.chemical_class);
        if (next && !isSafeText(next, { min: 1, max: 80 })) errors.push('chemical_class invalide');
        else product.chemical_class = next || '';
      }

      if (req.body.physical_state !== undefined) {
        const next = asOptionalString(req.body.physical_state);
        if (next && !isSafeText(next, { min: 1, max: 80 })) errors.push('physical_state invalide');
        else product.physical_state = next || '';
      }

      let supplier = null;
      const supplierName = asTrimmedString(req.body.supplier_name);
      const supplierEmail = normalizeEmail(req.body.supplier_email);
      if (req.body.supplier_email !== undefined && supplierEmail && !isValidEmail(supplierEmail)) {
        errors.push('supplier_email invalide');
      }

      if (supplierName) {
        if (!isSafeText(supplierName, { min: 2, max: 140 })) {
          errors.push('supplier_name invalide');
        } else {
          supplier = await Supplier.findOne({ name: new RegExp(`^${escapeRegex(supplierName)}$`, 'i') });
          if (!supplier) {
            supplier = await Supplier.create({
              name: supplierName,
              email: supplierEmail || undefined,
              status: 'ACTIF',
              created_by: req.user.id,
            });
          } else if (supplierEmail && !supplier.email) {
            supplier.email = supplierEmail;
            await supplier.save();
          }
        }
      }

      if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

      await product.save();

      if (supplier?._id) {
        await SupplierProduct.updateMany({ product: product._id }, { $set: { is_primary: false } });
        await SupplierProduct.findOneAndUpdate(
          { supplier: supplier._id, product: product._id },
          {
            $set: {
              supplier: supplier._id,
              product: product._id,
              is_primary: true,
              availability_status: 'unknown',
              created_by: req.user.id,
            },
          },
          { upsert: true, returnDocument: 'after' }
        );
      }

      await History.create({
        action_type: 'product_update',
        user: req.user.id,
        source: 'ui',
        description: `Registre chimique mis a jour (${product.code_product})`,
        actor_role: req.user.role,
        tags: ['product', 'chemical_register'],
        context: {
          product_id: String(product._id),
          product_name: product.name,
          included: product.chemical_register_included,
          excluded: product.chemical_register_excluded,
          supplier_id: supplier?._id ? String(supplier._id) : null,
          supplier_name: supplier?.name || null,
        },
      }).catch(() => null);

      return res.json({
        ok: true,
        product: {
          _id: product._id,
          code_product: product.code_product,
          name: product.name,
          chemical_register_included: product.chemical_register_included,
          chemical_register_excluded: product.chemical_register_excluded,
          chemical_class: product.chemical_class || '',
          physical_state: product.physical_state || '',
        },
        supplier: supplier
          ? { _id: supplier._id, name: supplier.name, email: supplier.email || '' }
          : null,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to update chemical register', details: err.message });
    }
  }
);

// BLOC 9 - Creation produit.
// POST /api/products valide les donnees, cree le produit et notifie les responsables si besoin.
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
    'category_proposal',
    'family', 
    'unite',
    'emplacement', 
    'stock_initial_year', 
    'chemical_class',
    'physical_state',
    'fds_attachment',
    'chemical_register_included',
    'chemical_register_excluded',
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
      errors.push('family invalide (economat, produit_chimique, gaz, consommable_laboratoire, consommable_informatique)'); 
    } 
    const name = asTrimmedString(req.body.name); 
    if (!name || !isSafeText(name, { min: 2, max: 140 })) errors.push('name obligatoire (2-140)'); 
    const qrCodeValue = asOptionalString(req.body.qr_code_value); 
    if (!qrCodeValue || !isSafeText(qrCodeValue, { min: 3, max: 220 })) errors.push('qr_code_value obligatoire (3-220)'); 

    const description = asOptionalString(req.body.description);
    if (description !== undefined && description !== null && description !== '' && !isSafeText(description, { min: 0, max: 800 })) {
      errors.push('description invalide (max 800, sans < >)');
    }

    const unite = asOptionalString(req.body.unite);
    if (unite && !isSafeText(unite, { min: 1, max: 30 })) errors.push('unite invalide (1-30)');
    const emplacement = asOptionalString(req.body.emplacement);
    if (emplacement && !isSafeText(emplacement, { min: 1, max: 80 })) errors.push('emplacement invalide (max 80)');

    const chemicalClass = asOptionalString(req.body.chemical_class);
    if (chemicalClass && !isSafeText(chemicalClass, { min: 1, max: 80 })) errors.push('chemical_class invalide (max 80)');
    const physicalState = asOptionalString(req.body.physical_state);
    if (physicalState && !isSafeText(physicalState, { min: 1, max: 80 })) errors.push('physical_state invalide (max 80)');
    const gasPressure = asOptionalString(req.body.gas_pressure);
    if (gasPressure && !isSafeText(gasPressure, { min: 1, max: 60 })) errors.push('gas_pressure invalide (max 60)');
    const gasPurity = asOptionalString(req.body.gas_purity);
    if (gasPurity && !isSafeText(gasPurity, { min: 1, max: 60 })) errors.push('gas_purity invalide (max 60)');

    if (req.body.category && !isValidObjectIdLike(req.body.category)) { 
      errors.push('category doit etre un ObjectId valide'); 
    } 

    const quantityCurrent = asNonNegativeNumber(req.body.quantity_current);
    if (Number.isNaN(quantityCurrent)) errors.push('quantity_current doit etre un nombre >= 0');

    const seuilMinimum = asNonNegativeNumber(req.body.seuil_minimum);
    if (Number.isNaN(seuilMinimum)) errors.push('seuil_minimum doit etre un nombre >= 0');

    const stockInitial = asNonNegativeNumber(req.body.stock_initial_year);
    if (Number.isNaN(stockInitial)) errors.push('stock_initial_year doit etre un nombre >= 0');

    const creatorIsResponsable = req.user.role === 'responsable';
    if (creatorIsResponsable && !req.body.category && isBlank(req.body.category_name)) {
      errors.push('category ou category_name obligatoire (creation responsable)');
    }

    if (req.body.code_product && !isValidProductCode(req.body.code_product)) {
      errors.push('code_product invalide (3-40, A-Z 0-9 . _ -)');
    }
 
    if (errors.length > 0) { 
      return res.status(400).json({ error: 'Validation failed', details: errors }); 
    } 

    let category = null;
    const categoryProposal = asOptionalString(req.body.category_proposal)
      || (!creatorIsResponsable && !req.body.category ? asOptionalString(req.body.category_name) : null);

    if (creatorIsResponsable && (req.body.category || req.body.category_name)) {
      category = await getOrCreateCategory({ 
        categoryId: req.body.category, 
        categoryName: req.body.category_name, 
        userId: req.user.id, 
      }); 
      if (!category) return res.status(400).json({ error: 'category invalide' }); 
    } else if (req.body.category && isValidObjectIdLike(req.body.category)) {
      // If a magasinier provides a category id, accept it as a draft (responsable can override at validation).
      const existing = await Category.findById(req.body.category).select('_id').lean();
      category = existing ? existing : null;
    }

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

    // Produit cree par magasinier: utilisable immediatement (pas de validation responsable).
    // On garde le champ validation_status pour compat/traçabilite, mais il est force a "approved".
    const validationStatus = 'approved';

    const payload = { 
      code_product: req.body.code_product ? normalizeProductCode(req.body.code_product) : (await getNextProductCode()), 
      name, 
      description, 
      category: category?._id || null, 
      category_proposal: categoryProposal,
      family, 
      unite: unite || 'Unite',
      emplacement, 
      stock_initial_year: stockInitial ?? 0, 
      chemical_class: chemicalClass,
      physical_state: physicalState,
      fds_attachment: sanitizeFdsAttachment(req.body.fds_attachment, errors),
      gas_pressure: gasPressure,
      gas_purity: gasPurity,
      quantity_current: quantityCurrent ?? 0,
      seuil_minimum: seuilMinimum ?? 0,
      status: computeStatus(quantityCurrent ?? 0, seuilMinimum ?? 0),
      lifecycle_status: 'active',
      qr_code_value: qrCodeValue,
      image_product: asOptionalString(req.body.image_product) && isSafeText(req.body.image_product, { min: 0, max: 400 })
        ? asOptionalString(req.body.image_product)
        : null,
      created_by: req.user.id, 
      validated_by: req.user.id,
      validation_status: validationStatus,
    }; 

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

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
        category: item.category ? String(item.category) : null, 
      }, 
    }); 
    notifyResponsablesOnNewProduct(item, req.user);
    res.status(201).json(item);
  } catch (err) {
    if (err?.code === 11000 && err?.keyPattern?.qr_code_value) {
      return res.status(409).json({ error: 'QR code deja utilise' });
    }
    res.status(400).json({ error: 'Failed to create product', details: err.message });
  }
});

// BLOC 10 - Modification produit.
// PUT /api/products/:id met a jour un produit existant avec controles de securite et metier.
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
    'unite',
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
    if (String(product.lifecycle_status || 'active') === 'archived') {
      return res.status(409).json({ error: 'Produit archive (modification interdite)' });
    }
    const categoryBefore = product.category ? String(product.category) : null;
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
      'unite',
      'emplacement',
      'stock_initial_year',
      'chemical_class',
      'physical_state',
      'fds_attachment',
      'chemical_register_included',
      'chemical_register_excluded',
      'gas_pressure',
      'gas_purity',
      'qr_code_value',
      'image_product',
      'seuil_minimum',
      'quantity_current',
    ];

    editableFields.forEach((field) => {
      if (req.body[field] === undefined) return;

      if (field === 'name') {
        const value = asTrimmedString(req.body.name);
        if (!value || !isSafeText(value, { min: 2, max: 140 })) errors.push('name invalide (2-140)');
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
        const nextQr = asOptionalString(req.body[field]);
        if (!nextQr || !isSafeText(nextQr, { min: 3, max: 220 })) errors.push('qr_code_value invalide (3-220)');
        else product[field] = nextQr;
        return;
      }

      if (field === 'description') {
        const next = asOptionalString(req.body[field]);
        if (next && !isSafeText(next, { min: 0, max: 800 })) errors.push('description invalide (max 800)');
        else product[field] = next || '';
        return;
      }
      if (field === 'unite') {
        const next = asOptionalString(req.body[field]);
        if (next && !isSafeText(next, { min: 1, max: 30 })) errors.push('unite invalide (1-30)');
        else product[field] = next || 'Unite';
        return;
      }
      if (field === 'emplacement') {
        const next = asOptionalString(req.body[field]);
        if (next && !isSafeText(next, { min: 1, max: 80 })) errors.push('emplacement invalide (max 80)');
        else product[field] = next || '';
        return;
      }
      if (field === 'chemical_class' || field === 'physical_state') {
        const next = asOptionalString(req.body[field]);
        if (next && !isSafeText(next, { min: 1, max: 80 })) errors.push(`${field} invalide (max 80)`);
        else product[field] = next || '';
        return;
      }
      if (field === 'gas_pressure' || field === 'gas_purity') {
        const next = asOptionalString(req.body[field]);
        if (next && !isSafeText(next, { min: 1, max: 60 })) errors.push(`${field} invalide (max 60)`);
        else product[field] = next || '';
        return;
      }
      if (field === 'fds_attachment') {
        const next = sanitizeFdsAttachment(req.body[field], errors);
        product[field] = next;
        return;
      }
      if (field === 'chemical_register_included' || field === 'chemical_register_excluded') {
        product[field] = Boolean(req.body[field]);
        return;
      }
      if (field === 'image_product') {
        const next = asOptionalString(req.body[field]);
        if (next && !isSafeText(next, { min: 0, max: 400 })) errors.push('image_product invalide (max 400)');
        else product[field] = next || '';
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

    // Regles metier: certaines modifications necessitent une re-validation responsable.
    try {
      const stockRulesConfig = await getStockRulesConfig();
      const seuilChanged = Number(beforeSnapshot.seuil_minimum || 0) !== Number(product.seuil_minimum || 0);
      const categoryAfter = product.category ? String(product.category) : null;
      const categoryChanged = categoryBefore !== categoryAfter;
      const actorIsResponsable = req.user.role === 'responsable';

      const requiresRevalidation =
        !actorIsResponsable
        && ((stockRulesConfig?.validationApresModificationSeuil && seuilChanged)
          || (stockRulesConfig?.validationApresChangementCategorie && categoryChanged));

      if (requiresRevalidation) {
        product.validation_status = 'pending';
        product.validated_by = null;
      }
    } catch {
      // ignore: stock rules config is best-effort
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

// POST /api/products/bulk/category
// Body: { product_ids: string[], category_id?: string, action: "set"|"clear" }
// Used by Responsable to classify products in bulk.
// BLOC 11 - Validation ou decision produit.
// Cette route garde une compatibilite avec les anciens flux de validation produit.
router.post(
  '/bulk/category',
  requireAuth,
  requirePermission(PERMISSIONS.PRODUCT_UPDATE),
  strictBody(['product_ids', 'category_id', 'action']),
  async (req, res) => {
    try {
      const action = String(req.body?.action || 'set').trim().toLowerCase();
      if (!['set', 'clear'].includes(action)) {
        return res.status(400).json({ error: 'action invalide (set|clear)' });
      }

      const rawIds = Array.isArray(req.body?.product_ids) ? req.body.product_ids : [];
      const dedup = [];
      const seen = new Set();
      for (const raw of rawIds) {
        const id = String(raw || '').trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        dedup.push(id);
      }

      if (!dedup.length) return res.status(400).json({ error: 'product_ids obligatoire (>=1)' });
      if (dedup.length > 500) return res.status(400).json({ error: 'product_ids trop long (max 500)' });
      if (dedup.some((id) => !isValidObjectIdLike(id))) return res.status(400).json({ error: 'product_ids invalide' });

      let category = null;
      if (action === 'set') {
        const categoryId = String(req.body?.category_id || '').trim();
        if (!categoryId || !isValidObjectIdLike(categoryId)) {
          return res.status(400).json({ error: 'category_id obligatoire' });
        }
        category = await Category.findById(categoryId).select('_id name lifecycle_status').lean();
        if (!category?._id) return res.status(404).json({ error: 'Categorie introuvable' });
        if (String(category.lifecycle_status || 'active') === 'archived') {
          return res.status(409).json({ error: 'Categorie archivee (interdite)' });
        }
      }

      const update = action === 'clear'
        ? { $unset: { category: '' } }
        : { $set: { category: category._id } };

      const result = await Product.updateMany(
        { _id: { $in: dedup } },
        update
      );

      await History.create({
        action_type: 'product_bulk_category',
        user: req.user.id,
        source: 'ui',
        description: action === 'clear'
          ? `Retrait categorie (bulk): ${dedup.length} produits`
          : `Affectation categorie "${category.name}" (bulk): ${dedup.length} produits`,
        actor_role: req.user.role,
        tags: ['product', 'bulk', 'category'],
        context: {
          action,
          category_id: category?._id ? String(category._id) : null,
          products_count: dedup.length,
          matched_count: result?.matchedCount ?? null,
          modified_count: result?.modifiedCount ?? null,
        },
      });

      return res.json({
        ok: true,
        action,
        category: category?._id ? { _id: category._id, name: category.name } : null,
        products_count: dedup.length,
        matched_count: result?.matchedCount ?? null,
        modified_count: result?.modifiedCount ?? null,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Bulk update failed', details: err.message });
    }
  }
);

// DELETE /api/products/:id
// Suppression definitive (responsable uniquement).
// Autorise seulement si le produit n'a pas de mouvements / demandes / commandes.
// BLOC 12 - Suppression logique ou archivage.
// DELETE /api/products/:id evite souvent la suppression physique pour garder l'historique.
router.delete(
  '/:id',
  requireAuth,
  requirePermission(PERMISSIONS.PRODUCT_DELETE),
  async (req, res) => {
    try {
      if (!isValidObjectIdLike(req.params.id)) {
        return res.status(400).json({ error: 'product id invalide' });
      }

      const product = await Product.findById(req.params.id).select('_id name code_product validation_status').lean();
      if (!product) return res.status(404).json({ error: 'Product not found' });

      const productId = product._id;

      const [hasRequests, hasEntries, hasExits, hasLots, hasPoLines, hasSupplierLinks] = await Promise.all([
        Request.exists({ product: productId }),
        StockEntry.exists({ product: productId }),
        StockExit.exists({ product: productId }),
        StockLot.exists({ product: productId }),
        PurchaseOrder.exists({ 'lines.product': productId }),
        SupplierProduct.exists({ product: productId }),
      ]);

      if (hasRequests || hasEntries || hasExits || hasLots || hasPoLines) {
        return res.status(409).json({
          error: 'Suppression impossible',
          details:
            'Ce produit est deja reference (demandes/mouvements/commandes). Utilisez plutot un archivage (a ajouter) ou bloquez le produit.',
        });
      }

      // Clean supplier links even if they are not blocking.
      if (hasSupplierLinks) {
        await SupplierProduct.deleteMany({ product: productId });
      }

      await Product.deleteOne({ _id: productId });

      await History.create({
        action_type: 'product_delete',
        user: req.user.id,
        source: 'ui',
        description: `Produit supprime definitivement (${product.code_product})`,
        actor_role: req.user.role,
        tags: ['product', 'delete'],
        context: { product_id: String(productId), code_product: product.code_product, name: product.name },
      });

      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to delete product', details: err.message });
    }
  }
);

// POST /api/products/:id/archive
// Archivage industriel (recommande): bloque l'usage du produit sans supprimer l'historique.
// BLOC 13 - Archivage produit.
// Cette route retire un produit du catalogue actif sans supprimer son historique.
router.post(
  '/:id/archive',
  requireAuth,
  requirePermission(PERMISSIONS.PRODUCT_DELETE),
  strictBody(['reason']),
  async (req, res) => {
    try {
      if (!isValidObjectIdLike(req.params.id)) {
        return res.status(400).json({ error: 'product id invalide' });
      }

      const product = await Product.findById(req.params.id);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      if (String(product.lifecycle_status || 'active') === 'archived') {
        return res.json({ ok: true, product });
      }

      const reason = asOptionalString(req.body?.reason);
      if (reason && !isSafeText(reason, { min: 0, max: 240 })) {
        return res.status(400).json({ error: 'reason invalide (max 240, sans < >)' });
      }

      product.lifecycle_status = 'archived';
      product.archived_at = new Date();
      product.archived_by = req.user.id;
      product.archived_reason = reason ? String(reason).slice(0, 240) : '';
      product.status = 'bloque';
      await product.save();

      await History.create({
        action_type: 'product_archive',
        user: req.user.id,
        product: product._id,
        source: 'ui',
        description: `Produit archive (${product.code_product})`,
        actor_role: req.user.role,
        tags: ['product', 'archive'],
        context: {
          reason: product.archived_reason || null,
          archived_at: product.archived_at,
        },
      });

      notifyResponsablesOnArchivedProduct(product, req.user);

      return res.json({ ok: true, product });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to archive product', details: err.message });
    }
  }
);

module.exports = router;
