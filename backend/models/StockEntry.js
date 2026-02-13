const mongoose = require('../db');

const stockEntrySchema = new mongoose.Schema(
  {
    // Auto-generated business document number: BE-YYYY-00001
    entry_number: { type: String, required: true, unique: true },

    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },

    // Core quantities and pricing
    quantity: { type: Number, required: true, min: 0 },
    unit_price: { type: Number, min: 0 },

    // Bon/commande metadata from cahier de charge
    purchase_order_number: String,
    purchase_voucher_number: String,
    delivery_note_number: String,
    delivery_date: Date,
    service_requester: String,
    supplier: String,

    // Product/business identifiers
    commercial_name: String,
    reference_code: String,
    lot_number: String,

    // Asset tracking (economat / patrimoine)
    inventory_number: String,
    patrimoine_number: String,
    beneficiary: String,

    // Chemical product specific fields
    expiry_date: Date,
    chemical_status: { type: String, enum: ['Utilisable', 'Perime'], default: 'Utilisable' },
    dangerous_product_attestation: String,

    // Gas contract reference
    contract_number: String,

    // General notes and attachments
    observation: String,
    attachments: [
      {
        label: String,
        file_name: String,
        file_url: String,
      },
    ],

    // Audit and state
    date_entry: { type: Date, default: Date.now },
    magasinier: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    canceled: { type: Boolean, default: false },
    canceled_at: Date,
    canceled_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StockEntry', stockEntrySchema);
