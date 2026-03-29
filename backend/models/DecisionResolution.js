const mongoose = require('../db');

const decisionResolutionSchema = new mongoose.Schema(
  {
    decision_id: { type: String, required: true, unique: true },
    kind: String,
    title: String,
    product_name: String,
    level: String,
    resolved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    resolved_at: { type: Date, default: Date.now },
    note: String,
  },
  { timestamps: true }
);

decisionResolutionSchema.index({ resolved_at: -1 });
decisionResolutionSchema.index({ resolved_by: 1, resolved_at: -1 });

module.exports = mongoose.model('DecisionResolution', decisionResolutionSchema);
