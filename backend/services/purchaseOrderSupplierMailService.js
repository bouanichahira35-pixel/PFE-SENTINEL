const AppSetting = require('../models/AppSetting');
const PurchaseOrder = require('../models/PurchaseOrder');
const { enqueueMail } = require('./mailQueueService');
const { logSecurityEvent } = require('./securityAuditService');
const { buildSupplierPortalUrlForSupplier } = require('./supplierPortalTokenService');

const POLICY_KEY = 'supplier_email_policy_v1';

const DEFAULT_POLICY = Object.freeze({
  enabled: true,
  send_on_create_ordered: true,
  send_on_update_to_ordered: true,
  include_lines: true,
  reminders_enabled: true,
  reminder_j1_enabled: true,
  overdue_enabled: true,
  reminder_j1_window_hours: 24,
  overdue_repeat_hours: 24,
  ack_reminders_enabled: true,
  ack_sla_hours: 24,
  ack_repeat_hours: 24,
});

async function getPolicy() {
  const item = await AppSetting.findOne({ setting_key: POLICY_KEY }).lean();
  const v = item?.setting_value || {};
  return {
    enabled: v?.enabled !== false,
    send_on_create_ordered: v?.send_on_create_ordered !== false,
    send_on_update_to_ordered: v?.send_on_update_to_ordered !== false,
    include_lines: v?.include_lines !== false,
    reminders_enabled: v?.reminders_enabled !== false,
    reminder_j1_enabled: v?.reminder_j1_enabled !== false,
    overdue_enabled: v?.overdue_enabled !== false,
    reminder_j1_window_hours: Math.max(6, Math.min(168, Math.floor(Number(v?.reminder_j1_window_hours || 24)))),
    overdue_repeat_hours: Math.max(6, Math.min(168, Math.floor(Number(v?.overdue_repeat_hours || 24)))),
    ack_reminders_enabled: v?.ack_reminders_enabled !== false,
    ack_sla_hours: Math.max(6, Math.min(168, Math.floor(Number(v?.ack_sla_hours || 24)))),
    ack_repeat_hours: Math.max(6, Math.min(168, Math.floor(Number(v?.ack_repeat_hours || 24)))),
  };
}

function formatDateFr(date) {
  if (!date) return '-';
  try {
    return new Date(date).toLocaleDateString('fr-FR');
  } catch {
    return '-';
  }
}

async function sendPurchaseOrderEmailToSupplier({
  purchase_order_id,
  triggered_by_user_id = null,
  reason = 'create',
  force = false,
  kind = 'po_ordered_email',
  portal_url = null,
}) {
  const policy = await getPolicy();
  if (!policy.enabled) return { ok: false, skipped: true, reason: 'disabled' };

  const po = await PurchaseOrder.findById(purchase_order_id)
    .populate('supplier', 'name email status')
    .populate('lines.product', 'name code_product')
    .lean();
  if (!po) return { ok: false, skipped: true, reason: 'po_not_found' };
  if (po.status !== 'ordered') return { ok: false, skipped: true, reason: 'not_ordered' };

  const supplier = po?.supplier;
  const supplierEmail = String(supplier?.email || '').trim();
  if (!supplierEmail) return { ok: false, skipped: true, reason: 'supplier_email_missing' };
  if (supplier?.status && supplier.status !== 'active') return { ok: false, skipped: true, reason: 'supplier_inactive' };

  const already = Array.isArray(po.supplier_notifications)
    ? po.supplier_notifications.some((n) => n?.kind === kind)
    : false;
  const oneShot = kind === 'po_ordered_email';
  if (oneShot && already && !force) return { ok: true, skipped: true, reason: 'already_sent' };

  const lines = Array.isArray(po.lines) ? po.lines : [];
  const linesText = policy.include_lines
    ? lines.slice(0, 20).map((l, idx) => {
      const p = l?.product || {};
      const name = p?.name || 'Produit';
      const code = p?.code_product ? ` (${p.code_product})` : '';
      return `${idx + 1}. ${name}${code} — Qté: ${Number(l?.quantity || 0)}`;
    }).join('\n')
    : '';

  const subjectPrefix =
    kind === 'po_overdue_reminder'
      ? '[SENTINEL] RELANCE (retard)'
      : kind === 'po_j1_reminder'
        ? '[SENTINEL] RELANCE (J-1)'
        : kind === 'po_ack_reminder'
          ? '[SENTINEL] CONFIRMATION ETA'
        : '[SENTINEL] Commande fournisseur';
  const subject = `${subjectPrefix} - ${supplier?.name || 'Fournisseur'}`;
  const effectivePortalUrl = portal_url || buildSupplierPortalUrlForSupplier({ supplier_id: supplier._id });
  const text = [
    `Bonjour,`,
    '',
    `Une commande a ete enregistree dans SENTINEL.`,
    '',
    `Reference: ${String(po._id)}`,
    `Fournisseur: ${supplier?.name || '-'}`,
    `Date commande: ${formatDateFr(po.ordered_at)}`,
    `Date prevue: ${formatDateFr(po.promised_at)}`,
    effectivePortalUrl ? `Portail (lecture): ${effectivePortalUrl}` : null,
    policy.ack_reminders_enabled && effectivePortalUrl
      ? `Merci de confirmer l'ETA via le portail (delai cible: ${policy.ack_sla_hours}h).`
      : null,
    linesText ? '' : null,
    linesText ? 'Lignes:' : null,
    linesText || null,
    '',
    `Ceci est un message automatique (raison: ${reason}).`,
  ].filter(Boolean).join('\n');

  const html = `<pre style="font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;white-space:pre-wrap;">${text}</pre>`;

  const jobId = `po_supplier_${String(po._id)}_${Date.now()}`;
  await enqueueMail({
    kind: 'purchase_order_supplier',
    role: 'supplier',
    to: supplierEmail,
    subject,
    text,
    html,
    job_id: jobId,
  });

  await PurchaseOrder.updateOne(
    { _id: po._id },
    { $push: { supplier_notifications: { kind, sent_at: new Date(), meta: { reason, force: Boolean(force) } } } }
  );

  await logSecurityEvent({
    event_type: 'supplier_email_enqueued',
    email: supplierEmail,
    role: 'supplier',
    success: true,
    details: `PO email queued to supplier (reason=${reason})`,
    user_id: triggered_by_user_id || undefined,
    after: {
      purchase_order_id: String(po._id),
      supplier_id: String(supplier?._id || ''),
      kind,
      job_id: jobId,
    },
  });

  return { ok: true, queued: true };
}

module.exports = {
  getSupplierEmailPolicy: getPolicy,
  sendPurchaseOrderEmailToSupplier,
  SUPPLIER_EMAIL_POLICY_KEY: POLICY_KEY,
  SUPPLIER_EMAIL_POLICY_DEFAULT: DEFAULT_POLICY,
};
