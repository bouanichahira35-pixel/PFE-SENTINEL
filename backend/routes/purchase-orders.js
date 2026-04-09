const router = require('express').Router();
const requireAuth = require('../middlewares/requireAuth');
const requirePermission = require('../middlewares/requirePermission');
const strictBody = require('../middlewares/strictBody');
const { PERMISSIONS } = require('../constants/permissions');

const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');
const SupplierProduct = require('../models/SupplierProduct');
const Product = require('../models/Product');
const History = require('../models/History');
const Notification = require('../models/Notification');
const DecisionAssignment = require('../models/DecisionAssignment');
const DecisionResolution = require('../models/DecisionResolution');
const User = require('../models/User');
const StockEntry = require('../models/StockEntry');
const StockLot = require('../models/StockLot');
const Sequence = require('../models/Sequence');
const { runInTransaction } = require('../services/transactionService');
const { getSupplierEmailPolicy, sendPurchaseOrderEmailToSupplier } = require('../services/purchaseOrderSupplierMailService');

const { asDate, asNonNegativeNumber, asOptionalString, asPositiveNumber, isSafeText, isValidObjectIdLike } = require('../utils/validation');

router.use(requireAuth);

function validateOptionalText(errors, field, value, { min = 0, max = 600 } = {}) {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  if (s === '') return undefined;
  if (!isSafeText(s, { min, max })) errors.push(`${field} invalide`);
  return s;
}

function computePromisedAt(orderedAt, leadTimeDays) {
  const d = new Date(orderedAt || new Date());
  const days = Number.isFinite(Number(leadTimeDays)) ? Math.max(0, Math.min(365, Math.floor(Number(leadTimeDays)))) : 7;
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
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

router.get('/', requirePermission(PERMISSIONS.PURCHASE_ORDER_MANAGE), async (req, res) => {
  try {
    const limitRaw = Number(req.query?.limit || 40);
    const limit = Number.isFinite(limitRaw) ? Math.max(10, Math.min(200, Math.floor(limitRaw))) : 40;

    const filter = {};
    const supplierId = asOptionalString(req.query?.supplier_id);
    if (supplierId) {
      if (!isValidObjectIdLike(supplierId)) return res.status(400).json({ error: 'supplier_id invalide' });
      filter.supplier = supplierId;
    }
    const status = asOptionalString(req.query?.status);
    if (status) {
      const st = String(status).trim();
      if (!['draft', 'ordered', 'delivered', 'cancelled'].includes(st)) return res.status(400).json({ error: 'status invalide' });
      filter.status = st;
    }
    const decisionId = asOptionalString(req.query?.decision_id);
    if (decisionId) filter.decision_id = String(decisionId).slice(0, 160);

    const items = await PurchaseOrder.find(filter)
      .sort({ ordered_at: -1, createdAt: -1 })
      .limit(limit)
      .populate('supplier', 'name')
      .populate('created_by', 'username role')
      .populate('lines.product', 'name code_product')
      .lean();
    return res.json({ purchase_orders: items });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch purchase orders', details: err.message });
  }
});

router.post(
  '/:id/receive',
  requirePermission(PERMISSIONS.PURCHASE_ORDER_MANAGE),
  requirePermission(PERMISSIONS.STOCK_ENTRY_CREATE),
  strictBody(['delivery_note_number', 'supplier_doc_qr_value', 'delivery_date', 'date_entry', 'lot_prefix', 'observation', 'received_lines']),
  async (req, res) => {
    try {
      if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });

      const deliveryDate = asDate(req.body?.delivery_date);
      if (deliveryDate === null) return res.status(400).json({ error: 'delivery_date invalide' });
      const dateEntry = asDate(req.body?.date_entry);
      if (dateEntry === null) return res.status(400).json({ error: 'date_entry invalide' });

      const errors = [];
      const deliveryNoteNumber = validateOptionalText(errors, 'delivery_note_number', req.body?.delivery_note_number, { min: 0, max: 80 });
      const supplierDocQrValue = validateOptionalText(errors, 'supplier_doc_qr_value', req.body?.supplier_doc_qr_value, { min: 0, max: 180 });
      const observation = validateOptionalText(errors, 'observation', req.body?.observation, { min: 0, max: 600 });
      const lotPrefixRaw = validateOptionalText(errors, 'lot_prefix', req.body?.lot_prefix, { min: 0, max: 30 });

      const incomingLines = Array.isArray(req.body?.received_lines) ? req.body.received_lines : [];
      if (incomingLines.length > 60) errors.push('received_lines trop long');
      for (const row of incomingLines.slice(0, 60)) {
        const pid = asOptionalString(row?.product_id);
        if (pid && !isValidObjectIdLike(pid)) errors.push('received_lines.product_id invalide');
        const qty = asNonNegativeNumber(row?.quantity);
        if (row?.quantity !== undefined && Number.isNaN(qty)) errors.push('received_lines.quantity invalide');
      }

      if (errors.length) return res.status(400).json({ error: 'Validation error', details: errors });

      const po = await PurchaseOrder.findById(req.params.id)
        .populate('supplier', 'name status default_lead_time_days')
        .populate('lines.product', '_id name code_product quantity_current seuil_minimum validation_status lifecycle_status')
        .lean();
      if (!po) return res.status(404).json({ error: 'Purchase order not found' });
      if (po.status === 'cancelled') return res.status(409).json({ error: 'Commande annulee' });

      const supplierName = po?.supplier?.name || 'Fournisseur';
      const orderedAt = po.ordered_at ? new Date(po.ordered_at) : new Date();
      const receiveAt = dateEntry || new Date();
      const lotPrefix = lotPrefixRaw ? String(lotPrefixRaw).trim().slice(0, 30) : `PO-${String(po._id).slice(-6).toUpperCase()}`;

      const lines = Array.isArray(po.lines) ? po.lines : [];
      if (!lines.length) return res.status(400).json({ error: 'Commande sans lignes' });

      const receiptByProductId = new Map();
      for (const row of incomingLines.slice(0, 50)) {
        const pid = asOptionalString(row?.product_id);
        if (!pid || !isValidObjectIdLike(pid)) continue;
        const qtyRaw = Number(row?.quantity);
        if (!Number.isFinite(qtyRaw) || qtyRaw < 0) continue;
        const qty = Math.floor(qtyRaw);
        receiptByProductId.set(String(pid), qty);
      }

      const computeProductStatus = (quantity, seuilMinimum) => {
        if (Number(quantity) <= 0) return 'rupture';
        if (Number(quantity) <= Number(seuilMinimum || 0)) return 'sous_seuil';
        return 'ok';
      };

      const isFullyReceived = (poDoc) => {
        const ls = Array.isArray(poDoc?.lines) ? poDoc.lines : [];
        if (!ls.length) return false;
        return ls.every((l) => Number(l?.quantity_received || 0) >= Number(l?.quantity || 0));
      };

      if (isFullyReceived(po)) return res.status(409).json({ error: 'Commande deja totalement receptionnee' });

      const createdEntries = await runInTransaction(async (session) => {
        const entryIds = [];
        const entryNumbers = [];
        const receiptLinesApplied = [];
        const receiveSeq = Number.isFinite(Number(po.receive_count)) ? Number(po.receive_count) + 1 : 1;

        for (let idx = 0; idx < Math.min(20, lines.length); idx += 1) {
          const line = lines[idx];
          const productId = line?.product?._id || line?.product;
          if (!productId) continue;

          const product = await Product.findById(productId).session(session);
          if (!product) continue;
          if (String(product.lifecycle_status || 'active') !== 'active') {
            throw new Error(`Produit archive / indisponible (${product.name || 'Produit'}).`);
          }

          const orderedQty = Number(line?.quantity || 0);
          const alreadyReceived = Number(line?.quantity_received || 0);
          const remaining = Math.max(0, orderedQty - alreadyReceived);
          if (!Number.isFinite(orderedQty) || orderedQty <= 0) continue;
          if (remaining <= 0) continue;

          const explicit = receiptByProductId.has(String(product._id))
            ? Number(receiptByProductId.get(String(product._id)))
            : null;
          const qty = explicit === null ? remaining : explicit;
          if (!Number.isFinite(qty) || qty <= 0) continue;
          if (qty > remaining) throw new Error(`Quantite recue (${qty}) > reste a recevoir (${remaining}) pour ${product.name || 'Produit'}`);

          const entryNumber = await getNextEntryNumber();
          const lotNumber = `${lotPrefix}-R${String(receiveSeq).padStart(2, '0')}-L${String(idx + 1).padStart(2, '0')}`;

          const payload = {
            entry_number: entryNumber,
            product: product._id,
            quantity: qty,
            unit_price: Number(line?.unit_price || 0),
            purchase_order_number: `PO-${String(po._id).slice(-6).toUpperCase()}`,
            delivery_note_number: deliveryNoteNumber || undefined,
            supplier_doc_qr_value: supplierDocQrValue || undefined,
            entry_mode: (supplierDocQrValue ? 'supplier_qr' : (deliveryNoteNumber ? 'supplier_number' : 'manual')),
            delivery_date: deliveryDate || orderedAt,
            supplier: supplierName,
            lot_number: lotNumber,
            lot_qr_value: lotNumber,
            observation: observation || undefined,
            date_entry: receiveAt,
            magasinier: req.user.id,
          };

          const [entry] = session ? await StockEntry.create([payload], { session }) : [await StockEntry.create(payload)];

          const lotPayload = {
            product: product._id,
            entry: entry._id,
            lot_number: payload.lot_number,
            qr_code_value: payload.lot_qr_value || payload.lot_number || payload.entry_number,
            expiry_date: payload.expiry_date || undefined,
            date_entry: payload.date_entry || new Date(),
            quantity_initial: qty,
            quantity_available: qty,
            unit_price: payload.unit_price,
            status: 'open',
          };
          if (session) await StockLot.create([lotPayload], { session });
          else await StockLot.create(lotPayload);

          product.quantity_current = Number(product.quantity_current || 0) + qty;
          product.status = computeProductStatus(product.quantity_current, product.seuil_minimum);
          await product.save({ session });

          await History.create([{
            action_type: 'entry',
            user: req.user.id,
            product: product._id,
            quantity: qty,
            source: 'ui',
            description: `Reception commande fournisseur (${payload.purchase_order_number})`,
            actor_role: req.user.role,
            tags: ['entry', 'purchase_order', 'receive'],
            context: {
              purchase_order_id: String(po._id),
              supplier_id: String(po?.supplier?._id || ''),
              supplier_name: supplierName,
              entry_id: String(entry._id),
              entry_number: payload.entry_number,
              lot_number: payload.lot_number,
            },
          }], { session });

          entryIds.push(entry._id);
          entryNumbers.push(entryNumber);
          receiptLinesApplied.push({ product_id: String(product._id), ordered: orderedQty, received: qty, remaining_after: Math.max(0, remaining - qty) });
        }

        if (!entryIds.length) {
          throw new Error('Aucune ligne a receptionner (quantites nulles ou deja recues)');
        }

        // Update PO: increment per-line received quantities and mark delivered only when fully received.
        const poDoc = await PurchaseOrder.findById(po._id).session(session);
        if (!poDoc) throw new Error('Purchase order not found');

        for (const l of poDoc.lines || []) {
          const pid = String(l.product || '');
          const applied = receiptLinesApplied.find((x) => x.product_id === pid);
          if (!applied) continue;
          l.quantity_received = Number(l.quantity_received || 0) + Number(applied.received || 0);
        }

        poDoc.receive_count = Number.isFinite(Number(poDoc.receive_count)) ? Number(poDoc.receive_count) + 1 : 1;
        poDoc.received_by = req.user.id;
        poDoc.received_at = poDoc.received_at || receiveAt;
        poDoc.received_entries = [...(poDoc.received_entries || []), ...entryIds];

        const fullyReceivedNow = poDoc.lines.every((l) => Number(l.quantity_received || 0) >= Number(l.quantity || 0));
        if (fullyReceivedNow) {
          poDoc.status = 'delivered';
          poDoc.delivered_at = poDoc.delivered_at || receiveAt;
        }

        await poDoc.save({ session });

        await History.create([{
          action_type: 'purchase_order',
          user: req.user.id,
          source: 'ui',
          description: fullyReceivedNow
            ? `Commande receptionnee (${entryIds.length} entree(s))`
            : `Reception partielle (${entryIds.length} entree(s))`,
          actor_role: req.user.role,
          tags: ['purchase_order', 'receive'],
          status_before: String(po.status || ''),
          status_after: fullyReceivedNow ? 'delivered' : 'ordered',
          context: {
            purchase_order_id: String(po._id),
            decision_id: po.decision_id || null,
            supplier_id: String(po?.supplier?._id || ''),
            supplier_name: supplierName,
            entries: entryNumbers,
            lines: receiptLinesApplied,
          },
        }], { session });

        return { entryIds, entryNumbers, receiptLinesApplied, fullyReceivedNow };
      });

      // Auto-resolve decision if linked.
      if (po.decision_id && createdEntries?.fullyReceivedNow) {
        const note = `Commande receptionnee. Entrees: ${(createdEntries.entryNumbers || []).join(', ') || 'N/A'}`;
        await DecisionResolution.updateOne(
          { decision_id: po.decision_id },
          {
            $set: {
              decision_id: po.decision_id,
              kind: 'purchase_order_received',
              title: 'Commande receptionnee',
              product_name: (Array.isArray(po.lines) && po.lines[0]?.product?.name) ? po.lines[0].product.name : '',
              level: null,
              resolved_by: req.user.id,
              resolved_at: new Date(),
              note,
            },
          },
          { upsert: true }
        );

        const lastAssignment = await DecisionAssignment.findOne({ decision_id: po.decision_id })
          .sort({ assigned_at: -1, createdAt: -1 })
          .populate('assigned_to', 'username role status')
          .lean();

        let targets = [];
        if (lastAssignment?.assigned_to && lastAssignment.assigned_to.status === 'active') {
          targets = [lastAssignment.assigned_to];
        } else {
          const users = await User.find({ role: 'magasinier', status: 'active' }).select('_id username').limit(20).lean();
          targets = users;
        }

        if (targets.length) {
          await Notification.insertMany(targets.map((u) => ({
            user: u._id,
            title: 'Commande receptionnee',
            message: [
              `Fournisseur: ${supplierName}`,
              `Commande: PO-${String(po._id).slice(-6).toUpperCase()}`,
              createdEntries.entryNumbers?.length ? `Entrees: ${createdEntries.entryNumbers.join(', ')}` : null,
              `Decision: ${po.decision_id}`,
            ].filter(Boolean).join('\n'),
            type: 'info',
            is_read: false,
          })));
        }
      }

      return res.json({
        ok: true,
        purchase_order_id: String(po._id),
        received_at: receiveAt.toISOString(),
        entries: createdEntries.entryNumbers || [],
        fully_received: Boolean(createdEntries?.fullyReceivedNow),
        lines: createdEntries?.receiptLinesApplied || [],
      });
    } catch (err) {
      return res.status(400).json({ error: 'Failed to receive purchase order', details: err.message });
    }
  }
);

router.post(
  '/',
  requirePermission(PERMISSIONS.PURCHASE_ORDER_MANAGE),
  strictBody(['supplier_id', 'ordered_at', 'promised_at', 'status', 'note', 'lines', 'decision_id']),
  async (req, res) => {
    try {
      const errors = [];
      const supplierId = asOptionalString(req.body?.supplier_id);
      if (!supplierId || !isValidObjectIdLike(supplierId)) return res.status(400).json({ error: 'supplier_id invalide' });
      const supplier = await Supplier.findById(supplierId).lean();
      if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

      const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
      if (!lines.length) return res.status(400).json({ error: 'lines obligatoire' });

      const parsedLines = [];
      for (const line of lines.slice(0, 20)) {
        const productId = asOptionalString(line?.product_id);
        if (!productId || !isValidObjectIdLike(productId)) return res.status(400).json({ error: 'product_id invalide' });
        const qty = asPositiveNumber(line?.quantity);
        if (!Number.isFinite(qty)) return res.status(400).json({ error: 'quantity invalide' });
        const unitPrice = asNonNegativeNumber(line?.unit_price);
        if (line?.unit_price !== undefined && Number.isNaN(unitPrice)) return res.status(400).json({ error: 'unit_price invalide' });
        const product = await Product.findById(productId).select('_id name').lean();
        if (!product) return res.status(404).json({ error: 'Product not found' });
        parsedLines.push({ product: product._id, quantity: qty, unit_price: Number(unitPrice || 0) });
      }

      const orderedAt = asDate(req.body?.ordered_at) || new Date();
      if (orderedAt === null) return res.status(400).json({ error: 'ordered_at invalide' });

      let promisedAt = asDate(req.body?.promised_at);
      if (promisedAt === null) return res.status(400).json({ error: 'promised_at invalide' });
      if (!promisedAt) promisedAt = computePromisedAt(orderedAt, supplier.default_lead_time_days);

      const statusRaw = asOptionalString(req.body?.status);
      const status = statusRaw === 'draft' ? 'draft' : 'ordered';
      const note = validateOptionalText(errors, 'note', req.body?.note, { min: 0, max: 600 });
      const decisionIdValue = validateOptionalText(errors, 'decision_id', req.body?.decision_id, { min: 0, max: 160 });
      if (errors.length) return res.status(400).json({ error: 'Validation error', details: errors });

      const created = await PurchaseOrder.create({
        supplier: supplier._id,
        status,
        decision_id: decisionIdValue || undefined,
        ordered_at: orderedAt,
        promised_at: promisedAt,
        note,
        created_by: req.user.id,
        lines: parsedLines,
      });

      await History.create({
        action_type: 'purchase_order',
        user: req.user.id,
        source: 'ui',
        description: 'Commande fournisseur creee',
        actor_role: req.user.role,
        tags: ['purchase_order', 'create'],
        context: { purchase_order_id: String(created._id), supplier_id: String(supplier._id) },
      });

      if (decisionIdValue) {
        const firstLine = parsedLines.length ? parsedLines[0] : null;
        const firstProduct = firstLine?.product ? await Product.findById(firstLine.product).select('name').lean() : null;
        const productName = firstProduct?.name || '';

        await DecisionResolution.updateOne(
          { decision_id: decisionIdValue },
          {
            $setOnInsert: {
              decision_id: decisionIdValue,
              kind: 'purchase_order_created',
              title: 'Commande fournisseur creee',
              product_name: productName,
              level: null,
              resolved_by: req.user.id,
              resolved_at: new Date(),
              note: `Commande ${String(created._id)} creee (fournisseur ${supplier.name || ''}).`,
            },
          },
          { upsert: true }
        );

        const lastAssignment = await DecisionAssignment.findOne({ decision_id: decisionIdValue })
          .sort({ assigned_at: -1, createdAt: -1 })
          .populate('assigned_to', 'username role status')
          .lean();

        let targets = [];
        if (lastAssignment?.assigned_to && lastAssignment.assigned_to.status === 'active') {
          targets = [lastAssignment.assigned_to];
        } else {
          const users = await User.find({ role: 'magasinier', status: 'active' }).select('_id username').limit(20).lean();
          targets = users;
        }

        if (targets.length) {
          await Notification.insertMany(targets.map((u) => ({
            user: u._id,
            title: 'Commande fournisseur creee',
            message: [
              productName ? `Produit: ${productName}` : null,
              `Fournisseur: ${supplier.name || 'Fournisseur'}`,
              `Decision: ${decisionIdValue}`,
            ].filter(Boolean).join('\n'),
            type: 'info',
            is_read: false,
          })));
        }
      }

      // Supplier email (external) - best effort (configurable via admin policy).
      try {
        const policy = await getSupplierEmailPolicy();
        if (created.status === 'ordered' && policy.send_on_create_ordered) {
          await sendPurchaseOrderEmailToSupplier({
            purchase_order_id: created._id,
            triggered_by_user_id: req.user.id,
            reason: 'create',
            kind: 'po_ordered_email',
          });
        }
      } catch {
        // ignore supplier mail errors (they are audited via mail queue if configured)
      }

      return res.status(201).json(created);
    } catch (err) {
      return res.status(400).json({ error: 'Failed to create purchase order', details: err.message });
    }
  }
);

router.post(
  '/quick',
  requirePermission(PERMISSIONS.PURCHASE_ORDER_MANAGE),
  strictBody(['product_id', 'quantity', 'supplier_id', 'note', 'decision_id', 'decision_level', 'decision_title', 'decision_kind']),
  async (req, res) => {
    try {
      const errors = [];
      const productId = asOptionalString(req.body?.product_id);
      const qty = asPositiveNumber(req.body?.quantity);
      if (!productId || !isValidObjectIdLike(productId)) return res.status(400).json({ error: 'product_id invalide' });
      if (!Number.isFinite(qty)) return res.status(400).json({ error: 'quantity invalide' });

      const product = await Product.findById(productId).select('_id name').lean();
      if (!product) return res.status(404).json({ error: 'Product not found' });

      let supplier = null;
      const supplierId = asOptionalString(req.body?.supplier_id);
      if (supplierId) {
        if (!isValidObjectIdLike(supplierId)) return res.status(400).json({ error: 'supplier_id invalide' });
        supplier = await Supplier.findById(supplierId).lean();
      }
      if (!supplier) {
        const link = await SupplierProduct.findOne({ product: product._id })
          .populate('supplier', 'name status default_lead_time_days')
          .sort({ is_primary: -1, updatedAt: -1 })
          .lean();
        supplier = link?.supplier || null;
      }
      if (!supplier) {
        supplier = await Supplier.findOne({ status: 'active' }).sort({ createdAt: -1 }).lean();
      }
      if (!supplier || supplier.status !== 'active') {
        return res.status(409).json({ error: 'Aucun fournisseur actif disponible pour ce produit' });
      }

      const orderedAt = new Date();
      const leadTimeDays = typeof supplier.default_lead_time_days === 'number' ? supplier.default_lead_time_days : 7;
      const promisedAt = computePromisedAt(orderedAt, leadTimeDays);

      const decisionIdValue = validateOptionalText(errors, 'decision_id', req.body?.decision_id, { min: 0, max: 160 });
      const decisionTitle = validateOptionalText(errors, 'decision_title', req.body?.decision_title, { min: 0, max: 120 });
      const decisionKind = validateOptionalText(errors, 'decision_kind', req.body?.decision_kind, { min: 0, max: 80 });
      const decisionLevel = validateOptionalText(errors, 'decision_level', req.body?.decision_level, { min: 0, max: 40 });
      const note = validateOptionalText(errors, 'note', req.body?.note, { min: 0, max: 600 });
      if (errors.length) return res.status(400).json({ error: 'Validation error', details: errors });

      const created = await PurchaseOrder.create({
        supplier: supplier._id,
        status: 'ordered',
        decision_id: decisionIdValue || undefined,
        ordered_at: orderedAt,
        promised_at: promisedAt,
        note,
        created_by: req.user.id,
        lines: [{ product: product._id, quantity: qty, unit_price: 0 }],
      });

      await History.create({
        action_type: 'purchase_order',
        user: req.user.id,
        source: 'ui',
        description: `Commande rapide creee (${product.name || 'Produit'})`,
        actor_role: req.user.role,
        tags: ['purchase_order', 'quick_create'],
        context: { purchase_order_id: String(created._id), supplier_id: String(supplier._id), product_id: String(product._id), quantity: qty },
      });

      if (decisionIdValue) {
        await DecisionResolution.updateOne(
          { decision_id: decisionIdValue },
          {
            $setOnInsert: {
              decision_id: decisionIdValue,
              kind: decisionKind || 'purchase_order_created',
              title: decisionTitle || 'Commande fournisseur creee',
              product_name: product.name || '',
              level: decisionLevel || null,
              resolved_by: req.user.id,
              resolved_at: new Date(),
              note: `Commande ${String(created._id)} creee (fournisseur ${supplier.name || ''}).`,
            },
          },
          { upsert: true }
        );

        const lastAssignment = await DecisionAssignment.findOne({ decision_id: decisionIdValue })
          .sort({ assigned_at: -1, createdAt: -1 })
          .populate('assigned_to', 'username role status')
          .lean();

        let targets = [];
        if (lastAssignment?.assigned_to && lastAssignment.assigned_to.status === 'active') {
          targets = [lastAssignment.assigned_to];
        } else {
          const users = await User.find({ role: 'magasinier', status: 'active' }).select('_id username').limit(20).lean();
          targets = users;
        }

        if (targets.length) {
          await Notification.insertMany(targets.map((u) => ({
            user: u._id,
            title: 'Commande fournisseur creee',
            message: [
              `Produit: ${product.name || 'Produit'}`,
              `Quantite: ${qty}`,
              `Fournisseur: ${supplier.name || 'Fournisseur'}`,
              `Decision: ${decisionIdValue}`,
            ].join('\n'),
            type: decisionLevel === 'Critique' ? 'alert' : 'info',
            is_read: false,
          })));
        }
      }

      // Supplier email (external) - best effort (configurable via admin policy).
      try {
        const policy = await getSupplierEmailPolicy();
        if (policy.send_on_create_ordered) {
          await sendPurchaseOrderEmailToSupplier({
            purchase_order_id: created._id,
            triggered_by_user_id: req.user.id,
            reason: 'quick_create',
            kind: 'po_ordered_email',
          });
        }
      } catch {
        // ignore
      }

      return res.status(201).json(created);
    } catch (err) {
      return res.status(400).json({ error: 'Failed to create quick purchase order', details: err.message });
    }
  }
);

router.patch(
  '/:id/status',
  requirePermission(PERMISSIONS.PURCHASE_ORDER_MANAGE),
  strictBody(['status', 'delivered_at']),
  async (req, res) => {
    try {
      if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });
      const status = String(req.body?.status || '').trim();
      if (!['draft', 'ordered', 'delivered', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'status invalide' });
      }
      if (status === 'delivered') {
        return res.status(409).json({
          error: 'Reception requise',
          details: 'Pour eviter les contradictions, utilisez POST /api/purchase-orders/:id/receive (cree entree stock + lots).',
        });
      }
      const before = await PurchaseOrder.findById(req.params.id).lean();
      if (!before) return res.status(404).json({ error: 'Purchase order not found' });

      const patch = { status };
      const updated = await PurchaseOrder.findByIdAndUpdate(req.params.id, { $set: patch }, { returnDocument: 'after' });
      if (!updated) return res.status(404).json({ error: 'Purchase order not found' });

      await History.create({
        action_type: 'purchase_order',
        user: req.user.id,
        source: 'ui',
        description: `Statut commande: ${before.status} -> ${updated.status}`,
        actor_role: req.user.role,
        tags: ['purchase_order', 'status_change', updated.status],
        status_before: before.status,
        status_after: updated.status,
        context: {
          purchase_order_id: String(updated._id),
          decision_id: updated.decision_id || null,
          delivered_at: updated.delivered_at || null,
        },
      });

      // If a draft is promoted to "ordered", optionally send supplier email.
      try {
        const policy = await getSupplierEmailPolicy();
        if (before.status !== 'ordered' && updated.status === 'ordered' && policy.send_on_update_to_ordered) {
          await sendPurchaseOrderEmailToSupplier({
            purchase_order_id: updated._id,
            triggered_by_user_id: req.user.id,
            reason: 'status_update_to_ordered',
            kind: 'po_ordered_email',
          });
        }
      } catch {
        // ignore
      }

      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: 'Failed to update purchase order', details: err.message });
    }
  }
);

// POST /api/purchase-orders/:id/notify-supplier
// Envoie (ou re-envoie) l'email fournisseur pour une commande "ordered".
router.post(
  '/:id/notify-supplier',
  requirePermission(PERMISSIONS.PURCHASE_ORDER_MANAGE),
  strictBody(['force']),
  async (req, res) => {
    try {
      if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });
      const force = Boolean(req.body?.force);
      const result = await sendPurchaseOrderEmailToSupplier({
        purchase_order_id: req.params.id,
        triggered_by_user_id: req.user.id,
        reason: 'manual_resend',
        force,
        kind: 'po_ordered_email',
      });
      return res.json({ ok: true, result });
    } catch (err) {
      return res.status(400).json({ error: 'Failed to notify supplier', details: err.message });
    }
  }
);

// POST /api/purchase-orders/:id/incidents
// Magasinier signale un litige / non-conformite (metier), visible au responsable.
router.post(
  '/:id/incidents',
  requirePermission(PERMISSIONS.PURCHASE_ORDER_MANAGE),
  strictBody(['severity', 'message']),
  async (req, res) => {
    try {
      if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });
      const severity = String(req.body?.severity || 'warning').trim();
      if (!['info', 'warning', 'critical'].includes(severity)) return res.status(400).json({ error: 'severity invalide' });
      const message = String(req.body?.message || '').trim().slice(0, 400);
      if (!message) return res.status(400).json({ error: 'message obligatoire' });

      const po = await PurchaseOrder.findById(req.params.id).populate('supplier', 'name').lean();
      if (!po) return res.status(404).json({ error: 'Purchase order not found' });

      const incident = {
        kind: 'non_conformity',
        severity,
        status: 'open',
        message,
        created_at: new Date(),
      };

      await PurchaseOrder.updateOne({ _id: po._id }, { $push: { incidents: incident } });

      await History.create({
        action_type: 'purchase_order',
        user: req.user.id,
        source: 'ui',
        description: `Litige signale (${severity})`,
        actor_role: req.user.role,
        tags: ['purchase_order', 'incident', 'non_conformity', severity],
        context: { purchase_order_id: String(po._id), supplier_name: po?.supplier?.name || '' },
      });

      const responsables = await User.find({ role: 'responsable', status: 'active' })
        .select('_id')
        .limit(20)
        .lean();
      if (responsables.length) {
        await Notification.insertMany(responsables.map((u) => ({
          user: u._id,
          title: severity === 'critical' ? 'Litige critique (commande fournisseur)' : 'Litige signale (commande fournisseur)',
          message: [
            `Commande: ${String(po._id).slice(-8).toUpperCase()}`,
            `Fournisseur: ${po?.supplier?.name || 'Fournisseur'}`,
            `Message: ${message}`,
          ].join('\n'),
          type: severity === 'critical' ? 'alert' : 'warning',
          is_read: false,
        })));
      }

      return res.status(201).json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: 'Failed to create incident', details: err.message });
    }
  }
);

// PATCH /api/purchase-orders/:id/incidents/:incidentId/resolve
router.patch(
  '/:id/incidents/:incidentId/resolve',
  requirePermission(PERMISSIONS.PURCHASE_ORDER_MANAGE),
  strictBody(['resolution_note']),
  async (req, res) => {
    try {
      if (String(req.user?.role || '').toLowerCase() !== 'responsable') {
        return res.status(403).json({ error: 'Acces refuse (responsable uniquement)' });
      }
      if (!isValidObjectIdLike(req.params.id)) return res.status(400).json({ error: 'id invalide' });
      if (!isValidObjectIdLike(req.params.incidentId)) return res.status(400).json({ error: 'incidentId invalide' });
      const note = String(req.body?.resolution_note || '').trim().slice(0, 320);

      const result = await PurchaseOrder.updateOne(
        { _id: req.params.id },
        {
          $set: {
            'incidents.$[i].status': 'resolved',
            'incidents.$[i].resolved_at': new Date(),
            'incidents.$[i].resolved_by': req.user.id,
            'incidents.$[i].resolution_note': note || undefined,
          },
        },
        { arrayFilters: [{ 'i._id': req.params.incidentId }] }
      );

      if (!result?.modifiedCount) return res.status(404).json({ error: 'Incident not found' });

      await History.create({
        action_type: 'purchase_order',
        user: req.user.id,
        source: 'ui',
        description: 'Litige resolu',
        actor_role: req.user.role,
        tags: ['purchase_order', 'incident', 'resolve'],
        context: { purchase_order_id: String(req.params.id), incident_id: String(req.params.incidentId) },
      });

      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: 'Failed to resolve incident', details: err.message });
    }
  }
);

module.exports = router;
