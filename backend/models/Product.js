const mongoose = require('../db');

const productSchema = new mongoose.Schema(
  {
    code_product: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true },
    description: String,
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    family: {
      type: String,
      enum: ['economat', 'produit_chimique', 'gaz', 'consommable_informatique', 'consommable_laboratoire'],
      required: true,
    },
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
    qr_code_value: String,
    image_product: String,
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    validated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    validation_status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);
