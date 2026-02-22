const router = require('express').Router();

const requireAuth = require('../middlewares/requireAuth');
const requirePermission = require('../middlewares/requirePermission');
const strictBody = require('../middlewares/strictBody');
const { PERMISSIONS } = require('../constants/permissions');

const User = require('../models/User');
const UserSession = require('../models/UserSession');
const Notification = require('../models/Notification');
const History = require('../models/History');
const { enqueueMail } = require('../services/mailQueueService');
const { logSecurityEvent } = require('../services/securityAuditService');
const { getUserPreferences, canSendNotificationEmail } = require('../services/userPreferencesService');
const { ERROR_CODES } = require('../constants/errorCodes');

// Toutes les routes ici sont protégées
router.use(requireAuth);

// GET /api/users?role=magasinier|demandeur|responsable&status=active|blocked
// Retourne la liste des utilisateurs (sans password_hash) + nombre de sessions actives.
router.get('/', requirePermission(PERMISSIONS.USER_MANAGE), async (req, res) => {
  try {
    const role = req.query.role;
    const status = req.query.status;

    const q = {};
    if (role) q.role = role;
    if (status) q.status = status;

    const users = await User.find(q)
      .select('_id username email telephone role status date_creation last_login')
      .sort({ role: 1, username: 1 })
      .lean();

    const userIds = users.map((u) => u._id);

    // Compter les sessions actives par user (sans N+1)
    const now = new Date();
    const sessionCounts = await UserSession.aggregate([
      {
        $match: {
          is_active: true,
          expires_at: { $gt: now },
          user: { $in: userIds },
        },
      },
      {
        $group: {
          _id: '$user',
          activeSessionsCount: { $sum: 1 },
          lastActivityAt: { $max: { $ifNull: ['$last_activity_at', '$updatedAt'] } },
        },
      },
    ]);

    const byUserId = new Map(
      sessionCounts.map((s) => [String(s._id), { count: s.activeSessionsCount, lastActivityAt: s.lastActivityAt }])
    );

    const result = users.map((u) => {
      const s = byUserId.get(String(u._id)) || { count: 0, lastActivityAt: null };
      return {
        ...u,
        activeSessionsCount: s.count,
        lastActivityAt: s.lastActivityAt,
      };
    });

    return res.json({ users: result });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch users', details: err.message });
  }
});

// GET /api/users/active-sessions?role=magasinier
// Liste des sessions actives (utile pour "voir qui est connecte")
router.get(
  '/active-sessions',
  requirePermission(PERMISSIONS.SESSION_MONITOR),
  async (req, res) => {
    try {
      const now = new Date();
      const role = req.query.role;

      const q = {
        is_active: true,
        expires_at: { $gt: now },
      };

      // Si on filtre par role, on fait un lookup via populate
      let sessionsQuery = UserSession.find(q)
        .sort({ last_activity_at: -1, updatedAt: -1 })
        .select('session_id user login_time last_activity_at expires_at ip_address device user_agent updatedAt')
        .populate({
          path: 'user',
          select: '_id username email telephone role status',
        });

      const sessions = await sessionsQuery.lean();

      const filtered = role ? sessions.filter((s) => s.user && s.user.role === role) : sessions;

      return res.json({ sessions: filtered });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to fetch sessions', details: err.message });
    }
  }
);

// PATCH /api/users/:id/status
// Body: { status: "active" | "blocked" }
// Si on bloque un user, on rvoke aussi toutes ses sessions.
router.patch(
  '/:id/status',
  requirePermission(PERMISSIONS.USER_MANAGE),
  strictBody(['status', 'reason']),
  async (req, res) => {
    try {
      const { status } = req.body || {};
      const reason = String(req.body?.reason || '').trim();
      if (!['active', 'blocked'].includes(status)) {
        return res.status(400).json({
          error: 'status invalide',
          code: ERROR_CODES.VALIDATION_FAILED,
          reason: 'status doit etre active ou blocked',
        });
      }
      if (reason.length < 5) {
        return res.status(400).json({
          error: 'reason obligatoire (min 5 caracteres)',
          code: ERROR_CODES.USER_STATUS_REASON_REQUIRED,
          reason: 'Le motif est obligatoire pour la tracabilite.',
        });
      }

      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({
          error: 'Utilisateur introuvable',
          code: ERROR_CODES.USER_NOT_FOUND,
          reason: 'Aucun utilisateur ne correspond a cet identifiant.',
        });
      }
      if (String(user._id) === String(req.user.id)) {
        return res.status(400).json({
          error: 'Operation interdite: vous ne pouvez pas modifier votre propre statut',
          code: ERROR_CODES.USER_STATUS_FORBIDDEN_SELF,
          reason: 'Separation des pouvoirs: un responsable ne peut pas s auto-bloquer.',
        });
      }
      if (user.role === 'responsable') {
        return res.status(400).json({
          error: 'Operation interdite: impossible de bloquer un responsable',
          code: ERROR_CODES.USER_STATUS_FORBIDDEN_ROLE,
          reason: 'Ce flux gere uniquement les comptes magasinier/demandeur.',
        });
      }

      const beforeStatus = user.status;
      user.status = status;
      await user.save();

      if (status === 'blocked') {
        await UserSession.updateMany(
          { user: user._id, is_active: true },
          {
            $set: {
              is_active: false,
              logout_time: new Date(),
              revoked_reason: 'blocked_by_responsable',
            },
          }
        );
      }

      const actorName = req.user.username || 'Responsable';
      const statusLabel = status === 'blocked' ? 'BLOQUE' : 'DEBLOQUE';
      const subject = `Mise a jour de votre compte: ${statusLabel}`;
      const message = `Votre compte a ete ${status === 'blocked' ? 'bloque' : 'debloque'} par ${actorName}. Motif: ${reason}`;

      await Notification.create({
        user: user._id,
        title: subject,
        message,
        type: status === 'blocked' ? 'warning' : 'info',
        is_read: false,
      });

      if (user.email) {
        const prefs = await getUserPreferences(user._id);
        if (canSendNotificationEmail(prefs, 'generic')) {
          await enqueueMail({
            kind: 'user_status_change',
            role: user.role,
            to: user.email,
            subject,
            text: message,
            html: `<p>${message}</p>`,
            job_id: `user_status_${user._id}_${status}_${Date.now()}`,
          });
        }
      }

      await History.create({
        action_type: 'block',
        user: req.user.id,
        source: 'ui',
        description: `Statut utilisateur modifie (${beforeStatus} -> ${status})`,
        status_before: beforeStatus,
        status_after: status,
        actor_role: req.user.role,
        tags: ['user', 'status_change', status],
        context: {
          target_user_id: String(user._id),
          target_role: user.role,
          reason,
        },
      });

      await logSecurityEvent({
        event_type: 'user_status_changed',
        user: req.user.id,
        role: req.user.role,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || '',
        success: true,
        details: `Changed status for user ${user._id} to ${status}. reason=${reason}`,
      });

      return res.json({
        message: 'Status mis a jour',
        user: { id: user._id, status: user.status },
        reason,
      });
    } catch (err) {
      return res.status(500).json({
        error: 'Failed to update status',
        code: ERROR_CODES.INTERNAL_ERROR,
        reason: 'Erreur serveur durant la mise a jour du statut.',
        details: err.message,
      });
    }
  }
);

// POST /api/users/:id/revoke-sessions
// Body: { reason?: string }
router.post(
  '/:id/revoke-sessions',
  requirePermission(PERMISSIONS.SESSION_REVOKE),
  async (req, res) => {
    try {
      const reason = String(req.body?.reason || 'revoked_by_responsable');

      const user = await User.findById(req.params.id).select('_id role username').lean();
      if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

      const r = await UserSession.updateMany(
        { user: user._id, is_active: true },
        {
          $set: {
            is_active: false,
            logout_time: new Date(),
            revoked_reason: reason,
          },
        }
      );

      await logSecurityEvent({
        event_type: 'sessions_revoked',
        user: req.user.id,
        role: req.user.role,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || '',
        success: true,
        details: `Revoked sessions for user ${user._id} (${user.role}/${user.username}) reason=${reason} modified=${r.modifiedCount}`,
      });

      return res.json({ message: 'Sessions revoquees', modified: r.modifiedCount });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to revoke sessions', details: err.message });
    }
  }
);

module.exports = router;
