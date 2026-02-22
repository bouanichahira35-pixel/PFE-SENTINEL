const User = require('../models/User');
const Notification = require('../models/Notification');
const AIAlert = require('../models/AIAlert');
const StockLot = require('../models/StockLot');
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

module.exports = {
  evaluateProductAlerts,
};
