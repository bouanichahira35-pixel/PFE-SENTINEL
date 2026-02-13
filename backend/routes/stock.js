const router = require('express').Router();
const StockEntry = require('../models/StockEntry');
const StockExit = require('../models/StockExit');
const Product = require('../models/Product');
const History = require('../models/History');
const Sequence = require('../models/Sequence');
const requireAuth = require('../middlewares/requireAuth');
const requireRole = require('../middlewares/requireRole');
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

router.post('/entries', requireAuth, requireRole('magasinier', 'responsable'), async (req, res) => {
  try {
    const quantity = Number(req.body.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'Quantity must be a positive number' });
    }

    const product = await Product.findById(req.body.product);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const payload = {
      entry_number: await getNextEntryNumber(),
      product: req.body.product,
      quantity,
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
      date_entry: req.body.date_entry || new Date(),
      magasinier: req.user.id,
    };

    const item = await StockEntry.create(payload);

    product.quantity_current = Number(product.quantity_current || 0) + quantity;
    product.status = computeProductStatus(product.quantity_current, product.seuil_minimum);
    await product.save();

    await History.create({
      action_type: 'entry',
      user: req.user.id,
      product: product._id,
      quantity,
      source: 'ui',
      description: `Bon d'entree cree (${item.entry_number})`,
    });

    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create stock entry', details: err.message });
  }
});

router.put('/entries/:id', requireAuth, requireRole('magasinier', 'responsable'), async (req, res) => {
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

router.patch('/entries/:id/cancel', requireAuth, requireRole('magasinier', 'responsable'), async (req, res) => {
  try {
    const entry = await StockEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Stock entry not found' });
    if (entry.canceled) return res.status(400).json({ error: 'Entry already canceled' });

    const product = await Product.findById(entry.product);
    if (!product) return res.status(404).json({ error: 'Linked product not found' });

    const currentStock = Number(product.quantity_current || 0);
    if (currentStock < Number(entry.quantity || 0)) {
      return res.status(400).json({ error: 'Cannot cancel entry: stock already consumed' });
    }

    entry.canceled = true;
    entry.canceled_at = new Date();
    entry.canceled_by = req.user.id;
    await entry.save();

    product.quantity_current = currentStock - Number(entry.quantity || 0);
    product.status = computeProductStatus(product.quantity_current, product.seuil_minimum);
    await product.save();

    await History.create({
      action_type: 'entry',
      user: req.user.id,
      product: product._id,
      quantity: entry.quantity,
      source: 'ui',
      description: `Bon d'entree annule (${entry.entry_number})`,
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

router.post('/exits', requireAuth, requireRole('magasinier', 'responsable'), async (req, res) => {
  try {
    const quantity = Number(req.body.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'Quantity must be a positive number' });
    }

    const product = await Product.findById(req.body.product);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const currentStock = Number(product.quantity_current || 0);
    if (currentStock < quantity) {
      return res.status(400).json({ error: 'Stock insuffisant' });
    }

    const payload = {
      exit_number: await getNextExitNumber(),
      withdrawal_paper_number: req.body.withdrawal_paper_number,
      product: req.body.product,
      quantity,
      direction_laboratory: req.body.direction_laboratory,
      beneficiary: req.body.beneficiary,
      demandeur: req.body.demandeur,
      date_exit: req.body.date_exit || new Date(),
      fifo_reference: req.body.fifo_reference,
      attachments: sanitizeAttachments(req.body.attachments),
      note: req.body.note,
      magasinier: req.user.id,
    };

    const item = await StockExit.create(payload);

    product.quantity_current = currentStock - quantity;
    product.status = computeProductStatus(product.quantity_current, product.seuil_minimum);
    await product.save();

    await History.create({
      action_type: 'exit',
      user: req.user.id,
      product: product._id,
      quantity,
      source: 'ui',
      description: `Bon de prelevement cree (${item.exit_number})`,
    });

    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create stock exit', details: err.message });
  }
});

router.put('/exits/:id', requireAuth, requireRole('magasinier', 'responsable'), async (req, res) => {
  try {
    const exitDoc = await StockExit.findById(req.params.id);
    if (!exitDoc) return res.status(404).json({ error: 'Stock exit not found' });
    if (exitDoc.canceled) return res.status(400).json({ error: 'Canceled exit cannot be updated' });

    const oldQty = Number(exitDoc.quantity || 0);
    const newQty = Number(req.body.quantity);
    if (!Number.isFinite(newQty) || newQty <= 0) {
      return res.status(400).json({ error: 'Quantity must be a positive number' });
    }

    const product = await Product.findById(exitDoc.product);
    if (!product) return res.status(404).json({ error: 'Linked product not found' });

    const stockAfterRollback = Number(product.quantity_current || 0) + oldQty;
    if (stockAfterRollback < newQty) {
      return res.status(400).json({ error: 'Stock insuffisant pour cette modification' });
    }

    Object.assign(exitDoc, {
      withdrawal_paper_number: req.body.withdrawal_paper_number,
      quantity: newQty,
      direction_laboratory: req.body.direction_laboratory,
      beneficiary: req.body.beneficiary,
      demandeur: req.body.demandeur,
      date_exit: req.body.date_exit,
      fifo_reference: req.body.fifo_reference,
      attachments: sanitizeAttachments(req.body.attachments),
      note: req.body.note,
    });

    await exitDoc.save();

    product.quantity_current = stockAfterRollback - newQty;
    product.status = computeProductStatus(product.quantity_current, product.seuil_minimum);
    await product.save();

    await History.create({
      action_type: 'exit',
      user: req.user.id,
      product: product._id,
      quantity: newQty,
      source: 'ui',
      description: `Bon de prelevement modifie (${exitDoc.exit_number})`,
    });

    res.json(exitDoc);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update stock exit', details: err.message });
  }
});

router.patch('/exits/:id/cancel', requireAuth, requireRole('magasinier', 'responsable'), async (req, res) => {
  try {
    const exitDoc = await StockExit.findById(req.params.id);
    if (!exitDoc) return res.status(404).json({ error: 'Stock exit not found' });
    if (exitDoc.canceled) return res.status(400).json({ error: 'Exit already canceled' });

    const product = await Product.findById(exitDoc.product);
    if (!product) return res.status(404).json({ error: 'Linked product not found' });

    exitDoc.canceled = true;
    exitDoc.canceled_at = new Date();
    exitDoc.canceled_by = req.user.id;
    await exitDoc.save();

    product.quantity_current = Number(product.quantity_current || 0) + Number(exitDoc.quantity || 0);
    product.status = computeProductStatus(product.quantity_current, product.seuil_minimum);
    await product.save();

    await History.create({
      action_type: 'exit',
      user: req.user.id,
      product: product._id,
      quantity: exitDoc.quantity,
      source: 'ui',
      description: `Bon de prelevement annule (${exitDoc.exit_number})`,
    });

    res.json({ message: 'Stock exit canceled', exit: exitDoc });
  } catch (err) {
    res.status(400).json({ error: 'Failed to cancel stock exit', details: err.message });
  }
});

module.exports = router;
