const mongoose = require('../db');

const purchaseOrderLineSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true },
    unit_price: { type: Number, default: 0 },
    quantity_received: { type: Number, default: 0 },
  },
  { _id: false }
);

const purchaseOrderSchema = new mongoose.Schema(
  {
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    status: { type: String, enum: ['draft', 'ordered', 'delivered', 'cancelled'], default: 'ordered' },
    decision_id: { type: String, trim: true },
    ordered_at: { type: Date, default: Date.now },
    promised_at: { type: Date },
    delivered_at: { type: Date },
    received_at: { type: Date },
    received_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    received_entries: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StockEntry' }],
    receive_count: { type: Number, default: 0 },
    note: String,
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lines: { type: [purchaseOrderLineSchema], default: [] },
    supplier_ack: {
      status: { type: String, enum: ['none', 'confirmed', 'delayed'], default: 'none' },
      eta_date: { type: Date },
      note: { type: String, trim: true },
      updated_at: { type: Date },
    },
    incidents: {
      type: [
        {
          kind: { type: String, trim: true },
          severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'warning' },
          status: { type: String, enum: ['open', 'resolved'], default: 'open' },
          message: { type: String, trim: true },
          created_at: { type: Date, default: Date.now },
          resolved_at: { type: Date },
          resolved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          resolution_note: { type: String, trim: true },
        },
      ],
      default: [],
    },
    supplier_notifications: {
      type: [
        {
          kind: { type: String, trim: true },
          sent_at: { type: Date },
          meta: mongoose.Schema.Types.Mixed,
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

purchaseOrderSchema.index({ supplier: 1, ordered_at: -1 });
purchaseOrderSchema.index({ status: 1, ordered_at: -1 });
purchaseOrderSchema.index({ 'lines.product': 1, ordered_at: -1 });
purchaseOrderSchema.index({ decision_id: 1, ordered_at: -1 });
purchaseOrderSchema.index({ received_at: -1 });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
