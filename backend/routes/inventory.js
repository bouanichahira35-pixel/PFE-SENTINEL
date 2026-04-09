const router = require('express').Router();

const requireAuth = require('../middlewares/requireAuth');
const requirePermission = require('../middlewares/requirePermission');
const strictBody = require('../middlewares/strictBody');
const { PERMISSIONS } = require('../constants/permissions');

const InventorySession = require('../models/InventorySession');
const InventoryCount = require('../models/InventoryCount');
const Product = require('../models/Product');
const StockEntry = require('../models/StockEntry');
const StockExit = require('../models/StockExit');
const Sequence = require('../models/Sequence');
const History = require('../models/History');
const { runInTransaction } = require('../services/transactionService');

const { asNonNegativeNumber, asOptionalString, asTrimmedString, isSafeText, isValidObjectIdLike } = require('../utils/validation');

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

// GET /api/inventory/sessions
router.get('/sessions', async (req, res) => {
  try {
    const status = asOptionalString(req.query?.status);
    const mine = String(req.query?.mine || '') === '1';
    const q = {};
    if (status && ['draft', 'counting', 'closed', 'applied', 'cancelled'].includes(status)) q.status = status;
    if (mine && req.user?.role === 'magasinier') q.created_by = req.user.id;

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

    const counts = await InventoryCount.find({ session: session._id })
      .populate('product', '_id name code_product quantity_current seuil_minimum')
      .populate('counted_by', 'username role')
      .sort({ updatedAt: -1 })
      .lean();

    const lines = counts.map((c) => ({
      _id: c._id,
      product: c.product,
      counted_quantity: Number(c.counted_quantity || 0),
      system_quantity_at_count: Number(c.system_quantity_at_count || 0),
      delta: Number(c.counted_quantity || 0) - Number(c.system_quantity_at_count || 0),
      note: c.note || '',
      counted_by: c.counted_by,
      counted_at: c.counted_at || c.updatedAt || c.createdAt,
    }));

    const summary = lines.reduce(
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

    return res.json({ ok: true, line: doc });
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
