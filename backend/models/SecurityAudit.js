const mongoose = require('../db');

const securityAuditSchema = new mongoose.Schema(
  {
    event_type: {
      type: String,
      enum: [
        'login_success',
        'login_failed',
        'logout',
        'logout_all',
        'password_reset_request',
        'password_reset_verify',
        'password_reset_done',
        'token_rejected',
        'email_sent',
        'email_failed',
      ],
      required: true,
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    email: String,
    role: String,
    ip_address: String,
    user_agent: String,
    success: { type: Boolean, default: true },
    details: String,
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    date_event: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SecurityAudit', securityAuditSchema);
