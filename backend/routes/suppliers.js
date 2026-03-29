const router = require('express').Router();
const requireAuth = require('../middlewares/requireAuth');
const requirePermission = require('../middlewares/requirePermission');
const strictBody = require('../middlewares/strictBody');
const { PERMISSIONS } = require('../constants/permissions');

const Supplier = require('../models/Supplier');
const SupplierProduct = require('../models/SupplierProduct');
const PurchaseOrder = require('../models/PurchaseOrder');
const Product = require('../models/Product');
const History = require('../models/History');

const { asNonNegativeNumber, asOptionalString, asPositiveNumber, isValidObjectIdLike } = require('../utils/validation');

router.use(requireAuth);

function clampDays(value, fallback) {
  const n = asNonNegativeNumber(value);
  if (n === undefined) return fallback;
  if (Number.isNaN(n)) return NaN;
  return Math.max(0, Math.min(365, Math.floor(n)));
}

function computeSupplierDeliveryKpis(purchaseOrders) {
  const delivered = (purchaseOrders || []).filter((po) => po && po.status === 'delivered' && po.delivered_at);
  const totalDelivered = delivered.length;
  if (!totalDelivered) {
    return {
      delivered_count: 0,
      on_time_rate: null,
      avg_lead_time_days: null,
      avg_delay_days: null,
    };
  }

  let onTime = 0;
  const leadTimes = [];
  const delays = [];

  for (const po of delivered) {
    const orderedAt = po.ordered_at ? new Date(po.ordered_at) : null;
    const deliveredAt = po.delivered_at ? new Date(po.delivered_at) : null;
    const promisedAt = po.promised_at ? new Date(po.promised_at) : null;
    if (!orderedAt || !deliveredAt || Number.isNaN(orderedAt.getTime()) || Number.isNaN(deliveredAt.getTime())) continue;

    const leadDays = Math.max(0, (deliveredAt.getTime() - orderedAt.getTime()) / (24 * 60 * 60 * 1000));
    leadTimes.push(leadDays);

    if (promisedAt && !Number.isNaN(promisedAt.getTime())) {
      const delayDays = (deliveredAt.getTime() - promisedAt.getTime()) / (24 * 60 * 60 * 1000);
      delays.push(delayDays);
      if (delayDays <= 0.00001) onTime += 1;
    }
  }

  const avg = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const avgLead = avg(leadTimes);
  const avgDelay = avg(delays);
  const onTimeRate = delays.length ? onTime / delays.length : null;

  return {
    delivered_count: totalDelivered,
    on_time_rate: onTimeRate !== null ? Number((onTimeRate * 100).toFixed(1)) : null,
    avg_lead_time_days: avgLead !== null ? Number(avgLead.toFixed(1)) : null,
    avg_delay_days: avgDelay !== null ? Number(avgDelay.toFixed(1)) : null,
  };
}

function computeSupplierScore(kpis, baselineLeadTimeDays) {
  const onTime = typeof kpis?.on_time_rate === 'number' ? kpis.on_time_rate : null; // 0-100
  const avgDelay = typeof kpis?.avg_delay_days === 'number' ? kpis.avg_delay_days : null;

  // Simple + explainable scoring:
  // - On-time dominates
  // - Delay penalizes
  let score = 50;
  if (onTime !== null) score = 0.75 * onTime + 25;
  if (avgDelay !== null && avgDelay > 0) score -= Math.min(30, avgDelay * 4);
  if (typeof baselineLeadTimeDays === 'number' && baselineLeadTimeDays > 0 && typeof kpis?.avg_lead_time_days === 'number') {
    const ratio = kpis.avg_lead_time_days / baselineLeadTimeDays;
    if (ratio > 1.2) score -= 8;
    if (ratio < 0.8) score += 4;
  }
  score = Math.max(0, Math.min(100, score));
  return Number(score.toFixed(1));
}

router.get('/', requirePermission(PERMISSIONS.SUPPLIER_MANAGE), async (req, res) => {
  try {
    const status = asOptionalString(req.query?.status);
    const q = {};
    if (status && ['active', 'inactive'].includes(status)) q.status = status;
    const items = await Supplier.find(q).sort({ name: 1 }).lean();
    return res.json({ suppliers: items });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch suppliers', details: err.message });
  }
});

router.post(
  '/',
  requirePermission(PERMISSIONS.SUPPLIER_MANAGE),
  strictBody(['name', 'email', 'phone', 'address', 'default_lead_time_days', 'status']),
  async (req, res) => {
    try {
      const name = asOptionalString(req.body?.name);
      if (!name) return res.status(400).json({ error: 'name obligatoire' });

      const lead = clampDays(req.body?.default_lead_time_days, 7);
      if (Number.isNaN(lead)) return res.status(400).json({ error: 'default_lead_time_days invalide' });

      const payload = {
        name,
        email: asOptionalString(req.body?.email),
        phone: asOptionalString(req.body?.phone),
        address: asOptionalString(req.body?.address),
        default_lead_time_days: lead,
        status: ['active', 'inactive'].includes(String(req.body?.status || 'active')) ? String(req.body.status) : 'active',
        created_by: req.user.id,
      };

      const created = await Supplier.create(payload);

      await History.create({
        action_type: 'supplier',
        user: req.user.id,
        source: 'ui',
        description: 'Fournisseur cree',
        actor_role: req.user.role,
        tags: ['supplier', 'create'],
        context: {
          supplier_id: String(created._id),
          name: created.name,
          status: created.status,
          default_lead_time_days: created.default_lead_time_days,
        },
      });

      return res.status(201).json(created);
    } catch (err) {
      const msg = String(err?.message || '');
      if (msg.includes('duplicate key')) return res.status(409).json({ error: 'Fournisseur deja existant' });
      return res.status(400).json({ error: 'Failed to create supplier', details: err.message });
    }
  }
);

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.SUPPLIER_MANAGE),
  strictBody(['name', 'email', 'phone', 'address', 'default_lead_time_days', 'status']),
  async (req, res) => {
    try {
      if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });
      const patch = {};
      const name = asOptionalString(req.body?.name);
      if (name) patch.name = name;
      const email = asOptionalString(req.body?.email);
      if (email !== undefined) patch.email = email;
      const phone = asOptionalString(req.body?.phone);
      if (phone !== undefined) patch.phone = phone;
      const address = asOptionalString(req.body?.address);
      if (address !== undefined) patch.address = address;
      if (req.body?.default_lead_time_days !== undefined) {
        const lead = clampDays(req.body.default_lead_time_days, null);
        if (Number.isNaN(lead)) return res.status(400).json({ error: 'default_lead_time_days invalide' });
        patch.default_lead_time_days = lead;
      }
      if (req.body?.status !== undefined) {
        const st = String(req.body.status || '').trim();
        if (!['active', 'inactive'].includes(st)) return res.status(400).json({ error: 'status invalide' });
        patch.status = st;
      }

      const before = await Supplier.findById(req.params.id).lean();
      if (!before) return res.status(404).json({ error: 'Supplier not found' });

      const updated = await Supplier.findByIdAndUpdate(req.params.id, { $set: patch }, { returnDocument: 'after' });
      if (!updated) return res.status(404).json({ error: 'Supplier not found' });

      await History.create({
        action_type: 'supplier',
        user: req.user.id,
        source: 'ui',
        description: 'Fournisseur modifie',
        actor_role: req.user.role,
        tags: ['supplier', 'update'],
        status_before: before.status,
        status_after: updated.status,
        context: {
          supplier_id: String(updated._id),
          before: {
            name: before.name,
            email: before.email || null,
            phone: before.phone || null,
            address: before.address || null,
            default_lead_time_days: before.default_lead_time_days,
            status: before.status,
          },
          after: {
            name: updated.name,
            email: updated.email || null,
            phone: updated.phone || null,
            address: updated.address || null,
            default_lead_time_days: updated.default_lead_time_days,
            status: updated.status,
          },
        },
      });

      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: 'Failed to update supplier', details: err.message });
    }
  }
);

router.post(
  '/:id/products',
  requirePermission(PERMISSIONS.SUPPLIER_MANAGE),
  strictBody(['product_id', 'lead_time_days', 'unit_price', 'is_primary', 'supplier_sku']),
  async (req, res) => {
    try {
      if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'supplier id invalide' });
      const productId = asOptionalString(req.body?.product_id);
      if (!productId || !isValidObjectIdLike(productId)) return res.status(400).json({ error: 'product_id invalide' });

      const lead = req.body?.lead_time_days === undefined ? null : clampDays(req.body.lead_time_days, null);
      if (Number.isNaN(lead)) return res.status(400).json({ error: 'lead_time_days invalide' });

      const unitPrice = asNonNegativeNumber(req.body?.unit_price);
      if (unitPrice !== undefined && Number.isNaN(unitPrice)) return res.status(400).json({ error: 'unit_price invalide' });

      const supplier = await Supplier.findById(req.params.id).lean();
      if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
      const product = await Product.findById(productId).select('_id name lifecycle_status').lean();
      if (!product) return res.status(404).json({ error: 'Product not found' });
      if (String(product.lifecycle_status || 'active') !== 'active') {
        return res.status(409).json({ error: 'Produit archive / indisponible' });
      }

      const isPrimary = Boolean(req.body?.is_primary);
      if (isPrimary) {
        await SupplierProduct.updateMany({ product: product._id }, { $set: { is_primary: false } });
      }

      const doc = await SupplierProduct.findOneAndUpdate(
        { supplier: supplier._id, product: product._id },
        {
          $set: {
            supplier_sku: asOptionalString(req.body?.supplier_sku) || undefined,
            lead_time_days: lead,
            unit_price: unitPrice === undefined ? undefined : unitPrice,
            is_primary: isPrimary,
            created_by: req.user.id,
          },
        },
        { upsert: true, returnDocument: 'after' }
      );

      await History.create({
        action_type: 'supplier',
        user: req.user.id,
        source: 'ui',
        description: 'Produit lie a un fournisseur',
        actor_role: req.user.role,
        tags: ['supplier', 'link_product'],
        context: {
          supplier_id: String(supplier._id),
          supplier_name: supplier.name,
          product_id: String(product._id),
          product_name: product.name,
          lead_time_days: doc.lead_time_days ?? null,
          unit_price: doc.unit_price ?? null,
          is_primary: Boolean(doc.is_primary),
          supplier_sku: doc.supplier_sku || null,
        },
      });

      return res.json(doc);
    } catch (err) {
      return res.status(400).json({ error: 'Failed to link supplier product', details: err.message });
    }
  }
);

router.get('/recommendation', requirePermission(PERMISSIONS.SUPPLIER_MANAGE), async (req, res) => {
  try {
    const productId = asOptionalString(req.query?.product_id);
    if (!productId || !isValidObjectIdLike(productId)) return res.status(400).json({ error: 'product_id invalide' });

    const product = await Product.findById(productId).select('_id name code_product lifecycle_status').lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (String(product.lifecycle_status || 'active') !== 'active') {
      return res.status(409).json({ error: 'Produit archive / indisponible' });
    }

    let links = await SupplierProduct.find({ product: product._id })
      .populate('supplier', 'name status default_lead_time_days')
      .lean();
    if (!links.length) {
      // Fallback: no explicit mapping yet -> consider all active suppliers.
      const suppliers = await Supplier.find({ status: 'active' }).select('_id name status default_lead_time_days').lean();
      links = suppliers.map((s) => ({
        supplier: s,
        product: product._id,
        is_primary: false,
        lead_time_days: null,
      }));
    }

    const supplierIds = links.map((l) => l.supplier?._id).filter(Boolean);
    const pos = supplierIds.length
      ? await PurchaseOrder.find({ supplier: { $in: supplierIds }, 'lines.product': product._id })
        .select('supplier status ordered_at promised_at delivered_at')
        .sort({ ordered_at: -1 })
        .limit(40)
        .lean()
      : [];

    const bySupplier = new Map();
    for (const po of pos) {
      const sid = String(po.supplier);
      const arr = bySupplier.get(sid) || [];
      arr.push(po);
      bySupplier.set(sid, arr);
    }

    const candidates = [];
    for (const link of links) {
      const supplier = link.supplier;
      if (!supplier || supplier.status !== 'active') continue;
      const sid = String(supplier._id);
      const history = bySupplier.get(sid) || [];
      const kpis = computeSupplierDeliveryKpis(history);
      const baselineLead = typeof link.lead_time_days === 'number'
        ? link.lead_time_days
        : (typeof supplier.default_lead_time_days === 'number' ? supplier.default_lead_time_days : 7);
      const score = computeSupplierScore(kpis, baselineLead);

      const reasons = [];
      if (typeof kpis.on_time_rate === 'number') reasons.push(`Taux a l'heure: ${kpis.on_time_rate}%`);
      if (typeof kpis.avg_lead_time_days === 'number') reasons.push(`Delai moyen: ${kpis.avg_lead_time_days}j`);
      if (typeof kpis.avg_delay_days === 'number') reasons.push(`Retard moyen: ${kpis.avg_delay_days}j`);
      if (!reasons.length) reasons.push('Pas assez d\'historique: utilisation du delai configure');
      if (link.is_primary) reasons.push('Fournisseur principal');

      candidates.push({
        supplier_id: supplier._id,
        supplier_name: supplier.name,
        score,
        kpis,
        is_primary: Boolean(link.is_primary),
        lead_time_days: baselineLead,
        reasons,
      });
    }

    candidates.sort((a, b) => {
      if (b.is_primary !== a.is_primary) return b.is_primary ? 1 : -1;
      return Number(b.score || 0) - Number(a.score || 0);
    });

    const recommended = candidates[0] || null;
    return res.json({
      ok: true,
      product: { id: product._id, name: product.name, code: product.code_product },
      recommended,
      candidates,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to recommend supplier', details: err.message });
  }
});

router.get('/:id/products', requirePermission(PERMISSIONS.SUPPLIER_MANAGE), async (req, res) => {
  try {
    if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'supplier id invalide' });
    const supplier = await Supplier.findById(req.params.id).select('_id name status default_lead_time_days').lean();
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

    const links = await SupplierProduct.find({ supplier: supplier._id })
      .populate('product', '_id name code_product unite seuil_minimum')
      .sort({ is_primary: -1, updatedAt: -1, createdAt: -1 })
      .lean();

    return res.json({
      ok: true,
      supplier,
      links: Array.isArray(links) ? links : [],
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch supplier products', details: err.message });
  }
});

router.get('/:id/metrics', requirePermission(PERMISSIONS.SUPPLIER_MANAGE), async (req, res) => {
  try {
    if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });
    const supplier = await Supplier.findById(req.params.id).lean();
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

    const pos = await PurchaseOrder.find({ supplier: supplier._id })
      .select('status ordered_at promised_at delivered_at')
      .sort({ ordered_at: -1 })
      .limit(100)
      .lean();

    const kpis = computeSupplierDeliveryKpis(pos);
    const score = computeSupplierScore(kpis, supplier.default_lead_time_days);

    return res.json({ ok: true, supplier, kpis, score });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to compute supplier metrics', details: err.message });
  }
});

module.exports = router;
