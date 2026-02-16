const router = require('express').Router();
const StockEntry = require('../models/StockEntry');
const StockExit = require('../models/StockExit');
const StockLot = require('../models/StockLot');
const Product = require('../models/Product');
const History = require('../models/History');
const Sequence = require('../models/Sequence');
const requireAuth = require('../middlewares/requireAuth');
const requirePermission = require('../middlewares/requirePermission');
const { PERMISSIONS } = require('../constants/permissions');
const { runInTransaction } = require('../services/transactionService');
const { evaluateProductAlerts } = require('../services/alertService');
const {
  asDate,
  asNonNegativeNumber,
  asOptionalString,
  asPositiveNumber,
  isValidObjectIdLike,
} = require('../utils/validation');
const SAFE_USER_FIELDS = 'username email role status telephone';

function computeProductStatus(quantity, seuilMinimum) {
  if (Number(quantity) <= 0) return 'rupture';
  if (Number(quantity) <= Number(seuilMinimum || 0)) return 'sous_seuil';
  return 'ok';
}

async function getNextEntryNumber() {
  const year = new Date().getFullYear();
  const counterName = `stock_entry_${year}`;

  const counter = await Sequence.findOneAndUpdate(
    { counter_name: counterName },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  return `BE-${year}-${String(counter.seq).padStart(5, '0')}`;
}

async function getNextExitNumber() {
  const year = new Date().getFullYear();
  const counterName = `stock_exit_${year}`;

  const counter = await Sequence.findOneAndUpdate(
    { counter_name: counterName },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  return `BP-${year}-${String(counter.seq).padStart(5, '0')}`;
}

function sanitizeAttachments(input) {
  if (!Array.isArray(input)) return [];
  return input.map((a) => ({
    label: a?.label || '',
    file_name: a?.file_name || '',
    file_url: a?.file_url || '',
  }));
}

router.get('/entries', requireAuth, async (req, res) => {
  try {
    const items = await StockEntry.find()
      .populate('product')
      .populate('magasinier', SAFE_USER_FIELDS)
      .populate('canceled_by', SAFE_USER_FIELDS)
      .sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stock entries' });
  }
});

router.post(
  '/entries',
  requireAuth,
  requirePermission(PERMISSIONS.STOCK_ENTRY_CREATE),
  async (req, res) => {
  try {
    const errors = [];
    const quantity = asPositiveNumber(req.body.quantity);
    if (Number.isNaN(quantity) || quantity === undefined) errors.push('quantity must be a positive number');
    if (!isValidObjectIdLike(req.body.product)) errors.push('product id invalide');

    const deliveryDate = asDate(req.body.delivery_date);
    if (deliveryDate === null) errors.push('delivery_date invalide');
    const dateEntry = asDate(req.body.date_entry);
    if (dateEntry === null) errors.push('date_entry invalide');
    const unitPrice = asNonNegativeNumber(req.body.unit_price);
    if (Number.isNaN(unitPrice)) errors.push('unit_price doit etre un nombre >= 0');

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const product = await Product.findById(req.body.product);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    if (product.validation_status !== 'approved') {
      return res.status(400).json({ error: 'Produit non valide. Validation responsable requise.' });
    }

    const item = await runInTransaction(async (session) => {
      const payload = {
        entry_number: await getNextEntryNumber(),
        product: req.body.product,
        quantity,
        unit_price: unitPrice,
        purchase_order_number: asOptionalString(req.body.purchase_order_number),
        purchase_voucher_number: asOptionalString(req.body.purchase_voucher_number),
        delivery_note_number: asOptionalString(req.body.delivery_note_number),
        delivery_date: deliveryDate,
        service_requester: asOptionalString(req.body.service_requester),
        supplier: asOptionalString(req.body.supplier),
        commercial_name: asOptionalString(req.body.commercial_name),
        reference_code: asOptionalString(req.body.reference_code),
        lot_number: asOptionalString(req.body.lot_number),
        inventory_number: asOptionalString(req.body.inventory_number),
        patrimoine_number: asOptionalString(req.body.patrimoine_number),
        beneficiary: asOptionalString(req.body.beneficiary),
        expiry_date: asDate(req.body.expiry_date) || undefined,
        chemical_status: asOptionalString(req.body.chemical_status),
        dangerous_product_attestation: asOptionalString(req.body.dangerous_product_attestation),
        contract_number: asOptionalString(req.body.contract_number),
        observation: asOptionalString(req.body.observation),
        attachments: sanitizeAttachments(req.body.attachments),
        date_entry: dateEntry || new Date(),
        magasinier: req.user.id,
      };

      const [entry] = session
        ? await StockEntry.create([payload], { session })
        : [await StockEntry.create(payload)];

      const lotPayload = {
        product: product._id,
        entry: entry._id,
        lot_number: entry.lot_number || undefined,
        expiry_date: entry.expiry_date || undefined,
        date_entry: entry.date_entry || new Date(),
        quantity_initial: quantity,
        quantity_available: quantity,
        unit_price: unitPrice,
        status: 'open',
      };
      if (session) await StockLot.create([lotPayload], { session });
      else await StockLot.create(lotPayload);

      product.quantity_current = Number(product.quantity_current || 0) + quantity;
      product.status = computeProductStatus(product.quantity_current, product.seuil_minimum);
      await product.save({ session });

      const historyPayload = {
        action_type: 'entry',
        user: req.user.id,
        product: product._id,
        quantity,
        source: 'ui',
        description: `Bon d'entree cree (${entry.entry_number})`,
      };
      if (session) await History.create([historyPayload], { session });
      else await History.create(historyPayload);

      await evaluateProductAlerts(product, session);
      return entry;
    });

    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create stock entry', details: err.message });
  }
});

router.put('/entries/:id', requireAuth, requirePermission(PERMISSIONS.STOCK_ENTRY_UPDATE), async (req, res) => {
  try {
    const entry = await StockEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Stock entry not found' });
    if (entry.canceled) return res.status(400).json({ error: 'Canceled entry cannot be updated' });

    const oldQty = Number(entry.quantity || 0);
    const newQty = Number(req.body.quantity);
    if (!Number.isFinite(newQty) || newQty <= 0) {
      return res.status(400).json({ error: 'Quantity must be a positive number' });
    }

    const qtyDelta = newQty - oldQty;
    const product = await Product.findById(entry.product);
    if (!product) return res.status(404).json({ error: 'Linked product not found' });

    const nextStock = Number(product.quantity_current || 0) + qtyDelta;
    if (nextStock < 0) {
      return res.status(400).json({ error: 'Stock would become negative' });
    }

    Object.assign(entry, {
      quantity: newQty,
      unit_price: req.body.unit_price,
      purchase_order_number: req.body.purchase_order_number,
      purchase_voucher_number: req.body.purchase_voucher_number,
      delivery_note_number: req.body.delivery_note_number,
      delivery_date: req.body.delivery_date,
      service_requester: req.body.service_requester,
      supplier: req.body.supplier,
      commercial_name: req.body.commercial_name,
      reference_code: req.body.reference_code,
      lot_number: req.body.lot_number,
      inventory_number: req.body.inventory_number,
      patrimoine_number: req.body.patrimoine_number,
      beneficiary: req.body.beneficiary,
      expiry_date: req.body.expiry_date,
      chemical_status: req.body.chemical_status,
      dangerous_product_attestation: req.body.dangerous_product_attestation,
      contract_number: req.body.contract_number,
      observation: req.body.observation,
      attachments: sanitizeAttachments(req.body.attachments),
    });

    await entry.save();

    product.quantity_current = nextStock;
    product.status = computeProductStatus(product.quantity_current, product.seuil_minimum);
    await product.save();

    await History.create({
      action_type: 'entry',
      user: req.user.id,
      product: product._id,
      quantity: newQty,
      source: 'ui',
      description: `Bon d'entree modifie (${entry.entry_number})`,
    });

    res.json(entry);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update stock entry', details: err.message });
  }
});

router.patch('/entries/:id/cancel', requireAuth, requirePermission(PERMISSIONS.STOCK_ENTRY_CANCEL), async (req, res) => {
  try {
    const entry = await StockEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Stock entry not found' });
    if (entry.canceled) return res.status(400).json({ error: 'Entry already canceled' });

    const product = await Product.findById(entry.product);
    if (!product) return res.status(404).json({ error: 'Linked product not found' });

    await runInTransaction(async (session) => {
      const lot = await StockLot.findOne({ entry: entry._id }).session(session);
      if (!lot) throw new Error('Lot d entree introuvable');
      if (Number(lot.quantity_available || 0) < Number(lot.quantity_initial || 0)) {
        throw new Error('Cannot cancel entry: stock already consumed from this lot');
      }

      entry.canceled = true;
      entry.canceled_at = new Date();
      entry.canceled_by = req.user.id;
      await entry.save({ session });

      lot.quantity_available = 0;
      lot.status = 'empty';
      await lot.save({ session });

      product.quantity_current = Number(product.quantity_current || 0) - Number(entry.quantity || 0);
      product.status = computeProductStatus(product.quantity_current, product.seuil_minimum);
      await product.save({ session });
      await evaluateProductAlerts(product, session);

      const historyPayload = {
        action_type: 'entry',
        user: req.user.id,
        product: product._id,
        quantity: entry.quantity,
        source: 'ui',
        description: `Bon d'entree annule (${entry.entry_number})`,
      };
      if (session) await History.create([historyPayload], { session });
      else await History.create(historyPayload);
    });

    res.json({ message: 'Stock entry canceled', entry });
  } catch (err) {
    res.status(400).json({ error: 'Failed to cancel stock entry', details: err.message });
  }
});

router.get('/exits', requireAuth, async (req, res) => {
  try {
    const items = await StockExit.find()
      .populate('product')
      .populate('magasinier', SAFE_USER_FIELDS)
      .populate('demandeur', SAFE_USER_FIELDS)
      .populate('canceled_by', SAFE_USER_FIELDS)
      .sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stock exits' });
  }
});

router.get('/kpis', requireAuth, requirePermission(PERMISSIONS.HISTORY_READ), async (req, res) => {
  try {
    const now = new Date();
    const from = req.query.from ? new Date(req.query.from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = req.query.to ? new Date(req.query.to) : now;

    const [entryAgg, exitAgg, topConsumed, ruptures] = await Promise.all([
      StockEntry.aggregate([
        { $match: { date_entry: { $gte: from, $lte: to }, canceled: false } },
        { $group: { _id: null, qty: { $sum: '$quantity' } } },
      ]),
      StockExit.aggregate([
        { $match: { date_exit: { $gte: from, $lte: to }, canceled: false } },
        { $group: { _id: null, qty: { $sum: '$quantity' } } },
      ]),
      StockExit.aggregate([
        { $match: { date_exit: { $gte: from, $lte: to }, canceled: false } },
        { $group: { _id: '$product', qty: { $sum: '$quantity' } } },
        { $sort: { qty: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'product',
          },
        },
        { $unwind: '$product' },
        { $project: { _id: 0, product_id: '$product._id', code: '$product.code_product', name: '$product.name', qty: 1 } },
      ]),
      Product.find({ status: 'rupture' }).select('code_product name quantity_current seuil_minimum').lean(),
    ]);

    const totalEntries = Number(entryAgg[0]?.qty || 0);
    const totalExits = Number(exitAgg[0]?.qty || 0);

    res.json({
      period: { from, to },
      totals: {
        entries: totalEntries,
        exits: totalExits,
        net: totalEntries - totalExits,
      },
      top_consumptions: topConsumed,
      ruptures,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute KPIs', details: err.message });
  }
});

router.post('/exits', requireAuth, requirePermission(PERMISSIONS.STOCK_EXIT_CREATE), async (req, res) => {
  try {
    const errors = [];
    const quantity = asPositiveNumber(req.body.quantity);
    if (Number.isNaN(quantity) || quantity === undefined) errors.push('quantity must be a positive number');
    if (!isValidObjectIdLike(req.body.product)) errors.push('product id invalide');

    const dateExit = asDate(req.body.date_exit);
    if (dateExit === null) errors.push('date_exit invalide');

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const product = await Product.findById(req.body.product);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    if (product.validation_status !== 'approved') {
      return res.status(400).json({ error: 'Produit non valide. Validation responsable requise.' });
    }

    const currentStock = Number(product.quantity_current || 0);
    if (currentStock < quantity) {
      return res.status(400).json({ error: 'Stock insuffisant' });
    }

    const item = await runInTransaction(async (session) => {
      const lots = await StockLot.find({
        product: product._id,
        quantity_available: { $gt: 0 },
      })
        .sort({ date_entry: 1, expiry_date: 1, createdAt: 1 })
        .session(session);

      let remaining = quantity;
      const consumedLots = [];

      for (const lot of lots) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, Number(lot.quantity_available || 0));
        if (take <= 0) continue;

        lot.quantity_available -= take;
        lot.status = lot.quantity_available <= 0 ? 'empty' : 'open';
        await lot.save({ session });

        remaining -= take;
        consumedLots.push({
          lot: lot._id,
          lot_number: lot.lot_number,
          quantity: take,
          expiry_date: lot.expiry_date,
        });
      }

      if (remaining > 0) {
        throw new Error('Stock insuffisant pour FIFO par lots');
      }

      const payload = {
        exit_number: await getNextExitNumber(),
        withdrawal_paper_number: asOptionalString(req.body.withdrawal_paper_number),
        product: req.body.product,
        quantity,
        direction_laboratory: asOptionalString(req.body.direction_laboratory),
        beneficiary: asOptionalString(req.body.beneficiary),
        demandeur: req.body.demandeur,
        date_exit: dateExit || new Date(),
        fifo_reference: consumedLots.map((x) => x.lot_number || 'N/A').join(', '),
        consumed_lots: consumedLots,
        attachments: sanitizeAttachments(req.body.attachments),
        note: asOptionalString(req.body.note),
        magasinier: req.user.id,
      };

      const [exit] = session ? await StockExit.create([payload], { session }) : [await StockExit.create(payload)];

      product.quantity_current = Number(product.quantity_current || 0) - quantity;
      product.status = computeProductStatus(product.quantity_current, product.seuil_minimum);
      await product.save({ session });

      const historyPayload = {
        action_type: 'exit',
        user: req.user.id,
        product: product._id,
        quantity,
        source: 'ui',
        description: `Bon de prelevement cree (${exit.exit_number})`,
      };
      if (session) await History.create([historyPayload], { session });
      else await History.create(historyPayload);

      await evaluateProductAlerts(product, session);
      return exit;
    });

    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create stock exit', details: err.message });
  }
});

router.put('/exits/:id', requireAuth, requirePermission(PERMISSIONS.STOCK_EXIT_UPDATE), async (req, res) => {
  try {
    const exitDoc = await StockExit.findById(req.params.id);
    if (!exitDoc) return res.status(404).json({ error: 'Stock exit not found' });
    if (exitDoc.canceled) return res.status(400).json({ error: 'Canceled exit cannot be updated' });

    const oldQty = Number(exitDoc.quantity || 0);
    const newQty = asPositiveNumber(req.body.quantity);
    if (Number.isNaN(newQty) || newQty === undefined) {
      return res.status(400).json({ error: 'Quantity must be a positive number' });
    }

    const product = await Product.findById(exitDoc.product);
    if (!product) return res.status(404).json({ error: 'Linked product not found' });

    await runInTransaction(async (session) => {
      for (const c of exitDoc.consumed_lots || []) {
        if (!c.lot || !c.quantity) continue;
        const lot = await StockLot.findById(c.lot).session(session);
        if (!lot) continue;
        lot.quantity_available = Number(lot.quantity_available || 0) + Number(c.quantity || 0);
        lot.status = lot.quantity_available > 0 ? 'open' : 'empty';
        await lot.save({ session });
      }

      const lots = await StockLot.find({
        product: product._id,
        quantity_available: { $gt: 0 },
      })
        .sort({ date_entry: 1, expiry_date: 1, createdAt: 1 })
        .session(session);

      let remaining = newQty;
      const consumedLots = [];
      for (const lot of lots) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, Number(lot.quantity_available || 0));
        if (take <= 0) continue;
        lot.quantity_available -= take;
        lot.status = lot.quantity_available <= 0 ? 'empty' : 'open';
        await lot.save({ session });
        remaining -= take;
        consumedLots.push({ lot: lot._id, lot_number: lot.lot_number, quantity: take, expiry_date: lot.expiry_date });
      }
      if (remaining > 0) throw new Error('Stock insuffisant pour cette modification');

      Object.assign(exitDoc, {
        withdrawal_paper_number: asOptionalString(req.body.withdrawal_paper_number),
        quantity: newQty,
        direction_laboratory: asOptionalString(req.body.direction_laboratory),
        beneficiary: asOptionalString(req.body.beneficiary),
        demandeur: req.body.demandeur,
        date_exit: asDate(req.body.date_exit) || exitDoc.date_exit,
        fifo_reference: consumedLots.map((x) => x.lot_number || 'N/A').join(', '),
        consumed_lots: consumedLots,
        attachments: sanitizeAttachments(req.body.attachments),
        note: asOptionalString(req.body.note),
      });
      await exitDoc.save({ session });

      product.quantity_current = Number(product.quantity_current || 0) + oldQty - newQty;
      product.status = computeProductStatus(product.quantity_current, product.seuil_minimum);
      await product.save({ session });
      await evaluateProductAlerts(product, session);

      const historyPayload = {
        action_type: 'exit',
        user: req.user.id,
        product: product._id,
        quantity: newQty,
        source: 'ui',
        description: `Bon de prelevement modifie (${exitDoc.exit_number})`,
      };
      if (session) await History.create([historyPayload], { session });
      else await History.create(historyPayload);
    });

    res.json(exitDoc);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update stock exit', details: err.message });
  }
});

router.patch('/exits/:id/cancel', requireAuth, requirePermission(PERMISSIONS.STOCK_EXIT_CANCEL), async (req, res) => {
  try {
    const exitDoc = await StockExit.findById(req.params.id);
    if (!exitDoc) return res.status(404).json({ error: 'Stock exit not found' });
    if (exitDoc.canceled) return res.status(400).json({ error: 'Exit already canceled' });

    const product = await Product.findById(exitDoc.product);
    if (!product) return res.status(404).json({ error: 'Linked product not found' });

    await runInTransaction(async (session) => {
      exitDoc.canceled = true;
      exitDoc.canceled_at = new Date();
      exitDoc.canceled_by = req.user.id;
      await exitDoc.save({ session });

      for (const c of exitDoc.consumed_lots || []) {
        if (!c.lot || !c.quantity) continue;
        const lot = await StockLot.findById(c.lot).session(session);
        if (!lot) continue;
        lot.quantity_available = Number(lot.quantity_available || 0) + Number(c.quantity || 0);
        lot.status = lot.quantity_available > 0 ? 'open' : 'empty';
        await lot.save({ session });
      }

      product.quantity_current = Number(product.quantity_current || 0) + Number(exitDoc.quantity || 0);
      product.status = computeProductStatus(product.quantity_current, product.seuil_minimum);
      await product.save({ session });
      await evaluateProductAlerts(product, session);

      const historyPayload = {
        action_type: 'exit',
        user: req.user.id,
        product: product._id,
        quantity: exitDoc.quantity,
        source: 'ui',
        description: `Bon de prelevement annule (${exitDoc.exit_number})`,
      };
      if (session) await History.create([historyPayload], { session });
      else await History.create(historyPayload);
    });

    res.json({ message: 'Stock exit canceled', exit: exitDoc });
  } catch (err) {
    res.status(400).json({ error: 'Failed to cancel stock exit', details: err.message });
  }
});

module.exports = router;
