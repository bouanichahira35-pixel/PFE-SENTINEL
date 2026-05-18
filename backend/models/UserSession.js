const mongoose = require('../db');

const userSessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    session_id: { type: String, required: true, unique: true },
    device: String,
    ip_address: String,
    user_agent: String,
    login_time: { type: Date, default: Date.now },
    last_activity_at: { type: Date, default: Date.now },
    logout_time: Date,
    expires_at: { type: Date, required: true },
    is_active: { type: Boolean, default: true },
    revoked_reason: String,
  },
  { timestamps: true }
);

userSessionSchema.index({ session_id: 1, user: 1, is_active: 1, expires_at: 1 });
userSessionSchema.index({ user: 1, is_active: 1, expires_at: 1 });

module.exports = mongoose.model('UserSession', userSessionSchema);
