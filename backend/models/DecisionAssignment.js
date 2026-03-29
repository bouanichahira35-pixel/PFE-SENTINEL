const mongoose = require('../db');

const decisionAssignmentSchema = new mongoose.Schema(
  {
    decision_id: { type: String, required: true },
    kind: String,
    title: String,
    product_name: String,
    level: String,
    note: String,
    assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assigned_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assigned_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

decisionAssignmentSchema.index({ decision_id: 1, assigned_at: -1 });
decisionAssignmentSchema.index({ assigned_to: 1, assigned_at: -1 });
decisionAssignmentSchema.index({ assigned_by: 1, assigned_at: -1 });

module.exports = mongoose.model('DecisionAssignment', decisionAssignmentSchema);

