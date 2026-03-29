const mongoose = require('../db');

const inventoryCountSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'InventorySession', required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },

    counted_quantity: { type: Number, required: true, min: 0 },
    system_quantity_at_count: { type: Number, required: true, min: 0 },

    note: String,
    counted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    counted_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

inventoryCountSchema.index({ session: 1, product: 1 }, { unique: true });
inventoryCountSchema.index({ session: 1, counted_at: -1 });

module.exports = mongoose.model('InventoryCount', inventoryCountSchema);

