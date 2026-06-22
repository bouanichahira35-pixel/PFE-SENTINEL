// BLOC 1 - Role du fichier.
// Ce fichier decrit le modele MongoDB SupplierAlert, ses champs, index et regles de validation.
// Point de vigilance: eviter de changer un champ sans verifier les migrations, seeds, routes et tests.

const mongoose = require('../db');

const supplierAlertSchema = new mongoose.Schema(
  {
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    type: {
      type: String,
      enum: [
        'FICHE_INCOMPLETE',
        'DOUBLON_POTENTIEL',
        'FOURNISSEUR_SUSPENDU',
        'FOURNISSEUR_INACTIF',
        'FICHE_ANCIENNE',
        'FIABILITE_FAIBLE',
      ],
      required: true,
      index: true,
    },
    message: { type: String, required: true, trim: true },
    priority: { type: String, enum: ['FAIBLE', 'MOYENNE', 'ELEVEE'], default: 'MOYENNE', index: true },
    status: { type: String, enum: ['NON_TRAITEE', 'EN_COURS', 'TRAITEE', 'IGNOREE'], default: 'NON_TRAITEE', index: true },
    treated_at: { type: Date, default: null },
    treated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Optional: stable deduplication key (best-effort).
    dedupe_key: { type: String, trim: true, index: true, default: '' },
  },
  { timestamps: true }
);

supplierAlertSchema.index({ supplier: 1, status: 1, createdAt: -1 });
supplierAlertSchema.index({ type: 1, status: 1, createdAt: -1 });
supplierAlertSchema.index({ dedupe_key: 1, createdAt: -1 });

module.exports = mongoose.model('SupplierAlert', supplierAlertSchema);

