// BLOC 1 - Role du fichier.
// Ce fichier decrit le modele MongoDB SecurityAudit, ses champs, index et regles de validation.
// Point de vigilance: eviter de changer un champ sans verifier les migrations, seeds, routes et tests.

const mongoose = require('../db');

const securityAuditSchema = new mongoose.Schema(
  {
    event_type: { type: String, required: true, trim: true, maxlength: 80, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    email: String,
    email_hash: String,
    role: String,
    ip_address: String,
    user_agent: String,
    success: { type: Boolean, default: true },
    details: String,
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    date_event: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SecurityAudit', securityAuditSchema);
