const router = require('express').Router();

const requireAuth = require('../middlewares/requireAuth');
const requirePermission = require('../middlewares/requirePermission');
const strictBody = require('../middlewares/strictBody');
const { PERMISSIONS } = require('../constants/permissions');

const InventorySession = require('../models/InventorySession');
const InventoryCount = require('../models/InventoryCount');
const { Inventory } = require('../models/Inventory');
const InventoryLine = require('../models/InventoryLine');
const Notification = require('../models/Notification');
const Category = require('../models/Category');
const Laboratory = require('../models/Laboratory');
const User = require('../models/User');
const Product = require('../models/Product');
const SupplierProduct = require('../models/SupplierProduct');
const StockEntry = require('../models/StockEntry');
const StockExit = require('../models/StockExit');
const Sequence = require('../models/Sequence');
const History = require('../models/History');
const { runInTransaction } = require('../services/transactionService');

const { asDate, asNonNegativeNumber, asOptionalString, asTrimmedString, isSafeText, isValidObjectIdLike } = require('../utils/validation');

router.use(requireAuth);
router.use(requirePermission(PERMISSIONS.INVENTORY_MANAGE));

function ensureRole(req, res, allowed) {
  if (!allowed.includes(String(req.user?.role || ''))) {
    res.status(403).json({ error: 'Acces refuse' });
    return false;
  }
  return true;
}

async function getNextInventoryReference() {
  const year = new Date().getFullYear();
  const counterName = `inventory_${year}`;
  const counter = await Sequence.findOneAndUpdate(
    { counter_name: counterName },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true }
  );
  return `INV-${year}-${String(counter.seq).padStart(5, '0')}`;
}

async function getNextEntryNumber() {
  const year = new Date().getFullYear();
  const counterName = `stock_entry_${year}`;
  const counter = await Sequence.findOneAndUpdate(
    { counter_name: counterName },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true }
  );
  return `BE-${year}-${String(counter.seq).padStart(5, '0')}`;
}

async function getNextExitNumber() {
  const year = new Date().getFullYear();
  const counterName = `stock_exit_${year}`;
  const counter = await Sequence.findOneAndUpdate(
    { counter_name: counterName },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true }
  );
  return `BP-${year}-${String(counter.seq).padStart(5, '0')}`;
}

function computeProductStatus(quantity, seuilMinimum) {
  if (Number(quantity) <= 0) return 'rupture';
  if (Number(quantity) <= Number(seuilMinimum || 0)) return 'sous_seuil';
  return 'ok';
}

const ACTIVE_INVENTORY_STATUSES = ['A_FAIRE', 'EN_COURS', 'A_VALIDER', 'A_RECOMPTER'];
const EDITABLE_INVENTORY_STATUSES = ['A_FAIRE', 'EN_COURS', 'A_RECOMPTER'];
const DEFAULT_INVENTORY_MAGASIN_CODE = 'MAG-01';
const DEFAULT_INVENTORY_MAGASIN_NAME = 'Magasin principal';
const INVENTORY_FAMILIES = [
  { value: 'economat', label: 'Économat' },
  { value: 'produit_chimique', label: 'Produit chimique' },
  { value: 'gaz', label: 'Gaz' },
  { value: 'consommable_laboratoire', label: 'Consommable laboratoire' },
  { value: 'consommable_informatique', label: 'Consommable informatique' },
];

const MOTIFS_ECART = [
  'CASSE',
  'PERTE',
  'VOL_SUSPECTE',
  'ERREUR_RANGEMENT',
  'ERREUR_SAISIE',
  'PRODUIT_DEPLACE',
  'ARTICLE_INTROUVABLE',
  'ARTICLE_ENDOMMAGE',
  'AUTRE',
];

const CRITICAL_FAMILIES = new Set(['gaz', 'produit_chimique']);

async function getOrCreateDefaultInventoryMagasin(userId) {
  const active = await Laboratory.findOne({ active: true }).select('_id code name active').sort({ name: 1 }).lean();
  if (active) return active;

  const update = {
    $set: { active: true },
    $setOnInsert: {
      code: DEFAULT_INVENTORY_MAGASIN_CODE,
      name: DEFAULT_INVENTORY_MAGASIN_NAME,
      description: "Magasin technique utilise automatiquement pour les inventaires.",
    },
  };

  if (userId) update.$setOnInsert.created_by = userId;

  const fallback = await Laboratory.findOneAndUpdate(
    { code: DEFAULT_INVENTORY_MAGASIN_CODE },
    update,
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
      projection: '_id code name active',
    }
  ).lean();

  return fallback;
}

function normalizeFamily(value) {
  if (!value) return null;
  const key = String(value).trim().toLowerCase();
  const allowed = new Set(INVENTORY_FAMILIES.map((f) => f.value));
  return allowed.has(key) ? key : null;
}

function productSearchRegex(value) {
  const escaped = String(value || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped ? new RegExp(escaped, 'i') : null;
}

async function resolveInventoryProduct({ productId, productQuery }) {
  const base = {
    lifecycle_status: 'active',
    validation_status: 'approved',
  };

  if (productId) {
    if (!isValidObjectIdLike(productId)) {
      return { error: 'product_id invalide' };
    }
    const product = await Product.findOne({ ...base, _id: productId })
      .select('_id code_product name')
      .lean();
    if (!product) return { error: 'Produit introuvable ou inactif' };
    return { product };
  }

  const q = String(productQuery || '').trim();
  if (!q) return { product: null };

  if (!isSafeText(q, { min: 2, max: 120 })) {
    return { error: 'produit invalide' };
  }

  const exact = await Product.findOne({
    ...base,
    $or: [
      { code_product: q.toUpperCase() },
      { name: { $regex: `^${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
    ],
  })
    .select('_id code_product name')
    .lean();
  if (exact) return { product: exact };

  const rx = productSearchRegex(q);
  const matches = await Product.find({
    ...base,
    $or: [
      { code_product: rx },
      { name: rx },
    ],
  })
    .select('_id code_product name')
    .sort({ name: 1 })
    .limit(2)
    .lean();

  if (matches.length === 1) return { product: matches[0] };
  if (matches.length > 1) return { error: 'Plusieurs produits correspondent. Choisir un produit dans la liste.' };
  return { error: 'Aucun produit actif ne correspond a cette saisie' };
}

async function listProductsForInventory({ typeInventaire, categorieId, familleId, productId }) {
  const q = {
    lifecycle_status: 'active',
    validation_status: 'approved',
  };

  if (typeInventaire === 'TOURNANT') {
    if (productId) q._id = productId;
    if (categorieId) q.category = categorieId;
    if (familleId) q.family = familleId;
  }

  const items = await Product.find(q).select('_id quantity_current emplacement').sort({ name: 1 }).lean();
  return items;
}

function uniqueObjectIdStrings(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const key = String(value?._id || value || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function buildMovementLockConfig({ enabled, typeInventaire, productIds = [] }) {
  const ids = uniqueObjectIdStrings(productIds);
  if (!enabled) {
    return {
      bloquer_mouvements: false,
      movement_blocked: false,
      movement_block_scope: 'none',
      movement_blocked_product_ids: [],
    };
  }

  if (String(typeInventaire) === 'GLOBAL' && ids.length === 0) {
    return {
      bloquer_mouvements: true,
      movement_blocked: true,
      movement_block_scope: 'global',
      movement_blocked_product_ids: [],
    };
  }

  return {
    bloquer_mouvements: true,
    movement_blocked: ids.length > 0,
    movement_block_scope: ids.length > 0 ? 'products' : 'none',
    movement_blocked_product_ids: ids,
  };
}

async function resolveInventoryLineProductIds(inventoryId) {
  const rows = await InventoryLine.find({ inventory_id: inventoryId }).select('product_id').lean();
  return uniqueObjectIdStrings(rows.map((row) => row.product_id));
}

function computeProgress({ total, counted }) {
  const t = Math.max(0, Number(total || 0));
  const c = Math.max(0, Number(counted || 0));
  const pct = t > 0 ? Math.round((c / t) * 100) : 0;
  return { total: t, counted: c, pct };
}

function sanitizeInventoryForMagasinier(inv) {
  if (!inv) return null;
  return {
    _id: inv._id,
    reference: inv.reference,
    type_inventaire: inv.type_inventaire,
    status: inv.status,
    magasin_id: inv.magasin_id,
    zone_id: inv.zone_id,
    famille_id: inv.famille_id,
    categorie_id: inv.categorie_id,
    product_id: inv.product_id,
    responsable_id: inv.responsable_id,
    magasinier_id: inv.magasinier_id,
    magasinier_ids: Array.isArray(inv.magasinier_ids) ? inv.magasinier_ids : [],
    date_lancement: inv.date_lancement,
    date_prevue: inv.date_prevue,
    commentaire: inv.commentaire || '',
    createdAt: inv.createdAt,
    updatedAt: inv.updatedAt,
  };
}

function isAssignedMagasinier(inv, userId) {
  const uid = String(userId || '');
  if (!uid) return false;

  const primary = inv?.magasinier_id?._id || inv?.magasinier_id || null;
  if (primary && String(primary) === uid) return true;

  const list = Array.isArray(inv?.magasinier_ids) ? inv.magasinier_ids : [];
  return list.some((id) => String(id?._id || id) === uid);
}

function listAssignedMagasinierIds(inv) {
  const out = new Set();
  const primary = inv?.magasinier_id?._id || inv?.magasinier_id || null;
  if (primary) out.add(String(primary));

  const list = Array.isArray(inv?.magasinier_ids) ? inv.magasinier_ids : [];
  for (const id of list) {
    const key = id?._id || id;
    if (key) out.add(String(key));
  }

  return Array.from(out);
}

function sanitizeInventoryForResponsable(inv) {
  if (!inv) return null;
  return inv;
}

function sanitizeProductForMagasinierCount(product) {
  if (!product) return null;
  return {
    _id: product._id,
    name: product.name || '',
    code_product: product.code_product || '',
  };
}

function sanitizeLegacyCountLineForRole(count, role) {
  const line = {
    _id: count._id,
    product: role === 'magasinier' ? sanitizeProductForMagasinierCount(count.product) : count.product,
    counted_quantity: Number(count.counted_quantity || 0),
    note: count.note || '',
    counted_by: count.counted_by,
    counted_at: count.counted_at || count.updatedAt || count.createdAt,
  };

  if (role !== 'magasinier') {
    line.system_quantity_at_count = Number(count.system_quantity_at_count || 0);
    line.delta = Number(count.counted_quantity || 0) - Number(count.system_quantity_at_count || 0);
  }

  return line;
}

function safeAbsNumber(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.abs(n);
}

async function getPrimaryUnitPriceMap(productIds) {
  const ids = (Array.isArray(productIds) ? productIds : []).filter((x) => x);
  if (!ids.length) return new Map();
  const items = await SupplierProduct.find({ product: { $in: ids }, is_primary: true })
    .select('product unit_price')
    .lean();
  const map = new Map();
  for (const row of items) {
    const key = String(row.product);
    const price = Number(row.unit_price || 0);
    if (!map.has(key)) map.set(key, Number.isFinite(price) ? price : 0);
  }
  return map;
}

// GET /api/inventory/launch/options
router.get('/launch/options', async (req, res) => {
  try {
    if (!ensureRole(req, res, ['responsable'])) return;

    let [magasins, categories, products, productBuckets, magasiniers] = await Promise.all([
      Laboratory.find({ active: true }).select('_id code name active').sort({ name: 1 }).lean(),
      Category.find({ lifecycle_status: 'active' }).select('_id name parent_family').sort({ name: 1 }).lean(),
      Product.find({ lifecycle_status: 'active', validation_status: 'approved' })
        .select('_id code_product name family category quantity_current emplacement')
        .sort({ name: 1 })
        .limit(500)
        .lean(),
      Product.aggregate([
        { $match: { lifecycle_status: 'active', validation_status: 'approved' } },
        {
          $group: {
            _id: { family: '$family', category: '$category' },
            count: { $sum: 1 },
          },
        },
      ]),
      User.find({ role: 'magasinier', status: 'active' }).select('_id username role status').sort({ username: 1 }).lean(),
    ]);

    const familyCounts = new Map();
    const categoryCounts = new Map();
    for (const row of Array.isArray(productBuckets) ? productBuckets : []) {
      const count = Math.max(0, Number(row?.count || 0));
      const family = String(row?._id?.family || '').trim();
      const category = row?._id?.category ? String(row._id.category) : '';
      if (family) familyCounts.set(family, Number(familyCounts.get(family) || 0) + count);
      if (category) categoryCounts.set(category, Number(categoryCounts.get(category) || 0) + count);
    }

    categories = categories
      .map((c) => ({
        ...c,
        article_count: Number(categoryCounts.get(String(c._id)) || 0),
      }))
      .filter((c) => Number(c.article_count || 0) > 0);

    const familles = INVENTORY_FAMILIES
      .map((f) => ({
        ...f,
        article_count: Number(familyCounts.get(String(f.value)) || 0),
      }))
      .filter((f) => Number(f.article_count || 0) > 0);

    if (!magasins.length) {
      const defaultMagasin = await getOrCreateDefaultInventoryMagasin(req.user?.id);
      magasins = defaultMagasin ? [defaultMagasin] : [];
    }

    return res.json({
      ok: true,
      magasins,
      categories,
      products,
      familles,
      active_product_count: Array.from(familyCounts.values()).reduce((sum, n) => sum + Number(n || 0), 0),
      magasiniers,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load inventory options', details: err.message });
  }
});

// GET /api/inventory/responsable/to-validate
router.get('/responsable/to-validate', async (req, res) => {
  try {
    if (!ensureRole(req, res, ['responsable'])) return;

    const inventories = await Inventory.find({ status: 'A_VALIDER', responsable_id: req.user.id })
      .sort({ submitted_at: -1, updatedAt: -1 })
      .limit(120)
      .populate('magasin_id', 'code name')
      .populate('zone_id', 'code name')
      .populate('categorie_id', 'name is_sensitive')
      .populate('product_id', '_id code_product name')
      .populate('magasinier_id', 'username role')
      .populate('magasinier_ids', 'username role')
      .lean();

    const ids = inventories.map((i) => i._id);
    const statsAgg = ids.length
      ? await InventoryLine.aggregate([
          { $match: { inventory_id: { $in: ids } } },
          {
            $addFields: {
              delta: {
                $subtract: [
                  { $ifNull: ['$quantite_comptee', 0] },
                  { $ifNull: ['$quantite_theorique_initiale', 0] },
                ],
              },
            },
          },
          {
            $lookup: {
              from: 'supplierproducts',
              let: { pid: '$product_id' },
              pipeline: [
                { $match: { $expr: { $and: [{ $eq: ['$product', '$$pid'] }, { $eq: ['$is_primary', true] }] } } },
                { $project: { unit_price: 1 } },
                { $limit: 1 },
              ],
              as: 'sp',
            },
          },
          {
            $addFields: {
              unit_price: { $ifNull: [{ $first: '$sp.unit_price' }, 0] },
              abs_value: {
                $multiply: [{ $abs: '$delta' }, { $ifNull: [{ $first: '$sp.unit_price' }, 0] }],
              },
              has_delta: { $ne: ['$delta', 0] },
            },
          },
          {
            $group: {
              _id: '$inventory_id',
              total_articles: { $sum: 1 },
              deltas_count: { $sum: { $cond: ['$has_delta', 1, 0] } },
              total_value_abs: { $sum: '$abs_value' },
            },
          },
        ])
      : [];

    const byId = new Map(statsAgg.map((s) => [String(s._id), s]));

    const items = inventories.map((inv) => {
      const s = byId.get(String(inv._id)) || { total_articles: 0, deltas_count: 0, total_value_abs: 0 };
      return {
        inventory: sanitizeInventoryForResponsable(inv),
        stats: {
          total_articles: Number(s.total_articles || 0),
          deltas_count: Number(s.deltas_count || 0),
          total_value_abs: Number(s.total_value_abs || 0),
        },
      };
    });

    return res.json({ ok: true, items });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch inventories to validate', details: err.message });
  }
});

// GET /api/inventory/responsable/inventories/:id/analysis
router.get('/responsable/inventories/:id/analysis', async (req, res) => {
  try {
    if (!ensureRole(req, res, ['responsable'])) return;
    if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });

    const inv = await Inventory.findById(req.params.id)
      .populate('magasin_id', 'code name')
      .populate('zone_id', 'code name')
      .populate('categorie_id', 'name is_sensitive')
      .populate('product_id', '_id code_product name')
      .populate('magasinier_id', 'username role')
      .populate('magasinier_ids', 'username role')
      .populate('responsable_id', 'username role')
      .lean();

    if (!inv) return res.status(404).json({ error: 'Inventaire introuvable' });
    if (String(inv.responsable_id?._id || inv.responsable_id) !== String(req.user.id)) return res.status(403).json({ error: 'Acces refuse' });

    const linesRaw = await InventoryLine.find({ inventory_id: inv._id })
      .populate('product_id', '_id code_product name unite emplacement family category')
      .lean();

    const productIds = linesRaw.map((l) => l.product_id?._id).filter(Boolean);
    const unitPriceMap = await getPrimaryUnitPriceMap(productIds);

    const categoryIds = linesRaw.map((l) => l.product_id?.category).filter((x) => x && isValidObjectIdLike(String(x)));
    const categories = categoryIds.length
      ? await Category.find({ _id: { $in: categoryIds } }).select('_id is_sensitive name').lean()
      : [];
    const categoryById = new Map(categories.map((c) => [String(c._id), c]));

    const lines = linesRaw.map((l) => {
      const theo = Math.max(0, Math.floor(Number(l.quantite_theorique_initiale || 0)));
      const counted = l.quantite_comptee === null || l.quantite_comptee === undefined ? null : Math.max(0, Math.floor(Number(l.quantite_comptee || 0)));
      const delta = counted === null ? null : (counted - theo);
      const price = unitPriceMap.get(String(l.product_id?._id || '')) || 0;
      const value = delta === null ? null : Number((delta * price).toFixed(3));
      const absValue = value === null ? null : Number((Math.abs(value)).toFixed(3));

      const family = String(l.product_id?.family || '');
      const cat = l.product_id?.category ? categoryById.get(String(l.product_id.category)) : null;
      const isCritical = Boolean(cat?.is_sensitive) || CRITICAL_FAMILIES.has(family);

      return {
        _id: l._id,
        product: {
          _id: l.product_id?._id,
          code_product: l.product_id?.code_product || '-',
          name: l.product_id?.name || 'Produit',
          unite: l.product_id?.unite || '',
          family,
          category: cat ? { _id: cat._id, name: cat.name || '', is_sensitive: Boolean(cat.is_sensitive) } : null,
          emplacement: l.emplacement_id || l.product_id?.emplacement || '',
        },
        quantite_theorique_initiale: theo,
        quantite_comptee: counted,
        ecart: delta,
        unit_price: price || 0,
        valeur_ecart: value,
        valeur_ecart_abs: absValue,
        criticite: isCritical ? 'critique' : 'normal',
        observation_magasinier: l.observation_magasinier || '',
        motif_ecart: l.motif_ecart || '',
        requires_recount: Boolean(l.requires_recount),
        recount_count: Number(l.recount_count || 0),
        last_recount_at: l.last_recount_at || null,
        observation_responsable: l.observation_responsable || '',
        is_counted: Boolean(l.is_counted),
        updatedAt: l.updatedAt,
      };
    });

    const total = lines.length;
    const countedLines = lines.filter((l) => l.quantite_comptee !== null);
    const okCount = countedLines.filter((l) => Number(l.ecart || 0) === 0).length;
    const deltaCount = countedLines.filter((l) => Number(l.ecart || 0) !== 0).length;
    const criticalDelta = countedLines.filter((l) => Number(l.ecart || 0) !== 0 && l.criticite === 'critique').length;
    const totalAbsValue = countedLines.reduce((acc, l) => acc + safeAbsNumber(l.valeur_ecart || 0), 0);
    const reliability = total > 0 ? Number(((okCount / total) * 100).toFixed(2)) : 0;

    const summary = {
      total_articles: total,
      articles_comptes: countedLines.length,
      articles_sans_ecart: okCount,
      articles_avec_ecart: deltaCount,
      articles_critiques_en_ecart: criticalDelta,
      valeur_totale_ecarts_abs: Number(totalAbsValue.toFixed(3)),
      fiabilite_pct: reliability,
    };

    const sorted = lines.slice().sort((a, b) => (safeAbsNumber(b.valeur_ecart_abs) - safeAbsNumber(a.valeur_ecart_abs)));

    return res.json({ ok: true, inventory: inv, summary, motifs_ecart: MOTIFS_ECART, lines: sorted });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to analyze inventory', details: err.message });
  }
});

// PATCH /api/inventory/responsable/inventories/:id/lines/:lineId
router.patch(
  '/responsable/inventories/:id/lines/:lineId',
  strictBody(['motif_ecart', 'observation_responsable']),
  async (req, res) => {
    try {
      if (!ensureRole(req, res, ['responsable'])) return;
      if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });
      if (!isValidObjectIdLike(req.params.lineId)) return res.status(400).json({ error: 'lineId invalide' });

      const inv = await Inventory.findById(req.params.id).select('_id status responsable_id').lean();
      if (!inv) return res.status(404).json({ error: 'Inventaire introuvable' });
      if (String(inv.responsable_id) !== String(req.user.id)) return res.status(403).json({ error: 'Acces refuse' });
      if (!['A_VALIDER', 'A_RECOMPTER'].includes(String(inv.status))) return res.status(409).json({ error: 'Inventaire non modifiable' });

      const line = await InventoryLine.findOne({ _id: req.params.lineId, inventory_id: inv._id });
      if (!line) return res.status(404).json({ error: 'Ligne introuvable' });

      if (req.body?.motif_ecart !== undefined) {
        const motif = asOptionalString(req.body?.motif_ecart) || '';
        if (motif && !MOTIFS_ECART.includes(motif)) return res.status(400).json({ error: 'motif_ecart invalide' });
        line.motif_ecart = motif;
      }

      if (req.body?.observation_responsable !== undefined) {
        const note = asOptionalString(req.body?.observation_responsable) || '';
        if (note && !isSafeText(note, { min: 0, max: 600 })) return res.status(400).json({ error: 'observation_responsable invalide' });
        line.observation_responsable = note;
      }

      await line.save();
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to update line', details: err.message });
    }
  }
);

// POST /api/inventory/responsable/inventories/:id/recount-request
router.post(
  '/responsable/inventories/:id/recount-request',
  strictBody(['motif', 'scope', 'line_ids']),
  async (req, res) => {
    try {
      if (!ensureRole(req, res, ['responsable'])) return;
      if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });

      const motif = asOptionalString(req.body?.motif);
      if (!motif || !isSafeText(motif, { min: 5, max: 300 })) return res.status(400).json({ error: 'motif obligatoire (min 5)' });
      const scope = asOptionalString(req.body?.scope) || 'all_deltas';
      if (!['all_deltas', 'critical_deltas', 'selected'].includes(scope)) return res.status(400).json({ error: 'scope invalide' });
      const rawLineIds = Array.isArray(req.body?.line_ids) ? req.body.line_ids : [];
      const selectedLineIds = rawLineIds.map((x) => String(x || '').trim()).filter((x) => isValidObjectIdLike(x));

      const inv = await Inventory.findById(req.params.id);
      if (!inv) return res.status(404).json({ error: 'Inventaire introuvable' });
      if (String(inv.responsable_id) !== String(req.user.id)) return res.status(403).json({ error: 'Acces refuse' });
      if (String(inv.status) !== 'A_VALIDER') return res.status(409).json({ error: 'Inventaire non recomptable (statut requis: A_VALIDER)' });

      const lines = await InventoryLine.find({ inventory_id: inv._id })
        .populate('product_id', '_id family category')
        .select('_id product_id quantite_comptee quantite_theorique_initiale ecart')
        .lean();
      if (!lines.length) return res.status(409).json({ error: 'Aucune ligne' });

      const categoryIds = lines.map((l) => l.product_id?.category).filter((x) => x && isValidObjectIdLike(String(x)));
      const categories = categoryIds.length
        ? await Category.find({ _id: { $in: categoryIds } }).select('_id is_sensitive').lean()
        : [];
      const categoryById = new Map(categories.map((c) => [String(c._id), Boolean(c.is_sensitive)]));

      const deltaLines = lines.filter((l) => {
        const theo = Math.max(0, Math.floor(Number(l.quantite_theorique_initiale || 0)));
        const counted = Math.max(0, Math.floor(Number(l.quantite_comptee || 0)));
        const delta = Number.isFinite(Number(l.ecart)) ? Number(l.ecart) : (counted - theo);
        return delta !== 0;
      });

      let targets = [];
      if (scope === 'selected') {
        const selected = new Set(selectedLineIds);
        targets = lines.filter((l) => selected.has(String(l._id)));
      } else if (scope === 'critical_deltas') {
        targets = deltaLines.filter((l) => {
          const family = String(l.product_id?.family || '');
          const catId = l.product_id?.category ? String(l.product_id.category) : '';
          const isSensitive = catId ? Boolean(categoryById.get(catId)) : false;
          return isSensitive || CRITICAL_FAMILIES.has(family);
        });
      } else {
        targets = deltaLines;
      }

      if (!targets.length) {
        return res.status(409).json({ error: 'Aucune ligne cible pour recomptage' });
      }

      const targetIds = targets.map((t) => t._id);
      const now = new Date();

      await runInTransaction(async (mongoSession) => {
        inv.status = 'A_RECOMPTER';
        inv.motif_recomptage = motif;
        inv.recount_requested_at = now;
        inv.recount_requested_by = req.user.id;
        await inv.save(mongoSession ? { session: mongoSession } : undefined);

        // Reset recount flags for all, then set for targets only (clear old note).
        await InventoryLine.updateMany(
          { inventory_id: inv._id },
          { $set: { requires_recount: false, observation_responsable: '' } },
          mongoSession ? { session: mongoSession } : undefined
        );

        await InventoryLine.updateMany(
          { inventory_id: inv._id, _id: { $in: targetIds } },
          { $set: { requires_recount: true, observation_responsable: motif } },
          mongoSession ? { session: mongoSession } : undefined
        );

        await History.create(
          [
            {
              action_type: 'inventory',
              user: req.user.id,
              source: 'ui',
              description: 'Le responsable a demandé un recomptage.',
              actor_role: req.user.role,
              tags: ['inventory', 'recount', 'RECOUNT_REQUESTED'],
              status_before: 'A_VALIDER',
              status_after: 'A_RECOMPTER',
              context: {
                event: 'RECOUNT_REQUESTED',
                inventory_id: String(inv._id),
                reference: inv.reference,
                motif,
                scope,
                targets_count: targetIds.length,
              },
            },
          ],
          mongoSession ? { session: mongoSession } : undefined
        );

        const targets = listAssignedMagasinierIds(inv);
        await Notification.insertMany(
          targets.map((userId) => ({
            user: userId,
            title: 'Recomptage demandé',
            message: `Le responsable demande un recomptage pour l'inventaire ${inv.reference}. Motif : ${motif}`,
            type: 'warning',
            is_read: false,
            event_type: 'RECOUNT_REQUESTED',
            inventory_id: inv._id,
          })),
          mongoSession ? { session: mongoSession } : undefined
        );
      });

      return res.json({ ok: true, inventory: { id: inv._id, status: inv.status }, targets_count: targetIds.length });
    } catch (err) {
      return res.status(400).json({ error: 'Failed to request recount', details: err.message });
    }
  }
);

// POST /api/inventory/responsable/inventories/:id/reject
router.post(
  '/responsable/inventories/:id/reject',
  strictBody(['motif']),
  async (req, res) => {
    try {
      if (!ensureRole(req, res, ['responsable'])) return;
      if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });

      const motif = asOptionalString(req.body?.motif);
      if (!motif || !isSafeText(motif, { min: 5, max: 400 })) return res.status(400).json({ error: 'motif obligatoire (min 5)' });

      const inv = await Inventory.findById(req.params.id);
      if (!inv) return res.status(404).json({ error: 'Inventaire introuvable' });
      if (String(inv.responsable_id) !== String(req.user.id)) return res.status(403).json({ error: 'Acces refuse' });
      if (String(inv.status) !== 'A_VALIDER') return res.status(409).json({ error: 'Inventaire non rejetable (statut requis: A_VALIDER)' });

      const now = new Date();

      await runInTransaction(async (mongoSession) => {
        inv.status = 'REJETE';
        inv.motif_rejet = motif;
        inv.rejected_at = now;
        inv.rejected_by = req.user.id;
        inv.movement_blocked = false;
        await inv.save(mongoSession ? { session: mongoSession } : undefined);

        await History.create(
          [
            {
              action_type: 'inventory',
              user: req.user.id,
              source: 'ui',
              description: "Le responsable a rejeté l'inventaire.",
              actor_role: req.user.role,
              tags: ['inventory', 'reject', 'INVENTORY_REJECTED'],
              status_before: 'A_VALIDER',
              status_after: 'REJETE',
              context: { event: 'INVENTORY_REJECTED', inventory_id: String(inv._id), reference: inv.reference, motif },
            },
          ],
          mongoSession ? { session: mongoSession } : undefined
        );

        const targets = listAssignedMagasinierIds(inv);
        await Notification.insertMany(
          targets.map((userId) => ({
            user: userId,
            title: 'Inventaire rejeté',
            message: `Votre inventaire ${inv.reference} a été rejeté. Motif : ${motif}`,
            type: 'alert',
            is_read: false,
            event_type: 'INVENTORY_REJECTED',
            inventory_id: inv._id,
          })),
          mongoSession ? { session: mongoSession } : undefined
        );
      });

      return res.json({ ok: true, inventory: { id: inv._id, status: inv.status } });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to reject inventory', details: err.message });
    }
  }
);

// POST /api/inventory/responsable/inventories/:id/validate
router.post('/responsable/inventories/:id/validate', async (req, res) => {
  try {
    if (!ensureRole(req, res, ['responsable'])) return;
    if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });

    const inv = await Inventory.findById(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Inventaire introuvable' });
    if (String(inv.responsable_id) !== String(req.user.id)) return res.status(403).json({ error: 'Acces refuse' });
    if (String(inv.status) !== 'A_VALIDER') return res.status(409).json({ error: 'Inventaire non validable (statut requis: A_VALIDER)' });

    const lines = await InventoryLine.find({ inventory_id: inv._id }).lean();
    if (!lines.length) return res.status(409).json({ error: 'Aucune ligne' });
    const anyNull = lines.some((l) => l.quantite_comptee === null || l.quantite_comptee === undefined);
    if (anyNull) return res.status(409).json({ error: 'Comptage incomplet' });

    const productIds = lines.map((l) => l.product_id).filter(Boolean);
    const unitPriceMap = await getPrimaryUnitPriceMap(productIds);

    const adjustments = [];
    const now = new Date();

    await runInTransaction(async (mongoSession) => {
      const mongoOpts = mongoSession ? { session: mongoSession } : undefined;
      for (const l of lines) {
        const product = mongoSession
          ? await Product.findById(l.product_id).session(mongoSession)
          : await Product.findById(l.product_id);
        if (!product) continue;

        const target = Math.max(0, Math.floor(Number(l.quantite_comptee || 0)));
        const current = Math.max(0, Math.floor(Number(product.quantity_current || 0)));
        const deltaFromCurrent = target - current;

        // Persist deltas based on theoretical snapshot (audit).
        const theo = Math.max(0, Math.floor(Number(l.quantite_theorique_initiale || 0)));
        const deltaTheo = target - theo;
        const unitPrice = unitPriceMap.get(String(product._id)) || 0;
        const value = Number.isFinite(unitPrice) ? (deltaTheo * unitPrice) : null;

        await InventoryLine.updateOne(
          { _id: l._id },
          { $set: { ecart: deltaTheo, valeur_ecart: value } },
          mongoOpts
        );

        if (deltaFromCurrent !== 0) {
          if (deltaFromCurrent > 0) {
            const entryNumber = await getNextEntryNumber();
            const entry = await StockEntry.create(
              [
                {
                  entry_number: entryNumber,
                  product: product._id,
                  quantity: deltaFromCurrent,
                  entry_mode: 'manual',
                  observation: `Ajustement inventaire ${inv.reference}`,
                  supplier: 'INVENTAIRE',
                  date_entry: now,
                  magasinier: inv.magasinier_id,
                },
              ],
              mongoOpts
            );
            adjustments.push({ kind: 'entry', product_id: String(product._id), delta: deltaFromCurrent, doc_number: entry[0].entry_number });
          } else {
            const exitQty = Math.abs(deltaFromCurrent);
            const exitNumber = await getNextExitNumber();
            const exit = await StockExit.create(
              [
                {
                  exit_number: exitNumber,
                  product: product._id,
                  quantity: exitQty,
                  exit_mode: 'manual',
                  note: `Ajustement inventaire ${inv.reference}`,
                  date_exit: now,
                  magasinier: inv.magasinier_id,
                },
              ],
              mongoOpts
            );
            adjustments.push({ kind: 'exit', product_id: String(product._id), delta: -exitQty, doc_number: exit[0].exit_number });
          }
        }

        product.quantity_current = target;
        product.status = computeProductStatus(product.quantity_current, product.seuil_minimum);
        await product.save(mongoOpts);
      }

      inv.status = 'VALIDE';
      inv.validated_at = now;
      inv.validated_by = req.user.id;
      inv.movement_blocked = false;
      await inv.save(mongoOpts);

      await History.create(
        [
          {
            action_type: 'inventory',
            user: req.user.id,
            source: 'ui',
            description: "Le responsable a validé l'inventaire et ajusté le stock.",
            actor_role: req.user.role,
            tags: ['inventory', 'validate', 'INVENTORY_VALIDATED'],
            status_before: 'A_VALIDER',
            status_after: 'VALIDE',
            context: {
              event: 'INVENTORY_VALIDATED',
              inventory_id: String(inv._id),
              reference: inv.reference,
              adjustments_count: adjustments.length,
            },
          },
        ],
        mongoOpts
      );

      const targets = listAssignedMagasinierIds(inv);
      await Notification.insertMany(
        targets.map((userId) => ({
          user: userId,
          title: 'Inventaire validé',
          message: `Votre inventaire ${inv.reference} a été validé par le responsable.`,
          type: 'info',
          is_read: false,
          event_type: 'INVENTORY_VALIDATED',
          inventory_id: inv._id,
        })),
        mongoOpts
      );
    });

    return res.json({ ok: true, inventory: { id: inv._id, reference: inv.reference, status: inv.status }, adjustments });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to validate inventory', details: err.message });
  }
});

// GET /api/inventory/magasinier/missions
// Missions for the connected magasinier. Includes progress (counted/total).
router.get('/magasinier/missions', async (req, res) => {
  try {
    if (!ensureRole(req, res, ['magasinier'])) return;

    const q = {
      $or: [{ magasinier_id: req.user.id }, { magasinier_ids: req.user.id }],
      status: { $in: ['A_FAIRE', 'EN_COURS', 'A_RECOMPTER', 'A_VALIDER', 'VALIDE', 'REJETE'] },
    };

    const items = await Inventory.find(q)
      .sort({ date_prevue: 1, date_lancement: -1 })
      .limit(120)
      .populate('magasin_id', 'code name')
      .populate('zone_id', 'code name')
      .populate('categorie_id', 'name')
      .populate('product_id', '_id code_product name')
      .populate('responsable_id', 'username role')
      .lean();

    const ids = items.map((i) => i._id);
    const agg = ids.length
      ? await InventoryLine.aggregate([
          { $match: { inventory_id: { $in: ids } } },
          {
            $group: {
              _id: '$inventory_id',
              total: { $sum: 1 },
              counted: { $sum: { $cond: ['$is_counted', 1, 0] } },
            },
          },
        ])
      : [];

    const byInventoryId = new Map(agg.map((a) => [String(a._id), computeProgress({ total: a.total, counted: a.counted })]));

    const missions = items.map((inv) => ({
      inventory: sanitizeInventoryForMagasinier(inv),
      progress: byInventoryId.get(String(inv._id)) || computeProgress({ total: 0, counted: 0 }),
    }));

    return res.json({ ok: true, missions });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch missions', details: err.message });
  }
});

// GET /api/inventory/magasinier/inventories/:id
// Counting sheet for magasinier.
router.get('/magasinier/inventories/:id', async (req, res) => {
  try {
    if (!ensureRole(req, res, ['magasinier'])) return;
    if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });

    const inv = await Inventory.findById(req.params.id)
      .populate('magasin_id', 'code name')
      .populate('zone_id', 'code name')
      .populate('categorie_id', 'name')
      .populate('product_id', '_id code_product name')
      .populate('responsable_id', 'username role')
      .populate('magasinier_id', 'username role')
      .populate('magasinier_ids', 'username role')
      .lean();

    if (!inv) return res.status(404).json({ error: 'Inventaire introuvable' });
    if (!isAssignedMagasinier(inv, req.user.id)) return res.status(403).json({ error: 'Acces refuse' });

    const linesRaw = await InventoryLine.find({ inventory_id: inv._id })
      .populate('product_id', '_id code_product name unite emplacement qr_code_value')
      .sort({ is_counted: 1, updatedAt: -1 })
      .lean();

    const lines = linesRaw.map((l) => {
      const counted = l.quantite_comptee === null || l.quantite_comptee === undefined ? null : Math.max(0, Math.floor(Number(l.quantite_comptee || 0)));
      return {
        _id: l._id,
        product: {
          _id: l.product_id?._id,
          code_product: l.product_id?.code_product || '-',
          name: l.product_id?.name || 'Produit',
          unite: l.product_id?.unite || '',
          qr_code_value: l.product_id?.qr_code_value || '',
          emplacement: l.emplacement_id || l.product_id?.emplacement || '',
        },
        lot: l.stock_id || '',
        quantite_comptee: counted,
        observation_magasinier: l.observation_magasinier || '',
        // For recount scenario: allow showing responsable note/motif, not quantities.
        motif_recompte: l.observation_responsable || '',
        requires_recount: Boolean(l.requires_recount),
        is_counted: Boolean(l.is_counted),
        is_verified_by_magasinier: Boolean(l.is_verified_by_magasinier),
        updatedAt: l.updatedAt,
      };
    });

    const total = linesRaw.length;
    const counted = linesRaw.reduce((acc, l) => acc + (l.is_counted ? 1 : 0), 0);

    return res.json({
      ok: true,
      inventory: sanitizeInventoryForMagasinier(inv),
      progress: computeProgress({ total, counted }),
      lines,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch inventory sheet', details: err.message });
  }
});

// POST /api/inventory/magasinier/inventories/:id/lines/:lineId/verify
router.post(
  '/magasinier/inventories/:id/lines/:lineId/verify',
  strictBody(['verified']),
  async (req, res) => {
    try {
      if (!ensureRole(req, res, ['magasinier'])) return;
      if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });
      if (!isValidObjectIdLike(req.params.lineId)) return res.status(400).json({ error: 'lineId invalide' });

      const verified = Boolean(req.body?.verified);

      const inv = await Inventory.findById(req.params.id).select('_id status magasinier_id magasinier_ids reference').lean();
      if (!inv) return res.status(404).json({ error: 'Inventaire introuvable' });
      if (!isAssignedMagasinier(inv, req.user.id)) return res.status(403).json({ error: 'Acces refuse' });
      if (!['EN_COURS', 'A_RECOMPTER'].includes(String(inv.status))) return res.status(409).json({ error: 'Inventaire non modifiable' });

      const line = await InventoryLine.findOne({ _id: req.params.lineId, inventory_id: inv._id });
      if (!line) return res.status(404).json({ error: 'Ligne introuvable' });
      if (verified && (line.quantite_comptee === null || line.quantite_comptee === undefined)) {
        return res.status(409).json({ error: 'Impossible de verifier une ligne non comptee' });
      }

      line.is_verified_by_magasinier = verified;
      await line.save();

      if (verified) {
        await History.create({
          action_type: 'inventory',
          user: req.user.id,
          source: 'ui',
          description: 'Le magasinier a marque une ligne comme verifiee.',
          actor_role: req.user.role,
          tags: ['inventory', 'line_verified', 'INVENTORY_LINE_VERIFIED'],
          status_before: String(inv.status),
          status_after: String(inv.status),
          context: { event: 'INVENTORY_LINE_VERIFIED', inventory_id: String(inv._id), reference: inv.reference, line_id: String(line._id) },
        });
      }

      return res.json({ ok: true, line: { _id: line._id, is_verified_by_magasinier: line.is_verified_by_magasinier } });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to verify line', details: err.message });
    }
  }
);

// POST /api/inventory/magasinier/inventories/:id/start
router.post('/magasinier/inventories/:id/start', async (req, res) => {
  try {
    if (!ensureRole(req, res, ['magasinier'])) return;
    if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });

    const inv = await Inventory.findById(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Inventaire introuvable' });
    if (!isAssignedMagasinier(inv, req.user.id)) return res.status(403).json({ error: 'Acces refuse' });
    if (String(inv.status) !== 'A_FAIRE') return res.status(409).json({ error: 'Inventaire non demarrable' });

    inv.status = 'EN_COURS';
    await inv.save();

    await History.create({
      action_type: 'inventory',
      user: req.user.id,
      source: 'ui',
      description: "Le magasinier a commencé l'inventaire.",
      actor_role: req.user.role,
      tags: ['inventory', 'start', 'INVENTORY_STARTED'],
      status_before: 'A_FAIRE',
      status_after: 'EN_COURS',
      context: { event: 'INVENTORY_STARTED', inventory_id: String(inv._id), reference: inv.reference },
    });

    return res.json({ ok: true, inventory: inv });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to start inventory', details: err.message });
  }
});

// POST /api/inventory/magasinier/inventories/:id/save-progress
router.post('/magasinier/inventories/:id/save-progress', async (req, res) => {
  try {
    if (!ensureRole(req, res, ['magasinier'])) return;
    if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });

    const inv = await Inventory.findById(req.params.id).lean();
    if (!inv) return res.status(404).json({ error: 'Inventaire introuvable' });
    if (!isAssignedMagasinier(inv, req.user.id)) return res.status(403).json({ error: 'Acces refuse' });
    if (!['EN_COURS', 'A_RECOMPTER'].includes(String(inv.status))) return res.status(409).json({ error: 'Progression non sauvegardable' });

    await History.create({
      action_type: 'inventory',
      user: req.user.id,
      source: 'ui',
      description: 'Le magasinier a sauvegarde la progression.',
      actor_role: req.user.role,
      tags: ['inventory', 'progress_saved', 'INVENTORY_PROGRESS_SAVED'],
      status_before: String(inv.status),
      status_after: String(inv.status),
      context: { event: 'INVENTORY_PROGRESS_SAVED', inventory_id: String(inv._id), reference: inv.reference },
    });

    return res.json({ ok: true, message: 'Progression sauvegardee' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save progress', details: err.message });
  }
});

// PATCH /api/inventory/magasinier/inventories/:id/lines/:lineId
router.patch(
  '/magasinier/inventories/:id/lines/:lineId',
  strictBody(['quantite_comptee', 'observation_magasinier']),
  async (req, res) => {
    try {
      if (!ensureRole(req, res, ['magasinier'])) return;
      if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });
      if (!isValidObjectIdLike(req.params.lineId)) return res.status(400).json({ error: 'lineId invalide' });

      const inv = await Inventory.findById(req.params.id).select('_id status magasinier_id magasinier_ids recount_requested_at').lean();
      if (!inv) return res.status(404).json({ error: 'Inventaire introuvable' });
      if (!isAssignedMagasinier(inv, req.user.id)) return res.status(403).json({ error: 'Acces refuse' });
      if (!['EN_COURS', 'A_RECOMPTER'].includes(String(inv.status))) {
        return res.status(409).json({ error: 'Inventaire non modifiable' });
      }

      const qty = asNonNegativeNumber(req.body?.quantite_comptee);
      if (qty === undefined || Number.isNaN(qty)) return res.status(400).json({ error: 'quantite_comptee obligatoire et >= 0' });
      const countedQty = Math.max(0, Math.floor(Number(qty || 0)));

      const observation = asOptionalString(req.body?.observation_magasinier) || '';
      if (observation && !isSafeText(observation, { min: 0, max: 600 })) return res.status(400).json({ error: 'observation invalide' });
      if (countedQty === 0 && !observation) return res.status(400).json({ error: 'Observation obligatoire si quantite_comptee = 0' });

      const line = await InventoryLine.findOne({ _id: req.params.lineId, inventory_id: inv._id });
      if (!line) return res.status(404).json({ error: 'Ligne introuvable' });

      const isRecountFlow = String(inv.status) === 'A_RECOMPTER';
      const recountRequestedAt = inv.recount_requested_at ? new Date(inv.recount_requested_at) : null;
      const needsRecount = Boolean(line.requires_recount);
      const shouldTrackRecount = isRecountFlow && needsRecount && recountRequestedAt && (!line.last_recount_at || new Date(line.last_recount_at) < recountRequestedAt);

      if (isRecountFlow && needsRecount && !observation) {
        return res.status(400).json({ error: 'Observation obligatoire pendant un recomptage' });
      }

      if (shouldTrackRecount) {
        line.previous_quantite_comptee = line.quantite_comptee === null || line.quantite_comptee === undefined
          ? null
          : Math.max(0, Math.floor(Number(line.quantite_comptee || 0)));
        line.recount_count = Math.max(0, Math.floor(Number(line.recount_count || 0))) + 1;
        line.last_recount_at = new Date();
      }

      line.quantite_comptee = countedQty;
      line.observation_magasinier = observation;
      line.is_counted = true;
      line.is_verified_by_magasinier = false;
      await line.save();

      return res.json({
        ok: true,
        line: {
          _id: line._id,
          inventory_id: line.inventory_id,
          product_id: line.product_id,
          quantite_comptee: line.quantite_comptee,
          observation_magasinier: line.observation_magasinier,
          is_counted: line.is_counted,
          updatedAt: line.updatedAt,
        },
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save line', details: err.message });
    }
  }
);

// POST /api/inventory/magasinier/inventories/:id/add-found
router.post(
  '/magasinier/inventories/:id/add-found',
  strictBody(['product_id', 'quantite_comptee', 'observation_magasinier']),
  async (req, res) => {
    try {
      if (!ensureRole(req, res, ['magasinier'])) return;
      if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });

      const inv = await Inventory.findById(req.params.id).lean();
      if (!inv) return res.status(404).json({ error: 'Inventaire introuvable' });
      if (!isAssignedMagasinier(inv, req.user.id)) return res.status(403).json({ error: 'Acces refuse' });
      if (String(inv.type_inventaire) !== 'GLOBAL') return res.status(409).json({ error: 'Ajout article reserve a GLOBAL' });
      if (!['EN_COURS', 'A_RECOMPTER'].includes(String(inv.status))) return res.status(409).json({ error: 'Inventaire non modifiable' });

      const productId = asOptionalString(req.body?.product_id);
      if (!productId || !isValidObjectIdLike(productId)) return res.status(400).json({ error: 'product_id obligatoire' });

      const qty = asNonNegativeNumber(req.body?.quantite_comptee);
      if (qty === undefined || Number.isNaN(qty)) return res.status(400).json({ error: 'quantite_comptee obligatoire et >= 0' });
      const countedQty = Math.max(0, Math.floor(Number(qty || 0)));

      const observation = asOptionalString(req.body?.observation_magasinier) || '';
      if (!observation) return res.status(400).json({ error: 'Observation obligatoire pour article ajoute' });
      if (!isSafeText(observation, { min: 2, max: 600 })) return res.status(400).json({ error: 'observation invalide' });

      const exists = await InventoryLine.findOne({ inventory_id: inv._id, product_id: productId }).select('_id').lean();
      if (exists) return res.status(409).json({ error: 'Article deja present dans la feuille' });

      const product = await Product.findById(productId).select('_id quantity_current emplacement name code_product').lean();
      if (!product) return res.status(404).json({ error: 'Produit introuvable' });

      const created = await InventoryLine.create({
        inventory_id: inv._id,
        product_id: product._id,
        // Best-effort snapshot: product not present at launch (e.g. created after launch).
        quantite_theorique_initiale: Math.max(0, Math.floor(Number(product.quantity_current || 0))),
        quantite_comptee: countedQty,
        ecart: null,
        valeur_ecart: null,
        motif_ecart: 'added_found',
        observation_magasinier: observation,
        observation_responsable: '',
        is_counted: true,
        emplacement_id: String(product.emplacement || ''),
        stock_id: '',
      });

      return res.status(201).json({ ok: true, line_id: created._id });
    } catch (err) {
      return res.status(400).json({ error: 'Failed to add found article', details: err.message });
    }
  }
);

// POST /api/inventory/magasinier/inventories/:id/submit
router.post('/magasinier/inventories/:id/submit', async (req, res) => {
  try {
    if (!ensureRole(req, res, ['magasinier'])) return;
    if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });

    const inv = await Inventory.findById(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Inventaire introuvable' });
    if (!isAssignedMagasinier(inv, req.user.id)) return res.status(403).json({ error: 'Acces refuse' });
    if (!['EN_COURS', 'A_RECOMPTER'].includes(String(inv.status))) return res.status(409).json({ error: 'Inventaire non soumissible' });

    const lines = await InventoryLine.find({ inventory_id: inv._id }).select('_id is_counted quantite_comptee observation_magasinier quantite_theorique_initiale requires_recount last_recount_at').lean();
    if (!lines.length) return res.status(409).json({ error: 'Aucune ligne' });

    const missing = lines.filter((l) => !l.is_counted);
    if (missing.length) return res.status(409).json({ error: 'Toutes les lignes ne sont pas comptees', details: `${missing.length} ligne(s) restantes` });

    const invalidObs = lines.filter((l) => Number(l.quantite_comptee || 0) === 0 && !String(l.observation_magasinier || '').trim());
    if (invalidObs.length) return res.status(400).json({ error: 'Observation obligatoire pour quantite = 0', details: `${invalidObs.length} ligne(s)` });

    const oldStatus = String(inv.status);
    const submittedAt = new Date();

    if (oldStatus === 'A_RECOMPTER') {
      const requestedAt = inv.recount_requested_at ? new Date(inv.recount_requested_at) : null;
      const recountLines = lines.filter((l) => Boolean(l.requires_recount));
      if (requestedAt && recountLines.length) {
        const notRecounted = recountLines.filter((l) => !l.last_recount_at || new Date(l.last_recount_at) < requestedAt);
        if (notRecounted.length) {
          return res.status(409).json({ error: 'Recomptage incomplet', details: `${notRecounted.length} ligne(s) demandee(s) non recomptées` });
        }
      }
    }

    await runInTransaction(async (mongoSession) => {
      // Compute deltas in background (not exposed to magasinier).
      for (const l of lines) {
        const counted = Math.max(0, Math.floor(Number(l.quantite_comptee || 0)));
        const theo = Math.max(0, Math.floor(Number(l.quantite_theorique_initiale || 0)));
        const delta = counted - theo;
        await InventoryLine.updateOne(
          { _id: l._id },
          { $set: { ecart: delta, valeur_ecart: null, requires_recount: false } },
          mongoSession ? { session: mongoSession } : undefined
        );
      }

      inv.status = 'A_VALIDER';
      inv.submitted_at = submittedAt;
      await inv.save(mongoSession ? { session: mongoSession } : undefined);

      await History.create(
        [
          {
            action_type: 'inventory',
            user: req.user.id,
            source: 'ui',
            description: "Le magasinier a soumis l'inventaire pour validation.",
            actor_role: req.user.role,
            tags: ['inventory', 'submitted', 'INVENTORY_SUBMITTED'],
            status_before: oldStatus,
            status_after: 'A_VALIDER',
            context: { event: 'INVENTORY_SUBMITTED', inventory_id: String(inv._id), reference: inv.reference },
          },
        ],
        mongoSession ? { session: mongoSession } : undefined
      );

      await Notification.create(
        [
          {
            user: inv.responsable_id,
            title: oldStatus === 'A_RECOMPTER' ? 'Recomptage terminé' : 'Inventaire en attente de validation',
            message: oldStatus === 'A_RECOMPTER'
              ? `Le magasinier a termine le recomptage de l'inventaire ${inv.reference}.`
              : `Le magasinier a termine le comptage de l'inventaire ${inv.reference}.`,
            type: 'warning',
            is_read: false,
            event_type: oldStatus === 'A_RECOMPTER' ? 'RECOUNT_FINISHED' : 'INVENTORY_TO_VALIDATE',
            inventory_id: inv._id,
          },
        ],
        mongoSession ? { session: mongoSession } : undefined
      );
    });

    return res.json({ ok: true, inventory: { id: inv._id, reference: inv.reference, status: inv.status } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to submit inventory', details: err.message });
  }
});

// PATCH /api/inventory/responsable/inventories/:id/settings
router.patch(
  '/responsable/inventories/:id/settings',
  strictBody(['date_prevue', 'commentaire', 'magasinier_ids', 'notifications_activees', 'bloquer_mouvements', 'movement_blocked_product_ids']),
  async (req, res) => {
    try {
      if (!ensureRole(req, res, ['responsable'])) return;
      if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });

      const inv = await Inventory.findById(req.params.id);
      if (!inv) return res.status(404).json({ error: 'Inventaire introuvable' });
      if (String(inv.responsable_id) !== String(req.user.id)) return res.status(403).json({ error: 'Acces refuse' });
      if (!EDITABLE_INVENTORY_STATUSES.includes(String(inv.status))) {
        return res.status(409).json({ error: 'Inventaire non modifiable pendant ce statut' });
      }

      const changes = [];

      if (req.body?.date_prevue !== undefined) {
        const datePrevue = asDate(req.body?.date_prevue);
        if (datePrevue === undefined || datePrevue === null) return res.status(400).json({ error: 'date_prevue invalide' });
        inv.date_prevue = datePrevue;
        changes.push('date_prevue');
      }

      if (req.body?.commentaire !== undefined) {
        const commentaire = asOptionalString(req.body?.commentaire) || '';
        if (commentaire && !isSafeText(commentaire, { min: 0, max: 600 })) return res.status(400).json({ error: 'commentaire invalide' });
        inv.commentaire = commentaire;
        changes.push('commentaire');
      }

      if (req.body?.notifications_activees !== undefined) {
        inv.notifications_activees = Boolean(req.body.notifications_activees);
        changes.push('notifications_activees');
      }

      if (req.body?.magasinier_ids !== undefined) {
        const rawIds = Array.isArray(req.body.magasinier_ids) ? req.body.magasinier_ids : [];
        const magasinierIds = uniqueObjectIdStrings(rawIds);
        if (!magasinierIds.length) return res.status(400).json({ error: 'magasinier_ids obligatoire' });
        if (magasinierIds.some((id) => !isValidObjectIdLike(id))) return res.status(400).json({ error: 'magasinier_id invalide' });

        const users = await User.find({ _id: { $in: magasinierIds } }).select('_id username role status').lean();
        const byId = new Map(users.map((u) => [String(u._id), u]));
        const ordered = magasinierIds.map((id) => byId.get(id)).filter(Boolean);
        if (ordered.length !== magasinierIds.length) return res.status(404).json({ error: 'Magasinier introuvable' });
        if (ordered.some((u) => String(u.role) !== 'magasinier')) return res.status(400).json({ error: 'Utilisateur non magasinier' });
        if (ordered.some((u) => String(u.status || 'active') !== 'active')) return res.status(409).json({ error: 'Magasinier inactif/bloque' });

        inv.magasinier_id = ordered[0]._id;
        inv.magasinier_ids = ordered.map((u) => u._id);
        changes.push('magasinier_ids');
      }

      if (req.body?.bloquer_mouvements !== undefined || req.body?.movement_blocked_product_ids !== undefined) {
        const enabled = req.body?.bloquer_mouvements !== undefined
          ? Boolean(req.body.bloquer_mouvements)
          : Boolean(inv.bloquer_mouvements);
        const allLineProductIds = await resolveInventoryLineProductIds(inv._id);
        let productIds = [];

        if (enabled) {
          const requested = uniqueObjectIdStrings(req.body?.movement_blocked_product_ids || []);
          if (requested.length) {
            const allowed = new Set(allLineProductIds.map(String));
            const invalid = requested.find((id) => !allowed.has(String(id)));
            if (invalid) return res.status(400).json({ error: 'Produit hors perimetre inventaire' });
            productIds = requested;
          } else if (String(inv.type_inventaire) !== 'GLOBAL') {
            productIds = allLineProductIds;
          }
        }

        const movementLock = buildMovementLockConfig({
          enabled,
          typeInventaire: inv.type_inventaire,
          productIds,
        });
        inv.bloquer_mouvements = movementLock.bloquer_mouvements;
        inv.movement_blocked = movementLock.movement_blocked;
        inv.movement_block_scope = movementLock.movement_block_scope;
        inv.movement_blocked_product_ids = movementLock.movement_blocked_product_ids;
        changes.push('mouvement_lock');
      }

      if (!changes.length) return res.status(400).json({ error: 'Aucune modification' });

      await inv.save();
      await History.create({
        action_type: 'inventory',
        user: req.user.id,
        source: 'ui',
        description: "Le responsable a modifie les parametres de l'inventaire.",
        actor_role: req.user.role,
        tags: ['inventory', 'settings', 'INVENTORY_UPDATED'],
        context: {
          event: 'INVENTORY_UPDATED',
          inventory_id: String(inv._id),
          reference: inv.reference,
          changes,
          movement_blocked: Boolean(inv.movement_blocked),
          movement_block_scope: inv.movement_block_scope || 'none',
          movement_blocked_product_ids: uniqueObjectIdStrings(inv.movement_blocked_product_ids),
        },
      });

      const updated = await Inventory.findById(inv._id)
        .populate('responsable_id', 'username role')
        .populate('magasinier_id', 'username role')
        .populate('magasinier_ids', 'username role')
        .populate('magasin_id', 'code name')
        .populate('zone_id', 'code name')
        .populate('categorie_id', 'name')
        .populate('product_id', '_id code_product name')
        .lean();

      return res.json({ ok: true, inventory: updated });
    } catch (err) {
      return res.status(400).json({ error: 'Failed to update inventory settings', details: err.message });
    }
  }
);

// POST /api/inventory/responsable/inventories/:id/cancel
router.post(
  '/responsable/inventories/:id/cancel',
  strictBody(['motif']),
  async (req, res) => {
    try {
      if (!ensureRole(req, res, ['responsable'])) return;
      if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });

      const motif = asOptionalString(req.body?.motif);
      if (!motif || !isSafeText(motif, { min: 5, max: 400 })) return res.status(400).json({ error: 'motif obligatoire (min 5)' });

      const inv = await Inventory.findById(req.params.id);
      if (!inv) return res.status(404).json({ error: 'Inventaire introuvable' });
      if (String(inv.responsable_id) !== String(req.user.id)) return res.status(403).json({ error: 'Acces refuse' });
      if (!ACTIVE_INVENTORY_STATUSES.includes(String(inv.status))) return res.status(409).json({ error: 'Inventaire deja cloture' });

      const before = String(inv.status);
      const now = new Date();

      await runInTransaction(async (mongoSession) => {
        inv.status = 'ANNULE';
        inv.motif_annulation = motif;
        inv.cancelled_at = now;
        inv.cancelled_by = req.user.id;
        inv.movement_blocked = false;
        inv.movement_block_scope = 'none';
        inv.movement_blocked_product_ids = [];
        await inv.save(mongoSession ? { session: mongoSession } : undefined);

        await History.create(
          [
            {
              action_type: 'inventory',
              user: req.user.id,
              source: 'ui',
              description: "Le responsable a annule l'inventaire.",
              actor_role: req.user.role,
              tags: ['inventory', 'cancel', 'INVENTORY_CANCELLED'],
              status_before: before,
              status_after: 'ANNULE',
              context: { event: 'INVENTORY_CANCELLED', inventory_id: String(inv._id), reference: inv.reference, motif },
            },
          ],
          mongoSession ? { session: mongoSession } : undefined
        );

        const targets = listAssignedMagasinierIds(inv);
        if (targets.length) {
          await Notification.insertMany(
            targets.map((userId) => ({
              user: userId,
              title: 'Inventaire annule',
              message: `L'inventaire ${inv.reference} a ete annule. Motif : ${motif}`,
              type: 'warning',
              is_read: false,
              event_type: 'INVENTORY_CANCELLED',
              inventory_id: inv._id,
            })),
            mongoSession ? { session: mongoSession } : undefined
          );
        }
      });

      return res.json({ ok: true, inventory: { id: inv._id, reference: inv.reference, status: inv.status } });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to cancel inventory', details: err.message });
    }
  }
);

// DELETE /api/inventory/responsable/inventories/:id
router.delete('/responsable/inventories/:id', async (req, res) => {
  try {
    if (!ensureRole(req, res, ['responsable'])) return;
    if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });

    const inv = await Inventory.findById(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Inventaire introuvable' });
    if (String(inv.responsable_id) !== String(req.user.id)) return res.status(403).json({ error: 'Acces refuse' });

    return res.status(409).json({
      code: 'INVENTORY_DELETE_DISABLED',
      error: "Suppression definitive des inventaires desactivee. Utilisez l'annulation pour desactiver l'inventaire et conserver l'audit.",
      inventory: { id: inv._id, reference: inv.reference, status: inv.status },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete inventory', details: err.message });
  }
});

// GET /api/inventory/inventories
router.get('/inventories', async (req, res) => {
  try {
    const role = String(req.user?.role || '');

    const q = {};
    if (role === 'magasinier') {
      q.$or = [{ magasinier_id: req.user.id }, { magasinier_ids: req.user.id }];
    } else if (role === 'responsable') {
      q.responsable_id = req.user.id;
    }

    const status = asOptionalString(req.query?.status);
    if (status && ACTIVE_INVENTORY_STATUSES.concat(['BROUILLON', 'VALIDE', 'REJETE', 'ANNULE']).includes(status)) {
      q.status = status;
    }

    const items = await Inventory.find(q)
      .sort({ date_lancement: -1, createdAt: -1 })
      .limit(120)
      .populate('responsable_id', 'username role')
      .populate('magasinier_id', 'username role')
      .populate('magasinier_ids', 'username role')
      .populate('magasin_id', 'code name')
      .populate('zone_id', 'code name')
      .populate('categorie_id', 'name')
      .populate('product_id', '_id code_product name')
      .lean();

    const ids = items.map((inv) => inv._id);
    const progressAgg = ids.length
      ? await InventoryLine.aggregate([
          { $match: { inventory_id: { $in: ids } } },
          {
            $group: {
              _id: '$inventory_id',
              total: { $sum: 1 },
              counted: { $sum: { $cond: ['$is_counted', 1, 0] } },
              recount: { $sum: { $cond: ['$requires_recount', 1, 0] } },
            },
          },
        ])
      : [];
    const progressById = new Map(progressAgg.map((row) => [String(row._id), computeProgress(row)]));
    const recountById = new Map(progressAgg.map((row) => [String(row._id), Number(row.recount || 0)]));

    const inventories = items.map((inv) => {
      const base = role === 'magasinier' ? sanitizeInventoryForMagasinier(inv) : inv;
      return {
        ...base,
        progress: progressById.get(String(inv._id)) || computeProgress({ total: 0, counted: 0 }),
        recount_lines_count: Number(recountById.get(String(inv._id)) || 0),
      };
    });

    return res.json({ ok: true, inventories });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch inventories', details: err.message });
  }
});

// POST /api/inventory/inventories (launch)
router.post(
  '/inventories',
  strictBody([
    'type_inventaire',
    'magasin_id',
    'zone_id',
    'famille_id',
    'categorie_id',
    'product_id',
    'product_query',
    'magasinier_id',
    'magasinier_ids',
    'date_prevue',
    'commentaire',
    'bloquer_mouvements',
    'notifications_activees',
  ]),
  async (req, res) => {
    try {
      if (!ensureRole(req, res, ['responsable'])) return;

      const errors = [];
      const typeInventaire = asOptionalString(req.body?.type_inventaire);
      if (!typeInventaire || !['GLOBAL', 'TOURNANT'].includes(typeInventaire)) errors.push('type_inventaire obligatoire (GLOBAL/TOURNANT)');

      let magasinId = asOptionalString(req.body?.magasin_id);
      if (magasinId && !isValidObjectIdLike(magasinId)) {
        errors.push('magasin_id invalide');
      } else if (magasinId) {
        const magasin = await Laboratory.findOne({ _id: magasinId, active: true }).select('_id').lean();
        if (!magasin) errors.push('magasin introuvable ou inactif');
      } else {
        const defaultMagasin = await getOrCreateDefaultInventoryMagasin(req.user?.id);
        magasinId = defaultMagasin?._id ? String(defaultMagasin._id) : '';
        if (!magasinId) errors.push('magasin indisponible pour lancer inventaire');
      }

      const zoneIdRaw = asOptionalString(req.body?.zone_id);
      const zoneId = null;
      if (zoneIdRaw) errors.push('zone_id n est plus utilise pour lancer un inventaire');

      const categorieIdRaw = asOptionalString(req.body?.categorie_id);
      const categorieId = categorieIdRaw && isValidObjectIdLike(categorieIdRaw) ? categorieIdRaw : null;

      const familleIdRaw = asOptionalString(req.body?.famille_id);
      const familleId = normalizeFamily(familleIdRaw);
      if (familleIdRaw && !familleId) errors.push('famille_id invalide');

      const productIdRaw = asOptionalString(req.body?.product_id);
      const productQuery = asOptionalString(req.body?.product_query);
      const productResolution = await resolveInventoryProduct({ productId: productIdRaw, productQuery });
      if (productResolution.error) errors.push(productResolution.error);
      const productId = productResolution.product?._id ? String(productResolution.product._id) : null;

      const magasinierId = asOptionalString(req.body?.magasinier_id);
      const magasinierIdsRaw = Array.isArray(req.body?.magasinier_ids) ? req.body.magasinier_ids : [];
      const candidates = [];
      if (magasinierId) candidates.push(magasinierId);
      for (const raw of magasinierIdsRaw) {
        const id = asOptionalString(raw);
        if (id) candidates.push(id);
      }
      const seen = new Set();
      const magasinierIds = [];
      for (const id of candidates) {
        const key = String(id || '').trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        magasinierIds.push(key);
      }
      if (!magasinierIds.length) errors.push('magasinier obligatoire');
      if (magasinierIds.some((id) => !isValidObjectIdLike(id))) errors.push('magasinier_id invalide');

      const datePrevue = asDate(req.body?.date_prevue);
      if (datePrevue === undefined) errors.push('date_prevue obligatoire');
      if (datePrevue === null) errors.push('date_prevue invalide');

      const commentaire = asOptionalString(req.body?.commentaire) || '';
      if (commentaire && !isSafeText(commentaire, { min: 0, max: 600 })) errors.push('commentaire invalide');

      const bloquerMouvements = Boolean(req.body?.bloquer_mouvements);
      const notificationsActives = req.body?.notifications_activees !== false;

      if (typeInventaire === 'GLOBAL') {
        if (familleId || categorieId || productId) errors.push('Pour GLOBAL, ne pas selectionner produit/famille/categorie comme perimetre');
      }

      if (typeInventaire === 'TOURNANT') {
        if (!productId && !familleId && !categorieId) {
          errors.push('Pour TOURNANT, choisir au moins un produit, une famille ou une categorie');
        }
        const perimeterCount = [productId, familleId, categorieId].filter(Boolean).length;
        if (perimeterCount > 1) {
          errors.push('Pour TOURNANT, choisir un seul perimetre: produit, famille ou categorie');
        }
      }

      if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

      const magasinierRows = await User.find({ _id: { $in: magasinierIds } })
        .select('_id role status username')
        .lean();
      const byId = new Map(magasinierRows.map((u) => [String(u._id), u]));
      const orderedMagasiniers = magasinierIds.map((id) => byId.get(String(id))).filter(Boolean);
      if (orderedMagasiniers.length !== magasinierIds.length) return res.status(404).json({ error: 'Magasinier introuvable' });
      const nonMag = orderedMagasiniers.find((u) => String(u.role) !== 'magasinier');
      if (nonMag) return res.status(400).json({ error: 'Utilisateur non magasinier' });
      const blocked = orderedMagasiniers.find((u) => String(u.status || 'active') !== 'active');
      if (blocked) return res.status(409).json({ error: 'Magasinier inactif/bloque' });
      const primaryMagasinier = orderedMagasiniers[0];

      const existingActive = await Inventory.findOne({
        status: { $in: ACTIVE_INVENTORY_STATUSES },
        magasin_id: magasinId,
        type_inventaire: typeInventaire,
        zone_id: zoneId,
        famille_id: familleId,
        categorie_id: categorieId,
        product_id: productId,
      })
        .select('_id reference status')
        .lean();
      if (existingActive) {
        return res.status(409).json({
          code: 'ACTIVE_INVENTORY_EXISTS',
          error: 'Inventaire deja actif sur ce perimetre',
          details: `Existant: ${existingActive.reference} (${existingActive.status})`,
          existing_inventory: {
            id: existingActive._id,
            reference: existingActive.reference,
            status: existingActive.status,
          },
        });
      }

      const reference = await getNextInventoryReference();
      const dateLancement = new Date();
      const products = await listProductsForInventory({
        typeInventaire,
        categorieId,
        familleId,
        productId,
      });

      if (!products.length) {
        return res.status(409).json({
          code: 'NO_PRODUCTS_FOR_INVENTORY',
          error: 'Aucun article concerne par cet inventaire',
        });
      }

      const movementLock = buildMovementLockConfig({
        enabled: bloquerMouvements,
        typeInventaire,
        productIds: typeInventaire === 'GLOBAL' ? [] : products.map((p) => p._id),
      });

      const result = await runInTransaction(async (mongoSession) => {
        const inventoryDoc = await Inventory.create(
          [
            {
              reference,
              type_inventaire: typeInventaire,
              status: 'A_FAIRE',
              magasin_id: magasinId,
              zone_id: zoneId,
              famille_id: familleId,
              categorie_id: categorieId,
              product_id: productId,
              responsable_id: req.user.id,
              magasinier_id: primaryMagasinier._id,
              magasinier_ids: orderedMagasiniers.map((u) => u._id),
              date_lancement: dateLancement,
              date_prevue: datePrevue,
              bloquer_mouvements: movementLock.bloquer_mouvements,
              notifications_activees: notificationsActives,
              commentaire,
              movement_blocked: movementLock.movement_blocked,
              movement_block_scope: movementLock.movement_block_scope,
              movement_blocked_product_ids: movementLock.movement_blocked_product_ids,
            },
          ],
          mongoSession ? { session: mongoSession } : undefined
        );

        const inventory = inventoryDoc[0];

        const lines = products.map((p) => ({
          inventory_id: inventory._id,
          product_id: p._id,
          quantite_theorique_initiale: Math.max(0, Math.floor(Number(p.quantity_current || 0))),
          quantite_comptee: null,
          ecart: null,
          valeur_ecart: null,
          motif_ecart: '',
          observation_magasinier: '',
          observation_responsable: '',
          is_counted: false,
          emplacement_id: String(p.emplacement || ''),
          stock_id: '',
        }));

        await InventoryLine.insertMany(lines, mongoSession ? { session: mongoSession } : undefined);

        await History.create(
          [
            {
              action_type: 'inventory',
              user: req.user.id,
              source: 'ui',
              description: "Le responsable a lance une session d'inventaire.",
              actor_role: req.user.role,
              tags: ['inventory', 'launch'],
              status_before: 'BROUILLON',
              status_after: 'A_FAIRE',
              context: {
                event: 'INVENTORY_LAUNCHED',
                inventory_id: String(inventory._id),
                reference,
                type_inventaire: typeInventaire,
                magasin_id: String(magasinId),
                zone_id: zoneId ? String(zoneId) : null,
                famille_id: familleId,
                categorie_id: categorieId ? String(categorieId) : null,
                product_id: productId,
                magasinier_id: String(primaryMagasinier._id),
                magasinier_ids: orderedMagasiniers.map((u) => String(u._id)),
                lines_count: lines.length,
                movement_blocked: movementLock.movement_blocked,
                movement_block_scope: movementLock.movement_block_scope,
                movement_blocked_product_ids: movementLock.movement_blocked_product_ids.map(String),
              },
            },
          ],
          mongoSession ? { session: mongoSession } : undefined
        );

        let notificationsCreated = 0;
        if (notificationsActives) {
          const typeLabel = typeInventaire === 'GLOBAL' ? 'GLOBAL' : 'TOURNANT';
          const targets = orderedMagasiniers.map((u) => u._id);
          await Notification.insertMany(
            targets.map((userId) => ({
              user: userId,
              title: "Nouvelle mission d'inventaire",
              message: `Une nouvelle mission d'inventaire ${typeLabel} vous a ete assignee (${reference}).`,
              type: 'info',
              is_read: false,
              event_type: 'NEW_INVENTORY_MISSION',
              inventory_id: inventory._id,
            })),
            mongoSession ? { session: mongoSession } : undefined
          );
          notificationsCreated = targets.length;
        }

        return { inventory, notifications_created: notificationsCreated, lines_count: lines.length };
      });

      return res.status(201).json({
        ok: true,
        inventory: result.inventory,
        lines_count: result.lines_count,
        notification_created: Number(result.notifications_created || 0) > 0,
        notifications_created: Number(result.notifications_created || 0),
      });
    } catch (err) {
      return res.status(400).json({ error: 'Failed to launch inventory', details: err.message });
    }
  }
);

// GET /api/inventory/sessions
router.get('/sessions', async (req, res) => {
  try {
    const status = asOptionalString(req.query?.status);
    const q = {};
    if (status && ['draft', 'counting', 'closed', 'applied', 'cancelled'].includes(status)) q.status = status;
    if (req.user?.role === 'magasinier') q.created_by = req.user.id;

    const sessions = await InventorySession.find(q)
      .sort({ createdAt: -1 })
      .limit(80)
      .populate('created_by', 'username role')
      .populate('closed_by', 'username role')
      .populate('applied_by', 'username role')
      .lean();

    return res.json({ ok: true, sessions });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch inventory sessions', details: err.message });
  }
});

// POST /api/inventory/sessions
router.post('/sessions', strictBody(['title', 'notes']), async (req, res) => {
  try {
    if (!ensureRole(req, res, ['magasinier', 'responsable'])) return;
    const title = asTrimmedString(req.body?.title);
    if (!title || !isSafeText(title, { min: 2, max: 100 })) return res.status(400).json({ error: 'title invalide' });
    const notes = asOptionalString(req.body?.notes);
    if (notes !== undefined && !isSafeText(notes, { min: 0, max: 600 })) return res.status(400).json({ error: 'notes invalide' });

    const reference = await getNextInventoryReference();
    const created = await InventorySession.create({
      title,
      reference,
      status: 'counting',
      notes,
      created_by: req.user.id,
      created_at: new Date(),
    });

    await History.create({
      action_type: 'inventory',
      user: req.user.id,
      source: 'ui',
      description: `Session inventaire creee (${reference})`,
      actor_role: req.user.role,
      tags: ['inventory', 'session', 'create'],
      context: { session_id: String(created._id), reference, title },
    });

    return res.status(201).json({ ok: true, session: created });
  } catch (err) {
    return res.status(400).json({ error: 'Failed to create inventory session', details: err.message });
  }
});

// GET /api/inventory/sessions/:id
router.get('/sessions/:id', async (req, res) => {
  try {
    if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });
    const session = await InventorySession.findById(req.params.id)
      .populate('created_by', 'username role')
      .populate('closed_by', 'username role')
      .populate('applied_by', 'username role')
      .lean();
    if (!session) return res.status(404).json({ error: 'Session introuvable' });

    if (req.user?.role === 'magasinier' && String(session.created_by?._id || session.created_by) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Acces refuse' });
    }

    const role = String(req.user?.role || '');
    const counts = await InventoryCount.find({ session: session._id })
      .populate('product', '_id name code_product quantity_current seuil_minimum')
      .populate('counted_by', 'username role')
      .sort({ updatedAt: -1 })
      .lean();

    const lines = counts.map((c) => sanitizeLegacyCountLineForRole(c, role));

    const summary = role === 'magasinier'
      ? { lines: lines.length }
      : lines.reduce(
          (acc, l) => {
            acc.lines += 1;
            if (l.delta > 0) acc.surplus += 1;
            if (l.delta < 0) acc.missing += 1;
            if (l.delta === 0) acc.ok += 1;
            acc.total_abs_delta += Math.abs(l.delta);
            return acc;
          },
          { lines: 0, ok: 0, surplus: 0, missing: 0, total_abs_delta: 0 }
        );

    return res.json({ ok: true, session, lines, summary });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch inventory session', details: err.message });
  }
});

// POST /api/inventory/sessions/:id/count
router.post('/sessions/:id/count', strictBody(['product_id', 'counted_quantity', 'note']), async (req, res) => {
  try {
    if (!ensureRole(req, res, ['magasinier', 'responsable'])) return;
    if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });
    const session = await InventorySession.findById(req.params.id).lean();
    if (!session) return res.status(404).json({ error: 'Session introuvable' });
    if (String(session.status) !== 'counting') return res.status(409).json({ error: 'Session non editable' });
    if (req.user?.role === 'magasinier' && String(session.created_by) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Acces refuse' });
    }

    const productId = asOptionalString(req.body?.product_id);
    if (!productId || !isValidObjectIdLike(productId)) return res.status(400).json({ error: 'product_id invalide' });

    const counted = asNonNegativeNumber(req.body?.counted_quantity);
    if (Number.isNaN(counted)) return res.status(400).json({ error: 'counted_quantity invalide' });

    const product = await Product.findById(productId).select('_id quantity_current name code_product').lean();
    if (!product) return res.status(404).json({ error: 'Produit introuvable' });

    const systemQty = Math.max(0, Math.floor(Number(product.quantity_current || 0)));
    const note = asOptionalString(req.body?.note);
    if (note !== undefined && !isSafeText(note, { min: 0, max: 600 })) return res.status(400).json({ error: 'note invalide' });
    const payload = {
      session: session._id,
      product: product._id,
      counted_quantity: Math.max(0, Math.floor(Number(counted || 0))),
      system_quantity_at_count: systemQty,
      note,
      counted_by: req.user.id,
      counted_at: new Date(),
    };

    const doc = await InventoryCount.findOneAndUpdate(
      { session: session._id, product: product._id },
      { $set: payload },
      { returnDocument: 'after', upsert: true }
    )
      .populate('product', '_id name code_product quantity_current seuil_minimum')
      .lean();

    return res.json({ ok: true, line: sanitizeLegacyCountLineForRole(doc, String(req.user?.role || '')) });
  } catch (err) {
    return res.status(400).json({ error: 'Failed to save count', details: err.message });
  }
});

// POST /api/inventory/sessions/:id/close
router.post('/sessions/:id/close', async (req, res) => {
  try {
    if (!ensureRole(req, res, ['magasinier', 'responsable'])) return;
    if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });
    const session = await InventorySession.findById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });
    if (String(session.status) !== 'counting') return res.status(409).json({ error: 'Session non cloturable' });
    if (req.user?.role === 'magasinier' && String(session.created_by) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Acces refuse' });
    }

    session.status = 'closed';
    session.closed_at = new Date();
    session.closed_by = req.user.id;
    await session.save();

    await History.create({
      action_type: 'inventory',
      user: req.user.id,
      source: 'ui',
      description: `Session inventaire cloturee (${session.reference})`,
      actor_role: req.user.role,
      tags: ['inventory', 'session', 'close'],
      context: { session_id: String(session._id), reference: session.reference },
    });

    return res.json({ ok: true, session });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to close session', details: err.message });
  }
});

// POST /api/inventory/sessions/:id/apply
router.post('/sessions/:id/apply', async (req, res) => {
  try {
    if (!ensureRole(req, res, ['responsable'])) return;
    if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });
    const session = await InventorySession.findById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });
    if (!['closed'].includes(String(session.status))) return res.status(409).json({ error: 'Session non applicable' });

    const counts = await InventoryCount.find({ session: session._id })
      .populate('product', '_id name code_product quantity_current seuil_minimum')
      .lean();
    if (!counts.length) return res.status(409).json({ error: 'Aucun comptage' });

    const adjustments = [];

    await runInTransaction(async (mongoSession) => {
      for (const row of counts) {
        const product = await Product.findById(row.product._id).session(mongoSession);
        if (!product) continue;

        const current = Math.max(0, Math.floor(Number(product.quantity_current || 0)));
        const counted = Math.max(0, Math.floor(Number(row.counted_quantity || 0)));
        const delta = counted - current;
        if (delta === 0) continue;

        if (delta > 0) {
          const entry = await StockEntry.create(
            [
              {
                entry_number: await getNextEntryNumber(),
                product: product._id,
                quantity: delta,
                entry_mode: 'manual',
                observation: `Ajustement inventaire ${session.reference}`,
                supplier: 'INVENTAIRE',
                date_entry: new Date(),
                magasinier: session.created_by,
              },
            ],
            { session: mongoSession }
          );
          adjustments.push({ kind: 'entry', product_id: String(product._id), delta, doc_number: entry[0].entry_number });
        } else {
          const exitQty = Math.abs(delta);
          const exit = await StockExit.create(
            [
              {
                exit_number: await getNextExitNumber(),
                product: product._id,
                quantity: exitQty,
                exit_mode: 'manual',
                note: `Ajustement inventaire ${session.reference}`,
                date_exit: new Date(),
                magasinier: session.created_by,
              },
            ],
            { session: mongoSession }
          );
          adjustments.push({ kind: 'exit', product_id: String(product._id), delta, doc_number: exit[0].exit_number });
        }

        product.quantity_current = counted;
        product.status = computeProductStatus(product.quantity_current, product.seuil_minimum);
        await product.save({ session: mongoSession });
      }

      session.status = 'applied';
      session.applied_at = new Date();
      session.applied_by = req.user.id;
      await session.save({ session: mongoSession });

      await History.create(
        [
          {
            action_type: 'inventory',
            user: req.user.id,
            source: 'ui',
            description: `Inventaire applique (${session.reference})`,
            actor_role: req.user.role,
            tags: ['inventory', 'apply', 'adjustment'],
            context: {
              session_id: String(session._id),
              reference: session.reference,
              adjustments_count: adjustments.length,
            },
          },
        ],
        { session: mongoSession }
      );
    });

    return res.json({ ok: true, session: { id: session._id, reference: session.reference, status: session.status }, adjustments });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to apply inventory', details: err.message });
  }
});

module.exports = router;
