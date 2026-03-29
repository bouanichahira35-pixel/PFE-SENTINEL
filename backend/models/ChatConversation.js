const mongoose = require('../db');

const chatConversationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['direct', 'chatbot', 'thread'], default: 'direct' },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // Optional linkage for operational threads (ex: feed/history item).
    context_kind: { type: String, enum: ['history', 'request', 'product', 'inventory', 'purchase_order', 'supplier', null], default: null },
    context_id: { type: mongoose.Schema.Types.ObjectId, default: null },
    last_message: { type: String, default: '' },
    last_message_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

chatConversationSchema.index({ participants: 1 });
chatConversationSchema.index({ last_message_at: -1 });
chatConversationSchema.index({ type: 1, context_kind: 1, context_id: 1 });

module.exports = mongoose.model('ChatConversation', chatConversationSchema);
