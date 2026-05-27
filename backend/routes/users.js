const router = require('express').Router();

const requireAuth = require('../middlewares/requireAuth');
const requirePermission = require('../middlewares/requirePermission');
const requireAnyPermission = require('../middlewares/requireAnyPermission');
const requireRole = require('../middlewares/requireRole');
const strictBody = require('../middlewares/strictBody');
const { PERMISSIONS } = require('../constants/permissions');
const { normalizeRole, isTechnicalRole } = require('../constants/roles');
const bcrypt = require('bcryptjs');

const User = require('../models/User');
const UserSession = require('../models/UserSession');
const Notification = require('../models/Notification');
const History = require('../models/History');
const { enqueueMail } = require('../services/mailQueueService');
const { logSecurityEvent } = require('../services/securityAuditService');
const { getUserPreferences, canSendNotificationEmail } = require('../services/userPreferencesService');
const { getRolePermissions } = require('../services/rbacPolicyService');
const { ERROR_CODES } = require('../constants/errorCodes');
const { normalizeEmail, normalizePhone, isValidEmail, isValidPhone, isSafeText, isStrongPassword } = require('../utils/validation');

const PROFILE_VALUES = ['bureautique', 'menage', 'petrole'];
const LIMITED_MANAGED_ROLES = new Set(['magasinier', 'demandeur']);

function getActorRole(req) {
  return normalizeRole(req.user?.role);
}

function canManageTargetRole(actorRole, targetRole) {
  if (actorRole === 'admin') return true;
  return LIMITED_MANAGED_ROLES.has(targetRole);
}

function normalizeServiceDirection(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.slice(0, 80);
}

function mapServiceToProfile(serviceDirection) {
  const text = String(serviceDirection || '').toLowerCase();
  if (!text) return null;
  if (/(rh|ressources humaines|administratif|admin|compta|finance|achats|logistique|secretariat|secr[eé]tariat)/.test(text)) {
    return 'bureautique';
  }
  if (/(menage|m[eé]nage|entretien|nettoyage|hygiene|hygi[eè]ne|proprete|propret[eé])/i.test(text)) {
    return 'menage';
  }
  if (/(hse|maintenance|exploitation|site|terrain|production|forage|atelier|instrumentation|electricite|gaz|chimique)/.test(text)) {
    return 'petrole';
  }
  return null;
}

// Toutes les routes ici sont protégées
router.use(requireAuth);

// GET /api/users?role=magasinier|demandeur|responsable&status=active|blocked
// Retourne la liste des utilisateurs (sans password_hash) + nombre de sessions actives.
router.get('/', requireAnyPermission(PERMISSIONS.USER_LIST, PERMISSIONS.USER_MANAGE), async (req, res) => {
  try {
    const actorRole = getActorRole(req);
    const role = normalizeRole(req.query.role);
    const status = req.query.status;

    const q = {};
    if (status) q.status = status;

    if (role) {
      if (!canManageTargetRole(actorRole, role)) {
        return res.status(403).json({ error: 'Accès refusé pour ce rôle (cible)' });
      }
      q.role = role;
    } else if (actorRole !== 'admin') {
      return res.status(400).json({ error: 'role obligatoire (magasinier|demandeur)' });
    }

    const users = await User.find(q)
      .select('_id username email telephone role status date_creation last_login demandeur_profile service_direction image_profile')
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

// GET /api/users/:id/permissions
// RBAC utilisateur: sous-ensemble des permissions du rôle (admin uniquement).
router.get('/:id/permissions', requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('_id username email role rbac_permissions')
      .lean();

    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const roleId = normalizeRole(user.role);
    const rolePerms = await getRolePermissions(roleId);
    const roleSet = rolePerms instanceof Set ? rolePerms : new Set();

    const inherits_role = !Array.isArray(user.rbac_permissions);
    const effective = inherits_role
      ? Array.from(roleSet.values())
      : user.rbac_permissions
        .map((p) => String(p || '').trim())
        .filter((p) => p && roleSet.has(p));

    return res.json({
      ok: true,
      userId: String(user._id),
      roleId,
      inherits_role,
      permissions: Array.from(new Set(effective)).sort(),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch user permissions', details: err.message });
  }
});

// PATCH /api/users/:id/permissions
// Body: { permissions: string[] } (admin uniquement).
router.patch('/:id/permissions', requireRole('admin'), strictBody(['permissions']), async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('_id role rbac_permissions')
      .lean();

    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const roleId = normalizeRole(user.role);
    const rolePerms = await getRolePermissions(roleId);
    const roleSet = rolePerms instanceof Set ? rolePerms : new Set();

    const input = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    const next = Array.from(new Set(
      input
        .map((p) => String(p || '').trim())
        .filter((p) => p && roleSet.has(p))
    )).sort();

    const roleList = Array.from(roleSet.values()).sort();
    const shouldInherit = next.length === roleList.length && next.every((p, i) => p === roleList[i]);

    // Safety guard: avoid self lock-out. An admin can only keep full inherited permissions on itself.
    if (String(req.user?.id) === String(user._id) && !shouldInherit) {
      return res.status(400).json({ error: 'Impossible de restreindre ses propres permissions' });
    }

    if (shouldInherit) {
      await User.updateOne({ _id: user._id }, { $unset: { rbac_permissions: 1 } });
    } else {
      await User.updateOne({ _id: user._id }, { $set: { rbac_permissions: next } });
    }

    return res.json({ ok: true, userId: String(user._id), roleId, inherits_role: shouldInherit, permissions: next });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update user permissions', details: err.message });
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
          select: '_id username email telephone role status demandeur_profile service_direction',
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
  requireAnyPermission(PERMISSIONS.USER_STATUS_UPDATE, PERMISSIONS.USER_MANAGE),
  strictBody(['status', 'reason']),
  async (req, res) => {
    try {
      const actorRole = getActorRole(req);
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
      if (!canManageTargetRole(actorRole, normalizeRole(user.role))) {
        return res.status(403).json({
          error: 'Operation interdite: rôle cible non autorisé',
          code: ERROR_CODES.USER_STATUS_FORBIDDEN_ROLE,
          reason: 'Ce flux gère uniquement les comptes demandeur/magasinier (sauf admin).',
        });
      }
      if (user.role === 'responsable' || user.role === 'admin') {
        return res.status(400).json({
          error: 'Operation interdite: impossible de bloquer un compte admin/responsable',
          code: ERROR_CODES.USER_STATUS_FORBIDDEN_ROLE,
          reason: 'Ce flux gère uniquement les comptes magasinier/demandeur.',
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
        if (typeof requireAuth.invalidateUserSessionsCache === 'function') {
          requireAuth.invalidateUserSessionsCache(user._id);
        }
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
  requireAnyPermission(PERMISSIONS.SESSION_REVOKE, PERMISSIONS.USER_MANAGE),
  async (req, res) => {
    try {
      const actorRole = getActorRole(req);
      const reason = String(req.body?.reason || 'revoked_by_responsable');

      const user = await User.findById(req.params.id).select('_id role username').lean();
      if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

      if (!canManageTargetRole(actorRole, normalizeRole(user.role))) {
        return res.status(403).json({ error: 'Accès refusé pour ce rôle (cible)' });
      }

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
      if (typeof requireAuth.invalidateUserSessionsCache === 'function') {
        requireAuth.invalidateUserSessionsCache(user._id);
      }

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

// POST /api/users
// Body: { username, email, telephone, role, password, demandeur_profile? }
router.post(
  '/',
  requireRole('admin'),
  requireAnyPermission(PERMISSIONS.USER_CREATE, PERMISSIONS.USER_MANAGE),
  strictBody(['username', 'email', 'telephone', 'role', 'password']),
  async (req, res) => {
    try {
      const username = String(req.body?.username || '').trim();
      const email = normalizeEmail(req.body?.email);
      const telephone = normalizePhone(req.body?.telephone);
      const role = normalizeRole(req.body?.role);
      const password = String(req.body?.password || '');
      const demandeurProfile = String(req.body?.demandeur_profile || '').trim().toLowerCase();
      const serviceDirection = normalizeServiceDirection(req.body?.service_direction);

      if (!username || username.length < 3 || username.length > 60 || !isSafeText(username, { min: 3, max: 60 })) {
        return res.status(400).json({ error: 'username invalide (3-60, sans caracteres speciaux)' });
      }
      if (!isValidEmail(email)) return res.status(400).json({ error: 'email invalide' });
      if (!isValidPhone(telephone)) return res.status(400).json({ error: 'telephone invalide' });
      if (!isTechnicalRole(role)) return res.status(400).json({ error: 'role invalide' });
      if (!isStrongPassword(password)) {
        return res.status(400).json({ error: 'password invalide (min 8, 1 maj, 1 min, 1 chiffre)' });
      }
      if (serviceDirection && !isSafeText(serviceDirection, { min: 2, max: 80 })) {
        return res.status(400).json({ error: 'service_direction invalide (2-80, sans caracteres speciaux)' });
      }

      const existingEmail = await User.findOne({ email }).select('_id').lean();
      if (existingEmail?._id) return res.status(409).json({ error: 'Email deja utilise' });

      const existingUsername = await User.findOne({ username }).select('_id').lean();
      if (existingUsername?._id) return res.status(409).json({ error: 'Username deja utilise' });

      const allowedProfiles = new Set(PROFILE_VALUES);
      const profileFromService = mapServiceToProfile(serviceDirection);
      const profileToSave = allowedProfiles.has(demandeurProfile)
        ? demandeurProfile
        : (profileFromService || 'bureautique');

      const hash = await bcrypt.hash(password, 12);
      const user = await User.create({
        username,
        email,
        telephone,
        role,
        status: 'active',
        password_hash: hash,
        ...(role === 'demandeur'
          ? {
            demandeur_profile: profileToSave,
            service_direction: serviceDirection || '',
          }
          : {}),
      });

      await History.create({
        action_type: 'user_create',
        user: req.user.id,
        source: 'ui',
        description: `Creation utilisateur (${role})`,
        actor_role: req.user.role,
        tags: ['user', 'create', role],
        context: {
          target_user_id: String(user._id),
          target_email: email,
          target_username: username,
          role,
        },
      });

      await logSecurityEvent({
        event_type: 'user_created',
        user: req.user.id,
        role: req.user.role,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || '',
        success: true,
        details: `Created user ${user._id} role=${role} email=${email}`,
      });

      return res.status(201).json({
        message: 'Utilisateur cree',
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          telephone: user.telephone,
          role: user.role,
          status: user.status,
          demandeur_profile: user.demandeur_profile,
          service_direction: user.service_direction || '',
        },
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to create user', details: err.message });
    }
  }
);

// PATCH /api/users/:id/role
// Body: { role, reason }
router.patch(
  '/:id/role',
  requireRole('admin'),
  requireAnyPermission(PERMISSIONS.USER_ROLE_UPDATE, PERMISSIONS.USER_MANAGE),
  strictBody(['role', 'reason']),
  async (req, res) => {
    try {
      const role = normalizeRole(req.body?.role);
      const reason = String(req.body?.reason || '').trim();
      if (!isTechnicalRole(role)) return res.status(400).json({ error: 'role invalide' });
      if (reason.length < 5) return res.status(400).json({ error: 'reason obligatoire (min 5 caracteres)' });

      const user = await User.findById(req.params.id).select('_id role username email').lean();
      if (!user?._id) return res.status(404).json({ error: 'Utilisateur introuvable' });

      const before = user.role;
      if (before === role) return res.json({ message: 'Aucun changement', user: { id: user._id, role } });

      await User.updateOne({ _id: user._id }, { $set: { role } });

      await History.create({
        action_type: 'user_update',
        user: req.user.id,
        source: 'ui',
        description: `Role utilisateur modifie (${before} -> ${role})`,
        actor_role: req.user.role,
        tags: ['user', 'role_change'],
        context: {
          target_user_id: String(user._id),
          target_email: user.email,
          target_username: user.username,
          before,
          after: role,
          reason,
        },
      });

      await logSecurityEvent({
        event_type: 'user_role_changed',
        user: req.user.id,
        role: req.user.role,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || '',
        success: true,
        details: `Changed user role ${user._id} ${before}->${role}. reason=${reason}`,
      });

      return res.json({ message: 'Role mis a jour', user: { id: user._id, role }, reason });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to update role', details: err.message });
    }
  }
);

// PATCH /api/users/:id/service-direction
// Body: { service_direction: "RH" | "Finance" | "HSE" | ... }
  // Met à jour le champ service_direction.
  // - Pour les demandeurs : met à jour aussi le profil catalogue automatiquement.
  // - Pour les autres rôles : met à jour uniquement service_direction.
  router.patch(
    '/:id/service-direction',
    requireAnyPermission(PERMISSIONS.USER_PROFILE_UPDATE, PERMISSIONS.USER_MANAGE),
    strictBody(['service_direction']),
    async (req, res) => {
    try {
      const actorRole = getActorRole(req);
      const serviceDirection = normalizeServiceDirection(req.body?.service_direction);
      if (serviceDirection && !isSafeText(serviceDirection, { min: 2, max: 80 })) {
        return res.status(400).json({ error: 'service_direction invalide (2-80, sans < >)' });
      }

      const user = await User.findById(req.params.id).select('_id role username service_direction demandeur_profile').lean();
      if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
      if (!canManageTargetRole(actorRole, normalizeRole(user.role))) {
        return res.status(403).json({ error: 'Accès refusé pour ce rôle (cible)' });
      }

      const beforeService = user.service_direction || '';
      const isDemandeur = user.role === 'demandeur';
      const profileFromService = isDemandeur ? mapServiceToProfile(serviceDirection) : null;
      const nextProfile = isDemandeur ? (profileFromService || (user.demandeur_profile || 'bureautique')) : undefined;

      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            service_direction: serviceDirection,
            ...(isDemandeur ? { demandeur_profile: nextProfile } : {}),
          },
        }
      );

      await History.create({
        action_type: 'user_update',
        user: req.user.id,
        source: 'ui',
        description: 'Service/direction mis a jour (auto-mapping profil catalogue)',
        actor_role: req.user.role,
        tags: ['user', 'service_direction'],
        context: {
          target_user_id: String(user._id),
          target_username: user.username,
          before_service: beforeService,
          after_service: serviceDirection,
          profile_after: nextProfile,
        },
      });

        return res.json({
          message: 'Service/direction mis a jour',
          user: {
            id: user._id,
            service_direction: serviceDirection,
            demandeur_profile: isDemandeur ? nextProfile : undefined,
          },
        });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to update service_direction', details: err.message });
    }
  }
);

// POST /api/users/:id/reset-password
// Body: { new_password?, reason }
router.post(
  '/:id/reset-password',
  requireRole('admin'),
  requireAnyPermission(PERMISSIONS.USER_PASSWORD_RESET, PERMISSIONS.USER_MANAGE),
  strictBody(['reason']),
  async (req, res) => {
    try {
      const reason = String(req.body?.reason || '').trim();
      if (reason.length < 5) return res.status(400).json({ error: 'reason obligatoire (min 5 caracteres)' });

      const user = await User.findById(req.params.id).select('_id username email role').lean();
      if (!user?._id) return res.status(404).json({ error: 'Utilisateur introuvable' });

      const newPassword = String(req.body?.new_password || '').trim() || `Tmp_${Math.random().toString(36).slice(2, 10)}A1!`;
      if (!isStrongPassword(newPassword)) {
        return res.status(400).json({ error: 'new_password invalide (min 8, 1 maj, 1 min, 1 chiffre)' });
      }

      const hash = await bcrypt.hash(newPassword, 12);
      await User.updateOne({ _id: user._id }, { $set: { password_hash: hash } });

      await UserSession.updateMany(
        { user: user._id, is_active: true },
        { $set: { is_active: false, logout_time: new Date(), revoked_reason: 'password_reset' } }
      );
      if (typeof requireAuth.invalidateUserSessionsCache === 'function') {
        requireAuth.invalidateUserSessionsCache(user._id);
      }

      await History.create({
        action_type: 'user_update',
        user: req.user.id,
        source: 'ui',
        description: 'Mot de passe reinitialise (admin)',
        actor_role: req.user.role,
        tags: ['user', 'password_reset'],
        context: {
          target_user_id: String(user._id),
          target_email: user.email,
          target_username: user.username,
          reason,
        },
      });

      await logSecurityEvent({
        event_type: 'user_password_reset',
        user: req.user.id,
        role: req.user.role,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || '',
        success: true,
        details: `Reset password for user ${user._id}. reason=${reason}`,
      });

      const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
      const exposeTempPassword = !isProd || String(process.env.EXPOSE_TEMP_PASSWORD || '').toLowerCase() === 'true';
      return res.json({
        message: 'Mot de passe reinitialise',
        user: { id: user._id },
        ...(exposeTempPassword ? { new_password: newPassword } : {}),
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to reset password', details: err.message });
    }
  }
);

// PATCH /api/users/:id/demandeur-profile
// Body: { demandeur_profile: "bureautique" | "menage" | "petrole" }
router.patch(
  '/:id/demandeur-profile',
  requireAnyPermission(PERMISSIONS.USER_PROFILE_UPDATE, PERMISSIONS.USER_MANAGE),
  strictBody(['demandeur_profile']),
  async (req, res) => {
    try {
      const actorRole = getActorRole(req);
      const demandeurProfile = String(req.body?.demandeur_profile || '').trim().toLowerCase();
      const allowed = new Set(['bureautique', 'menage', 'petrole']);
      if (!allowed.has(demandeurProfile)) {
        return res.status(400).json({
          error: 'demandeur_profile invalide',
          code: ERROR_CODES.VALIDATION_FAILED,
          reason: 'Valeurs autorisees: bureautique, menage, petrole',
        });
      }

      const user = await User.findById(req.params.id).select('_id role username demandeur_profile').lean();
      if (!user) {
        return res.status(404).json({
          error: 'Utilisateur introuvable',
          code: ERROR_CODES.USER_NOT_FOUND,
          reason: 'Aucun utilisateur ne correspond a cet identifiant.',
        });
      }
      if (user.role !== 'demandeur') {
        return res.status(400).json({
          error: 'Operation interdite',
          code: ERROR_CODES.VALIDATION_FAILED,
          reason: 'Le profil catalogue ne concerne que les demandeurs.',
        });
      }
      if (!canManageTargetRole(actorRole, normalizeRole(user.role))) {
        return res.status(403).json({ error: 'Accès refusé pour ce rôle (cible)' });
      }

      const before = user.demandeur_profile || 'bureautique';
      await User.updateOne({ _id: user._id }, { $set: { demandeur_profile: demandeurProfile } });

      await History.create({
        action_type: 'user_update',
        user: req.user.id,
        source: 'ui',
        description: `Profil catalogue modifie (${before} -> ${demandeurProfile})`,
        actor_role: req.user.role,
        tags: ['user', 'demandeur_profile'],
        context: {
          target_user_id: String(user._id),
          target_username: user.username,
          before,
          after: demandeurProfile,
        },
      });

      return res.json({
        message: 'Profil catalogue mis a jour',
        user: { id: user._id, demandeur_profile: demandeurProfile },
      });
    } catch (err) {
      return res.status(500).json({
        error: 'Failed to update demandeur_profile',
        code: ERROR_CODES.INTERNAL_ERROR,
        reason: 'Erreur serveur durant la mise a jour du profil.',
        details: err.message,
      });
    }
  }
);

module.exports = router;
