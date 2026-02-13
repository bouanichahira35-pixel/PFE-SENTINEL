const mongoose = require('../db');

const stockRuleSchema = new mongoose.Schema(
  {
    rule_type: { type: String, enum: ['seuil','blocage','fifo'], required: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StockRule', stockRuleSchema);
