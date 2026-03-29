const mongoose = require('../db');

const productSchema = new mongoose.Schema(
  {
    code_product: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true },
    description: String,
    // La categorie peut etre assignee au moment de la validation par le responsable.
    // Pour les produits "pending", elle peut etre vide (null).
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: false },
    // Proposition libre lors de la creation (ex: magasinier propose une categorie sans la creer).
    category_proposal: { type: String, trim: true },
    family: {
      type: String,
      enum: ['economat', 'produit_chimique', 'gaz', 'consommable_laboratoire'],
      required: true,
    },
    unite: { type: String, default: 'Unite', trim: true },
    emplacement: String,
    stock_initial_year: { type: Number, default: 0 },
    chemical_class: String,
    physical_state: String,
    fds_attachment: {
      file_name: String,
      file_url: String,
    },
    gas_pressure: String,
    gas_purity: String,
    quantity_current: { type: Number, default: 0 },
    seuil_minimum: { type: Number, default: 0 },
    status: { type: String, enum: ['ok', 'sous_seuil', 'rupture', 'bloque'], default: 'ok' },

    // Lifecycle (industrial reality): we avoid hard-deletes. Archived products are hidden from demandeurs and blocked from ops.
    lifecycle_status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
    archived_at: Date,
    archived_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    archived_reason: { type: String, trim: true },

    qr_code_value: { type: String, trim: true },
    image_product: String,
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    validated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    validation_status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  },
  { timestamps: true }
);

productSchema.index({ qr_code_value: 1 }, { unique: true, sparse: true });
productSchema.index({ validation_status: 1, createdAt: -1 });
productSchema.index({ status: 1, quantity_current: 1 });
productSchema.index({ category: 1, family: 1, createdAt: -1 });
productSchema.index({ lifecycle_status: 1, validation_status: 1, createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);
