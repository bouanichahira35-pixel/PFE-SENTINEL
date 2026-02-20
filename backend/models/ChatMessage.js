const mongoose = require('../db');

const chatMessageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatConversation', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sender_role: String,
    message: { type: String, required: true },
    read_by: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

chatMessageSchema.index({ conversation: 1, createdAt: -1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
