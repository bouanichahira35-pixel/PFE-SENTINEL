// BLOC 1 - Role du fichier.
// Ce fichier decrit le modele MongoDB AIAlert, ses champs, index et regles de validation.
// Point de vigilance: eviter de changer un champ sans verifier les migrations, seeds, routes et tests.

const mongoose = require('../db');

const aiAlertSchema = new mongoose.Schema(
  {
    // External dataset import id (ex: ALT-000001). Optional and sparse-unique to keep imports idempotent.
    external_alert_id: { type: String, trim: true, index: true, unique: true, sparse: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    alert_type: { type: String, enum: ['anomaly', 'rupture', 'surconsommation'], required: true },
    risk_level: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
    message: String,
    detected_at: { type: Date, default: Date.now },
    status: { type: String, enum: ['new', 'reviewed'], default: 'new' },
    action_taken: String,
    reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AIAlert', aiAlertSchema);
