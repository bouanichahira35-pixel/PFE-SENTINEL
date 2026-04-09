const mongoose = require('../db');

const supplierProductSchema = new mongoose.Schema(
  {
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    supplier_sku: { type: String, trim: true },
    unit_price: { type: Number, default: 0 },
    lead_time_days: { type: Number, default: null },
    availability_status: {
      type: String,
      enum: ['unknown', 'available', 'limited', 'out_of_stock', 'long_lead_time'],
      default: 'unknown',
    },
    availability_note: { type: String, trim: true },
    availability_updated_at: { type: Date },
    is_primary: { type: Boolean, default: false },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

supplierProductSchema.index({ supplier: 1, product: 1 }, { unique: true });
supplierProductSchema.index({ product: 1, is_primary: -1 });

module.exports = mongoose.model('SupplierProduct', supplierProductSchema);
