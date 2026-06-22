// BLOC 1 - Role du fichier.
// Ce fichier decrit le modele MongoDB Category, ses champs, index et regles de validation.
// Point de vigilance: eviter de changer un champ sans verifier les migrations, seeds, routes et tests.

const mongoose = require('../db');

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    description: String,
    // Si vide: categorie "publique" pour tous les demandeurs.
    // Sinon: visible seulement pour les demandeurs dont le profil est inclus.
    audiences: {
      type: [String],
      enum: ['bureautique', 'menage', 'petrole'],
      default: [],
    },
    parent_family: {
      type: String,
      enum: ['economat', 'produit_chimique', 'gaz', 'consommable_laboratoire', 'consommable_informatique'],
      required: false,
      index: true,
    },
    tags: { type: [String], default: [] },

    // Business rules (pilotage)
    is_sensitive: { type: Boolean, default: false },
    requires_special_validation: { type: Boolean, default: false },
    requires_fds: { type: Boolean, default: false },
    requires_lot_tracking: { type: Boolean, default: false },
    requires_expiry_date: { type: Boolean, default: false },

    // Visibility (optional scoping)
    visible_metiers: { type: [String], default: [] },
    visible_sites: { type: [String], default: [] },
    visible_services: { type: [String], default: [] },

    // Lifecycle (industrial reality): avoid hard-deletes by default
    lifecycle_status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
    archived_at: Date,
    archived_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    archived_reason: { type: String, trim: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

categorySchema.index({ name: 1 }, { unique: true });
categorySchema.index({ lifecycle_status: 1, parent_family: 1, name: 1 });

module.exports = mongoose.model('Category', categorySchema);
