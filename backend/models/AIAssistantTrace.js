const mongoose = require('../db');

const aiAssistantTraceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    mode: { type: String, enum: ['chat', 'report'], default: 'chat' },
    source: { type: String, default: 'fallback' },
    question: { type: String, required: true, maxlength: 4000 },
    answer: { type: String, required: true, maxlength: 12000 },
    latency_ms: { type: Number, min: 0 },
    gemini_configured: { type: Boolean, default: false },
    partial_warnings: { type: [String], default: [] },
    request_id: { type: String },
  },
  { timestamps: true }
);

aiAssistantTraceSchema.index({ user: 1, createdAt: -1 });
aiAssistantTraceSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AIAssistantTrace', aiAssistantTraceSchema);

