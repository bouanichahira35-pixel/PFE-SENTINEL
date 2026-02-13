const router = require('express').Router();
const ChatConversation = require('../models/ChatConversation');
const ChatMessage = require('../models/ChatMessage');

router.get('/conversations', async (req, res) => {
  try {
    const items = await ChatConversation.find();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

router.get('/messages/:conversationId', async (req, res) => {
  try {
    const items = await ChatMessage.find({ conversation: req.params.conversationId });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

module.exports = router;
