const SecurityAudit = require('../models/SecurityAudit');
const { sendAdminCriticalFailureDigestIfDue } = require('./adminMailDigestService');
const { hmacSha256, maskEmail } = require('../utils/privacy');

function sanitizeAuditPayload(payload) {
  const next = { ...(payload || {}) };
  if (next.email) {
    next.email_hash = hmacSha256(next.email) || undefined;
    next.email = maskEmail(next.email) || next.email;
  }
  return next;
}

async function logSecurityEvent(payload) {
  try {
    const sanitized = sanitizeAuditPayload(payload);
    await SecurityAudit.create(sanitized);
    if (sanitized?.event_type === 'email_failed') {
      sendAdminCriticalFailureDigestIfDue().catch(() => {});
    }
  } catch (err) {
    // Do not break main flow if audit logging fails.
  }
}

module.exports = { logSecurityEvent };
