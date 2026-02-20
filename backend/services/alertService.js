const User = require('../models/User');
const Notification = require('../models/Notification');
const AIAlert = require('../models/AIAlert');
const StockLot = require('../models/StockLot');
const { enqueueMail } = require('./mailQueueService');
const { getUserPreferences } = require('./userPreferencesService');
const { logSecurityEvent } = require('./securityAuditService');

async function createNotificationsForResponsables({ title, message, type = 'warning' }, session = null) {
  const responsables = await User.find({ role: 'responsable', status: 'active' }).select('_id email').session(session);
  if (!responsables.length) return;
  const docs = responsables.map((u) => ({
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

  const emails = responsables.map((x) => x.email).filter(Boolean);
  if (emails.length > 0) {
    let sentCount = 0;
    for (const responsable of responsables) {
      if (!responsable.email) continue;
      try {
        const prefs = await getUserPreferences(responsable._id);
        if (!prefs?.notifications?.email || !prefs?.notifications?.stockAlerts) continue;
        await enqueueMail({
          kind: 'stock_alert',
          role: 'responsable',
          to: responsable.email,
          subject: title,
          text: message,
          html: `<p>${message}</p>`,
          job_id: `stock_alert_${responsable._id}_${Date.now()}`,
        });
        sentCount += 1;
      } catch {
        // keep loop resilient
      }
    }

    if (sentCount > 0) {
      await logSecurityEvent({
        event_type: 'email_sent',
        role: 'responsable',
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

    await createNotificationsForResponsables({ title, message, type: 'alert' }, session);

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
    await createNotificationsForResponsables({ title, message, type: 'warning' }, session);
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
