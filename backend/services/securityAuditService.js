const SecurityAudit = require('../models/SecurityAudit');

async function logSecurityEvent(payload) {
  try {
    await SecurityAudit.create(payload);
  } catch (err) {
    // Do not break main flow if audit logging fails.
  }
}

module.exports = { logSecurityEvent };
