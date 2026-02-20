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
    submission_duration_ms: { type: Number, min: 0 },

    // Requester/business context from cahier de charge
    direction_laboratory: String,
    beneficiary: String,
    demandeur: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    request: { type: mongoose.Schema.Types.ObjectId, ref: 'Request' },

    // Date fields
    date_exit: { type: Date, default: Date.now },
    scanned_lot_qr: String,
    internal_bond_token: String,
    internal_bond_id: String,
    exit_mode: {
      type: String,
      enum: ['manual', 'fifo_qr', 'internal_bond'],
      default: 'manual',
    },

    // FIFO support (simple today, can become array of lots later)
    fifo_reference: String,
    consumed_lots: [
      {
        lot: { type: mongoose.Schema.Types.ObjectId, ref: 'StockLot' },
        lot_number: String,
        quantity: Number,
        expiry_date: Date,
      },
    ],

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

stockExitSchema.index({ product: 1, date_exit: -1 });
stockExitSchema.index({ demandeur: 1, date_exit: -1 });
stockExitSchema.index({ magasinier: 1, date_exit: -1 });
stockExitSchema.index({ request: 1 }, { sparse: true });
stockExitSchema.index({ canceled: 1, date_exit: -1 });
stockExitSchema.index({ internal_bond_id: 1, canceled: 1 }, { sparse: true });

module.exports = mongoose.model('StockExit', stockExitSchema);
