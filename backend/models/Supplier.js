const mongoose = require('../db');

const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    default_lead_time_days: { type: Number, default: 7 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

supplierSchema.index({ name: 1 }, { unique: true });
supplierSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Supplier', supplierSchema);

