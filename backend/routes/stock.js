const router = require('express').Router();
const QRCode = require('qrcode');
const StockEntry = require('../models/StockEntry');
const StockExit = require('../models/StockExit');
const StockLot = require('../models/StockLot');
const FifoScanAudit = require('../models/FifoScanAudit');
const Product = require('../models/Product');
const Request = require('../models/Request');
const History = require('../models/History');
const Sequence = require('../models/Sequence');
const requireAuth = require('../middlewares/requireAuth');
const requirePermission = require('../middlewares/requirePermission');
const strictBody = require('../middlewares/strictBody');
const { PERMISSIONS } = require('../constants/permissions');
const { runInTransaction } = require('../services/transactionService');
const { evaluateProductAlerts } = require('../services/alertService');
const { signQrPayload, verifyQrToken } = require('../services/qrTokenService');
const logger = require('../utils/logger');
const { ERROR_CODES } = require('../constants/errorCodes');
const {
  asDate,
  asNonNegativeNumber,
  asOptionalString,
  asPositiveNumber,
  isValidObjectIdLike,
} = require('../utils/validation');
const SAFE_USER_FIELDS = 'username email role status telephone';

function parsePeriod(fromRaw, toRaw) {
  const now = new Date();
  const from = fromRaw ? new Date(fromRaw) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = toRaw ? new Date(toRaw) : now;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return { from, to };
}

function ensureResponsableRole(req, res) {
  if (req.user?.role !== 'responsable') {
    res.status(403).json({ error: 'Acces reserve au responsable' });
    return false;
  }
  return true;
}

function sanitizeDurationMs(value) {
  const n = asNonNegativeNumber(value);
  if (n === undefined) return undefined;
  if (Number.isNaN(n)) return NaN;
  return Math.round(n);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function buildInternalBondPrintHtml({ qrValue, payload, generatedBy }) {
  const qrImageUrl = await QRCode.toDataURL(qrValue, {
    width: 280,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
  const issuedAt = payload?.iat ? new Date(Number(payload.iat) * 1000) : null;
  const expiresAt = payload?.exp ? new Date(Number(payload.exp) * 1000) : null;

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Bon interne ${escapeHtml(payload?.bond_id || '')}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; background: #f5f7fb; color: #0f172a; }
    .page { max-width: 860px; margin: 20px auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    .header { padding: 18px 22px; border-bottom: 1px solid #e2e8f0; background: linear-gradient(135deg, #0f766e, #0ea5e9); color: #fff; }
    .header h1 { margin: 0; font-size: 22px; }
    .meta { margin-top: 6px; font-size: 13px; opacity: 0.95; }
    .content { padding: 20px 22px; display: grid; grid-template-columns: 1fr 310px; gap: 22px; }
    .line { margin-bottom: 10px; font-size: 14px; }
    .label { font-weight: 700; color: #334155; margin-right: 6px; }
    .qr-wrap { text-align: center; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; background: #f8fafc; }
    .qr-wrap img { width: 260px; height: 260px; }
    .qr-caption { font-size: 11px; color: #64748b; margin-top: 8px; word-break: break-all; }
    .token-box { margin: 8px 22px 20px; border: 1px dashed #94a3b8; border-radius: 10px; background: #f8fafc; padding: 10px; font-size: 11px; color: #334155; word-break: break-all; }
    .actions { padding: 0 22px 20px; }
    .actions button { border: 0; border-radius: 8px; padding: 10px 14px; background: #0f766e; color: #fff; cursor: pointer; font-weight: 600; }
    @media print {
      body { background: #fff; }
      .page { margin: 0; border: 0; border-radius: 0; }
      .actions { display: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <h1>Bon Interne QR</h1>
      <div class="meta">ID: ${escapeHtml(payload?.bond_id || '-')} | Genere par: ${escapeHtml(generatedBy || '-')}</div>
    </div>
    <div class="content">
      <div>
        <div class="line"><span class="label">Produit:</span>${escapeHtml(payload?.product_name || '-')}</div>
        <div class="line"><span class="label">Code produit:</span>${escapeHtml(payload?.product_code || '-')}</div>
        <div class="line"><span class="label">Quantite:</span>${escapeHtml(payload?.quantity || '-')}</div>
        <div class="line"><span class="label">Direction/Labo:</span>${escapeHtml(payload?.direction_laboratory || '-')}</div>
        <div class="line"><span class="label">Beneficiaire:</span>${escapeHtml(payload?.beneficiary || '-')}</div>
        <div class="line"><span class="label">N bon papier:</span>${escapeHtml(payload?.withdrawal_paper_number || '-')}</div>
        <div class="line"><span class="label">Date emission:</span>${issuedAt ? issuedAt.toLocaleString('fr-FR') : '-'}</div>
        <div class="line"><span class="label">Date expiration:</span>${expiresAt ? expiresAt.toLocaleString('fr-FR') : '-'}</div>
      </div>
      <div class="qr-wrap">
        <img src="${qrImageUrl}" alt="QR bon interne" />
        <div class="qr-caption">Scanner ce QR pour pre-remplir la sortie stock</div>
      </div>
    </div>
    <div class="token-box">${escapeHtml(qrValue)}</div>
    <div class="actions"><button onclick="window.print()">Imprimer / Exporter en PDF</button></div>
  </div>
</body>
</html>`;
}

async function logFifoScanAudit(payload, session) {
  const auditPayload = {
    context: payload?.context,
    status: payload?.status,
    result: payload?.result,
    product: payload?.product,
    stock_lot: payload?.stock_lot || undefined,
    stock_exit: payload?.stock_exit || undefined,
    user: payload?.user,
    quantity_requested: payload?.quantity_requested,
    scanned_qr: asOptionalString(payload?.scanned_qr),
    expected_qr: asOptionalString(payload?.expected_qr),
    note: asOptionalString(payload?.note),
  };

  try {
    if (session) await FifoScanAudit.create([auditPayload], { session });
    else await FifoScanAudit.create(auditPayload);
  } catch (err) {
    logger.warn({ err: err?.message || err }, 'FIFO audit log failed');
  }
}

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

async function getNextInternalBondNumber() {
  const year = new Date().getFullYear();
  const counterName = `internal_bond_${year}`;
  const counter = await Sequence.findOneAndUpdate(
    { counter_name: counterName },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true }
  );
  return `IB-${year}-${String(counter.seq).padStart(5, '0')}`;
}

function normalizeDocRef(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

function normalizeHumanText(value) {
  return String(value || '').trim().toUpperCase();
}

function sanitizeEntryMode(value) {
  const v = String(value || '').trim().toLowerCase();
  if (['supplier_qr', 'supplier_number', 'manual'].includes(v)) return v;
  return 'manual';
}

function sanitizeExitMode(value) {
  const v = String(value || '').trim().toLowerCase();
  if (['internal_bond', 'fifo_qr', 'manual'].includes(v)) return v;
  return 'manual';
}

function sanitizeAttachments(input) {
  if (!Array.isArray(input)) return [];
  return input.map((a) => ({
    label: a?.label || '',
    file_name: a?.file_name || '',
    file_url: a?.file_url || '',
  }));
}

async function ensureLegacyOpenLot(product, session) {
  if (!product?._id) return;
  const lotsAgg = await StockLot.aggregate([
    { $match: { product: product._id } },
    {
      $group: {
        _id: null,
        total_available: { $sum: '$quantity_available' },
      },
    },
  ]).session(session);

  const lotsAvailable = Number(lotsAgg[0]?.total_available || 0);
  const currentStock = Number(product.quantity_current || 0);
  const missingForFifo = currentStock - lotsAvailable;
  if (missingForFifo <= 0) return;

  const legacyDate = new Date();
  const legacyLotNumber = `LEGACY-${legacyDate.getFullYear()}-${legacyDate.getMonth() + 1}-${legacyDate.getDate()}`;
  const legacyPayload = {
    product: product._id,
    lot_number: legacyLotNumber,
    date_entry: product.createdAt || legacyDate,
    quantity_initial: missingForFifo,
    quantity_available: missingForFifo,
    unit_price: 0,
    status: 'open',
  };
  if (session) await StockLot.create([legacyPayload], { session });
  else await StockLot.create(legacyPayload);
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

router.get('/fifo/next-lot/:productId', requireAuth, async (req, res) => {
  try {
    if (!isValidObjectIdLike(req.params.productId)) {
      return res.status(400).json({ error: 'product id invalide' });
    }

    const product = await Product.findById(req.params.productId).select('_id name code_product quantity_current').lean();
    if (!product) return res.status(404).json({ error: 'Produit introuvable' });

    const lot = await StockLot.findOne({
      product: product._id,
      quantity_available: { $gt: 0 },
    })
      .sort({ date_entry: 1, createdAt: 1 })
      .lean();

    return res.json({
      ok: true,
      product: {
        id: product._id,
        name: product.name,
        code_product: product.code_product,
        quantity_current: Number(product.quantity_current || 0),
      },
      next_fifo_lot: lot ? {
        id: lot._id,
        lot_number: lot.lot_number || null,
        qr_code_value: lot.qr_code_value || null,
        quantity_available: Number(lot.quantity_available || 0),
        date_entry: lot.date_entry,
        expiry_date: lot.expiry_date || null,
      } : null,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch next FIFO lot', details: err.message });
  }
});

router.post(
  '/internal-bond/generate',
  requireAuth,
  requirePermission(PERMISSIONS.STOCK_EXIT_CREATE),
  strictBody([
    'product',
    'quantity',
    'withdrawal_paper_number',
    'direction_laboratory',
    'beneficiary',
    'request',
    'note',
    'valid_hours',
  ]),
  async (req, res) => {
    try {
      if (!isValidObjectIdLike(req.body?.product)) {
        return res.status(400).json({ error: 'product id invalide' });
      }
      const quantity = asPositiveNumber(req.body?.quantity);
      if (Number.isNaN(quantity) || quantity === undefined) {
        return res.status(400).json({ error: 'quantity doit etre > 0' });
      }

      const product = await Product.findById(req.body.product).select('_id name code_product quantity_current validation_status').lean();
      if (!product) return res.status(404).json({ error: 'Produit introuvable' });
      if (product.validation_status !== 'approved') {
        return res.status(400).json({ error: 'Produit non valide. Validation responsable requise.' });
      }

      const bondId = await getNextInternalBondNumber();
      const tokenPayload = {
        type: 'internal_bond',
        bond_id: bondId,
        product_id: String(product._id),
        product_code: product.code_product,
        product_name: product.name,
        quantity: Number(quantity),
        withdrawal_paper_number: asOptionalString(req.body?.withdrawal_paper_number),
        direction_laboratory: asOptionalString(req.body?.direction_laboratory),
        beneficiary: asOptionalString(req.body?.beneficiary),
        request_id: req.body?.request ? String(req.body.request) : '',
        note: asOptionalString(req.body?.note),
        issued_by: String(req.user.id),
      };
      const signed = signQrPayload(tokenPayload, {
        ttl_hours: asPositiveNumber(req.body?.valid_hours) || 24,
      });

      return res.status(201).json({
        ok: true,
        bond_id: bondId,
        qr_value: signed.token,
        expires_at: signed.expires_at,
        payload: {
          ...tokenPayload,
          exp: signed.payload.exp,
          iat: signed.payload.iat,
        },
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to generate internal bond', details: err.message });
    }
  }
);

router.post(
  '/internal-bond/resolve',
  requireAuth,
  requirePermission(PERMISSIONS.STOCK_EXIT_CREATE),
  strictBody(['qr_value']),
  async (req, res) => {
    try {
      const qrValue = asOptionalString(req.body?.qr_value);
      if (!qrValue) return res.status(400).json({ error: 'qr_value obligatoire' });

      const payload = verifyQrToken(qrValue, { expected_type: 'internal_bond' });
      const existing = payload?.bond_id
        ? await StockExit.findOne({ internal_bond_id: String(payload.bond_id), canceled: false }).select('_id exit_number createdAt').lean()
        : null;

      return res.json({
        ok: true,
        payload,
        already_used: Boolean(existing),
        used_exit: existing || null,
      });
    } catch (err) {
      return res.status(400).json({ error: 'Invalid internal bond QR', details: err.message });
    }
  }
);

router.post(
  '/internal-bond/print-data',
  requireAuth,
  requirePermission(PERMISSIONS.STOCK_EXIT_CREATE),
  strictBody(['qr_value']),
  async (req, res) => {
    try {
      const qrValue = asOptionalString(req.body?.qr_value);
      if (!qrValue) return res.status(400).json({ error: 'qr_value obligatoire' });

      const payload = verifyQrToken(qrValue, { expected_type: 'internal_bond' });
      const html = await buildInternalBondPrintHtml({
        qrValue,
        payload,
        generatedBy: req.user?.username || req.user?.id || '-',
      });

      return res.json({
        ok: true,
        bond_id: payload?.bond_id || null,
        html,
      });
    } catch (err) {
      return res.status(400).json({ error: 'Impossible de preparer le bon interne PDF', details: err.message });
    }
  }
);

router.get(
  '/fifo/audit',
  requireAuth,
  requirePermission(PERMISSIONS.HISTORY_READ),
  async (req, res) => {
    try {
      if (!ensureResponsableRole(req, res)) return;
      const period = parsePeriod(req.query.from, req.query.to);
      if (!period) return res.status(400).json({ error: 'from/to invalides' });

      const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 120, 1), 500);
      const filter = {
        createdAt: { $gte: period.from, $lte: period.to },
      };

      if (req.query.product && isValidObjectIdLike(req.query.product)) {
        filter.product = req.query.product;
      }
      if (['match', 'mismatch', 'no_lot'].includes(String(req.query.result || ''))) {
        filter.result = String(req.query.result);
      }
      if (['accepted', 'blocked'].includes(String(req.query.status || ''))) {
        filter.status = String(req.query.status);
      }

      const items = await FifoScanAudit.find(filter)
        .populate('user', 'username role')
        .populate('product', 'name code_product')
        .populate('stock_exit', 'exit_number date_exit')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      return res.json({
        period,
        count: items.length,
        items,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to fetch FIFO audit', details: err.message });
    }
  }
);

router.get(
  '/fifo/kpis',
  requireAuth,
  requirePermission(PERMISSIONS.HISTORY_READ),
  async (req, res) => {
    try {
      if (!ensureResponsableRole(req, res)) return;
      const period = parsePeriod(req.query.from, req.query.to);
      if (!period) return res.status(400).json({ error: 'from/to invalides' });

      const entryMatch = {
        canceled: false,
        date_entry: { $gte: period.from, $lte: period.to },
      };
      const exitMatch = {
        canceled: false,
        date_exit: { $gte: period.from, $lte: period.to },
      };
      const fifoMatch = {
        createdAt: { $gte: period.from, $lte: period.to },
      };

      const [entryStats, exitStats, fifoStats] = await Promise.all([
        StockEntry.aggregate([
          { $match: entryMatch },
          {
            $group: {
              _id: '$entry_mode',
              count: { $sum: 1 },
              avg_duration_ms: { $avg: '$submission_duration_ms' },
              duration_samples: {
                $sum: {
                  $cond: [{ $gt: ['$submission_duration_ms', 0] }, 1, 0],
                },
              },
            },
          },
        ]),
        StockExit.aggregate([
          { $match: exitMatch },
          {
            $group: {
              _id: '$exit_mode',
              count: { $sum: 1 },
              avg_duration_ms: { $avg: '$submission_duration_ms' },
              duration_samples: {
                $sum: {
                  $cond: [{ $gt: ['$submission_duration_ms', 0] }, 1, 0],
                },
              },
            },
          },
        ]),
        FifoScanAudit.aggregate([
          { $match: fifoMatch },
          {
            $group: {
              _id: { result: '$result', status: '$status' },
              count: { $sum: 1 },
            },
          },
        ]),
      ]);

      const entryModes = { manual: 0, supplier_number: 0, supplier_qr: 0 };
      const exitModes = { manual: 0, fifo_qr: 0, internal_bond: 0 };
      const durationBuckets = {
        manual: { weighted_sum: 0, samples: 0 },
        scan: { weighted_sum: 0, samples: 0 },
      };

      entryStats.forEach((row) => {
        const mode = String(row?._id || 'manual');
        if (Object.prototype.hasOwnProperty.call(entryModes, mode)) {
          entryModes[mode] = Number(row?.count || 0);
        }
        const avg = Number(row?.avg_duration_ms || 0);
        const samples = Number(row?.duration_samples || 0);
        if (samples > 0 && avg > 0) {
          const bucketName = mode === 'supplier_qr' ? 'scan' : 'manual';
          durationBuckets[bucketName].weighted_sum += avg * samples;
          durationBuckets[bucketName].samples += samples;
        }
      });

      exitStats.forEach((row) => {
        const mode = String(row?._id || 'manual');
        if (Object.prototype.hasOwnProperty.call(exitModes, mode)) {
          exitModes[mode] = Number(row?.count || 0);
        }
        const avg = Number(row?.avg_duration_ms || 0);
        const samples = Number(row?.duration_samples || 0);
        if (samples > 0 && avg > 0) {
          const bucketName = mode === 'manual' ? 'manual' : 'scan';
          durationBuckets[bucketName].weighted_sum += avg * samples;
          durationBuckets[bucketName].samples += samples;
        }
      });

      let totalFifoAttempts = 0;
      let acceptedMatch = 0;
      let blockedMismatch = 0;
      let blockedNoLot = 0;
      fifoStats.forEach((row) => {
        const result = String(row?._id?.result || '');
        const status = String(row?._id?.status || '');
        const count = Number(row?.count || 0);
        totalFifoAttempts += count;
        if (result === 'match' && status === 'accepted') acceptedMatch += count;
        if (result === 'mismatch' && status === 'blocked') blockedMismatch += count;
        if (result === 'no_lot' && status === 'blocked') blockedNoLot += count;
      });

      const avoidedErrors = blockedMismatch + blockedNoLot;
      const avgManualMs = durationBuckets.manual.samples > 0
        ? Math.round(durationBuckets.manual.weighted_sum / durationBuckets.manual.samples)
        : 0;
      const avgScanMs = durationBuckets.scan.samples > 0
        ? Math.round(durationBuckets.scan.weighted_sum / durationBuckets.scan.samples)
        : 0;

      const totalEntries = entryModes.manual + entryModes.supplier_number + entryModes.supplier_qr;
      const totalExits = exitModes.manual + exitModes.fifo_qr + exitModes.internal_bond;
      const totalOperations = totalEntries + totalExits;
      const scannedOperations = entryModes.supplier_qr + exitModes.fifo_qr + exitModes.internal_bond;

      return res.json({
        period,
        entries: {
          total: totalEntries,
          modes: entryModes,
        },
        exits: {
          total: totalExits,
          modes: exitModes,
        },
        fifo_scan: {
          attempts: totalFifoAttempts,
          accepted_match: acceptedMatch,
          blocked_mismatch: blockedMismatch,
          blocked_no_lot: blockedNoLot,
          avoided_errors_count: avoidedErrors,
          avoided_error_rate_pct: totalFifoAttempts > 0
            ? Number(((avoidedErrors / totalFifoAttempts) * 100).toFixed(2))
            : 0,
        },
        performance: {
          scan_adoption_pct: totalOperations > 0
            ? Number(((scannedOperations / totalOperations) * 100).toFixed(2))
            : 0,
          avg_form_time_manual_ms: avgManualMs,
          avg_form_time_scan_ms: avgScanMs,
          avg_form_time_manual_sec: Number((avgManualMs / 1000).toFixed(2)),
          avg_form_time_scan_sec: Number((avgScanMs / 1000).toFixed(2)),
        },
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to compute FIFO KPIs', details: err.message });
    }
  }
);

router.post(
  '/entries',
  requireAuth,
  requirePermission(PERMISSIONS.STOCK_ENTRY_CREATE),
  strictBody([
    'product',
    'quantity',
    'unit_price',
    'purchase_order_number',
    'purchase_voucher_number',
    'delivery_note_number',
    'delivery_date',
    'service_requester',
    'supplier',
    'commercial_name',
    'reference_code',
    'lot_number',
    'lot_qr_value',
    'inventory_number',
    'patrimoine_number',
    'beneficiary',
    'expiry_date',
    'chemical_status',
    'dangerous_product_attestation',
    'contract_number',
    'observation',
    'attachments',
    'date_entry',
    'request',
    'entry_mode',
    'supplier_doc_qr_value',
    'submission_duration_ms',
  ]),
  async (req, res) => {
  try {
    const errors = [];
    const quantity = asPositiveNumber(req.body.quantity);
    if (Number.isNaN(quantity) || quantity === undefined) errors.push('quantity must be a positive number');
    if (!isValidObjectIdLike(req.body.product)) errors.push('product id invalide');
    if (req.body.request !== undefined && req.body.request !== null && !isValidObjectIdLike(req.body.request)) {
      errors.push('request id invalide');
    }

    const deliveryDate = asDate(req.body.delivery_date);
    if (deliveryDate === null) errors.push('delivery_date invalide');
    const dateEntry = asDate(req.body.date_entry);
    if (dateEntry === null) errors.push('date_entry invalide');
    const unitPrice = asNonNegativeNumber(req.body.unit_price);
    if (Number.isNaN(unitPrice)) errors.push('unit_price doit etre un nombre >= 0');
    const submissionDurationMs = sanitizeDurationMs(req.body.submission_duration_ms);
    if (Number.isNaN(submissionDurationMs)) errors.push('submission_duration_ms invalide');

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

    const supplier = asOptionalString(req.body.supplier);
    const deliveryNoteNumber = asOptionalString(req.body.delivery_note_number);
    const supplierDocQrValue = asOptionalString(req.body.supplier_doc_qr_value);

    if (deliveryNoteNumber && supplier) {
      const normalizedSupplier = normalizeHumanText(supplier);
      const normalizedDeliveryRef = normalizeDocRef(deliveryNoteNumber);
      const candidates = await StockEntry.find({
        product: product._id,
        canceled: false,
        supplier: { $exists: true, $ne: '' },
        delivery_note_number: { $exists: true, $ne: '' },
      }).select('_id entry_number supplier delivery_note_number createdAt');
      const duplicateByNumber = candidates.find((item) => (
        normalizeHumanText(item.supplier) === normalizedSupplier
        && normalizeDocRef(item.delivery_note_number) === normalizedDeliveryRef
      ));
      if (duplicateByNumber) {
        return res.status(409).json({
          error: 'Bande de livraison deja enregistree pour ce produit',
          reason: `Entree existante: ${duplicateByNumber.entry_number || duplicateByNumber._id}`,
        });
      }
    }

    if (supplierDocQrValue) {
      const normalizedQrValue = normalizeDocRef(supplierDocQrValue);
      const candidates = await StockEntry.find({
        product: product._id,
        canceled: false,
        supplier_doc_qr_value: { $exists: true, $ne: '' },
      }).select('_id entry_number supplier_doc_qr_value createdAt');
      const duplicateByScan = candidates.find((item) => normalizeDocRef(item.supplier_doc_qr_value) === normalizedQrValue);
      if (duplicateByScan) {
        return res.status(409).json({
          error: 'QR fournisseur deja utilise pour ce produit',
          reason: `Entree existante: ${duplicateByScan.entry_number || duplicateByScan._id}`,
        });
      }
    }

    const item = await runInTransaction(async (session) => {
      const payload = {
        entry_number: await getNextEntryNumber(),
        product: req.body.product,
        quantity,
        unit_price: unitPrice,
        submission_duration_ms: submissionDurationMs,
        purchase_order_number: asOptionalString(req.body.purchase_order_number),
        purchase_voucher_number: asOptionalString(req.body.purchase_voucher_number),
        delivery_note_number: deliveryNoteNumber,
        supplier_doc_qr_value: supplierDocQrValue,
        entry_mode: sanitizeEntryMode(req.body.entry_mode),
        delivery_date: deliveryDate,
        service_requester: asOptionalString(req.body.service_requester),
        supplier,
        commercial_name: asOptionalString(req.body.commercial_name),
        reference_code: asOptionalString(req.body.reference_code),
        lot_number: asOptionalString(req.body.lot_number),
        lot_qr_value: asOptionalString(req.body.lot_qr_value),
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
        qr_code_value: entry.lot_qr_value || entry.lot_number || entry.entry_number,
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

router.put(
  '/entries/:id',
  requireAuth,
  requirePermission(PERMISSIONS.STOCK_ENTRY_UPDATE),
  strictBody([
    'quantity',
    'unit_price',
    'purchase_order_number',
    'purchase_voucher_number',
    'delivery_note_number',
    'delivery_date',
    'service_requester',
    'supplier',
    'commercial_name',
    'reference_code',
    'lot_number',
    'inventory_number',
    'patrimoine_number',
    'beneficiary',
    'expiry_date',
    'chemical_status',
    'dangerous_product_attestation',
    'contract_number',
    'observation',
    'attachments',
    'date_entry',
    'entry_mode',
    'supplier_doc_qr_value',
    'submission_duration_ms',
  ]),
  async (req, res) => {
  try {
    if (!isValidObjectIdLike(req.params.id)) {
      return res.status(400).json({ error: 'entry id invalide' });
    }

    const newQty = asPositiveNumber(req.body.quantity);
    if (Number.isNaN(newQty) || newQty === undefined) {
      return res.status(400).json({ error: 'quantity must be a positive number' });
    }

    const parsedUnitPrice = asNonNegativeNumber(req.body.unit_price);
    if (Number.isNaN(parsedUnitPrice)) {
      return res.status(400).json({ error: 'unit_price doit etre un nombre >= 0' });
    }
    const parsedDeliveryDate = asDate(req.body.delivery_date);
    if (parsedDeliveryDate === null) return res.status(400).json({ error: 'delivery_date invalide' });
    const parsedExpiryDate = asDate(req.body.expiry_date);
    if (parsedExpiryDate === null) return res.status(400).json({ error: 'expiry_date invalide' });
    const parsedDateEntry = asDate(req.body.date_entry);
    if (parsedDateEntry === null) return res.status(400).json({ error: 'date_entry invalide' });
    const submissionDurationMs = sanitizeDurationMs(req.body.submission_duration_ms);
    if (Number.isNaN(submissionDurationMs)) return res.status(400).json({ error: 'submission_duration_ms invalide' });
    const supplier = asOptionalString(req.body.supplier);
    const deliveryNoteNumber = asOptionalString(req.body.delivery_note_number);
    const supplierDocQrValue = asOptionalString(req.body.supplier_doc_qr_value);

    const updatedEntry = await runInTransaction(async (session) => {
      const entry = await StockEntry.findById(req.params.id).session(session);
      if (!entry) throw new Error('Stock entry not found');
      if (entry.canceled) throw new Error('Canceled entry cannot be updated');

      const oldQty = Number(entry.quantity || 0);
      const qtyDelta = Number(newQty) - oldQty;

      const product = await Product.findById(entry.product).session(session);
      if (!product) throw new Error('Linked product not found');
      if (product.validation_status !== 'approved') {
        throw new Error('Produit non valide. Validation responsable requise.');
      }

      if (deliveryNoteNumber && supplier) {
        const normalizedSupplier = normalizeHumanText(supplier);
        const normalizedDeliveryRef = normalizeDocRef(deliveryNoteNumber);
        const candidates = await StockEntry.find({
          _id: { $ne: entry._id },
          product: product._id,
          canceled: false,
          supplier: { $exists: true, $ne: '' },
          delivery_note_number: { $exists: true, $ne: '' },
        }).session(session).select('_id entry_number supplier delivery_note_number');
        const duplicateByNumber = candidates.find((item) => (
          normalizeHumanText(item.supplier) === normalizedSupplier
          && normalizeDocRef(item.delivery_note_number) === normalizedDeliveryRef
        ));
        if (duplicateByNumber) throw new Error('Bande de livraison deja enregistree pour ce produit');
      }

      if (supplierDocQrValue) {
        const normalizedQrValue = normalizeDocRef(supplierDocQrValue);
        const candidates = await StockEntry.find({
          _id: { $ne: entry._id },
          product: product._id,
          canceled: false,
          supplier_doc_qr_value: { $exists: true, $ne: '' },
        }).session(session).select('_id entry_number supplier_doc_qr_value');
        const duplicateByScan = candidates.find((item) => normalizeDocRef(item.supplier_doc_qr_value) === normalizedQrValue);
        if (duplicateByScan) throw new Error('QR fournisseur deja utilise pour ce produit');
      }

      const lot = await StockLot.findOne({ entry: entry._id }).session(session);
      if (!lot) throw new Error("Lot d'entree introuvable");

      const consumedFromLot = Math.max(0, Number(lot.quantity_initial || 0) - Number(lot.quantity_available || 0));
      if (newQty < consumedFromLot) {
        throw new Error('Impossible: quantite inferieure a la quantite deja consommee en FIFO');
      }

      const nextStock = Number(product.quantity_current || 0) + qtyDelta;
      if (nextStock < 0) throw new Error('Stock would become negative');

      Object.assign(entry, {
        quantity: newQty,
        unit_price: parsedUnitPrice,
        submission_duration_ms: submissionDurationMs,
        purchase_order_number: asOptionalString(req.body.purchase_order_number),
        purchase_voucher_number: asOptionalString(req.body.purchase_voucher_number),
        delivery_note_number: deliveryNoteNumber,
        supplier_doc_qr_value: supplierDocQrValue,
        entry_mode: sanitizeEntryMode(req.body.entry_mode || entry.entry_mode),
        delivery_date: parsedDeliveryDate,
        service_requester: asOptionalString(req.body.service_requester),
        supplier,
        commercial_name: asOptionalString(req.body.commercial_name),
        reference_code: asOptionalString(req.body.reference_code),
        lot_number: asOptionalString(req.body.lot_number),
        inventory_number: asOptionalString(req.body.inventory_number),
        patrimoine_number: asOptionalString(req.body.patrimoine_number),
        beneficiary: asOptionalString(req.body.beneficiary),
        expiry_date: parsedExpiryDate,
        chemical_status: asOptionalString(req.body.chemical_status),
        dangerous_product_attestation: asOptionalString(req.body.dangerous_product_attestation),
        contract_number: asOptionalString(req.body.contract_number),
        observation: asOptionalString(req.body.observation),
        attachments: sanitizeAttachments(req.body.attachments),
        date_entry: parsedDateEntry || entry.date_entry,
      });
      await entry.save({ session });

      lot.quantity_initial = Number(newQty);
      lot.quantity_available = Math.max(0, Number(newQty) - consumedFromLot);
      lot.unit_price = parsedUnitPrice;
      lot.lot_number = entry.lot_number || undefined;
      lot.expiry_date = entry.expiry_date || undefined;
      lot.date_entry = entry.date_entry || lot.date_entry;
      lot.status = lot.quantity_available > 0 ? 'open' : 'empty';
      await lot.save({ session });

      product.quantity_current = nextStock;
      product.status = computeProductStatus(product.quantity_current, product.seuil_minimum);
      await product.save({ session });
      await evaluateProductAlerts(product, session);

      const historyPayload = {
        action_type: 'entry',
        user: req.user.id,
        product: product._id,
        quantity: newQty,
        source: 'ui',
        description: `Bon d'entree modifie (${entry.entry_number})`,
      };
      if (session) await History.create([historyPayload], { session });
      else await History.create(historyPayload);

      return entry;
    });

    res.json(updatedEntry);
  } catch (err) {
    if (String(err?.message).includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
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

router.post(
  '/exits',
  requireAuth,
  requirePermission(PERMISSIONS.STOCK_EXIT_CREATE),
  strictBody([
    'withdrawal_paper_number',
    'product',
    'quantity',
    'direction_laboratory',
    'beneficiary',
    'demandeur',
    'request',
    'date_exit',
    'scanned_lot_qr',
    'internal_bond_token',
    'exit_mode',
    'submission_duration_ms',
    'attachments',
    'note',
  ]),
  async (req, res) => {
  try {
    const errors = [];
    const quantity = asPositiveNumber(req.body.quantity);
    if (Number.isNaN(quantity) || quantity === undefined) errors.push('quantity must be a positive number');
    if (!isValidObjectIdLike(req.body.product)) errors.push('product id invalide');

    const dateExit = asDate(req.body.date_exit);
    if (dateExit === null) errors.push('date_exit invalide');
    if (req.body.request !== undefined && req.body.request !== null && !isValidObjectIdLike(req.body.request)) {
      errors.push('request id invalide');
    }
    if (req.body.demandeur !== undefined && req.body.demandeur !== null && !isValidObjectIdLike(req.body.demandeur)) {
      errors.push('demandeur id invalide');
    }
    const submissionDurationMs = sanitizeDurationMs(req.body.submission_duration_ms);
    if (Number.isNaN(submissionDurationMs)) errors.push('submission_duration_ms invalide');

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        code: ERROR_CODES.VALIDATION_FAILED,
        reason: 'Les champs requis de la sortie sont invalides.',
        details: errors,
      });
    }

    const product = await Product.findById(req.body.product);
    if (!product) {
      return res.status(404).json({
        error: 'Product not found',
        code: ERROR_CODES.PRODUCT_NOT_FOUND,
        reason: 'Produit introuvable pour cette sortie.',
      });
    }
    if (product.validation_status !== 'approved') {
      return res.status(400).json({
        error: 'Produit non valide. Validation responsable requise.',
        code: ERROR_CODES.PRODUCT_NOT_APPROVED,
        reason: 'La sortie est interdite tant que le produit est en pending/rejected.',
      });
    }

    const currentStock = Number(product.quantity_current || 0);
    if (currentStock < quantity) {
      return res.status(400).json({
        error: 'Stock insuffisant',
        code: ERROR_CODES.STOCK_INSUFFICIENT,
        reason: `Stock courant ${currentStock} < quantite demandee ${quantity}.`,
      });
    }

    const internalBondToken = asOptionalString(req.body.internal_bond_token);
    let internalBondPayload = null;
    if (internalBondToken) {
      try {
        internalBondPayload = verifyQrToken(internalBondToken, { expected_type: 'internal_bond' });
      } catch (err) {
        return res.status(400).json({
          error: 'QR bon interne invalide',
          code: ERROR_CODES.VALIDATION_FAILED,
          reason: err.message,
        });
      }

      if (internalBondPayload?.bond_id) {
        const alreadyUsed = await StockExit.findOne({
          internal_bond_id: String(internalBondPayload.bond_id),
          canceled: false,
        }).select('_id exit_number');
        if (alreadyUsed) {
          return res.status(409).json({
            error: 'Bon interne deja utilise',
            code: ERROR_CODES.VALIDATION_FAILED,
            reason: `Associe a la sortie ${alreadyUsed.exit_number || alreadyUsed._id}`,
          });
        }
      }

      if (internalBondPayload?.product_id && String(internalBondPayload.product_id) !== String(product._id)) {
        return res.status(400).json({
          error: 'Le bon interne ne correspond pas au produit',
          code: ERROR_CODES.VALIDATION_FAILED,
        });
      }
      if (internalBondPayload?.quantity && Number(internalBondPayload.quantity) !== Number(quantity)) {
        return res.status(400).json({
          error: 'La quantite ne correspond pas au bon interne',
          code: ERROR_CODES.VALIDATION_FAILED,
        });
      }
    }

    const item = await runInTransaction(async (session) => {
      await ensureLegacyOpenLot(product, session);
      let linkedRequest = null;
      if (req.body.request) {
        linkedRequest = await Request.findById(req.body.request)
          .populate('demandeur', 'username')
          .session(session);
        if (!linkedRequest) throw new Error('Demande introuvable');
        if (String(linkedRequest.product) !== String(product._id)) {
          throw new Error('La demande ne correspond pas a ce produit');
        }
        if (['refused', 'served'].includes(String(linkedRequest.status || '').toLowerCase())) {
          throw new Error('La demande ne peut plus etre servie');
        }
      }

      const directionLaboratory = linkedRequest
        ? asOptionalString(linkedRequest?.direction_laboratory)
        : asOptionalString(req.body.direction_laboratory) || asOptionalString(internalBondPayload?.direction_laboratory);
      const beneficiary = linkedRequest
        ? asOptionalString(linkedRequest?.beneficiary) || asOptionalString(linkedRequest?.demandeur?.username)
        : asOptionalString(req.body.beneficiary) || asOptionalString(internalBondPayload?.beneficiary);
      const demandeurId = linkedRequest?.demandeur?._id || req.body.demandeur || linkedRequest?.demandeur;

      const scannedLotQr = asOptionalString(req.body.scanned_lot_qr);
      let fifoScanAcceptedPayload = null;

      const lots = await StockLot.find({
        product: product._id,
        quantity_available: { $gt: 0 },
      })
        .sort({ date_entry: 1, createdAt: 1 })
        .session(session);

      const lotsTotal = lots.reduce((sum, lot) => sum + Number(lot.quantity_available || 0), 0);
      if (lotsTotal < quantity && currentStock >= quantity) {
        const correctiveQty = currentStock - lotsTotal;
        if (correctiveQty > 0) {
          const correctiveLotPayload = {
            product: product._id,
            lot_number: `LEGACY-RECOVERY-${Date.now()}`,
            qr_code_value: `LEGACY-RECOVERY-${Date.now()}`,
            date_entry: product.createdAt || new Date(),
            quantity_initial: correctiveQty,
            quantity_available: correctiveQty,
            unit_price: 0,
            status: 'open',
          };
          const [correctiveLot] = session
            ? await StockLot.create([correctiveLotPayload], { session })
            : [await StockLot.create(correctiveLotPayload)];
          lots.push(correctiveLot);
          lots.sort((a, b) => new Date(a.date_entry) - new Date(b.date_entry));
        }
      }

      if (scannedLotQr) {
        const firstFifoLot = lots.find((lot) => Number(lot.quantity_available || 0) > 0);
        if (!firstFifoLot) {
          await logFifoScanAudit({
            context: 'exit_create',
            status: 'blocked',
            result: 'no_lot',
            product: product._id,
            user: req.user.id,
            quantity_requested: quantity,
            scanned_qr: scannedLotQr,
            note: 'Aucun lot ouvert pour FIFO',
          }, session);
          const fifoErr = new Error('Aucun lot disponible pour FIFO');
          fifoErr.code = ERROR_CODES.FIFO_LOT_INSUFFICIENT;
          throw fifoErr;
        }
        const expectedQr = String(firstFifoLot.qr_code_value || firstFifoLot.lot_number || '').trim();
        if (expectedQr && expectedQr !== scannedLotQr) {
          await logFifoScanAudit({
            context: 'exit_create',
            status: 'blocked',
            result: 'mismatch',
            product: product._id,
            stock_lot: firstFifoLot._id,
            user: req.user.id,
            quantity_requested: quantity,
            scanned_qr: scannedLotQr,
            expected_qr: expectedQr,
            note: 'QR scanne different du premier lot FIFO',
          }, session);
          const fifoScanErr = new Error('Lot scanne invalide: veuillez scanner le premier lot FIFO');
          fifoScanErr.code = ERROR_CODES.VALIDATION_FAILED;
          throw fifoScanErr;
        }
        fifoScanAcceptedPayload = {
          context: 'exit_create',
          status: 'accepted',
          result: 'match',
          product: product._id,
          stock_lot: firstFifoLot._id,
          user: req.user.id,
          quantity_requested: quantity,
          scanned_qr: scannedLotQr,
          expected_qr: expectedQr,
          note: 'Scan FIFO valide',
        };
      }

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
        const fifoErr = new Error('Stock insuffisant pour FIFO par lots');
        fifoErr.code = ERROR_CODES.FIFO_LOT_INSUFFICIENT;
        throw fifoErr;
      }

      const payload = {
        exit_number: await getNextExitNumber(),
        withdrawal_paper_number: asOptionalString(req.body.withdrawal_paper_number) || asOptionalString(internalBondPayload?.withdrawal_paper_number),
        product: req.body.product,
        quantity,
        submission_duration_ms: submissionDurationMs,
        direction_laboratory: directionLaboratory,
        beneficiary,
        demandeur: demandeurId,
        request: req.body.request,
        date_exit: dateExit || new Date(),
        scanned_lot_qr: scannedLotQr,
        fifo_reference: consumedLots.map((x) => x.lot_number || 'N/A').join(', '),
        consumed_lots: consumedLots,
        attachments: sanitizeAttachments(req.body.attachments),
        note: asOptionalString(req.body.note),
        internal_bond_token: internalBondToken,
        internal_bond_id: asOptionalString(internalBondPayload?.bond_id),
        exit_mode: sanitizeExitMode(req.body.exit_mode || (internalBondToken ? 'internal_bond' : (scannedLotQr ? 'fifo_qr' : 'manual'))),
        magasinier: req.user.id,
      };

      const [exit] = session ? await StockExit.create([payload], { session }) : [await StockExit.create(payload)];

      if (fifoScanAcceptedPayload) {
        await logFifoScanAudit({
          ...fifoScanAcceptedPayload,
          stock_exit: exit._id,
        }, session);
      }

      product.quantity_current = Number(product.quantity_current || 0) - quantity;
      product.status = computeProductStatus(product.quantity_current, product.seuil_minimum);
      await product.save({ session });

      const historyPayload = {
        action_type: 'exit',
        user: req.user.id,
        product: product._id,
        request: req.body.request || linkedRequest?._id || null,
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
    const errCode = err?.code || ERROR_CODES.VALIDATION_FAILED;
    const reasonByCode = {
      [ERROR_CODES.FIFO_LOT_INSUFFICIENT]: 'Stock legacy sans lots suffisants ou donnees lots incoherentes.',
      [ERROR_CODES.VALIDATION_FAILED]: 'Regles metier de sortie non satisfaites.',
    };
    res.status(400).json({
      error: 'Failed to create stock exit',
      code: errCode,
      reason: reasonByCode[errCode] || 'Erreur metier sortie stock.',
      details: err.message,
    });
  }
});

router.put(
  '/exits/:id',
  requireAuth,
  requirePermission(PERMISSIONS.STOCK_EXIT_UPDATE),
  strictBody([
    'withdrawal_paper_number',
    'quantity',
    'direction_laboratory',
    'beneficiary',
    'demandeur',
    'request',
    'date_exit',
    'scanned_lot_qr',
    'internal_bond_token',
    'exit_mode',
    'submission_duration_ms',
    'attachments',
    'note',
  ]),
  async (req, res) => {
  try {
    if (req.body.request !== undefined && req.body.request !== null && !isValidObjectIdLike(req.body.request)) {
      return res.status(400).json({ error: 'request id invalide' });
    }

    const exitDoc = await StockExit.findById(req.params.id);
    if (!exitDoc) return res.status(404).json({ error: 'Stock exit not found' });
    if (exitDoc.canceled) return res.status(400).json({ error: 'Canceled exit cannot be updated' });

    const internalBondToken = asOptionalString(req.body.internal_bond_token);
    let internalBondPayload = null;
    if (internalBondToken) {
      internalBondPayload = verifyQrToken(internalBondToken, { expected_type: 'internal_bond' });
      if (internalBondPayload?.bond_id) {
        const usedByOther = await StockExit.findOne({
          _id: { $ne: exitDoc._id },
          internal_bond_id: String(internalBondPayload.bond_id),
          canceled: false,
        }).select('_id exit_number');
        if (usedByOther) throw new Error(`Bon interne deja utilise par ${usedByOther.exit_number || usedByOther._id}`);
      }
    }

    const oldQty = Number(exitDoc.quantity || 0);
    const newQty = asPositiveNumber(req.body.quantity);
    if (Number.isNaN(newQty) || newQty === undefined) {
      return res.status(400).json({ error: 'Quantity must be a positive number' });
    }
    const submissionDurationMs = sanitizeDurationMs(req.body.submission_duration_ms);
    if (Number.isNaN(submissionDurationMs)) {
      return res.status(400).json({ error: 'submission_duration_ms invalide' });
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

      await ensureLegacyOpenLot(product, session);

      const lots = await StockLot.find({
        product: product._id,
        quantity_available: { $gt: 0 },
      })
        .sort({ date_entry: 1, createdAt: 1 })
        .session(session);

      const scannedLotQr = asOptionalString(req.body.scanned_lot_qr);
      let fifoScanAcceptedPayload = null;
      if (scannedLotQr) {
        const firstFifoLot = lots.find((lot) => Number(lot.quantity_available || 0) > 0);
        if (!firstFifoLot) {
          await logFifoScanAudit({
            context: 'exit_update',
            status: 'blocked',
            result: 'no_lot',
            product: product._id,
            stock_exit: exitDoc._id,
            user: req.user.id,
            quantity_requested: newQty,
            scanned_qr: scannedLotQr,
            note: 'Aucun lot ouvert pour FIFO (modification sortie)',
          }, session);
          throw new Error('Aucun lot disponible pour FIFO');
        }
        const expectedQr = String(firstFifoLot.qr_code_value || firstFifoLot.lot_number || '').trim();
        if (expectedQr && expectedQr !== scannedLotQr) {
          await logFifoScanAudit({
            context: 'exit_update',
            status: 'blocked',
            result: 'mismatch',
            product: product._id,
            stock_lot: firstFifoLot._id,
            stock_exit: exitDoc._id,
            user: req.user.id,
            quantity_requested: newQty,
            scanned_qr: scannedLotQr,
            expected_qr: expectedQr,
            note: 'QR scanne different du premier lot FIFO (modification sortie)',
          }, session);
          throw new Error('Lot scanne invalide: veuillez scanner le premier lot FIFO');
        }
        fifoScanAcceptedPayload = {
          context: 'exit_update',
          status: 'accepted',
          result: 'match',
          product: product._id,
          stock_lot: firstFifoLot._id,
          stock_exit: exitDoc._id,
          user: req.user.id,
          quantity_requested: newQty,
          scanned_qr: scannedLotQr,
          expected_qr: expectedQr,
          note: 'Scan FIFO valide (modification sortie)',
        };
      }

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
        withdrawal_paper_number: asOptionalString(req.body.withdrawal_paper_number) || asOptionalString(internalBondPayload?.withdrawal_paper_number),
        quantity: newQty,
        submission_duration_ms: submissionDurationMs,
        direction_laboratory: asOptionalString(req.body.direction_laboratory) || asOptionalString(internalBondPayload?.direction_laboratory),
        beneficiary: asOptionalString(req.body.beneficiary) || asOptionalString(internalBondPayload?.beneficiary),
        demandeur: req.body.demandeur,
        request: req.body.request,
        date_exit: asDate(req.body.date_exit) || exitDoc.date_exit,
        scanned_lot_qr: scannedLotQr,
        fifo_reference: consumedLots.map((x) => x.lot_number || 'N/A').join(', '),
        consumed_lots: consumedLots,
        attachments: sanitizeAttachments(req.body.attachments),
        note: asOptionalString(req.body.note),
        internal_bond_token: internalBondToken,
        internal_bond_id: asOptionalString(internalBondPayload?.bond_id),
        exit_mode: sanitizeExitMode(req.body.exit_mode || (internalBondToken ? 'internal_bond' : (scannedLotQr ? 'fifo_qr' : 'manual'))),
      });
      await exitDoc.save({ session });

      if (fifoScanAcceptedPayload) {
        await logFifoScanAudit(fifoScanAcceptedPayload, session);
      }

      product.quantity_current = Number(product.quantity_current || 0) + oldQty - newQty;
      product.status = computeProductStatus(product.quantity_current, product.seuil_minimum);
      await product.save({ session });
      await evaluateProductAlerts(product, session);

      const historyPayload = {
        action_type: 'exit',
        user: req.user.id,
        product: product._id,
        request: req.body.request || exitDoc.request || null,
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
        request: exitDoc.request || null,
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
