const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { getSupplierEmailPolicy, sendPurchaseOrderEmailToSupplier } = require('./purchaseOrderSupplierMailService');
const { buildSupplierPortalUrlForSupplier } = require('./supplierPortalTokenService');
const logger = require('../utils/logger');

function hoursToMs(h) {
  const n = Number(h || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n * 60 * 60 * 1000;
}

function isRecentlyNotified(po, kind, withinMs) {
  if (!withinMs) return false;
  const list = Array.isArray(po?.supplier_notifications) ? po.supplier_notifications : [];
  const last = list
    .filter((x) => x && x.kind === kind && x.sent_at)
    .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())[0];
  if (!last?.sent_at) return false;
  const lastAt = new Date(last.sent_at).getTime();
  return Number.isFinite(lastAt) && (Date.now() - lastAt) < withinMs;
}

async function notifyAdminsAndResponsables({ title, message, type = 'warning' }) {
  const targets = await User.find({ role: { $in: ['admin', 'responsable'] }, status: 'active' })
    .select('_id')
    .limit(50)
    .lean();
  if (!targets.length) return;
  await Notification.insertMany(targets.map((t) => ({
    user: t._id,
    title,
    message,
    type,
    is_read: false,
  })));
}

async function runPurchaseOrderRemindersOnce() {
  const policy = await getSupplierEmailPolicy();
  if (!policy.enabled || !policy.reminders_enabled) {
    return { ok: true, skipped: true, reason: 'disabled' };
  }

  const now = new Date();
  const j1WindowMs = hoursToMs(policy.reminder_j1_window_hours || 24);
  const overdueRepeatMs = hoursToMs(policy.overdue_repeat_hours || 24);
  const ackSlaMs = hoursToMs(policy.ack_sla_hours || 24);
  const ackRepeatMs = hoursToMs(policy.ack_repeat_hours || 24);

  const max = Math.max(10, Math.min(250, Number(process.env.PO_REMINDERS_MAX || 80)));

  const candidates = await PurchaseOrder.find({
    status: 'ordered',
  })
    .sort({ promised_at: 1 })
    .limit(max)
    .populate('supplier', 'name email status')
    .lean();

  let sentJ1 = 0;
  let sentOverdue = 0;
  let sentAck = 0;

  for (const po of candidates || []) {
    const supplier = po.supplier;

    if (!supplier || supplier.status !== 'active') continue;
    if (!supplier.email) continue;

    // ETA confirmation reminder (supplier responsiveness) - before delivery reminders.
    if (policy.ack_reminders_enabled && ackSlaMs > 0) {
      const ackStatus = String(po?.supplier_ack?.status || 'none');
      const orderedAt = po.ordered_at ? new Date(po.ordered_at) : (po.createdAt ? new Date(po.createdAt) : null);
      if (ackStatus === 'none' && orderedAt && !Number.isNaN(orderedAt.getTime())) {
        const ageMs = now.getTime() - orderedAt.getTime();
        if (ageMs >= ackSlaMs && !isRecentlyNotified(po, 'po_ack_reminder', ackRepeatMs || ackSlaMs)) {
          const portalUrl = buildSupplierPortalUrlForSupplier({ supplier_id: supplier._id });
          await sendPurchaseOrderEmailToSupplier({
            purchase_order_id: po._id,
            reason: 'auto_ack',
            kind: 'po_ack_reminder',
            portal_url: portalUrl,
          });
          sentAck += 1;
        }
      }
    }

    // J-1 reminder
    const promisedAt = po.promised_at ? new Date(po.promised_at) : null;
    const hasPromised = promisedAt && !Number.isNaN(promisedAt.getTime());
    const diffMs = hasPromised ? promisedAt.getTime() - now.getTime() : null;

    if (policy.reminder_j1_enabled && hasPromised && diffMs > 0 && diffMs <= j1WindowMs) {
      if (isRecentlyNotified(po, 'po_j1_reminder', j1WindowMs * 0.8)) continue;
      const portalUrl = buildSupplierPortalUrlForSupplier({ supplier_id: supplier._id });
      await sendPurchaseOrderEmailToSupplier({
        purchase_order_id: po._id,
        reason: 'auto_j1',
        kind: 'po_j1_reminder',
        portal_url: portalUrl,
      });
      sentJ1 += 1;
      continue;
    }

    // Overdue reminder
    if (policy.overdue_enabled && hasPromised && diffMs <= 0) {
      if (isRecentlyNotified(po, 'po_overdue_reminder', overdueRepeatMs)) continue;
      const portalUrl = buildSupplierPortalUrlForSupplier({ supplier_id: supplier._id });
      await sendPurchaseOrderEmailToSupplier({
        purchase_order_id: po._id,
        reason: 'auto_overdue',
        kind: 'po_overdue_reminder',
        portal_url: portalUrl,
      });
      sentOverdue += 1;
    }
  }

  if (sentOverdue > 0) {
    await notifyAdminsAndResponsables({
      title: 'Relances fournisseurs (retard)',
      message: `${sentOverdue} relance(s) envoyee(s) automatiquement pour des commandes en retard.`,
      type: 'warning',
    });
  }

  if (sentAck > 0) {
    await notifyAdminsAndResponsables({
      title: 'Relances fournisseurs (ETA)',
      message: `${sentAck} relance(s) envoyee(s) automatiquement pour obtenir une confirmation d'ETA (portail).`,
      type: 'info',
    });
  }

  return { ok: true, sent_ack: sentAck, sent_j1: sentJ1, sent_overdue: sentOverdue };
}

let started = false;
let intervalId = null;

function startPurchaseOrderRemindersJob() {
  if (started) return;
  started = true;

  const everyMinutes = Math.max(2, Math.min(120, Number(process.env.PO_REMINDERS_EVERY_MINUTES || 10)));
  const everyMs = everyMinutes * 60 * 1000;

  const tick = async () => {
    try {
      const summary = await runPurchaseOrderRemindersOnce();
      if (summary?.sent_j1 || summary?.sent_overdue) {
        logger.info({ summary }, '[SUPPLIER] PO reminders tick');
      }
    } catch (err) {
      logger.warn({ err: err?.message || err }, '[SUPPLIER] PO reminders tick failed');
    }
  };

  // Run shortly after boot, then on interval.
  setTimeout(tick, 5000);
  intervalId = setInterval(tick, everyMs);
}

function stopPurchaseOrderRemindersJob() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  started = false;
}

module.exports = {
  startPurchaseOrderRemindersJob,
  stopPurchaseOrderRemindersJob,
  runPurchaseOrderRemindersOnce,
};
