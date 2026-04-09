const User = require('../models/User');
const Notification = require('../models/Notification');
const AIAlert = require('../models/AIAlert');
const StockLot = require('../models/StockLot');
const Product = require('../models/Product');
const History = require('../models/History');
const { enqueueMail } = require('./mailQueueService');
const { getUserPreferences, canSendNotificationEmail } = require('./userPreferencesService');
const { logSecurityEvent } = require('./securityAuditService');

async function createNotificationsForStockTeams({ title, message, type = 'warning' }, session = null) {
  const teams = await User.find({
    role: { $in: ['responsable', 'magasinier'] },
    status: 'active',
  }).select('_id email role').session(session);
  if (!teams.length) return;

  const docs = teams.map((u) => ({
    user: u._id,
    title,
    message,
    type,
    is_read: false,
  }));
  if (session) {
    await Notification.insertMany(docs, { session });
  } else {
    await Notification.insertMany(docs);
  }

  const emails = teams.map((x) => x.email).filter(Boolean);
  if (emails.length > 0) {
    let sentCount = 0;
    for (const teamUser of teams) {
      if (!teamUser.email) continue;
      try {
        const prefs = await getUserPreferences(teamUser._id);
        if (!canSendNotificationEmail(prefs, 'stock')) continue;
        await enqueueMail({
          kind: 'stock_alert',
          role: teamUser.role,
          to: teamUser.email,
          subject: title,
          text: message,
          html: `<p>${message}</p>`,
          job_id: `stock_alert_${teamUser._id}_${Date.now()}`,
        });
        sentCount += 1;
      } catch {
        // keep loop resilient
      }
    }

    if (sentCount > 0) {
      await logSecurityEvent({
        event_type: 'email_sent',
        role: 'stock_team',
        success: true,
        details: 'Stock alert mail queued',
        after: { recipients_count: sentCount, subject: title },
      });
    }
  }
}

async function evaluateProductAlerts(product, session = null) {
  const qty = Number(product.quantity_current || 0);
  const seuil = Number(product.seuil_minimum || 0);

  if (qty <= seuil) {
    const statusLabel = qty <= 0 ? 'rupture' : 'sous seuil';
    const title = 'Alerte stock';
    const message = `${product.name} est ${statusLabel}. Quantite restante: ${qty}, seuil: ${seuil}.`;

    await createNotificationsForStockTeams({ title, message, type: 'alert' }, session);

    const alertDoc = {
      product: product._id,
      alert_type: qty <= 0 ? 'rupture' : 'surconsommation',
      risk_level: qty <= 0 ? 'high' : 'medium',
      message,
      status: 'new',
    };
    if (session) await AIAlert.create([alertDoc], { session });
    else await AIAlert.create(alertDoc);
  }

  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const expiringLots = await StockLot.find({
    product: product._id,
    quantity_available: { $gt: 0 },
    expiry_date: { $exists: true, $ne: null, $lte: in30Days },
  })
    .select('lot_number expiry_date quantity_available')
    .limit(5)
    .session(session);

  if (expiringLots.length) {
    const title = 'Alerte peremption';
    const message = `${product.name}: ${expiringLots.length} lot(s) proches de la peremption.`;
    await createNotificationsForStockTeams({ title, message, type: 'warning' }, session);
    const alertDoc = {
      product: product._id,
      alert_type: 'anomaly',
      risk_level: 'medium',
      message,
      status: 'new',
    };
    if (session) await AIAlert.create([alertDoc], { session });
    else await AIAlert.create(alertDoc);
  }
}

async function createAiAlertIfMissing({ productId, alert_type, risk_level, message }, session = null) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existing = await AIAlert.findOne({
    product: productId,
    alert_type,
    status: { $in: ['new', 'open'] },
    createdAt: { $gte: since },
  }).session(session);
  if (existing) return { created: false, alert: existing };

  const doc = {
    product: productId,
    alert_type,
    risk_level,
    message,
    status: 'new',
  };
  const created = session
    ? (await AIAlert.create([doc], { session }))[0]
    : await AIAlert.create(doc);
  return { created: true, alert: created };
}

async function rebuildAiAlerts({ max_products = 300 } = {}) {
  const max = Math.min(2000, Math.max(1, Number(max_products || 300)));
  const products = await Product.find({})
    .select('_id name quantity_current seuil_minimum')
    .sort({ updatedAt: -1 })
    .limit(max)
    .lean();

  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const expiringLots = await StockLot.find({
    quantity_available: { $gt: 0 },
    expiry_date: { $exists: true, $ne: null, $lte: in30Days },
  })
    .select('product')
    .lean();

  const expiringByProduct = new Map();
  for (const lot of expiringLots) {
    const key = String(lot?.product || '');
    if (!key) continue;
    expiringByProduct.set(key, (expiringByProduct.get(key) || 0) + 1);
  }

  let createdCount = 0;
  let scanned = 0;
  for (const p of products) {
    scanned += 1;
    const qty = Number(p.quantity_current || 0);
    const seuil = Number(p.seuil_minimum || 0);
    const name = p.name || 'Produit';

    if (qty <= seuil) {
      const statusLabel = qty <= 0 ? 'rupture' : 'sous seuil';
      const message = `${name} est ${statusLabel}. Quantite restante: ${qty}, seuil: ${seuil}.`;
      const result = await createAiAlertIfMissing({
        productId: p._id,
        alert_type: qty <= 0 ? 'rupture' : 'surconsommation',
        risk_level: qty <= 0 ? 'high' : 'medium',
        message,
      });
      if (result.created) createdCount += 1;
    }

    const expCount = expiringByProduct.get(String(p._id)) || 0;
    if (expCount > 0) {
      const message = `${name}: ${expCount} lot(s) proches de la peremption (<=30 jours).`;
      const result = await createAiAlertIfMissing({
        productId: p._id,
        alert_type: 'anomaly',
        risk_level: 'medium',
        message,
      });
      if (result.created) createdCount += 1;
    }
  }

  return { ok: true, scanned_products: scanned, created_alerts: createdCount };
}

async function buildHistoryAnomalyAlerts({
  window_days = 90,
  max_total = 25,
  min_samples = 5,
} = {}) {
  const since = new Date(Date.now() - Math.max(1, Number(window_days || 90)) * 24 * 60 * 60 * 1000);
  const events = await History.find({
    action_type: 'exit',
    product: { $ne: null },
    quantity: { $gt: 0 },
    date_action: { $gte: since },
  })
    .select('product quantity date_action')
    .sort({ date_action: -1 })
    .lean();

  const eventsByProduct = new Map();
  for (const e of events) {
    const pid = String(e.product || '');
    if (!pid) continue;
    if (!eventsByProduct.has(pid)) eventsByProduct.set(pid, []);
    eventsByProduct.get(pid).push(e);
  }

  let createdCount = 0;
  let scanned = 0;
  const candidates = [];

  for (const [productId, rows] of eventsByProduct.entries()) {
    scanned += 1;
    if (rows.length < min_samples) continue;
    const values = rows.map((x) => Number(x.quantity || 0));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((acc, v) => acc + ((v - mean) ** 2), 0) / values.length;
    const std = Math.sqrt(variance);
    if (!Number.isFinite(std) || std === 0) continue;
    const threshold = mean + (2 * std);

    const anomaly = rows.find((x) => Number(x.quantity || 0) > threshold);
    if (!anomaly) continue;
    candidates.push({
      productId,
      quantity: Number(anomaly.quantity || 0),
      date_action: anomaly.date_action,
      threshold: Number(threshold.toFixed(2)),
      mean: Number(mean.toFixed(2)),
      std: Number(std.toFixed(2)),
    });
  }

  const limited = candidates
    .sort((a, b) => new Date(b.date_action || 0) - new Date(a.date_action || 0))
    .slice(0, Math.max(1, Number(max_total || 25)));

  for (const row of limited) {
    const product = await Product.findById(row.productId).select('name').lean();
    const productName = product?.name || 'Produit';
    const riskLevel = row.quantity > row.threshold * 1.5 ? 'high' : 'medium';
    const message = `${productName}: sortie anormale detectee (${row.quantity} u), seuil statistique ${row.threshold}.`;

    const result = await createAiAlertIfMissing({
      productId: row.productId,
      alert_type: 'anomaly',
      risk_level: riskLevel,
      message,
    });
    if (result.created) {
      createdCount += 1;
      await createNotificationsForStockTeams(
        {
          title: 'Anomalie de sortie detectee',
          message,
          type: riskLevel === 'high' ? 'alert' : 'warning',
        }
      );
    }
  }

  return {
    ok: true,
    scanned_products: scanned,
    total_candidates: limited.length,
    created_alerts: createdCount,
  };
}

module.exports = {
  evaluateProductAlerts,
  rebuildAiAlerts,
  createAiAlertIfMissing,
  buildHistoryAnomalyAlerts,
};
