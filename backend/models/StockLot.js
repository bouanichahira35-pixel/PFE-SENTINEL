const mongoose = require('../db');

const stockLotSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    entry: { type: mongoose.Schema.Types.ObjectId, ref: 'StockEntry' },
    lot_number: String,
    qr_code_value: String,
    expiry_date: Date,
    date_entry: { type: Date, default: Date.now },
    quantity_initial: { type: Number, required: true, min: 0 },
    quantity_available: { type: Number, required: true, min: 0 },
    unit_price: { type: Number, min: 0 },
    status: { type: String, enum: ['open', 'empty', 'expired'], default: 'open' },
  },
  { timestamps: true }
);

stockLotSchema.index({ product: 1, date_entry: 1, expiry_date: 1 });
stockLotSchema.index({ product: 1, qr_code_value: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('StockLot', stockLotSchema);
