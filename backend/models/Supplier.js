const mongoose = require('../db');

const supplierSchema = new mongoose.Schema(
  {
    // External dataset import id (ex: SUP-001). Optional and sparse-unique to avoid breaking existing data.
    external_supplier_id: { type: String, trim: true, index: true, unique: true, sparse: true },
    name: { type: String, required: true, trim: true },
    // Keep email/phone optional at DB-level for backward compatibility,
    // but enforce requiredness in the supplier registry API.
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    domain: { type: String, trim: true }, // domaine / spécialité
    main_contact: { type: String, trim: true }, // contact principal
    internal_note: { type: String, trim: true }, // note interne
    reliability_level: {
      type: String,
      enum: ['FIABLE', 'MOYEN', 'A_SURVEILLER', 'NON_EVALUE'],
      default: 'NON_EVALUE',
    },
    last_verification_date: { type: Date, default: null },
    default_lead_time_days: { type: Number, default: 7 },
    // New canonical values are French uppercase; legacy values are kept for existing data.
    status: { type: String, enum: ['ACTIF', 'INACTIF', 'SUSPENDU', 'A_VERIFIER', 'active', 'inactive'], default: 'ACTIF' },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

supplierSchema.index({ name: 1 }, { unique: true });
supplierSchema.index({ status: 1, createdAt: -1 });
supplierSchema.index({ email: 1 });
supplierSchema.index({ phone: 1 });

module.exports = mongoose.model('Supplier', supplierSchema);

