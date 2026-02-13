const mongoose = require('../db');

const userSessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    device: String,
    ip_address: String,
    login_time: { type: Date, default: Date.now },
    logout_time: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('UserSession', userSessionSchema);
