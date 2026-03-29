const mongoose = require('../db');

const inventorySessionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    reference: { type: String, required: true, unique: true, trim: true },
    status: {
      type: String,
      enum: ['draft', 'counting', 'closed', 'applied', 'cancelled'],
      default: 'counting',
    },
    notes: String,

    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    created_at: { type: Date, default: Date.now },
    closed_at: Date,
    closed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    applied_at: Date,
    applied_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

inventorySessionSchema.index({ status: 1, createdAt: -1 });
inventorySessionSchema.index({ created_by: 1, createdAt: -1 });

module.exports = mongoose.model('InventorySession', inventorySessionSchema);

