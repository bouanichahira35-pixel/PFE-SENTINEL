// BLOC 1 - Role du fichier.
// Ce fichier decrit le modele MongoDB Inventory, ses champs, index et regles de validation.
// Point de vigilance: eviter de changer un champ sans verifier les migrations, seeds, routes et tests.

const mongoose = require('../db');

const INVENTORY_TYPES = ['GLOBAL', 'TOURNANT'];
const INVENTORY_STATUSES = [
  'BROUILLON',
  'A_FAIRE',
  'EN_COURS',
  'A_VALIDER',
  'A_RECOMPTER',
  'VALIDE',
  'REJETE',
  'ANNULE',
];

const inventorySchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true, trim: true },
    type_inventaire: { type: String, enum: INVENTORY_TYPES, required: true, index: true },
    status: { type: String, enum: INVENTORY_STATUSES, required: true, index: true },

    magasin_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Laboratory', required: true, index: true },
    zone_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', default: null, index: true },
    // In the current app model, "famille" is a product enum string (not a dedicated collection).
    famille_id: { type: String, default: null, trim: true, index: true },
    categorie_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null, index: true },

    responsable_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    magasinier_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Multi-assign: allow one inventory mission to be visible to multiple magasinier accounts.
    // `magasinier_id` remains the primary/legacy field for backward compatibility.
    magasinier_ids: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [], index: true },

    date_lancement: { type: Date, required: true, index: true },
    date_prevue: { type: Date, required: true, index: true },

    bloquer_mouvements: { type: Boolean, default: false },
    notifications_activees: { type: Boolean, default: true },
    commentaire: { type: String, default: '', trim: true },

    // Stock movement lock can be global or limited to the inventory product perimeter.
    movement_blocked: { type: Boolean, default: false, index: true },
    movement_block_scope: { type: String, enum: ['none', 'global', 'products'], default: 'none', index: true },
    movement_blocked_product_ids: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }], default: [], index: true },

    // Workflow timestamps / audit
    submitted_at: { type: Date, default: null, index: true },
    validated_at: { type: Date, default: null, index: true },
    validated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    rejected_at: { type: Date, default: null, index: true },
    rejected_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    cancelled_at: { type: Date, default: null, index: true },
    cancelled_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    // Recount flow
    recount_requested_at: { type: Date, default: null },
    recount_requested_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    motif_recomptage: { type: String, default: '', trim: true },

    // Reject flow
    motif_rejet: { type: String, default: '', trim: true },
    motif_annulation: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

inventorySchema.index(
  {
    status: 1,
    magasin_id: 1,
    type_inventaire: 1,
    zone_id: 1,
    famille_id: 1,
    categorie_id: 1,
    product_id: 1,
    createdAt: -1,
  },
  { name: 'inventory_perimeter_status' }
);

module.exports = {
  Inventory: mongoose.model('Inventory', inventorySchema),
  INVENTORY_TYPES,
  INVENTORY_STATUSES,
};
