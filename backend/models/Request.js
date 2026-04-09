const mongoose = require('../db');
const { normalizeRequestStatus } = require('../utils/requestStatus');

const requestSchema = new mongoose.Schema(
  {
    demandeur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity_requested: { type: Number, required: true },
    direction_laboratory: String,
    beneficiary: String,
    // Priority used for alerting/escalation (e.g., urgent requests can notify responsable by email).
    priority: { type: String, enum: ['normal', 'urgent', 'critical'], default: 'normal' },
    // Workflow (canonique):
    // pending -> validated -> preparing -> served
    // served -> received (demandeur confirmation)
    // pending -> rejected
    // pending -> cancelled (demandeur)
    //
    // Compat legacy: accepted/refused are still accepted but should be migrated to validated/rejected.
    status: {
      type: String,
      enum: ['pending', 'validated', 'preparing', 'served', 'received', 'rejected', 'cancelled', 'accepted', 'refused'],
      default: 'pending',
    },
    date_request: { type: Date, default: Date.now },
    // Legacy fields: date_acceptance/date_processing/processed_by were used when magasinier validated the request.
    // Kept for backward compatibility.
    date_acceptance: Date,
    date_processing: Date,
    date_served: Date,
    processed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    served_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    stock_exit: { type: mongoose.Schema.Types.ObjectId, ref: 'StockExit' },
    note: String,

    // Optional token for "bon de sortie" / pick-up confirmation.
    receipt_token: { type: String, trim: true },
    received_at: Date,
    received_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Canonical audit-friendly fields
    validated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    validated_at: Date,
    prepared_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    prepared_at: Date,
    cancelled_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancelled_at: Date,
  },
  { timestamps: true }
);

requestSchema.index({ status: 1, date_request: -1 });
requestSchema.index({ demandeur: 1, status: 1, date_request: -1 });
requestSchema.index({ product: 1, status: 1, date_request: -1 });
requestSchema.index({ processed_by: 1, date_processing: -1 });
requestSchema.index({ stock_exit: 1 }, { sparse: true });

requestSchema.pre('validate', function canonicalizeLegacyStatus() {
  if (this.status) {
    this.status = normalizeRequestStatus(this.status);
  }
});

module.exports = mongoose.model('Request', requestSchema);
