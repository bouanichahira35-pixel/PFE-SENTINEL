const SecurityAudit = require('../models/SecurityAudit');
const { sendAdminCriticalFailureDigestIfDue } = require('./adminMailDigestService');

async function logSecurityEvent(payload) {
  try {
    await SecurityAudit.create(payload);
    if (payload?.event_type === 'email_failed') {
      sendAdminCriticalFailureDigestIfDue().catch(() => {});
    }
  } catch (err) {
    // Do not break main flow if audit logging fails.
  }
}

module.exports = { logSecurityEvent };
