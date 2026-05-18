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
const SupplierAlert = require('../models/SupplierAlert');
const SupplierHistory = require('../models/SupplierHistory');
const { getSupplierEmailPolicy } = require('../services/purchaseOrderSupplierMailService');
const { enqueueMail } = require('../services/mailQueueService');
const { isMailConfigured } = require('../services/mailerService');
const { logSecurityEvent } = require('../services/securityAuditService');
const {
  SUPPLIER_STATUS,
  RELIABILITY_LEVEL,
  ALERT_STATUS,
  normalizeSupplierStatus,
  normalizeReliabilityLevel,
  isActiveSupplierStatus,
  computeSupplierProfileQuality,
  buildSupplierAlerts,
} = require('../services/supplierRegistryService');

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

function supplierStatusQuery(value) {
  const normalized = normalizeSupplierStatus(value);
  if (!normalized) return null;
  if (normalized === SUPPLIER_STATUS.ACTIF) return { $in: ['ACTIF', 'active'] };
  if (normalized === SUPPLIER_STATUS.INACTIF) return { $in: ['INACTIF', 'inactive'] };
  return normalized;
}

function toCanonicalSupplierStatus(value) {
  const normalized = normalizeSupplierStatus(value);
  return normalized || SUPPLIER_STATUS.ACTIF;
}

function parsePageLimit(req, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, Number(req.query?.page || 1));
  const limit = Math.min(maxLimit, Math.max(1, Number(req.query?.limit || defaultLimit)));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function buildSupplierSearchFilter(qRaw) {
  const q = String(qRaw || '').trim();
  if (!q) return null;
  const email = normalizeEmail(q) || q.toLowerCase();
  const phone = normalizePhone(q) || q;
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(safe, 'i');
  const phoneSafe = String(phone).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const phoneRe = new RegExp(phoneSafe, 'i');
  const emailSafe = String(email).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const emailRe = new RegExp(emailSafe, 'i');
  return {
    $or: [
      { name: re },
      { email: emailRe },
      { phone: phoneRe },
    ],
  };
}

function stripDiacritics(input) {
  try {
    return String(input || '').normalize('NFD').replace(/\p{Diacritic}/gu, '');
  } catch {
    return String(input || '');
  }
}

function normalizeSupplierNameForSimilarity(name) {
  const base = stripDiacritics(name).toLowerCase();
  return base.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function trigramSet(str) {
  const s = `  ${String(str || '')}  `;
  const set = new Set();
  for (let i = 0; i < s.length - 2; i += 1) set.add(s.slice(i, i + 3));
  return set;
}

function trigramSimilarity(a, b) {
  const sa = trigramSet(a);
  const sb = trigramSet(b);
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  return (2 * inter) / (sa.size + sb.size);
}

async function findPotentialDuplicateSuppliers({ supplierId = null, name, email, phone } = {}) {
  const ors = [];
  const nEmail = normalizeEmail(email);
  const nPhone = normalizePhone(phone);
  const nName = normalizeSupplierNameForSimilarity(name);

  if (nEmail) ors.push({ email: nEmail });
  if (nPhone) ors.push({ phone: nPhone });
  if (nName) {
    const safe = nName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    ors.push({ name: new RegExp(`^${safe}$`, 'i') });
  }

  if (!ors.length) return [];
  const baseFilter = { $or: ors };
  if (supplierId) baseFilter._id = { $ne: supplierId };

  const candidates = await Supplier.find(baseFilter)
    .select('_id name email phone status reliability_level updatedAt createdAt')
    .limit(30)
    .lean();

  if (!nName) return candidates;

  const fuzzy = [];
  for (const c of candidates) {
    const cn = normalizeSupplierNameForSimilarity(c?.name || '');
    const sim = trigramSimilarity(nName, cn);
    if (sim >= 0.82) fuzzy.push({ ...c, similarity: Number(sim.toFixed(3)) });
  }
  const byId = new Map();
  for (const c of candidates) byId.set(String(c._id), c);
  for (const c of fuzzy) byId.set(String(c._id), c);
  return Array.from(byId.values()).slice(0, 30);
}

async function upsertSupplierAlertsForSupplier({
  supplier,
  userId = null,
  potential_duplicates = [],
} = {}) {
  if (!supplier?._id) return { created: 0, treated: 0, active: [] };

  const { alerts } = buildSupplierAlerts({ supplier, potential_duplicates });
  const existingOpen = await SupplierAlert.find({
    supplier: supplier._id,
    status: { $in: [ALERT_STATUS.NON_TRAITEE, ALERT_STATUS.EN_COURS] },
  }).lean();

  const openByType = new Map(existingOpen.map((a) => [a.type, a]));
  const desiredTypes = new Set(alerts.map((a) => a.type));

  const toCreate = alerts.filter((a) => !openByType.has(a.type));
  const toTreat = existingOpen.filter((a) => !desiredTypes.has(a.type));

  let created = 0;
  if (toCreate.length) {
    const payload = toCreate.map((a) => ({
      supplier: supplier._id,
      type: a.type,
      message: a.message,
      priority: a.priority,
      status: ALERT_STATUS.NON_TRAITEE,
      treated_at: null,
      treated_by: null,
      dedupe_key: a.dedupe_key || '',
    }));
    const inserted = await SupplierAlert.insertMany(payload);
    created = inserted.length;

    await SupplierHistory.insertMany(inserted.map((ins) => ({
      supplier: supplier._id,
      user: userId || null,
      action: 'MODIFICATION',
      comment: `Création alerte: ${ins.type}`,
      new_value: { alert_id: String(ins._id), type: ins.type, priority: ins.priority },
    }))).catch(() => null);
  }

  let treated = 0;
  if (toTreat.length) {
    const ids = toTreat.map((x) => x._id);
    const res = await SupplierAlert.updateMany(
      { _id: { $in: ids } },
      { $set: { status: ALERT_STATUS.TRAITEE, treated_at: new Date(), treated_by: userId || null } }
    );
    treated = Number(res?.modifiedCount || 0);

    await SupplierHistory.insertMany(toTreat.map((a) => ({
      supplier: supplier._id,
      user: userId || null,
      action: 'TRAITEMENT_ALERTE',
      comment: `Alerte auto-traitée: ${a.type}`,
      old_value: { alert_id: String(a._id), type: a.type, status: a.status },
      new_value: { status: ALERT_STATUS.TRAITEE },
    }))).catch(() => null);
  }

  const active = await SupplierAlert.find({
    supplier: supplier._id,
    status: { $in: [ALERT_STATUS.NON_TRAITEE, ALERT_STATUS.EN_COURS] },
  }).sort({ createdAt: -1 }).limit(25).lean();

  return { created, treated, active };
}

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

// GET /api/suppliers
// Listing "référentiel": recherche, filtres, pagination (sans dépendance aux autres modules).
router.get('/', requirePermission(PERMISSIONS.SUPPLIER_MANAGE), async (req, res) => {
  try {
    const { page, limit, skip } = parsePageLimit(req, { defaultLimit: 20, maxLimit: 100 });

    const filter = {};
    const statusFilter = asOptionalString(req.query?.status);
    if (statusFilter && statusFilter !== 'all') {
      const sq = supplierStatusQuery(statusFilter);
      if (!sq) return res.status(400).json({ error: 'status invalide' });
      filter.status = sq;
    }

    const reliability = asOptionalString(req.query?.reliability);
    if (reliability && reliability !== 'all') {
      const rel = normalizeReliabilityLevel(reliability);
      if (!rel) return res.status(400).json({ error: 'reliability invalide' });
      filter.reliability_level = rel;
    }

    const profileState = asOptionalString(req.query?.profile_state);
    if (profileState && profileState !== 'all') {
      if (!['complete', 'incomplete', 'a_verifier'].includes(profileState)) {
        return res.status(400).json({ error: 'profile_state invalide' });
      }
      if (profileState === 'a_verifier') {
        filter.status = supplierStatusQuery(SUPPLIER_STATUS.A_VERIFIER);
      } else if (profileState === 'incomplete') {
        filter.$or = [
          { email: { $in: [null, undefined, ''] } },
          { phone: { $in: [null, undefined, ''] } },
          { domain: { $in: [null, undefined, ''] } },
          { status: { $in: [null, undefined, ''] } },
        ];
      } else if (profileState === 'complete') {
        filter.$and = [
          { email: { $nin: [null, undefined, ''] } },
          { phone: { $nin: [null, undefined, ''] } },
          { domain: { $nin: [null, undefined, ''] } },
          { status: { $nin: [null, undefined, ''] } },
        ];
      }
    }

    const searchFilter = buildSupplierSearchFilter(req.query?.q);
    if (searchFilter) filter.$and = [...(filter.$and || []), searchFilter];

    const sortKey = String(req.query?.sort || 'name').trim();
    const sortDir = String(req.query?.dir || 'asc').trim().toLowerCase() === 'desc' ? -1 : 1;
    const sort = sortKey === 'updatedAt'
      ? { updatedAt: sortDir, name: 1 }
      : { name: sortDir, updatedAt: -1 };

    const [items, total] = await Promise.all([
      Supplier.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Supplier.countDocuments(filter),
    ]);

    const withQuality = items.map((s) => {
      const quality = computeSupplierProfileQuality(s);
      return {
        ...s,
        status: toCanonicalSupplierStatus(s.status),
        profile_state: quality.state,
        missing_fields: quality.missing_fields,
      };
    });

    return res.json({
      suppliers: withQuality,
      items: withQuality,
      page,
      limit,
      total,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch suppliers', details: err.message });
  }
});

// GET /api/suppliers/stats
router.get('/stats', requirePermission(PERMISSIONS.SUPPLIER_MANAGE), async (req, res) => {
  try {
    const [
      total,
      active,
      inactive,
      suspended,
      toVerify,
      incompleteProfiles,
      openAlerts,
      watchSuppliers,
    ] = await Promise.all([
      Supplier.countDocuments({}),
      Supplier.countDocuments({ status: supplierStatusQuery(SUPPLIER_STATUS.ACTIF) }),
      Supplier.countDocuments({ status: supplierStatusQuery(SUPPLIER_STATUS.INACTIF) }),
      Supplier.countDocuments({ status: supplierStatusQuery(SUPPLIER_STATUS.SUSPENDU) }),
      Supplier.countDocuments({ status: supplierStatusQuery(SUPPLIER_STATUS.A_VERIFIER) }),
      Supplier.countDocuments({
        $or: [
          { email: { $in: [null, undefined, ''] } },
          { phone: { $in: [null, undefined, ''] } },
          { domain: { $in: [null, undefined, ''] } },
          { status: { $in: [null, undefined, ''] } },
        ],
      }),
      SupplierAlert.countDocuments({ status: ALERT_STATUS.NON_TRAITEE }),
      Supplier.countDocuments({
        $or: [
          { reliability_level: RELIABILITY_LEVEL.A_SURVEILLER },
          { status: supplierStatusQuery(SUPPLIER_STATUS.A_VERIFIER) },
        ],
      }),
    ]);

    return res.json({
      ok: true,
      stats: {
        total_suppliers: total,
        active_suppliers: active,
        inactive_suppliers: inactive,
        suspended_suppliers: suspended,
        to_verify_suppliers: toVerify,
        incomplete_profiles: incompleteProfiles,
        open_alerts: openAlerts,
        watch_suppliers: watchSuppliers,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to compute suppliers stats', details: err.message });
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

    const suppliers = await Supplier.find({ status: supplierStatusQuery(SUPPLIER_STATUS.ACTIF) })
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
  strictBody([
    'name',
    'email',
    'phone',
    'address',
    'domain',
    'main_contact',
    'internal_note',
    'reliability_level',
    'last_verification_date',
    'default_lead_time_days',
    'status',
    'confirm_duplicate',
  ]),
  async (req, res) => {
    try {
      const name = asOptionalString(req.body?.name);
      if (!name || !isSafeText(name, { min: 2, max: 80 })) return res.status(400).json({ error: 'name obligatoire (2-80)' });

      const lead = clampDays(req.body?.default_lead_time_days, 7);
      if (Number.isNaN(lead)) return res.status(400).json({ error: 'default_lead_time_days invalide' });

      const email = normalizeEmail(req.body?.email);
      if (!email) return res.status(400).json({ error: 'email obligatoire' });
      if (!isValidEmail(email)) return res.status(400).json({ error: 'email invalide' });
      const phone = normalizePhone(req.body?.phone);
      if (!phone) return res.status(400).json({ error: 'telephone obligatoire' });
      if (!isValidPhone(phone)) return res.status(400).json({ error: 'telephone invalide' });
      const address = asOptionalString(req.body?.address);
      if (address !== undefined && !isSafeText(address, { min: 0, max: 240 })) return res.status(400).json({ error: 'address invalide' });

      const domain = asOptionalString(req.body?.domain);
      if (domain !== undefined && !isSafeText(domain, { min: 0, max: 80 })) return res.status(400).json({ error: 'domain invalide' });

      const mainContact = asOptionalString(req.body?.main_contact);
      if (mainContact !== undefined && !isSafeText(mainContact, { min: 0, max: 80 })) return res.status(400).json({ error: 'main_contact invalide' });

      const internalNote = asOptionalString(req.body?.internal_note);
      if (internalNote !== undefined && !isSafeText(internalNote, { min: 0, max: 800 })) return res.status(400).json({ error: 'internal_note invalide' });

      const reliability = req.body?.reliability_level === undefined
        ? undefined
        : normalizeReliabilityLevel(req.body?.reliability_level);
      if (reliability === null) return res.status(400).json({ error: 'reliability_level invalide' });

      let lastVerificationDate = null;
      if (req.body?.last_verification_date !== undefined && req.body?.last_verification_date !== null && req.body?.last_verification_date !== '') {
        const d = new Date(req.body.last_verification_date);
        if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'last_verification_date invalide' });
        lastVerificationDate = d;
      }

      const normalizedStatus = normalizeSupplierStatus(req.body?.status);
      if (!normalizedStatus) return res.status(400).json({ error: 'status obligatoire/invalide' });

      const nameSafe = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const [sameName, sameEmail, samePhone] = await Promise.all([
        Supplier.findOne({ name: new RegExp(`^${nameSafe}$`, 'i') }).select('_id name').lean(),
        Supplier.findOne({ email }).select('_id name email').lean(),
        Supplier.findOne({ phone }).select('_id name phone').lean(),
      ]);
      if (sameName) return res.status(409).json({ error: 'Un fournisseur avec ce nom existe déjà.' });
      if (sameEmail) return res.status(409).json({ error: 'Un fournisseur avec cet email existe déjà.' });
      if (samePhone) return res.status(409).json({ error: 'Un fournisseur avec ce téléphone existe déjà.' });

      const potentialDuplicates = await findPotentialDuplicateSuppliers({ name, email, phone });
      const confirmDuplicate = req.body?.confirm_duplicate === true || String(req.body?.confirm_duplicate || '').toLowerCase() === 'true';
      if (potentialDuplicates.length && !confirmDuplicate) {
        return res.status(409).json({
          error: 'Doublon potentiel détecté',
          code: 'DUPLICATE_WARNING',
          potential_duplicates: potentialDuplicates.map((d) => ({
            id: d._id,
            name: d.name,
            email: d.email || null,
            phone: d.phone || null,
            status: toCanonicalSupplierStatus(d.status),
            similarity: d.similarity || null,
          })),
        });
      }

      const payload = {
        name,
        email,
        phone,
        address,
        default_lead_time_days: lead,
        status: normalizedStatus,
        domain,
        main_contact: mainContact,
        internal_note: internalNote,
        reliability_level: reliability || RELIABILITY_LEVEL.NON_EVALUE,
        last_verification_date: lastVerificationDate,
        created_by: req.user.id,
      };

      const created = await Supplier.create(payload);

      await SupplierHistory.create({
        supplier: created._id,
        user: req.user.id,
        action: 'CREATION',
        new_value: {
          name: created.name,
          email: created.email || null,
          phone: created.phone || null,
          address: created.address || null,
          domain: created.domain || null,
          main_contact: created.main_contact || null,
          status: toCanonicalSupplierStatus(created.status),
          reliability_level: created.reliability_level || RELIABILITY_LEVEL.NON_EVALUE,
        },
      });

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

      await upsertSupplierAlertsForSupplier({
        supplier: created,
        userId: req.user.id,
        potential_duplicates: potentialDuplicates,
      }).catch(() => null);

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
  strictBody([
    'name',
    'email',
    'phone',
    'address',
    'domain',
    'main_contact',
    'internal_note',
    'reliability_level',
    'last_verification_date',
    'default_lead_time_days',
    'status',
    'confirm_duplicate',
  ]),
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
        if (!email) return res.status(400).json({ error: 'email obligatoire' });
        if (!isValidEmail(email)) return res.status(400).json({ error: 'email invalide' });
        patch.email = email;
      }
      const phone = normalizePhone(req.body?.phone);
      if (phone !== undefined) {
        if (!phone) return res.status(400).json({ error: 'telephone obligatoire' });
        if (!isValidPhone(phone)) return res.status(400).json({ error: 'telephone invalide' });
        patch.phone = phone;
      }
      const address = asOptionalString(req.body?.address);
      if (address !== undefined) {
        if (address && !isSafeText(address, { min: 0, max: 240 })) return res.status(400).json({ error: 'address invalide' });
        patch.address = address;
      }

      const domain = asOptionalString(req.body?.domain);
      if (domain !== undefined) {
        if (domain && !isSafeText(domain, { min: 0, max: 80 })) return res.status(400).json({ error: 'domain invalide' });
        patch.domain = domain;
      }
      const mainContact = asOptionalString(req.body?.main_contact);
      if (mainContact !== undefined) {
        if (mainContact && !isSafeText(mainContact, { min: 0, max: 80 })) return res.status(400).json({ error: 'main_contact invalide' });
        patch.main_contact = mainContact;
      }
      const internalNote = asOptionalString(req.body?.internal_note);
      if (internalNote !== undefined) {
        if (internalNote && !isSafeText(internalNote, { min: 0, max: 800 })) return res.status(400).json({ error: 'internal_note invalide' });
        patch.internal_note = internalNote;
      }
      if (req.body?.reliability_level !== undefined) {
        const rel = normalizeReliabilityLevel(req.body?.reliability_level);
        if (!rel) return res.status(400).json({ error: 'reliability_level invalide' });
        patch.reliability_level = rel;
      }
      if (req.body?.last_verification_date !== undefined) {
        if (req.body?.last_verification_date === null || req.body?.last_verification_date === '') {
          patch.last_verification_date = null;
        } else {
          const d = new Date(req.body.last_verification_date);
          if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'last_verification_date invalide' });
          patch.last_verification_date = d;
        }
      }
      if (req.body?.default_lead_time_days !== undefined) {
        const lead = clampDays(req.body.default_lead_time_days, null);
        if (Number.isNaN(lead)) return res.status(400).json({ error: 'default_lead_time_days invalide' });
        patch.default_lead_time_days = lead;
      }
      if (req.body?.status !== undefined) {
        const st = normalizeSupplierStatus(req.body.status);
        if (!st) return res.status(400).json({ error: 'status invalide' });
        patch.status = st;
      }

      const before = await Supplier.findById(req.params.id).lean();
      if (!before) return res.status(404).json({ error: 'Supplier not found' });

      const effectiveName = patch.name || before.name;
      const effectiveEmail = patch.email === undefined ? before.email : patch.email;
      const effectivePhone = patch.phone === undefined ? before.phone : patch.phone;

      const nameSafe = String(effectiveName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const [sameName, sameEmail, samePhone] = await Promise.all([
        effectiveName
          ? Supplier.findOne({ _id: { $ne: before._id }, name: new RegExp(`^${nameSafe}$`, 'i') }).select('_id').lean()
          : null,
        effectiveEmail
          ? Supplier.findOne({ _id: { $ne: before._id }, email: normalizeEmail(effectiveEmail) }).select('_id').lean()
          : null,
        effectivePhone
          ? Supplier.findOne({ _id: { $ne: before._id }, phone: normalizePhone(effectivePhone) }).select('_id').lean()
          : null,
      ]);
      if (sameName) return res.status(409).json({ error: 'Un fournisseur avec ce nom existe déjà.' });
      if (sameEmail) return res.status(409).json({ error: 'Un fournisseur avec cet email existe déjà.' });
      if (samePhone) return res.status(409).json({ error: 'Un fournisseur avec ce téléphone existe déjà.' });

      const potentialDuplicates = await findPotentialDuplicateSuppliers({
        supplierId: before._id,
        name: effectiveName,
        email: effectiveEmail,
        phone: effectivePhone,
      });
      const confirmDuplicate = req.body?.confirm_duplicate === true || String(req.body?.confirm_duplicate || '').toLowerCase() === 'true';
      if (potentialDuplicates.length && !confirmDuplicate) {
        return res.status(409).json({
          error: 'Doublon potentiel détecté',
          code: 'DUPLICATE_WARNING',
          potential_duplicates: potentialDuplicates.map((d) => ({
            id: d._id,
            name: d.name,
            email: d.email || null,
            phone: d.phone || null,
            status: toCanonicalSupplierStatus(d.status),
            similarity: d.similarity || null,
          })),
        });
      }

      const updated = await Supplier.findByIdAndUpdate(req.params.id, { $set: patch }, { returnDocument: 'after' });
      if (!updated) return res.status(404).json({ error: 'Supplier not found' });

      const changed = {};
      const fields = ['name', 'email', 'phone', 'address', 'domain', 'main_contact', 'internal_note', 'status', 'reliability_level', 'last_verification_date', 'default_lead_time_days'];
      for (const f of fields) {
        const b = before?.[f];
        const a = updated?.[f];
        const bv = b instanceof Date ? b.toISOString() : b;
        const av = a instanceof Date ? a.toISOString() : a;
        if (bv !== av) changed[f] = { before: b ?? null, after: a ?? null };
      }

      await SupplierHistory.create({
        supplier: updated._id,
        user: req.user.id,
        action: 'MODIFICATION',
        old_value: Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.before])),
        new_value: Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.after])),
      }).catch(() => null);

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

      await upsertSupplierAlertsForSupplier({
        supplier: updated,
        userId: req.user.id,
        potential_duplicates: potentialDuplicates,
      }).catch(() => null);

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
      if (!isActiveSupplierStatus(supplier.status)) {
        return res.status(409).json({ error: 'Fournisseur inactif' });
      }
      const product = await Product.findById(productId).select('_id name lifecycle_status').lean();
      if (!product) return res.status(404).json({ error: 'Product not found' });
      if (String(product.lifecycle_status || 'active') !== 'active') {
        return res.status(409).json({ error: 'Produit archive / indisponible' });
      }

      // Controle intelligent: un fournisseur a risque eleve ne peut pas etre associe a un produit.
      // (Regle explainable, basee sur retards + commandes ouvertes + ACK + litiges)
      try {
        const emailPolicy = await getSupplierEmailPolicy().catch(() => null);
        const ackSlaHours = emailPolicy && typeof emailPolicy.ack_sla_hours === 'number' ? emailPolicy.ack_sla_hours : 24;
        const ackSlaMs = Math.max(6, Math.min(168, Math.floor(Number(ackSlaHours || 24)))) * 60 * 60 * 1000;
        const windowDays = 180;
        const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
        const now = new Date();

        const [deliveredPos, openPos] = await Promise.all([
          PurchaseOrder.find({
            supplier: supplier._id,
            status: 'delivered',
            delivered_at: { $ne: null },
            ordered_at: { $gte: since },
          })
            .select('supplier status ordered_at promised_at delivered_at')
            .sort({ ordered_at: -1 })
            .limit(450)
            .lean(),
          PurchaseOrder.find({
            supplier: supplier._id,
            status: 'ordered',
            received_at: { $in: [null, undefined] },
          })
            .select('supplier status ordered_at promised_at createdAt supplier_ack incidents')
            .sort({ ordered_at: -1, createdAt: -1 })
            .limit(250)
            .lean(),
        ]);

        const kpis = computeSupplierDeliveryKpis(deliveredPos || []);
        const openOrdersCount = Array.isArray(openPos) ? openPos.length : 0;

        let lateOpenOrdersCount = 0;
        let maxDaysLate = 0;
        let ackOverdueCount = 0;
        let openIncidentsCount = 0;
        let criticalOpenIncidentsCount = 0;

        for (const po of openPos || []) {
          const promised = po?.promised_at ? new Date(po.promised_at) : null;
          if (promised && !Number.isNaN(promised.getTime())) {
            const daysLate = (now.getTime() - promised.getTime()) / (24 * 60 * 60 * 1000);
            if (daysLate > 0.00001) {
              lateOpenOrdersCount += 1;
              maxDaysLate = Math.max(maxDaysLate, daysLate);
            }
          }

          const ackStatus = String(po?.supplier_ack?.status || 'none');
          const orderedAt = po.ordered_at ? new Date(po.ordered_at) : (po.createdAt ? new Date(po.createdAt) : null);
          if (ackStatus === 'none' && orderedAt && !Number.isNaN(orderedAt.getTime())) {
            if ((now.getTime() - orderedAt.getTime()) >= ackSlaMs) ackOverdueCount += 1;
          }

          const incidents = Array.isArray(po?.incidents) ? po.incidents : [];
          for (const inc of incidents) {
            if (inc && String(inc.status || 'open') === 'open') {
              openIncidentsCount += 1;
              if (String(inc.severity || '') === 'critical') criticalOpenIncidentsCount += 1;
            }
          }
        }

        const riskScore = computeSupplierRisk({
          kpis,
          openOrdersCount,
          lateOpenOrdersCount,
          maxDaysLate,
          ackOverdueCount,
          openIncidentsCount,
          criticalOpenIncidentsCount,
        });
        const riskLevel = riskLevelFromScore(riskScore);
        if (['critique', 'eleve'].includes(String(riskLevel))) {
          return res.status(409).json({
            error: 'Fournisseur a risque eleve',
            details: `Association bloquee: risque ${riskLevel} (score ${riskScore}/100) sur ${windowDays} jours.`,
          });
        }
      } catch {
        // Never block on insights compute error; only enforce "inactive" strictly.
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
      const suppliers = await Supplier.find({ status: supplierStatusQuery(SUPPLIER_STATUS.ACTIF) }).select('_id name status default_lead_time_days').lean();
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
      if (!supplier || !isActiveSupplierStatus(supplier.status)) continue;
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

    const suppliers = await Supplier.find({ status: supplierStatusQuery(SUPPLIER_STATUS.ACTIF) })
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

// GET /api/suppliers/:id (fiche détail)
router.get('/:id', requirePermission(PERMISSIONS.SUPPLIER_MANAGE), async (req, res) => {
  try {
    if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });
    const supplier = await Supplier.findById(req.params.id).lean();
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

    const quality = computeSupplierProfileQuality(supplier);
    const alerts = await SupplierAlert.find({ supplier: supplier._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.json({
      ok: true,
      supplier: {
        ...supplier,
        status: toCanonicalSupplierStatus(supplier.status),
        profile_state: quality.state,
        missing_fields: quality.missing_fields,
      },
      alerts,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch supplier detail', details: err.message });
  }
});

// GET /api/suppliers/:id/history
router.get('/:id/history', requirePermission(PERMISSIONS.SUPPLIER_MANAGE), async (req, res) => {
  try {
    if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });
    const { page, limit, skip } = parsePageLimit(req, { defaultLimit: 50, maxLimit: 200 });

    const [items, total] = await Promise.all([
      SupplierHistory.find({ supplier: req.params.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user', 'username email role status telephone')
        .lean(),
      SupplierHistory.countDocuments({ supplier: req.params.id }),
    ]);

    return res.json({
      ok: true,
      page,
      limit,
      total,
      total_pages: Math.max(1, Math.ceil(total / limit)),
      items,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch supplier history', details: err.message });
  }
});

// PATCH /api/suppliers/:id/status
router.patch(
  '/:id/status',
  requirePermission(PERMISSIONS.SUPPLIER_MANAGE),
  strictBody(['status', 'comment']),
  async (req, res) => {
    try {
      if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });
      const status = normalizeSupplierStatus(req.body?.status);
      if (!status) return res.status(400).json({ error: 'status invalide' });
      const comment = asOptionalString(req.body?.comment);
      if (comment !== undefined && !isSafeText(comment, { min: 0, max: 240 })) return res.status(400).json({ error: 'comment invalide' });

      const before = await Supplier.findById(req.params.id).lean();
      if (!before) return res.status(404).json({ error: 'Supplier not found' });

      const updated = await Supplier.findByIdAndUpdate(req.params.id, { $set: { status } }, { returnDocument: 'after' });
      if (!updated) return res.status(404).json({ error: 'Supplier not found' });

      await SupplierHistory.create({
        supplier: updated._id,
        user: req.user.id,
        action: 'CHANGEMENT_STATUT',
        old_value: { status: toCanonicalSupplierStatus(before.status) },
        new_value: { status: toCanonicalSupplierStatus(updated.status) },
        comment: comment || '',
      }).catch(() => null);

      await History.create({
        action_type: 'supplier',
        user: req.user.id,
        source: 'ui',
        description: 'Changement statut fournisseur',
        actor_role: req.user.role,
        tags: ['supplier', 'status'],
        status_before: before.status,
        status_after: updated.status,
        context: { supplier_id: String(updated._id), comment: comment || '' },
      }).catch(() => null);

      const potentialDuplicates = await findPotentialDuplicateSuppliers({
        supplierId: updated._id,
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
      });
      await upsertSupplierAlertsForSupplier({
        supplier: updated,
        userId: req.user.id,
        potential_duplicates: potentialDuplicates,
      }).catch(() => null);

      return res.json({ ok: true, supplier: updated });
    } catch (err) {
      return res.status(400).json({ error: 'Failed to update supplier status', details: err.message });
    }
  }
);

// PATCH /api/suppliers/:id/reliability
router.patch(
  '/:id/reliability',
  requirePermission(PERMISSIONS.SUPPLIER_MANAGE),
  strictBody(['reliability_level', 'comment']),
  async (req, res) => {
    try {
      if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });
      const reliability = normalizeReliabilityLevel(req.body?.reliability_level);
      if (!reliability) return res.status(400).json({ error: 'reliability_level invalide' });
      const comment = asOptionalString(req.body?.comment);
      if (comment !== undefined && !isSafeText(comment, { min: 0, max: 240 })) return res.status(400).json({ error: 'comment invalide' });

      const before = await Supplier.findById(req.params.id).lean();
      if (!before) return res.status(404).json({ error: 'Supplier not found' });

      const updated = await Supplier.findByIdAndUpdate(req.params.id, { $set: { reliability_level: reliability } }, { returnDocument: 'after' });
      if (!updated) return res.status(404).json({ error: 'Supplier not found' });

      await SupplierHistory.create({
        supplier: updated._id,
        user: req.user.id,
        action: 'CHANGEMENT_FIABILITE',
        old_value: { reliability_level: before.reliability_level || RELIABILITY_LEVEL.NON_EVALUE },
        new_value: { reliability_level: updated.reliability_level || RELIABILITY_LEVEL.NON_EVALUE },
        comment: comment || '',
      }).catch(() => null);

      await History.create({
        action_type: 'supplier',
        user: req.user.id,
        source: 'ui',
        description: 'Changement fiabilite fournisseur',
        actor_role: req.user.role,
        tags: ['supplier', 'reliability'],
        context: { supplier_id: String(updated._id), comment: comment || '' },
      }).catch(() => null);

      const potentialDuplicates = await findPotentialDuplicateSuppliers({
        supplierId: updated._id,
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
      });
      await upsertSupplierAlertsForSupplier({
        supplier: updated,
        userId: req.user.id,
        potential_duplicates: potentialDuplicates,
      }).catch(() => null);

      return res.json({ ok: true, supplier: updated });
    } catch (err) {
      return res.status(400).json({ error: 'Failed to update supplier reliability', details: err.message });
    }
  }
);

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
      if (!isActiveSupplierStatus(supplier.status)) return res.status(409).json({ error: 'Fournisseur inactif' });

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
