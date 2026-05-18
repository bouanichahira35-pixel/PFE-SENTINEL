const router = require('express').Router();
const requireAuth = require('../middlewares/requireAuth');
const requirePermission = require('../middlewares/requirePermission');
const strictBody = require('../middlewares/strictBody');
const { PERMISSIONS } = require('../constants/permissions');

const SupplierAlert = require('../models/SupplierAlert');
const SupplierHistory = require('../models/SupplierHistory');
const History = require('../models/History');

const { asOptionalString, isValidObjectIdLike, isSafeText } = require('../utils/validation');
const { ALERT_STATUS } = require('../services/supplierRegistryService');

router.use(requireAuth);
router.use(requirePermission(PERMISSIONS.SUPPLIER_MANAGE));

function parsePageLimit(req, { defaultLimit = 30, maxLimit = 200 } = {}) {
  const page = Math.max(1, Number(req.query?.page || 1));
  const limit = Math.min(maxLimit, Math.max(1, Number(req.query?.limit || defaultLimit)));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

router.get('/', async (req, res) => {
  try {
    const { page, limit, skip } = parsePageLimit(req);
    const filter = {};

    const status = asOptionalString(req.query?.status);
    if (status && status !== 'all') {
      if (!Object.values(ALERT_STATUS).includes(status)) return res.status(400).json({ error: 'status invalide' });
      filter.status = status;
    }

    const type = asOptionalString(req.query?.type);
    if (type && type !== 'all') filter.type = type;

    const priority = asOptionalString(req.query?.priority);
    if (priority && priority !== 'all') filter.priority = priority;

    const supplierId = asOptionalString(req.query?.supplier);
    if (supplierId) {
      if (!isValidObjectIdLike(supplierId)) return res.status(400).json({ error: 'supplier invalide' });
      filter.supplier = supplierId;
    }

    const [items, total] = await Promise.all([
      SupplierAlert.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('supplier', 'name status reliability_level')
        .lean(),
      SupplierAlert.countDocuments(filter),
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
    return res.status(500).json({ error: 'Failed to fetch supplier alerts', details: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });
    const item = await SupplierAlert.findById(req.params.id).populate('supplier', 'name status').lean();
    if (!item) return res.status(404).json({ error: 'Alert not found' });
    return res.json({ ok: true, alert: item });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch supplier alert', details: err.message });
  }
});

// PATCH /api/supplier-alerts/:id/status
router.patch('/:id/status', strictBody(['status', 'comment']), async (req, res) => {
  try {
    if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });
    const status = asOptionalString(req.body?.status);
    if (!status || !Object.values(ALERT_STATUS).includes(status)) return res.status(400).json({ error: 'status invalide' });
    const comment = asOptionalString(req.body?.comment);
    if (comment !== undefined && !isSafeText(comment, { min: 0, max: 240 })) return res.status(400).json({ error: 'comment invalide' });

    const before = await SupplierAlert.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ error: 'Alert not found' });

    const treated = status === ALERT_STATUS.TRAITEE || status === ALERT_STATUS.IGNOREE;
    const update = {
      status,
      treated_at: treated ? new Date() : null,
      treated_by: treated ? req.user.id : null,
    };

    const updated = await SupplierAlert.findByIdAndUpdate(req.params.id, { $set: update }, { returnDocument: 'after' })
      .populate('supplier', 'name status')
      .lean();
    if (!updated) return res.status(404).json({ error: 'Alert not found' });

    await SupplierHistory.create({
      supplier: before.supplier,
      user: req.user.id,
      action: 'TRAITEMENT_ALERTE',
      old_value: { alert_id: String(before._id), status: before.status },
      new_value: { status: updated.status },
      comment: comment || '',
    }).catch(() => null);

    await History.create({
      action_type: 'supplier',
      user: req.user.id,
      source: 'ui',
      description: 'Traitement alerte fournisseur',
      actor_role: req.user.role,
      tags: ['supplier', 'alert', 'status'],
      context: {
        supplier_id: before.supplier ? String(before.supplier) : null,
        alert_id: String(before._id),
        type: before.type,
        status_before: before.status,
        status_after: updated.status,
        comment: comment || '',
      },
    }).catch(() => null);

    return res.json({ ok: true, alert: updated });
  } catch (err) {
    return res.status(400).json({ error: 'Failed to update supplier alert status', details: err.message });
  }
});

module.exports = router;

