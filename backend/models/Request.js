const mongoose = require('../db');

const requestSchema = new mongoose.Schema(
  {
    demandeur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity_requested: { type: Number, required: true },
    direction_laboratory: String,
    beneficiary: String,
    status: { type: String, enum: ['pending', 'accepted', 'served', 'refused'], default: 'pending' },
    date_request: { type: Date, default: Date.now },
    date_acceptance: Date,
    date_processing: Date,
    date_served: Date,
    processed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    served_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    stock_exit: { type: mongoose.Schema.Types.ObjectId, ref: 'StockExit' },
    note: String,
  },
  { timestamps: true }
);

requestSchema.index({ status: 1, date_request: -1 });
requestSchema.index({ demandeur: 1, status: 1, date_request: -1 });
requestSchema.index({ product: 1, status: 1, date_request: -1 });
requestSchema.index({ processed_by: 1, date_processing: -1 });
requestSchema.index({ stock_exit: 1 }, { sparse: true });

module.exports = mongoose.model('Request', requestSchema);
