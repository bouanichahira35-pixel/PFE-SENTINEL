const mongoose = require('../db');

const syncEventSchema = new mongoose.Schema(
  {
    event_id: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    source: { type: String, enum: ['mobile'], default: 'mobile' },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    site: String,
    status: {
      type: String,
      enum: ['processing', 'accepted', 'rejected'],
      default: 'processing',
      index: true,
    },
    payload: mongoose.Schema.Types.Mixed,
    result: mongoose.Schema.Types.Mixed,
    error: String,
    error_code: String,
    event_time_device: Date,
    created_at_local: Date,
    received_at: { type: Date, default: Date.now },
    processed_at: Date,
  },
  { timestamps: true }
);

syncEventSchema.index({ user: 1, event_id: 1 }, { unique: true });
syncEventSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('SyncEvent', syncEventSchema);
