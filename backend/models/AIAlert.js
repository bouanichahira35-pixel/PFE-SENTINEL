const mongoose = require('../db');

const aiAlertSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    alert_type: { type: String, enum: ['anomaly', 'rupture', 'surconsommation'], required: true },
    risk_level: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
    message: String,
    detected_at: { type: Date, default: Date.now },
    status: { type: String, enum: ['new', 'reviewed'], default: 'new' },
    action_taken: String,
    reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AIAlert', aiAlertSchema);
