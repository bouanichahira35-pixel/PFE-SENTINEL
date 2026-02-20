const mongoose = require('../db');

const idempotencyKeySchema = new mongoose.Schema(
  {
    fingerprint: { type: String, required: true, unique: true },
    idem_key: { type: String, required: true },
    method: { type: String, required: true },
    path: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    client_ip: String,
    expires_at: { type: Date, required: true },
  },
  { timestamps: true }
);

idempotencyKeySchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
idempotencyKeySchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('IdempotencyKey', idempotencyKeySchema);
