const mongoose = require('../db');

const passwordResetSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reset_code: { type: String, required: true }, // hash du code OTP
    expiration_date: { type: Date, required: true },
    status: { type: String, enum: ['valid', 'expired', 'used'], default: 'valid' },
    attempts: { type: Number, default: 0 },
    verified_at: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('PasswordReset', passwordResetSchema);
