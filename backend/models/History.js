const mongoose = require('../db');

const historySchema = new mongoose.Schema(
  {
    action_type: { type: String, enum: ['entry', 'exit', 'request', 'validation', 'block', 'product_create', 'product_update'], required: true, immutable: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', immutable: true },
    request: { type: mongoose.Schema.Types.ObjectId, ref: 'Request', immutable: true },
    quantity: { type: Number, immutable: true },
    date_action: { type: Date, default: Date.now, immutable: true },
    source: { type: String, enum: ['ui', 'system', 'ia'], default: 'ui', immutable: true },
    description: { type: String, immutable: true },
    status_before: { type: String, immutable: true },
    status_after: { type: String, immutable: true },
    actor_role: { type: String, immutable: true },
    correlation_id: { type: String, immutable: true },
    tags: { type: [String], default: [], immutable: true },
    context: { type: mongoose.Schema.Types.Mixed, immutable: true },
    ai_features: { type: mongoose.Schema.Types.Mixed, immutable: true },
  },
  { timestamps: true }
);

historySchema.index({ date_action: -1 });
historySchema.index({ action_type: 1, date_action: -1 });
historySchema.index({ user: 1, date_action: -1 });
historySchema.index({ product: 1, date_action: -1 });
historySchema.index({ request: 1, date_action: -1 });
historySchema.index({ source: 1, date_action: -1 });
historySchema.index({ correlation_id: 1 });

function blockHistoryMutation(next) {
  next(new Error('History is append-only and cannot be modified or deleted'));
}

// Hard lock: prevent all update/delete operations on history records.
historySchema.pre('updateOne', blockHistoryMutation);
historySchema.pre('updateMany', blockHistoryMutation);
historySchema.pre('findOneAndUpdate', blockHistoryMutation);
historySchema.pre('replaceOne', blockHistoryMutation);
historySchema.pre('deleteOne', blockHistoryMutation);
historySchema.pre('deleteMany', blockHistoryMutation);
historySchema.pre('findOneAndDelete', blockHistoryMutation);
historySchema.pre('findOneAndRemove', blockHistoryMutation);

module.exports = mongoose.model('History', historySchema);
