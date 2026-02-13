const mongoose = require('../db');

const historySchema = new mongoose.Schema(
  {
    action_type: { type: String, enum: ['entry', 'exit', 'request', 'validation', 'block'], required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    quantity: Number,
    date_action: { type: Date, default: Date.now },
    source: { type: String, enum: ['ui', 'system', 'ia'], default: 'ui' },
    description: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('History', historySchema);
