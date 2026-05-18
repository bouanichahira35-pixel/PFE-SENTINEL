const router = require('express').Router();

const requireAuth = require('../middlewares/requireAuth');
const strictBody = require('../middlewares/strictBody');

const User = require('../models/User');
const Notification = require('../models/Notification');
const { SupportTicket, SUPPORT_TICKET_CATEGORIES, SUPPORT_TICKET_PRIORITIES, SUPPORT_TICKET_STATUSES } = require('../models/SupportTicket');
const { asDate, isSafeText } = require('../utils/validation');

router.use(requireAuth);

function ensureAdmin(req, res) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role !== 'admin') {
    res.status(403).json({ error: 'Acces refuse (admin uniquement)' });
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

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getTicketOr404(req, res, id) {
  const ticket = await SupportTicket.findById(id).lean();
  if (!ticket) {
    res.status(404).json({ error: 'Ticket introuvable' });
    return null;
  }
  return ticket;
}

// GET /api/admin/support/summary
router.get('/summary', async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const [openCount, urgentOpenCount, inProgressCount, resolvedToday] = await Promise.all([
      SupportTicket.countDocuments({ status: { $in: ['NEW', 'IN_PROGRESS', 'WAITING_USER'] } }),
      SupportTicket.countDocuments({ status: { $in: ['NEW', 'IN_PROGRESS', 'WAITING_USER'] }, priority: 'URGENT' }),
      SupportTicket.countDocuments({ status: 'IN_PROGRESS' }),
      SupportTicket.countDocuments({ status: 'RESOLVED', resolvedAt: { $gte: todayStart, $lte: todayEnd } }),
    ]);

    return res.json({
      ok: true,
      kpis: {
        open: Number(openCount || 0),
        urgent: Number(urgentOpenCount || 0),
        in_progress: Number(inProgressCount || 0),
        resolved_today: Number(resolvedToday || 0),
      },
      generated_at: now.toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch summary', details: err.message });
  }
});

// GET /api/admin/support/tickets
router.get('/tickets', async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const status = normalizeEnum(req.query?.status, SUPPORT_TICKET_STATUSES);
    const priority = normalizeEnum(req.query?.priority, SUPPORT_TICKET_PRIORITIES);
    const role = String(req.query?.role || '').trim().toLowerCase();
    const category = normalizeEnum(req.query?.category, SUPPORT_TICKET_CATEGORIES);

    const from = asDate(req.query?.from);
    const to = asDate(req.query?.to);

    const qText = String(req.query?.q || '').trim();

    const limitRaw = Number(req.query?.limit || 60);
    const offsetRaw = Number(req.query?.offset || 0);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 60;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;

    const query = {};
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (category) query.category = category;
    if (role) query.createdByRole = role;
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = startOfDay(from);
      if (to) query.createdAt.$lte = endOfDay(to);
    }

    if (qText) {
      const safe = qText.slice(0, 80);
      const rx = new RegExp(escapeRegex(safe), 'i');
      query.$or = [
        { ticketNumber: rx },
        { title: rx },
        { message: rx },
        { createdByUsername: rx },
      ];
    }

    const [total, tickets] = await Promise.all([
      SupportTicket.countDocuments(query),
      SupportTicket.find(query)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .select('ticketNumber title category priority status createdAt updatedAt createdBy createdByRole createdByUsername lastReplyAt lastAdminReplyAt resolvedAt')
        .lean(),
    ]);

    return res.json({
      ok: true,
      total: Number(total || 0),
      tickets: Array.isArray(tickets) ? tickets : [],
      page: { limit, offset },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to list tickets', details: err.message });
  }
});

// GET /api/admin/support/tickets/:id
router.get('/tickets/:id', async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const id = String(req.params.id || '').trim();
    const ticket = await SupportTicket.findById(id)
      .populate('createdBy', '_id username role')
      .populate('assignedTo', '_id username role')
      .lean();

    if (!ticket) return res.status(404).json({ error: 'Ticket introuvable' });
    return res.json({ ok: true, ticket });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch ticket', details: err.message });
  }
});

// PATCH /api/admin/support/tickets/:id/status
router.patch(
  '/tickets/:id/status',
  strictBody(['status']),
  async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const id = String(req.params.id || '').trim();
      const status = normalizeEnum(req.body?.status, SUPPORT_TICKET_STATUSES);
      if (!status) return res.status(400).json({ error: 'Statut invalide' });

      const ticket = await getTicketOr404(req, res, id);
      if (!ticket) return;

      const now = new Date();
      const patch = { status, updatedAt: now };
      if (status === 'RESOLVED' && !ticket.resolvedAt) patch.resolvedAt = now;
      if (status !== 'RESOLVED' && ticket.resolvedAt && ['NEW', 'IN_PROGRESS', 'WAITING_USER'].includes(status)) {
        patch.resolvedAt = null;
      }
      if (status === 'CLOSED' && !ticket.closedAt) patch.closedAt = now;
      if (status !== 'CLOSED' && ticket.closedAt && status !== 'CLOSED') patch.closedAt = null;

      await SupportTicket.updateOne({ _id: id }, { $set: patch });

      if (status === 'RESOLVED') {
        await Notification.create({
          user: ticket.createdBy,
          title: 'Ticket support résolu',
          message: 'Votre ticket a été marqué comme résolu.',
          type: 'info',
          event_type: 'support_ticket_resolved',
          is_read: false,
        }).catch(() => {});
      }

      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to update status', details: err.message });
    }
  }
);

// PATCH /api/admin/support/tickets/:id/priority
router.patch(
  '/tickets/:id/priority',
  strictBody(['priority']),
  async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const id = String(req.params.id || '').trim();
      const priority = normalizeEnum(req.body?.priority, SUPPORT_TICKET_PRIORITIES);
      if (!priority) return res.status(400).json({ error: 'Priorite invalide' });

      await SupportTicket.updateOne({ _id: id }, { $set: { priority, updatedAt: new Date() } });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to update priority', details: err.message });
    }
  }
);

// POST /api/admin/support/tickets/:id/reply
router.post(
  '/tickets/:id/reply',
  strictBody(['message']),
  async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const id = String(req.params.id || '').trim();
      const message = String(req.body?.message || '').trim();
      if (!isSafeText(message, { min: 2, max: 1200 })) {
        return res.status(400).json({ error: 'Reponse invalide (2-1200)' });
      }

      const ticket = await getTicketOr404(req, res, id);
      if (!ticket) return;
      if (ticket.status === 'CLOSED') return res.status(409).json({ error: 'Ticket ferme' });

      const now = new Date();
      const nextStatus = ticket.status === 'NEW' ? 'IN_PROGRESS' : ticket.status;

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
          $set: {
            lastReplyAt: now,
            lastAdminReplyAt: now,
            status: nextStatus,
            updatedAt: now,
          },
        }
      );

      await Notification.create({
        user: ticket.createdBy,
        title: 'Réponse support',
        message: 'Une réponse a été ajoutée à votre ticket support.',
        type: 'info',
        event_type: 'support_ticket_reply',
        is_read: false,
      }).catch(() => {});

      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to reply', details: err.message });
    }
  }
);

module.exports = router;
