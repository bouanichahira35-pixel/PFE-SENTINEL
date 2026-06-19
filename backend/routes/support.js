const router = require('express').Router();

const requireAuth = require('../middlewares/requireAuth');
const strictBody = require('../middlewares/strictBody');

const User = require('../models/User');
const Notification = require('../models/Notification');
const Sequence = require('../models/Sequence');
const { SupportTicket, SUPPORT_TICKET_CATEGORIES, SUPPORT_TICKET_PRIORITIES } = require('../models/SupportTicket');
const { isSafeText } = require('../utils/validation');

router.use(requireAuth);

function ensureResponsable(req, res) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role !== 'responsable') {
    res.status(403).json({ error: 'Acces refuse (responsable uniquement)' });
    return false;
  }
  return true;
}

function normalizeEnum(value, allowed) {
  const key = String(value || '').trim().toUpperCase();
  return allowed.includes(key) ? key : null;
}

function notifTypeForPriority(priority) {
  if (priority === 'URGENT') return 'alert';
  if (priority === 'HIGH') return 'warning';
  return 'info';
}

async function getNextSupportTicketNumber() {
  const year = new Date().getFullYear();
  const counterName = `support_ticket_${year}`;
  const counter = await Sequence.findOneAndUpdate(
    { counter_name: counterName },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true }
  );
  return `SUP-${year}-${String(counter.seq).padStart(5, '0')}`;
}

function pickLastAdminReplyAt(ticket) {
  const rows = Array.isArray(ticket?.responses) ? ticket.responses : [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const r = rows[i];
    if (String(r?.authorRole || '').toLowerCase() === 'admin') return r?.createdAt || null;
  }
  return null;
}

// POST /api/support/tickets
router.post(
  '/tickets',
  strictBody(['title', 'category', 'priority', 'message', 'pageUrl', 'browserInfo', 'attachmentUrl']),
  async (req, res) => {
    try {
      if (!ensureResponsable(req, res)) return;

      const title = String(req.body?.title || '').trim();
      const message = String(req.body?.message || '').trim();
      const category = normalizeEnum(req.body?.category, SUPPORT_TICKET_CATEGORIES);
      const priority = normalizeEnum(req.body?.priority, SUPPORT_TICKET_PRIORITIES) || 'NORMAL';

      const pageUrl = String(req.body?.pageUrl || '').trim().slice(0, 220);
      const browserInfo = String(req.body?.browserInfo || '').trim().slice(0, 340);
      const attachmentUrl = String(req.body?.attachmentUrl || '').trim().slice(0, 420);

      if (!isSafeText(title, { min: 3, max: 120 })) {
        return res.status(400).json({ error: 'Objet invalide (3-120)' });
      }
      if (!category) {
        return res.status(400).json({ error: 'Categorie invalide' });
      }
      if (!SUPPORT_TICKET_PRIORITIES.includes(priority)) {
        return res.status(400).json({ error: 'Priorite invalide' });
      }
      if (!isSafeText(message, { min: 6, max: 2000 })) {
        return res.status(400).json({ error: 'Message invalide (6-2000)' });
      }
      if (pageUrl && !isSafeText(pageUrl, { min: 0, max: 220 })) {
        return res.status(400).json({ error: 'Contexte page invalide' });
      }
      if (browserInfo && !isSafeText(browserInfo, { min: 0, max: 340 })) {
        return res.status(400).json({ error: 'Contexte navigateur invalide' });
      }
      if (attachmentUrl && !isSafeText(attachmentUrl, { min: 0, max: 420 })) {
        return res.status(400).json({ error: 'Piece jointe invalide' });
      }

      const ticketNumber = await getNextSupportTicketNumber();

      const ticket = await SupportTicket.create({
        ticketNumber,
        title,
        category,
        priority,
        message,
        status: 'NEW',
        createdBy: req.user.id,
        createdByRole: req.user.role,
        createdByUsername: req.user.username || 'Utilisateur',
        pageUrl,
        browserInfo,
        attachmentUrl,
        lastReplyAt: new Date(),
      });

      const admins = await User.find({ role: 'admin', status: 'active' })
        .select('_id username role status')
        .lean();

      if (admins.length) {
        const titleNotif = `Nouveau ticket support: ${ticketNumber}`;
        const msg = `Nouveau ticket support envoyé par ${req.user.username}.\nObjet: ${title}\nCatégorie: ${category}\nPriorité: ${priority}`;
        await Notification.insertMany(
          admins.map((a) => ({
            user: a._id,
            title: titleNotif,
            message: msg,
            type: notifTypeForPriority(priority),
            event_type: 'support_ticket_new',
            is_read: false,
          }))
        );
      }

      return res.status(201).json({
        ok: true,
        ticket: {
          _id: ticket._id,
          ticketNumber: ticket.ticketNumber,
          title: ticket.title,
          category: ticket.category,
          priority: ticket.priority,
          status: ticket.status,
          createdAt: ticket.createdAt,
        },
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to create support ticket', details: err.message });
    }
  }
);

// GET /api/support/my-tickets
router.get('/my-tickets', async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;

    const limitRaw = Number(req.query?.limit || 12);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(30, Math.floor(limitRaw))) : 12;

    const rows = await SupportTicket.find({ createdBy: req.user.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('ticketNumber title category priority status createdAt updatedAt lastAdminReplyAt lastReplyAt resolvedAt closedAt')
      .lean();

    const items = (rows || []).map((t) => ({
      ...t,
      lastAdminReplyAt: t.lastAdminReplyAt || null,
      lastReplyAt: t.lastReplyAt || null,
    }));

    return res.json({ ok: true, tickets: items });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch tickets', details: err.message });
  }
});

// GET /api/support/tickets/:id
router.get('/tickets/:id', async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;

    const id = String(req.params.id || '').trim();
    const ticket = await SupportTicket.findById(id)
      .populate('createdBy', '_id username role')
      .lean();

    if (!ticket) return res.status(404).json({ error: 'Ticket introuvable' });
    if (String(ticket.createdBy?._id || ticket.createdBy) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Acces refuse' });
    }

    return res.json({
      ok: true,
      ticket: {
        ...ticket,
        lastAdminReplyAt: ticket.lastAdminReplyAt || pickLastAdminReplyAt(ticket),
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch ticket', details: err.message });
  }
});

// POST /api/support/tickets/:id/reply
router.post(
  '/tickets/:id/reply',
  strictBody(['message']),
  async (req, res) => {
    try {
      if (!ensureResponsable(req, res)) return;

      const id = String(req.params.id || '').trim();
      const message = String(req.body?.message || '').trim();
      if (!isSafeText(message, { min: 2, max: 1200 })) {
        return res.status(400).json({ error: 'Reponse invalide (2-1200)' });
      }

      const ticket = await SupportTicket.findById(id).select('_id createdBy status').lean();
      if (!ticket) return res.status(404).json({ error: 'Ticket introuvable' });
      if (String(ticket.createdBy) !== String(req.user.id)) return res.status(403).json({ error: 'Acces refuse' });
      if (ticket.status === 'CLOSED') return res.status(409).json({ error: 'Ticket ferme' });

      const now = new Date();
      const nextStatus =
        ticket.status === 'WAITING_USER' || ticket.status === 'RESOLVED'
          ? 'IN_PROGRESS'
          : ticket.status;

      await SupportTicket.updateOne(
        { _id: id },
        {
          $push: {
            responses: {
              author: req.user.id,
              authorRole: req.user.role,
              authorUsername: req.user.username || '',
              message,
              createdAt: now,
            },
          },
          $set: { lastReplyAt: now, status: nextStatus, updatedAt: now },
        }
      );

      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to reply', details: err.message });
    }
  }
);

// PATCH /api/support/tickets/:id/resolve
router.patch('/tickets/:id/resolve', async (req, res) => {
  try {
    if (!ensureResponsable(req, res)) return;

    const id = String(req.params.id || '').trim();
    const ticket = await SupportTicket.findById(id).select('_id createdBy status resolvedAt').lean();
    if (!ticket) return res.status(404).json({ error: 'Ticket introuvable' });
    if (String(ticket.createdBy) !== String(req.user.id)) return res.status(403).json({ error: 'Acces refuse' });
    if (ticket.status === 'CLOSED') return res.status(409).json({ error: 'Ticket ferme' });

    const now = new Date();
    await SupportTicket.updateOne(
      { _id: id },
      {
        $set: {
          status: 'RESOLVED',
          resolvedAt: ticket.resolvedAt || now,
          lastReplyAt: now,
          updatedAt: now,
        },
      }
    );

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to resolve ticket', details: err.message });
  }
});

module.exports = router;
