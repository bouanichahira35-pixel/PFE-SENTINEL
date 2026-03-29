const router = require('express').Router();
const ChatConversation = require('../models/ChatConversation');
const ChatMessage = require('../models/ChatMessage');
const History = require('../models/History');
const Request = require('../models/Request');
const Product = require('../models/Product');
const User = require('../models/User');
const requireAuth = require('../middlewares/requireAuth');
const strictBody = require('../middlewares/strictBody');
const { getUserPreferences } = require('../services/userPreferencesService');
const { enqueueMail } = require('../services/mailQueueService');
const { logSecurityEvent } = require('../services/securityAuditService');

const SAFE_USER_FIELDS = '_id username email role status image_profile';

function getCounterpartRole(role) {
  if (role === 'magasinier') return 'responsable';
  if (role === 'responsable') return 'magasinier';
  return null;
}

async function ensureDirectConversation(userA, userB) {
  let conv = await ChatConversation.findOne({
    type: 'direct',
    participants: { $all: [userA, userB], $size: 2 },
  });
  if (!conv) {
    conv = await ChatConversation.create({
      type: 'direct',
      participants: [userA, userB],
      last_message: '',
      last_message_at: new Date(),
    });
  }
  return conv;
}

async function notifyConversationRecipientsByMail({ sender, recipients, content, conversationId }) {
  if (!Array.isArray(recipients) || recipients.length === 0) return;

  const appUrl = process.env.APP_BASE_URL || process.env.FRONTEND_URL || '';
  const chatUrl = appUrl ? `${appUrl}/magasinier/chat` : '';
  const senderName = sender?.username || 'Responsable';
  const dateLabel = new Date().toLocaleString('fr-FR');
  const shortMessage = String(content || '').slice(0, 400);

  for (const recipient of recipients) {
    if (!recipient?.email) continue;

    try {
      const prefs = await getUserPreferences(recipient._id);
      if (!prefs?.notifications?.email) continue;

      const senderRole = String(sender?.role || '').toLowerCase();
      const recipientRole = String(recipient?.role || '').toLowerCase();
      const subject =
        senderRole === 'responsable'
          ? `Nouveau message du responsable (${senderName})`
          : (senderRole === 'magasinier' && recipientRole === 'responsable')
            ? `Message chat non lu du magasinier (${senderName})`
            : `Nouveau message (${senderName})`;
      const text = [
        `Bonjour ${recipient.username || ''},`,
        `${senderName} vous a envoye un nouveau message.`,
        `Date: ${dateLabel}`,
        `Message: ${shortMessage}`,
        chatUrl ? `Ouvrir le chat: ${chatUrl}` : null,
      ].filter(Boolean).join('\n');
      const html = `
        <div style="font-family:Arial,sans-serif;font-size:14px;color:#111;line-height:1.5">
          <p>Bonjour <strong>${recipient.username || ''}</strong>,</p>
          <p><strong>${senderName}</strong> vous a envoye un nouveau message.</p>
          <p><strong>Date:</strong> ${dateLabel}</p>
          <p><strong>Message:</strong> ${shortMessage}</p>
          ${chatUrl ? `<p><a href="${chatUrl}" style="display:inline-block;background:#005bbb;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none;">Ouvrir le chat</a></p>` : ''}
        </div>
      `;

      await enqueueMail({
        kind: 'chat_message',
        role: recipient.role,
        to: recipient.email,
        subject,
        text,
        html,
        job_id: `chat_message_${conversationId}_${recipient._id}_${Date.now()}`,
      });
    } catch (err) {
      await logSecurityEvent({
        event_type: 'email_failed',
        user: recipient?._id,
        email: recipient?.email,
        role: recipient?.role,
        success: false,
        details: `Chat mail enqueue failed: ${err?.message || 'unknown_error'}`,
        after: {
          conversation_id: conversationId,
        },
      });
    }
  }
}

router.use(requireAuth);

router.get('/contacts', async (req, res) => {
  try {
    const counterpartRole = getCounterpartRole(req.user.role);
    if (!counterpartRole) return res.json([]);

    const users = await User.find({ role: counterpartRole, status: 'active' })
      .select(SAFE_USER_FIELDS)
      .sort({ username: 1 })
      .lean();
    return res.json(users);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

router.get('/conversations', async (req, res) => {
  try {
    const userId = req.user.id;
    const items = await ChatConversation.find({
      type: 'direct',
      participants: userId,
    })
      .populate('participants', SAFE_USER_FIELDS)
      .sort({ last_message_at: -1, updatedAt: -1 })
      .lean();
    return res.json(items);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

router.post('/conversations/direct', strictBody(['user_id']), async (req, res) => {
  try {
    const targetId = String(req.body?.user_id || '');
    if (!targetId) return res.status(400).json({ error: 'user_id obligatoire' });
    if (String(targetId) === String(req.user.id)) {
      return res.status(400).json({ error: 'Conversation avec soi-meme interdite' });
    }

    const target = await User.findById(targetId).select(SAFE_USER_FIELDS).lean();
    if (!target || target.status !== 'active') {
      return res.status(404).json({ error: 'Utilisateur cible introuvable' });
    }

    const conversation = await ensureDirectConversation(req.user.id, targetId);
    const populated = await ChatConversation.findById(conversation._id)
      .populate('participants', SAFE_USER_FIELDS)
      .lean();
    return res.status(201).json(populated);
  } catch (err) {
    return res.status(400).json({ error: 'Failed to create/get conversation', details: err.message });
  }
});

async function buildThreadParticipantsFromHistory(historyDoc, currentUserId) {
  const ids = new Set();
  if (currentUserId) ids.add(String(currentUserId));
  if (historyDoc?.user) ids.add(String(historyDoc.user));

  if (historyDoc?.request) {
    const reqDoc = await Request.findById(historyDoc.request).lean();
    if (reqDoc?.demandeur) ids.add(String(reqDoc.demandeur));
    if (reqDoc?.processed_by) ids.add(String(reqDoc.processed_by));
    if (reqDoc?.served_by) ids.add(String(reqDoc.served_by));
    if (reqDoc?.validated_by) ids.add(String(reqDoc.validated_by));
    if (reqDoc?.prepared_by) ids.add(String(reqDoc.prepared_by));
  }

  if (historyDoc?.product) {
    const prodDoc = await Product.findById(historyDoc.product).select('created_by').lean();
    if (prodDoc?.created_by) ids.add(String(prodDoc.created_by));
  }

  const list = Array.from(ids).filter(Boolean);
  const activeUsers = await User.find({ _id: { $in: list }, status: 'active' }).select('_id').lean();
  return activeUsers.map((u) => u._id);
}

router.post('/conversations/thread', strictBody(['history_id']), async (req, res) => {
  try {
    const historyId = String(req.body?.history_id || '').trim();
    if (!historyId) return res.status(400).json({ error: 'history_id obligatoire' });

    const historyDoc = await History.findById(historyId).lean();
    if (!historyDoc) return res.status(404).json({ error: 'Evenement introuvable' });

    // Find existing thread conversation linked to this history item.
    let conv = await ChatConversation.findOne({
      type: 'thread',
      context_kind: 'history',
      context_id: historyDoc._id,
    });

    if (!conv) {
      const participants = await buildThreadParticipantsFromHistory(historyDoc, req.user.id);
      conv = await ChatConversation.create({
        type: 'thread',
        participants,
        context_kind: 'history',
        context_id: historyDoc._id,
        last_message: '',
        last_message_at: new Date(),
      });
    }

    const populated = await ChatConversation.findById(conv._id)
      .populate('participants', SAFE_USER_FIELDS)
      .lean();

    return res.status(201).json(populated);
  } catch (err) {
    return res.status(400).json({ error: 'Failed to create/get thread conversation', details: err.message });
  }
});

router.get('/messages/:conversationId', async (req, res) => {
  try {
    const conversation = await ChatConversation.findById(req.params.conversationId).lean();
    if (!conversation) return res.status(404).json({ error: 'Conversation introuvable' });
    const allowed = (conversation.participants || []).some((p) => String(p) === String(req.user.id));
    if (!allowed) return res.status(403).json({ error: 'Acces refuse' });

    const items = await ChatMessage.find({ conversation: conversation._id })
      .populate('sender', SAFE_USER_FIELDS)
      .sort({ createdAt: 1 })
      .lean();
    return res.json(items);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

router.post('/messages/:conversationId', strictBody(['message']), async (req, res) => {
  try {
    const content = String(req.body?.message || '').trim();
    if (!content) return res.status(400).json({ error: 'message obligatoire' });
    if (content.length > 2000) return res.status(400).json({ error: 'message trop long' });

    const conversation = await ChatConversation.findById(req.params.conversationId);
    if (!conversation) return res.status(404).json({ error: 'Conversation introuvable' });
    const allowed = (conversation.participants || []).some((p) => String(p) === String(req.user.id));
    if (!allowed) return res.status(403).json({ error: 'Acces refuse' });

    const item = await ChatMessage.create({
      conversation: conversation._id,
      sender: req.user.id,
      sender_role: req.user.role,
      message: content,
      read_by: [req.user.id],
    });

    conversation.last_message = content.slice(0, 280);
    conversation.last_message_at = new Date();
    await conversation.save();

    const recipientIds = (conversation.participants || [])
      .map((p) => String(p))
      .filter((id) => id !== String(req.user.id));
    if (recipientIds.length > 0) {
      const recipients = await User.find({ _id: { $in: recipientIds }, status: 'active' })
        .select('username email role status')
        .lean();
      await notifyConversationRecipientsByMail({
        sender: req.user,
        recipients,
        content,
        conversationId: conversation._id,
      });
    }

    const populated = await ChatMessage.findById(item._id).populate('sender', SAFE_USER_FIELDS).lean();
    return res.status(201).json(populated);
  } catch (err) {
    return res.status(400).json({ error: 'Failed to send message', details: err.message });
  }
});

module.exports = router;
