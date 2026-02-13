const mongoose = require('../db');

const stockExitSchema = new mongoose.Schema(
  {
    // Auto-generated business document number: BP-YYYY-00001
    exit_number: { type: String, required: true, unique: true },

    // Optional paper number that may come from external process/ECM
    withdrawal_paper_number: String,

    // Core stock linkage
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 0 },

    // Requester/business context from cahier de charge
    direction_laboratory: String,
    beneficiary: String,
    demandeur: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Date fields
    date_exit: { type: Date, default: Date.now },

    // FIFO support (simple today, can become array of lots later)
    fifo_reference: String,

    // Optional document links/metadata
    attachments: [
      {
        label: String,
        file_name: String,
        file_url: String,
      },
    ],

    note: String,
    magasinier: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Soft cancel to keep immutable trace
    canceled: { type: Boolean, default: false },
    canceled_at: Date,
    canceled_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StockExit', stockExitSchema);
