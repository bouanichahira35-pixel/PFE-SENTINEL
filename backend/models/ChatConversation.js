const mongoose = require('../db');

const chatConversationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['direct', 'chatbot'], default: 'direct' },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    last_message: { type: String, default: '' },
    last_message_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

chatConversationSchema.index({ participants: 1 });
chatConversationSchema.index({ last_message_at: -1 });

module.exports = mongoose.model('ChatConversation', chatConversationSchema);
