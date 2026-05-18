const mongoose = require('../db');

const supplierHistorySchema = new mongoose.Schema(
  {
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    action: {
      type: String,
      enum: [
        'CREATION',
        'MODIFICATION',
        'DESACTIVATION',
        'REACTIVATION',
        'SUSPENSION',
        'CHANGEMENT_STATUT',
        'CHANGEMENT_FIABILITE',
        'MARQUER_A_VERIFIER',
        'TRAITEMENT_ALERTE',
      ],
      required: true,
      index: true,
    },
    old_value: { type: mongoose.Schema.Types.Mixed, default: null },
    new_value: { type: mongoose.Schema.Types.Mixed, default: null },
    comment: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

supplierHistorySchema.index({ supplier: 1, createdAt: -1 });
supplierHistorySchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('SupplierHistory', supplierHistorySchema);

