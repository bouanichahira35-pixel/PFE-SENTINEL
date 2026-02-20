const mongoose = require('../db');

const fifoScanAuditSchema = new mongoose.Schema(
  {
    context: {
      type: String,
      enum: ['exit_create', 'exit_update'],
      required: true,
    },
    status: {
      type: String,
      enum: ['accepted', 'blocked'],
      required: true,
    },
    result: {
      type: String,
      enum: ['match', 'mismatch', 'no_lot'],
      required: true,
    },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    stock_lot: { type: mongoose.Schema.Types.ObjectId, ref: 'StockLot' },
    stock_exit: { type: mongoose.Schema.Types.ObjectId, ref: 'StockExit' },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    quantity_requested: { type: Number, min: 0 },
    scanned_qr: String,
    expected_qr: String,
    note: String,
  },
  { timestamps: true }
);

fifoScanAuditSchema.index({ createdAt: -1 });
fifoScanAuditSchema.index({ product: 1, createdAt: -1 });
fifoScanAuditSchema.index({ user: 1, createdAt: -1 });
fifoScanAuditSchema.index({ result: 1, status: 1, createdAt: -1 });
fifoScanAuditSchema.index({ stock_exit: 1 }, { sparse: true });

module.exports = mongoose.model('FifoScanAudit', fifoScanAuditSchema);
