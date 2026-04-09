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
const { getSupplierEmailPolicy } = require('../services/purchaseOrderSupplierMailService');
const { enqueueMail } = require('../services/mailQueueService');
const { isMailConfigured } = require('../services/mailerService');
const { logSecurityEvent } = require('../services/securityAuditService');

const {
  asNonNegativeNumber,
  asOptionalString,
  asPositiveNumber,
  isValidObjectIdLike,
  normalizeEmail,
  normalizePhone,
  isValidEmail,
  isValidPhone,
  isSafeText,
} = require('../utils/validation');

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

function riskLevelFromScore(riskScore) {
  const s = Number(riskScore || 0);
  if (s >= 75) return 'critique';
  if (s >= 55) return 'eleve';
  if (s >= 35) return 'moyen';
  return 'faible';
}

function computeSupplierRisk({
  kpis,
  openOrdersCount,
  lateOpenOrdersCount,
  maxDaysLate,
  ackOverdueCount = 0,
  openIncidentsCount = 0,
  criticalOpenIncidentsCount = 0,
}) {
  const onTime = typeof kpis?.on_time_rate === 'number' ? kpis.on_time_rate : null; // 0-100
  const avgDelay = typeof kpis?.avg_delay_days === 'number' ? kpis.avg_delay_days : null; // can be negative

  let risk = 0;
  const open = Number(openOrdersCount || 0);
  const late = Number(lateOpenOrdersCount || 0);
  const maxLate = Number(maxDaysLate || 0);

  // Explainable + stable:
  // - Late open orders is the strongest signal
  // - Missing ETA confirmation (ACK) adds risk
  // - Open incidents (litiges) add business risk
  // - On-time history is a secondary signal
  // - Avg delay adds small penalty
  risk += Math.min(50, late * 12);
  risk += Math.min(18, open * 2);
  if (maxLate > 0) risk += Math.min(12, maxLate * 0.6);
  risk += Math.min(16, Number(ackOverdueCount || 0) * 6);
  risk += Math.min(18, Number(openIncidentsCount || 0) * 4);
  risk += Math.min(20, Number(criticalOpenIncidentsCount || 0) * 10);
  if (onTime !== null) risk += Math.max(0, (100 - onTime) * 0.35);
  if (avgDelay !== null && avgDelay > 0) risk += Math.min(12, avgDelay * 2);

  risk = Math.max(0, Math.min(100, risk));
  return Number(risk.toFixed(1));
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

// GET /api/suppliers/insights?max=8&window_days=180
// Centre d'incidents: retards + commandes ouvertes + risques (explainable).
router.get('/insights', requirePermission(PERMISSIONS.SUPPLIER_MANAGE), async (req, res) => {
  try {
    const max = Math.max(5, Math.min(50, Number(req.query?.max || 8)));
    const windowDays = clampDays(req.query?.window_days, 180);
    if (Number.isNaN(windowDays)) return res.status(400).json({ error: 'window_days invalide' });

    const emailPolicy = await getSupplierEmailPolicy().catch(() => null);
    const ackSlaHours = emailPolicy && typeof emailPolicy.ack_sla_hours === 'number' ? emailPolicy.ack_sla_hours : 24;
    const ackSlaMs = Math.max(6, Math.min(168, Math.floor(Number(ackSlaHours || 24)))) * 60 * 60 * 1000;

    const suppliers = await Supplier.find({ status: 'active' })
      .select('_id name status default_lead_time_days')
      .sort({ name: 1 })
      .lean();

    const supplierIds = suppliers.map((s) => s._id);
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const now = new Date();

    const [deliveredPos, openPos] = await Promise.all([
      supplierIds.length
        ? PurchaseOrder.find({
          supplier: { $in: supplierIds },
          status: 'delivered',
          delivered_at: { $ne: null },
          ordered_at: { $gte: since },
        })
          .select('supplier status ordered_at promised_at delivered_at')
          .sort({ ordered_at: -1 })
          .limit(2500)
          .lean()
        : [],
      supplierIds.length
        ? PurchaseOrder.find({
          supplier: { $in: supplierIds },
          status: 'ordered',
          received_at: { $in: [null, undefined] },
        })
          .select('supplier status ordered_at promised_at createdAt supplier_ack incidents')
          .sort({ ordered_at: -1, createdAt: -1 })
          .limit(2000)
          .lean()
        : [],
    ]);

    const deliveredBySupplier = new Map();
    for (const po of deliveredPos || []) {
      const sid = String(po.supplier);
      const arr = deliveredBySupplier.get(sid) || [];
      arr.push(po);
      deliveredBySupplier.set(sid, arr);
    }

    const openBySupplier = new Map();
    const latePurchaseOrders = [];
    for (const po of openPos || []) {
      const sid = String(po.supplier);
      const arr = openBySupplier.get(sid) || [];
      arr.push(po);
      openBySupplier.set(sid, arr);

      const promised = po.promised_at ? new Date(po.promised_at) : null;
      if (promised && !Number.isNaN(promised.getTime()) && promised.getTime() < now.getTime()) {
        const daysLate = (now.getTime() - promised.getTime()) / (24 * 60 * 60 * 1000);
        latePurchaseOrders.push({
          po_id: po._id,
          supplier_id: po.supplier,
          ordered_at: po.ordered_at || po.createdAt || null,
          promised_at: po.promised_at || null,
          days_late: Number(daysLate.toFixed(1)),
        });
      }
    }

    const items = suppliers.map((s) => {
      const deliveredHistory = deliveredBySupplier.get(String(s._id)) || [];
      const kpis = computeSupplierDeliveryKpis(deliveredHistory);
      const score = computeSupplierScore(kpis, s.default_lead_time_days);

      const openList = openBySupplier.get(String(s._id)) || [];
      const openOrdersCount = openList.length;
      let lateOpenOrdersCount = 0;
      let maxDaysLate = 0;
      let ack_overdue_open_orders_count = 0;
      let open_incidents_count = 0;
      let critical_open_incidents_count = 0;

      for (const po of openList) {
        const promised = po.promised_at ? new Date(po.promised_at) : null;
        if (promised && !Number.isNaN(promised.getTime()) && promised.getTime() < now.getTime()) {
          lateOpenOrdersCount += 1;
          const daysLate = (now.getTime() - promised.getTime()) / (24 * 60 * 60 * 1000);
          maxDaysLate = Math.max(maxDaysLate, daysLate);
        }

        const ackStatus = String(po?.supplier_ack?.status || 'none');
        const orderedAt = po.ordered_at ? new Date(po.ordered_at) : (po.createdAt ? new Date(po.createdAt) : null);
        if (ackStatus === 'none' && orderedAt && !Number.isNaN(orderedAt.getTime())) {
          if ((now.getTime() - orderedAt.getTime()) >= ackSlaMs) ack_overdue_open_orders_count += 1;
        }

        const incidents = Array.isArray(po?.incidents) ? po.incidents : [];
        for (const inc of incidents) {
          if (inc && String(inc.status || 'open') === 'open') {
            open_incidents_count += 1;
            if (String(inc.severity || '') === 'critical') critical_open_incidents_count += 1;
          }
        }
      }

      const riskScore = computeSupplierRisk({
        kpis,
        openOrdersCount,
        lateOpenOrdersCount,
        maxDaysLate,
        ackOverdueCount: ack_overdue_open_orders_count,
        openIncidentsCount: open_incidents_count,
        criticalOpenIncidentsCount: critical_open_incidents_count,
      });

      const reasons = [];
      if (lateOpenOrdersCount > 0) reasons.push(`${lateOpenOrdersCount} commande(s) en retard`);
      if (openOrdersCount > 0) reasons.push(`${openOrdersCount} commande(s) ouverte(s)`);
      if (ack_overdue_open_orders_count > 0) reasons.push(`${ack_overdue_open_orders_count} ETA non confirmee (SLA ${Math.round(ackSlaMs / (60 * 60 * 1000))}h)`);
      if (critical_open_incidents_count > 0) reasons.push(`${critical_open_incidents_count} litige(s) critique(s)`);
      else if (open_incidents_count > 0) reasons.push(`${open_incidents_count} litige(s) ouvert(s)`);
      if (typeof kpis.on_time_rate === 'number') reasons.push(`Taux a l'heure: ${kpis.on_time_rate}%`);
      if (typeof kpis.avg_delay_days === 'number') reasons.push(`Retard moyen: ${kpis.avg_delay_days}j`);
      if (!reasons.length) reasons.push('Aucun signal critique detecte');

      return {
        supplier_id: s._id,
        supplier_name: s.name,
        score_fiability: score,
        kpis,
        open_orders_count: openOrdersCount,
        late_open_orders_count: lateOpenOrdersCount,
        max_days_late: Number(maxDaysLate.toFixed(1)),
        ack_overdue_open_orders_count,
        open_incidents_count,
        critical_open_incidents_count,
        risk_score: riskScore,
        risk_level: riskLevelFromScore(riskScore),
        reasons,
      };
    });

    items.sort((a, b) => Number(b.risk_score || 0) - Number(a.risk_score || 0));
    latePurchaseOrders.sort((a, b) => Number(b.days_late || 0) - Number(a.days_late || 0));

    const supplierNameById = new Map(items.map((x) => [String(x.supplier_id), x.supplier_name]));
    const latePos = latePurchaseOrders.slice(0, 12).map((po) => ({
      ...po,
      supplier_name: supplierNameById.get(String(po.supplier_id)) || 'Fournisseur',
    }));

    return res.json({
      ok: true,
      window_days: windowDays,
      summary: {
        active_suppliers: suppliers.length,
        open_orders: openPos.length,
        late_open_orders: latePurchaseOrders.length,
      },
      risk_suppliers: items.slice(0, max),
      late_purchase_orders: latePos,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to compute supplier insights', details: err.message });
  }
});

router.post(
  '/',
  requirePermission(PERMISSIONS.SUPPLIER_MANAGE),
  strictBody(['name', 'email', 'phone', 'address', 'default_lead_time_days', 'status']),
  async (req, res) => {
    try {
      const name = asOptionalString(req.body?.name);
      if (!name || !isSafeText(name, { min: 2, max: 80 })) return res.status(400).json({ error: 'name obligatoire (2-80)' });

      const lead = clampDays(req.body?.default_lead_time_days, 7);
      if (Number.isNaN(lead)) return res.status(400).json({ error: 'default_lead_time_days invalide' });

      const email = normalizeEmail(req.body?.email);
      if (email !== undefined && !isValidEmail(email)) return res.status(400).json({ error: 'email invalide' });
      const phone = normalizePhone(req.body?.phone);
      if (phone !== undefined && !isValidPhone(phone)) return res.status(400).json({ error: 'phone invalide' });
      const address = asOptionalString(req.body?.address);
      if (address !== undefined && !isSafeText(address, { min: 0, max: 240 })) return res.status(400).json({ error: 'address invalide' });

      const payload = {
        name,
        email,
        phone,
        address,
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
      if (name) {
        if (!isSafeText(name, { min: 2, max: 80 })) return res.status(400).json({ error: 'name invalide (2-80)' });
        patch.name = name;
      }
      const email = normalizeEmail(req.body?.email);
      if (email !== undefined) {
        if (email && !isValidEmail(email)) return res.status(400).json({ error: 'email invalide' });
        patch.email = email;
      }
      const phone = normalizePhone(req.body?.phone);
      if (phone !== undefined) {
        if (phone && !isValidPhone(phone)) return res.status(400).json({ error: 'phone invalide' });
        patch.phone = phone;
      }
      const address = asOptionalString(req.body?.address);
      if (address !== undefined) {
        if (address && !isSafeText(address, { min: 0, max: 240 })) return res.status(400).json({ error: 'address invalide' });
        patch.address = address;
      }
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
  strictBody(['product_id', 'lead_time_days', 'unit_price', 'is_primary', 'supplier_sku', 'availability_status', 'availability_note']),
  async (req, res) => {
    try {
      if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'supplier id invalide' });
      const productId = asOptionalString(req.body?.product_id);
      if (!productId || !isValidObjectIdLike(productId)) return res.status(400).json({ error: 'product_id invalide' });

      const lead = req.body?.lead_time_days === undefined ? null : clampDays(req.body.lead_time_days, null);
      if (Number.isNaN(lead)) return res.status(400).json({ error: 'lead_time_days invalide' });

      const unitPrice = asNonNegativeNumber(req.body?.unit_price);
      if (unitPrice !== undefined && Number.isNaN(unitPrice)) return res.status(400).json({ error: 'unit_price invalide' });

      const availabilityRaw = asOptionalString(req.body?.availability_status);
      const availability = availabilityRaw ? String(availabilityRaw).trim() : 'unknown';
      if (!['unknown', 'available', 'limited', 'out_of_stock', 'long_lead_time'].includes(availability)) {
        return res.status(400).json({ error: 'availability_status invalide' });
      }
      const availabilityNoteRaw = asOptionalString(req.body?.availability_note);
      const availabilityNote = availabilityNoteRaw ? String(availabilityNoteRaw).trim() : '';
      if (availabilityNote && !isSafeText(availabilityNote, { min: 0, max: 180 })) {
        return res.status(400).json({ error: 'availability_note invalide' });
      }

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
            availability_status: availability,
            availability_note: availabilityNote || undefined,
            availability_updated_at: availability !== 'unknown' || availabilityNote ? new Date() : undefined,
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
          availability_status: doc.availability_status || 'unknown',
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

// GET /api/suppliers/ranking
// Classement technique: score + KPIs livraison.
router.get('/ranking', requirePermission(PERMISSIONS.SUPPLIER_MANAGE), async (req, res) => {
  try {
    const max = Math.max(5, Math.min(200, Number(req.query?.max || 50)));

    const suppliers = await Supplier.find({ status: 'active' })
      .select('_id name status default_lead_time_days')
      .sort({ name: 1 })
      .lean();

    const supplierIds = suppliers.map((s) => s._id);
    const pos = supplierIds.length
      ? await PurchaseOrder.find({ supplier: { $in: supplierIds } })
        .select('supplier status ordered_at promised_at delivered_at supplier_ack')
        .sort({ ordered_at: -1 })
        .limit(1200)
        .lean()
      : [];

    const bySupplier = new Map();
    for (const po of pos) {
      const sid = String(po.supplier);
      const arr = bySupplier.get(sid) || [];
      arr.push(po);
      bySupplier.set(sid, arr);
    }

    const items = suppliers.map((s) => {
      const history = bySupplier.get(String(s._id)) || [];
      const kpis = computeSupplierDeliveryKpis(history);
      const score = computeSupplierScore(kpis, s.default_lead_time_days);
      const lastDelivered = (history || []).find((po) => po.status === 'delivered' && po.delivered_at)?.delivered_at || null;

      // Responsiveness: ETA confirmation via portal (supplier_ack)
      const ackSamples = [];
      let ackTotal = 0;
      let ackOk = 0;
      for (const po of history) {
        const orderedAt = po.ordered_at ? new Date(po.ordered_at) : null;
        if (!orderedAt || Number.isNaN(orderedAt.getTime())) continue;
        ackTotal += 1;
        const ackStatus = String(po?.supplier_ack?.status || 'none');
        if (ackStatus !== 'none') {
          ackOk += 1;
          const updatedAt = po?.supplier_ack?.updated_at ? new Date(po.supplier_ack.updated_at) : null;
          if (updatedAt && !Number.isNaN(updatedAt.getTime())) {
            const hours = (updatedAt.getTime() - orderedAt.getTime()) / (60 * 60 * 1000);
            if (Number.isFinite(hours) && hours >= 0) ackSamples.push(hours);
          }
        }
      }
      const ackRate = ackTotal ? Number(((ackOk / ackTotal) * 100).toFixed(1)) : null;
      const avgAckHours = ackSamples.length ? Number((ackSamples.reduce((a, b) => a + b, 0) / ackSamples.length).toFixed(1)) : null;
      return {
        supplier_id: s._id,
        supplier_name: s.name,
        score,
        kpis,
        last_delivered_at: lastDelivered,
        ack_rate: ackRate,
        avg_ack_hours: avgAckHours,
      };
    });

    items.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));

    return res.json({
      ok: true,
      ranking: items.slice(0, max),
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to rank suppliers', details: err.message });
  }
});

// POST /api/suppliers/:id/notify-email
// Petit système de notification fournisseur "par mail" (hors commandes).
// Usage: message court (demande d'info, demande devis, relance administrative...).
router.post(
  '/:id/notify-email',
  requirePermission(PERMISSIONS.SUPPLIER_MANAGE),
  strictBody(['subject', 'message', 'kind']),
  async (req, res) => {
    try {
      if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });
      if (!isMailConfigured()) return res.status(409).json({ error: 'Email non configure (SMTP)' });

      const supplier = await Supplier.findById(req.params.id).select('_id name email status').lean();
      if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
      if (supplier.status !== 'active') return res.status(409).json({ error: 'Fournisseur inactif' });

      const to = String(supplier.email || '').trim();
      if (!to) return res.status(409).json({ error: 'Email fournisseur manquant' });
      if (!isValidEmail(normalizeEmail(to) || '')) return res.status(400).json({ error: 'Email fournisseur invalide' });

      const kindRaw = asOptionalString(req.body?.kind);
      const kind = kindRaw && isSafeText(kindRaw, { min: 2, max: 80 }) ? kindRaw : 'supplier_manual_message';

      const subjectRaw = asOptionalString(req.body?.subject);
      const subject = subjectRaw && isSafeText(subjectRaw, { min: 4, max: 140 })
        ? subjectRaw
        : `[SENTINEL] Message - ${supplier.name || 'Fournisseur'}`;

      const messageRaw = asOptionalString(req.body?.message);
      const message = (messageRaw || '').trim();
      if (!message || !isSafeText(message, { min: 4, max: 1000 })) {
        return res.status(400).json({ error: 'message invalide' });
      }

      const text = [
        `Bonjour,`,
        '',
        message,
        '',
        `---`,
        `Envoye via SENTINEL (ETAP)`,
      ].join('\n');

      const html = `<pre style="font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;white-space:pre-wrap;">${text}</pre>`;

      const jobId = `supplier_manual_${String(supplier._id)}_${Date.now()}`;
      await enqueueMail({
        kind: kind,
        role: 'supplier',
        to,
        subject,
        text,
        html,
        job_id: jobId,
      });

      await History.create({
        action_type: 'supplier',
        user: req.user.id,
        source: 'ui',
        description: 'Notification email fournisseur envoyee (enqueue)',
        actor_role: req.user.role,
        tags: ['supplier', 'email', 'notify', kind],
        context: {
          supplier_id: String(supplier._id),
          supplier_name: supplier.name || '',
          kind,
          job_id: jobId,
        },
      });

      await logSecurityEvent({
        event_type: 'supplier_email_manual_enqueued',
        email: to,
        role: 'supplier',
        success: true,
        details: `Manual supplier email queued (kind=${kind})`,
        user_id: req.user.id,
        after: {
          supplier_id: String(supplier._id),
          kind,
          job_id: jobId,
        },
      });

      return res.json({ ok: true, queued: true });
    } catch (err) {
      return res.status(400).json({ error: 'Failed to notify supplier', details: err.message });
    }
  }
);

module.exports = router;
