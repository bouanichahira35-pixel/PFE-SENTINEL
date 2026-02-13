const mongoose = require('../db');

const chatConversationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['responsable-magasinier','chatbot'], default: 'responsable-magasinier' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ChatConversation', chatConversationSchema);
