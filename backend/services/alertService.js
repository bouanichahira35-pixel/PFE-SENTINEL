const User = require('../models/User');
const Notification = require('../models/Notification');
const AIAlert = require('../models/AIAlert');
const StockLot = require('../models/StockLot');
const nodemailer = require('nodemailer');
const { logSecurityEvent } = require('./securityAuditService');

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT || 587),
  secure: String(process.env.MAIL_SECURE) === 'true',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

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
    try {
      await transporter.sendMail({
        from: process.env.MAIL_FROM || process.env.MAIL_USER,
        to: emails.join(','),
        subject: title,
        text: message,
      });
      await logSecurityEvent({
        event_type: 'email_sent',
        role: 'responsable',
        success: true,
        details: 'Stock alert mail sent',
        after: { recipients_count: emails.length, subject: title },
      });
    } catch {
      await logSecurityEvent({
        event_type: 'email_failed',
        role: 'responsable',
        success: false,
        details: 'Stock alert mail failed',
        after: { recipients_count: emails.length, subject: title },
      });
      // Keep app resilient if mail provider is unavailable.
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
