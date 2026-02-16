const router = require('express').Router();
const zlib = require('zlib');
const History = require('../models/History');
const requireAuth = require('../middlewares/requireAuth');
const requirePermission = require('../middlewares/requirePermission');
const { PERMISSIONS } = require('../constants/permissions');
const SAFE_USER_FIELDS = 'username email role status telephone';

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildDateFilter(req, fallbackDays = 90) {
  const filter = {};
  const from = parseDate(req.query.from);
  const to = parseDate(req.query.to);
  if (from || to) {
    filter.date_action = {};
    if (from) filter.date_action.$gte = from;
    if (to) filter.date_action.$lte = to;
    return filter;
  }
  const now = new Date();
  const fromFallback = new Date(now.getTime() - fallbackDays * 24 * 60 * 60 * 1000);
  filter.date_action = { $gte: fromFallback, $lte: now };
  return filter;
}

function toDatasetRow(item) {
  const context = item.context && typeof item.context === 'object' ? item.context : {};
  const aiFeatures = item.ai_features && typeof item.ai_features === 'object' ? item.ai_features : {};
  const quantity = Number(item.quantity || 0);

  let targetLabel = null;
  if (item.action_type === 'request' && item.status_after) {
    targetLabel = item.status_after;
  }

  return {
    dataset_version: 'v1.1',
    history_id: String(item._id || ''),
    timestamp: item.date_action ? new Date(item.date_action).toISOString() : null,
    action_type: item.action_type || null,
    source: item.source || null,
    actor_role: item.actor_role || null,
    user_id: item.user ? String(item.user) : null,
    product_id: item.product ? String(item.product) : null,
    request_id: item.request ? String(item.request) : null,
    quantity,
    status_before: item.status_before || null,
    status_after: item.status_after || null,
    tags: Array.isArray(item.tags) ? item.tags : [],
    description: item.description || null,
    correlation_id: item.correlation_id || null,
    context,
    ai_features: aiFeatures,
    target_label: targetLabel,
  };
}

function toCsv(rows) {
  const header = [
    'history_id',
    'timestamp',
    'action_type',
    'source',
    'actor_role',
    'user_id',
    'product_id',
    'request_id',
    'quantity',
    'status_before',
    'status_after',
    'tags',
    'description',
    'correlation_id',
    'context_json',
    'ai_features_json',
    'target_label',
  ];

  const escapeCsv = (value) => {
    const s = String(value ?? '');
    if (s.includes('"') || s.includes(';') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = rows.map((r) => ([
    r.history_id,
    r.timestamp,
    r.action_type,
    r.source,
    r.actor_role,
    r.user_id,
    r.product_id,
    r.request_id,
    r.quantity,
    r.status_before,
    r.status_after,
    (r.tags || []).join('|'),
    r.description,
    r.correlation_id,
    JSON.stringify(r.context || {}),
    JSON.stringify(r.ai_features || {}),
    r.target_label,
  ].map(escapeCsv).join(';')));

  return [header.join(';'), ...lines].join('\n');
}

function deterministicScore(input) {
  let hash = 2166136261;
  const str = String(input || '');
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const unsigned = hash >>> 0;
  return unsigned / 4294967295;
}

function buildClassSummary(rows) {
  const summary = {};
  rows.forEach((r) => {
    const key = r.target_label || 'null';
    summary[key] = (summary[key] || 0) + 1;
  });
  return summary;
}

function applySplit(rows, splitMode, splitRatio, seed) {
  if (splitMode === 'none') {
    return { train: rows, test: [] };
  }

  if (splitMode === 'temporal') {
    const sorted = [...rows].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const trainCount = Math.max(1, Math.floor(sorted.length * splitRatio));
    return {
      train: sorted.slice(0, trainCount),
      test: sorted.slice(trainCount),
    };
  }

  if (splitMode === 'stratified') {
    const byLabel = new Map();
    rows.forEach((r) => {
      const key = r.target_label || 'null';
      if (!byLabel.has(key)) byLabel.set(key, []);
      byLabel.get(key).push(r);
    });

    const train = [];
    const test = [];
    byLabel.forEach((labelRows, label) => {
      labelRows.forEach((r) => {
        const score = deterministicScore(`${seed}:${label}:${r.history_id}`);
        if (score < splitRatio) train.push(r);
        else test.push(r);
      });
    });
    return { train, test };
  }

  // random split (deterministic with seed)
  const train = [];
  const test = [];
  rows.forEach((r) => {
    const score = deterministicScore(`${seed}:${r.history_id}`);
    if (score < splitRatio) train.push(r);
    else test.push(r);
  });
  return { train, test };
}

router.get('/', requireAuth, requirePermission(PERMISSIONS.HISTORY_READ), async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 200)));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.action_type) filter.action_type = req.query.action_type;
    if (req.query.user) filter.user = req.query.user;
    if (req.query.product) filter.product = req.query.product;
    if (req.query.request) filter.request = req.query.request;
    if (req.query.source) filter.source = req.query.source;
    if (req.query.status_after) filter.status_after = req.query.status_after;
    if (req.query.correlation_id) filter.correlation_id = req.query.correlation_id;

    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    if (from || to) {
      filter.date_action = {};
      if (from) filter.date_action.$gte = from;
      if (to) filter.date_action.$lte = to;
    }

    const [items, total] = await Promise.all([
      History.find(filter)
      .sort({ date_action: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', SAFE_USER_FIELDS)
      .populate('product')
      .populate('request'),
      History.countDocuments(filter),
    ]);

    res.json({
      page,
      limit,
      total,
      total_pages: Math.max(1, Math.ceil(total / limit)),
      items,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

router.get('/stats', requireAuth, requirePermission(PERMISSIONS.HISTORY_READ), async (req, res) => {
  try {
    const filter = buildDateFilter(req, 3650);

    const [byType, bySource, byStatusAfter, coverage] = await Promise.all([
      History.aggregate([
        { $match: filter },
        { $group: { _id: '$action_type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      History.aggregate([
        { $match: filter },
        { $group: { _id: '$source', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      History.aggregate([
        { $match: filter },
        { $match: { status_after: { $exists: true, $ne: null } } },
        { $group: { _id: '$status_after', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      History.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            min_date: { $min: '$date_action' },
            max_date: { $max: '$date_action' },
            missing_quantity: {
              $sum: {
                $cond: [{ $eq: [{ $ifNull: ['$quantity', null] }, null] }, 1, 0],
              },
            },
            missing_product: {
              $sum: {
                $cond: [{ $eq: [{ $ifNull: ['$product', null] }, null] }, 1, 0],
              },
            },
            missing_target_label: {
              $sum: {
                $cond: [{ $eq: [{ $ifNull: ['$status_after', null] }, null] }, 1, 0],
              },
            },
          },
        },
      ]),
    ]);

    const c = coverage[0] || {
      total: 0,
      min_date: null,
      max_date: null,
      missing_quantity: 0,
      missing_product: 0,
      missing_target_label: 0,
    };
    const total = Number(c.total || 0);
    const safeRate = (n) => (total > 0 ? Number((n / total).toFixed(4)) : 0);

    res.json({
      by_type: byType,
      by_source: bySource,
      by_status_after: byStatusAfter,
      coverage: {
        total_rows: total,
        min_date: c.min_date,
        max_date: c.max_date,
      },
      null_rates: {
        quantity: safeRate(Number(c.missing_quantity || 0)),
        product: safeRate(Number(c.missing_product || 0)),
        target_label: safeRate(Number(c.missing_target_label || 0)),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute history stats' });
  }
});

router.get('/insights', requireAuth, requirePermission(PERMISSIONS.HISTORY_READ), async (req, res) => {
  try {
    const filter = buildDateFilter(req, 90);

    const [dailyTrend, topConsumedProducts, exitEvents] = await Promise.all([
      History.aggregate([
        { $match: filter },
        {
          $project: {
            action_type: 1,
            day: {
              $dateToString: { format: '%Y-%m-%d', date: '$date_action' },
            },
          },
        },
        {
          $group: {
            _id: { day: '$day', action_type: '$action_type' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.day': 1 } },
      ]),
      History.aggregate([
        { $match: { ...filter, action_type: 'exit', product: { $ne: null } } },
        {
          $group: {
            _id: '$product',
            total_qty: { $sum: { $ifNull: ['$quantity', 0] } },
            events: { $sum: 1 },
          },
        },
        { $sort: { total_qty: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'product',
          },
        },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            product_id: '$_id',
            code_product: '$product.code_product',
            designation: '$product.name',
            total_qty: 1,
            events: 1,
          },
        },
      ]),
      History.find({ ...filter, action_type: 'exit', quantity: { $gt: 0 }, product: { $ne: null } })
        .select('product quantity date_action')
        .sort({ date_action: -1 })
        .lean(),
    ]);

    // Simple anomaly detection per product: value > mean + 2*std, with at least 5 samples.
    const eventsByProduct = new Map();
    for (const e of exitEvents) {
      const pid = String(e.product);
      if (!eventsByProduct.has(pid)) eventsByProduct.set(pid, []);
      eventsByProduct.get(pid).push(e);
    }

    const anomalies = [];
    eventsByProduct.forEach((events, productId) => {
      if (events.length < 5) return;
      const values = events.map((x) => Number(x.quantity || 0));
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((acc, v) => acc + ((v - mean) ** 2), 0) / values.length;
      const std = Math.sqrt(variance);
      const threshold = mean + (2 * std);

      events
        .filter((x) => Number(x.quantity || 0) > threshold)
        .slice(0, 5)
        .forEach((x) => {
          anomalies.push({
            product_id: productId,
            quantity: Number(x.quantity || 0),
            date_action: x.date_action,
            threshold: Number(threshold.toFixed(2)),
            mean: Number(mean.toFixed(2)),
            std: Number(std.toFixed(2)),
          });
        });
    });

    anomalies.sort((a, b) => new Date(b.date_action) - new Date(a.date_action));

    return res.json({
      period_filter: filter.date_action || null,
      daily_trend: dailyTrend,
      top_consumed_products: topConsumedProducts,
      anomalies: anomalies.slice(0, 20),
      meta: {
        algorithm: 'rule-based',
        anomaly_rule: 'quantity > mean + 2*std per product, min 5 samples',
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to compute history insights', details: err.message });
  }
});

router.get('/dataset', requireAuth, requirePermission(PERMISSIONS.HISTORY_READ), async (req, res) => {
  try {
    const format = String(req.query.format || 'jsonl').trim().toLowerCase();
    if (!['jsonl', 'csv'].includes(format)) {
      return res.status(400).json({ error: 'format invalide (jsonl|csv)' });
    }
    const split = String(req.query.split || 'none').trim().toLowerCase(); // none|random|temporal|stratified
    if (!['none', 'random', 'temporal', 'stratified'].includes(split)) {
      return res.status(400).json({ error: 'split invalide (none|random|temporal|stratified)' });
    }
    const subset = String(req.query.subset || 'train').trim().toLowerCase(); // train|test|all
    if (!['train', 'test', 'all'].includes(subset)) {
      return res.status(400).json({ error: 'subset invalide (train|test|all)' });
    }
    const seed = String(req.query.seed || '42');
    const ratioNum = Number(req.query.train_ratio ?? 0.8);
    const trainRatio = Number.isFinite(ratioNum) ? Math.min(0.95, Math.max(0.05, ratioNum)) : 0.8;

    const filter = buildDateFilter(req, 3650);
    if (req.query.action_type) filter.action_type = req.query.action_type;
    if (req.query.source) filter.source = req.query.source;
    if (req.query.status_after) filter.status_after = req.query.status_after;

    const maxRows = 100000;
    const requestedLimit = Number(req.query.limit || 50000);
    const limit = Math.min(maxRows, Math.max(1, requestedLimit));

    const docs = await History.find(filter)
      .sort({ date_action: -1 })
      .limit(limit)
      .lean();

    const rows = docs.map(toDatasetRow);
    const { train, test } = applySplit(rows, split, trainRatio, seed);
    let selectedRows = rows;
    if (split !== 'none') {
      if (subset === 'train') selectedRows = train;
      else if (subset === 'test') selectedRows = test;
      else selectedRows = [...train, ...test];
    }

    const summaryPayload = {
      total_rows: rows.length,
      split,
      subset,
      train_ratio: split === 'none' ? null : trainRatio,
      train_count: train.length,
      test_count: test.length,
      class_distribution_all: buildClassSummary(rows),
      class_distribution_selected: buildClassSummary(selectedRows),
    };
    const datePart = new Date().toISOString().slice(0, 10);
    res.setHeader('X-Dataset-Summary', Buffer.from(JSON.stringify(summaryPayload)).toString('base64'));
    const gzipRequested = String(req.query.gzip || 'false').toLowerCase() === 'true';

    if (format === 'csv') {
      const csv = toCsv(selectedRows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      const splitPart = split === 'none' ? 'full' : `${split}_${subset}`;
      const fileName = `history_dataset_${splitPart}_${datePart}.csv${gzipRequested ? '.gz' : ''}`;
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      const payload = `\uFEFF${csv}`;
      if (gzipRequested) {
        res.setHeader('Content-Encoding', 'gzip');
        return res.send(zlib.gzipSync(Buffer.from(payload, 'utf8')));
      }
      return res.send(payload);
    }

    const jsonl = selectedRows.map((row) => JSON.stringify(row)).join('\n');
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    const splitPart = split === 'none' ? 'full' : `${split}_${subset}`;
    const fileName = `history_dataset_${splitPart}_${datePart}.jsonl${gzipRequested ? '.gz' : ''}`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    if (gzipRequested) {
      res.setHeader('Content-Encoding', 'gzip');
      return res.send(zlib.gzipSync(Buffer.from(jsonl, 'utf8')));
    }
    return res.send(jsonl);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to export history dataset', details: err.message });
  }
});

router.get('/schema', requireAuth, requirePermission(PERMISSIONS.HISTORY_READ), (req, res) => {
  return res.json({
    dataset_version: 'v1.1',
    endpoint: '/api/history/dataset',
    formats: ['jsonl', 'csv'],
    split_modes: ['none', 'random', 'temporal', 'stratified'],
    subsets: ['train', 'test', 'all'],
    query_params: {
      format: 'jsonl|csv',
      split: 'none|random|temporal|stratified',
      subset: 'train|test|all',
      train_ratio: '0.05..0.95 (default 0.8)',
      seed: 'string seed for deterministic split',
      from: 'ISO date',
      to: 'ISO date',
      action_type: 'entry|exit|request|validation|block',
      source: 'ui|system|ia',
      status_after: 'accepted|refused|pending|...',
      limit: '1..100000',
      gzip: 'true|false',
    },
    row_fields: [
      'dataset_version',
      'history_id',
      'timestamp',
      'action_type',
      'source',
      'actor_role',
      'user_id',
      'product_id',
      'request_id',
      'quantity',
      'status_before',
      'status_after',
      'tags',
      'description',
      'correlation_id',
      'context',
      'ai_features',
      'target_label',
    ],
    target_definition: {
      target_label: 'For request events, equals status_after (accepted/refused/pending). Otherwise null.',
    },
  });
});

router.all('/', requireAuth, requirePermission(PERMISSIONS.HISTORY_READ), (req, res) => {
  return res.status(405).json({ error: 'History is read-only' });
});

module.exports = router;
