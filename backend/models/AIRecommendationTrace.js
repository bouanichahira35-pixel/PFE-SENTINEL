const mongoose = require('../db');

const aiRecommendationTraceSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    applied_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ordered_qty: { type: Number, required: true, min: 0 },
    risk_before_pct: { type: Number, min: 0, max: 100 },
    risk_after_pct: { type: Number, min: 0, max: 100 },
    impact_note: { type: String },
    recommendation_context: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

aiRecommendationTraceSchema.index({ product: 1, createdAt: -1 });
aiRecommendationTraceSchema.index({ applied_by: 1, createdAt: -1 });

module.exports = mongoose.model('AIRecommendationTrace', aiRecommendationTraceSchema);
