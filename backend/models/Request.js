const mongoose = require('../db');

const requestSchema = new mongoose.Schema(
  {
    demandeur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity_requested: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'accepted', 'refused'], default: 'pending' },
    date_request: { type: Date, default: Date.now },
    date_processing: Date,
    processed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Request', requestSchema);
