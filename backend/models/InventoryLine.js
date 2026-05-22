const mongoose = require('../db');

const inventoryLineSchema = new mongoose.Schema(
  {
    inventory_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true, index: true },
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },

    // Snapshot at launch: MUST NOT be recomputed later from Product.quantity_current.
    quantite_theorique_initiale: { type: Number, required: true, min: 0 },

    quantite_comptee: { type: Number, default: null, min: 0 },
    ecart: { type: Number, default: null },
    valeur_ecart: { type: Number, default: null },
    motif_ecart: { type: String, default: '', trim: true },
    observation_magasinier: { type: String, default: '', trim: true },
    observation_responsable: { type: String, default: '', trim: true },
    is_counted: { type: Boolean, default: false, index: true },
    is_verified_by_magasinier: { type: Boolean, default: false, index: true },

    // Recount support (simple PFE approach)
    requires_recount: { type: Boolean, default: false, index: true },
    recount_count: { type: Number, default: 0, min: 0 },
    last_recount_at: { type: Date, default: null },
    previous_quantite_comptee: { type: Number, default: null, min: 0 },

    // Lightweight snapshot for UI/debug (not a foreign key in current model).
    emplacement_id: { type: String, default: '', trim: true },
    stock_id: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

inventoryLineSchema.index({ inventory_id: 1, product_id: 1 }, { unique: true });

module.exports = mongoose.model('InventoryLine', inventoryLineSchema);
