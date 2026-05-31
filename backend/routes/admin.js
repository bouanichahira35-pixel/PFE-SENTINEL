const router = require('express').Router();
const requireAuth = require('../middlewares/requireAuth');
const User = require('../models/User');
const UserSession = require('../models/UserSession');
const SecurityAudit = require('../models/SecurityAudit');
const History = require('../models/History');
const AppSetting = require('../models/AppSetting');
const Notification = require('../models/Notification');
const strictBody = require('../middlewares/strictBody');
const { summarize } = require('../services/perfMonitorService');
const mongoose = require('../db');
const { SUPPLIER_EMAIL_POLICY_KEY, SUPPLIER_EMAIL_POLICY_DEFAULT } = require('../services/purchaseOrderSupplierMailService');
const {
  getRbacPolicy,
  setRbacPolicy,
  getDefaultPolicy,
  getRolePermissions,
  TECHNICAL_ONLY_FOR_ADMIN,
} = require('../services/rbacPolicyService');
const { PERMISSIONS, PERMISSION_META } = require('../constants/permissions');
const { logSecurityEvent } = require('../services/securityAuditService');
const { isSafeText } = require('../utils/validation');
const { enqueueMail } = require('../services/mailQueueService');
const { getUserPreferences, canSendNotificationEmail } = require('../services/userPreferencesService');

const SAFE_USER_FIELDS = 'username email role status telephone';

function ensureAdmin(req, res) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role !== 'admin') {
    res.status(403).json({ error: 'Acces refuse (admin uniquement)' });
    return false;
  }
  return true;
}

async function getSettingValue(key, fallback = null) {
  const item = await AppSetting.findOne({ setting_key: key }).lean();
  return item?.setting_value ?? fallback;
}

async function setSettingValue(key, value, userId = null) {
  return AppSetting.findOneAndUpdate(
    { setting_key: key },
    { $set: { setting_value: value, updated_by: userId || undefined } },
    { returnDocument: 'after', upsert: true }
  );
}

function clampAdminWindowDays(value) {
  const raw = Number(value || 1);
  if (!Number.isFinite(raw)) return 1;
  if (raw <= 1) return 1;
  if (raw <= 7) return 7;
  return 30;
}

function dayKey(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function buildDailySeries(rows, days) {
  const byDay = new Map();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - Math.max(0, days - 1));

  for (let i = 0; i < days; i += 1) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    byDay.set(dayKey(d), {
      date: dayKey(d),
      connexions: 0,
      erreurs: 0,
      securite: 0,
    });
  }

  for (const row of rows || []) {
    const key = dayKey(row?.date_event || row?.createdAt);
    if (!key || !byDay.has(key)) continue;
    const item = byDay.get(key);
    if (row.event_type === 'login_success') item.connexions += 1;
    if (row.event_type === 'login_failed' || row.success === false) item.erreurs += 1;
    item.securite += 1;
  }

  return Array.from(byDay.values());
}

function scorePart(label, score, detail) {
  const n = Math.max(0, Math.min(100, Math.round(Number(score || 0))));
  return { label, score: n, detail };
}

// Mini-console Support utilisateurs (tickets)
router.use('/support', require('./admin-support'));

// GET /api/admin/overview
// Console technique: sessions, comptes, audit securite.
router.get('/overview', requireAuth, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const now = new Date();
    const windowDays = clampAdminWindowDays(req.query?.days);
    const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

    const [activeSessions, blockedUsers, activeUsers, usersTotal, lastFailures, lastEvents, chartEvents] = await Promise.all([
      UserSession.countDocuments({ is_active: true, expires_at: { $gt: now } }),
      User.countDocuments({ status: 'blocked' }),
      User.countDocuments({ status: 'active' }),
      User.countDocuments({}),
      SecurityAudit.find({ event_type: 'login_failed', date_event: { $gte: since } })
        .sort({ date_event: -1, createdAt: -1 })
        .limit(12)
        .select('date_event email role ip_address user_agent success details')
        .lean(),
      SecurityAudit.find({ date_event: { $gte: since } })
        .sort({ date_event: -1, createdAt: -1 })
        .limit(20)
        .select('date_event event_type email role ip_address success details')
        .lean(),
      SecurityAudit.find({ date_event: { $gte: since } })
        .sort({ date_event: 1, createdAt: 1 })
        .select('date_event event_type success')
        .lean(),
    ]);

    // Aggregate counts by event_type within the selected admin window.
    const agg = await SecurityAudit.aggregate([
      { $match: { date_event: { $gte: since } } },
      {
        $group: {
          _id: { type: '$event_type', success: '$success' },
          count: { $sum: 1 },
        },
      },
    ]);

    const auditStats = {};
    for (const row of agg || []) {
      const type = String(row?._id?.type || 'unknown');
      const success = Boolean(row?._id?.success);
      if (!auditStats[type]) auditStats[type] = { success: 0, failed: 0 };
      if (success) auditStats[type].success += Number(row.count || 0);
      else auditStats[type].failed += Number(row.count || 0);
    }

    // Simple health score (0-100) for the Admin console.
    // Explainable scoring based on DB + security signals.
    const mongoOk = mongoose?.connection?.readyState === 1;
    const failedLogins24h = lastFailures.length;
    const availabilityScore = mongoOk ? 100 : 20;
    const securityScore = Math.max(0, 100 - Math.min(45, failedLogins24h * 4) - Math.min(25, Number(blockedUsers || 0) * 2));
    const accessScore = Math.max(0, 100 - Math.min(25, Number(blockedUsers || 0) * 3));
    const activityScore = Number(activeSessions || 0) > 40 ? 80 : 100;
    let healthScore = Math.round((availabilityScore * 0.35) + (securityScore * 0.35) + (accessScore * 0.2) + (activityScore * 0.1));
    healthScore = Math.max(0, Math.min(100, healthScore));

    return res.json({
      ok: true,
      generated_at: now.toISOString(),
      window: {
        days: windowDays,
        since: since.toISOString(),
      },
      system_health: {
        score: healthScore,
        breakdown: [
          scorePart('Disponibilite', availabilityScore, mongoOk ? 'Base de donnees joignable' : 'Base de donnees indisponible'),
          scorePart('Securite', securityScore, `${failedLogins24h} connexion(s) echouee(s)`),
          scorePart('Acces', accessScore, `${Number(blockedUsers || 0)} compte(s) bloque(s)`),
          scorePart('Activite', activityScore, `${Number(activeSessions || 0)} session(s) active(s)`),
        ],
        signals: {
          mongodb_ok: mongoOk,
          failed_logins_24h: failedLogins24h,
          blocked_users: Number(blockedUsers || 0),
          active_sessions: Number(activeSessions || 0),
        },
      },
      users: {
        total: usersTotal,
        active: activeUsers,
        blocked: blockedUsers,
      },
      sessions: {
        active: activeSessions,
      },
      security_audit: {
        since: since.toISOString(),
        stats: auditStats,
        daily_series: buildDailySeries(chartEvents, windowDays),
        recent_events: Array.isArray(lastEvents) ? lastEvents : [],
        recent_login_failures: Array.isArray(lastFailures) ? lastFailures : [],
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch admin overview', details: err.message });
  }
});

// GET /api/admin/audit-history
// Admin console audit feed. It deliberately uses admin role access instead of
// the broader HISTORY_READ permission because this page is part of the admin shell.
router.get('/audit-history', requireAuth, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 200)));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.action_type) filter.action_type = req.query.action_type;
    if (req.query.user) filter.user = req.query.user;
    if (req.query.product) filter.product = req.query.product;
    if (req.query.request) filter.request = req.query.request;
    if (req.query.source) filter.source = req.query.source;
    if (req.query.status_after) filter.status_after = req.query.status_after;
    if (req.query.correlation_id) filter.correlation_id = req.query.correlation_id;

    const [items, total] = await Promise.all([
      History.find(filter)
        .sort({ date_action: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user', SAFE_USER_FIELDS)
        .populate('product')
        .populate('request')
        .lean(),
      History.countDocuments(filter),
    ]);

    return res.json({
      ok: true,
      page,
      limit,
      total,
      total_pages: Math.max(1, Math.ceil(total / limit)),
      items,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch admin audit history' });
  }
});

// POST /api/admin/support-request
// Responsable -> Admin IT (ticket simple)
router.post('/support-request', requireAuth, strictBody(['subject', 'message', 'priority']), async (req, res) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    if (role !== 'responsable') {
      return res.status(403).json({ error: 'Acces refuse (responsable uniquement)' });
    }

    const subject = String(req.body?.subject || '').trim();
    const message = String(req.body?.message || '').trim();
    const priority = String(req.body?.priority || 'normal').trim().toLowerCase();

    if (!isSafeText(subject, { min: 3, max: 120 })) {
      return res.status(400).json({ error: 'Objet invalide (3-120)' });
    }
    if (!isSafeText(message, { min: 6, max: 800 })) {
      return res.status(400).json({ error: 'Message invalide (6-800)' });
    }
    if (!['normal', 'urgent', 'critical'].includes(priority)) {
      return res.status(400).json({ error: 'Priorite invalide' });
    }

    const admins = await User.find({ role: 'admin', status: 'active' })
      .select('_id email username role')
      .lean();

    if (!admins.length) {
      return res.status(409).json({ error: 'Aucun administrateur IT actif' });
    }

    const title = `Demande IT (${priority.toUpperCase()}): ${subject}`;
    const body = `Responsable: ${req.user.username}\nMessage: ${message}`;

    await Notification.insertMany(
      admins.map((a) => ({
        user: a._id,
        title,
        message: body,
        type: priority === 'critical' ? 'alert' : priority === 'urgent' ? 'warning' : 'info',
        is_read: false,
      }))
    );

    for (const a of admins) {
      if (!a.email) continue;
      try {
        const prefs = await getUserPreferences(a._id);
        if (!canSendNotificationEmail(prefs, 'generic')) continue;
        await enqueueMail({
          kind: 'support_request',
          role: a.role,
          to: a.email,
          subject: title,
          text: body,
          html: `<p><b>${title}</b></p><p>${body.replace(/\n/g, '<br/>')}</p>`,
          job_id: `support_req_${a._id}_${Date.now()}`,
        });
      } catch {
        // keep resilient
      }
    }

    await logSecurityEvent({
      event_type: 'support_request',
      user: req.user.id,
      role: req.user.role,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'] || '',
      success: true,
      details: `Support request sent to ${admins.length} admin(s)`,
      after: { subject, priority },
    });

    return res.json({ ok: true, delivered_to: admins.length });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to send support request', details: err.message });
  }
});

// GET /api/admin/settings
// Parametrage technique (stocke en base via AppSetting).
router.get('/settings', requireAuth, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const maintenance = await getSettingValue('maintenance_mode', { enabled: false, message: '' });
    const aiGovernance = await getSettingValue('ai_governance_v2', {
      min_training_interval_minutes: 360,
      auto_training_enabled: true,
      auto_training_every_minutes: 360,
      max_versions_kept: 20,
    });
    const runtimeLimits = await getSettingValue('runtime_limits_hint', {
      auth_max_per_15min: Number(process.env.RATE_LIMIT_AUTH_MAX || 100),
      ai_max_per_min: Number(process.env.RATE_LIMIT_AI_MAX || 60),
      chat_max_per_min: Number(process.env.RATE_LIMIT_CHAT_MAX || 180),
      note: 'Ces limites sont appliquees au demarrage (env). Modifier ici = indicatif / necessite redemarrage si vous voulez les appliquer via env.',
    });

    const supplierEmailPolicy = await getSettingValue(SUPPLIER_EMAIL_POLICY_KEY, SUPPLIER_EMAIL_POLICY_DEFAULT);

    return res.json({
      ok: true,
      maintenance,
      ai_governance: aiGovernance,
      runtime_limits_hint: runtimeLimits,
      supplier_email_policy: supplierEmailPolicy,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch admin settings', details: err.message });
  }
});

// PATCH /api/admin/settings
router.patch(
  '/settings',
  requireAuth,
  strictBody(['maintenance', 'ai_governance', 'runtime_limits_hint', 'supplier_email_policy']),
  async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const nextMaintenanceRaw = req.body?.maintenance;
      if (nextMaintenanceRaw && typeof nextMaintenanceRaw === 'object') {
        const enabled = Boolean(nextMaintenanceRaw.enabled);
        const message = String(nextMaintenanceRaw.message || '').slice(0, 220);
        await setSettingValue('maintenance_mode', { enabled, message }, req.user.id);
      }

      const nextGovRaw = req.body?.ai_governance;
      if (nextGovRaw && typeof nextGovRaw === 'object') {
        const payload = {
          min_training_interval_minutes: Math.max(5, Math.floor(Number(nextGovRaw.min_training_interval_minutes || 360))),
          auto_training_enabled: nextGovRaw.auto_training_enabled !== false,
          auto_training_every_minutes: Math.max(30, Math.floor(Number(nextGovRaw.auto_training_every_minutes || 360))),
          max_versions_kept: Math.max(5, Math.floor(Number(nextGovRaw.max_versions_kept || 20))),
        };
        await setSettingValue('ai_governance_v2', payload, req.user.id);
      }

      const nextLimits = req.body?.runtime_limits_hint;
      if (nextLimits && typeof nextLimits === 'object') {
        const payload = {
          auth_max_per_15min: Math.max(10, Math.floor(Number(nextLimits.auth_max_per_15min || process.env.RATE_LIMIT_AUTH_MAX || 100))),
          ai_max_per_min: Math.max(5, Math.floor(Number(nextLimits.ai_max_per_min || process.env.RATE_LIMIT_AI_MAX || 60))),
          chat_max_per_min: Math.max(10, Math.floor(Number(nextLimits.chat_max_per_min || process.env.RATE_LIMIT_CHAT_MAX || 180))),
          note: String(nextLimits.note || '').slice(0, 240),
        };
        await setSettingValue('runtime_limits_hint', payload, req.user.id);
      }

      const nextSupplierEmailPolicy = req.body?.supplier_email_policy;
      if (nextSupplierEmailPolicy && typeof nextSupplierEmailPolicy === 'object') {
        const payload = {
          enabled: nextSupplierEmailPolicy.enabled !== false,
          send_on_create_ordered: nextSupplierEmailPolicy.send_on_create_ordered !== false,
          send_on_update_to_ordered: nextSupplierEmailPolicy.send_on_update_to_ordered !== false,
          include_lines: nextSupplierEmailPolicy.include_lines !== false,
          reminders_enabled: nextSupplierEmailPolicy.reminders_enabled !== false,
          reminder_j1_enabled: nextSupplierEmailPolicy.reminder_j1_enabled !== false,
          overdue_enabled: nextSupplierEmailPolicy.overdue_enabled !== false,
          reminder_j1_window_hours: Math.max(6, Math.min(168, Math.floor(Number(nextSupplierEmailPolicy.reminder_j1_window_hours || 24)))),
          overdue_repeat_hours: Math.max(6, Math.min(168, Math.floor(Number(nextSupplierEmailPolicy.overdue_repeat_hours || 24)))),
          ack_reminders_enabled: nextSupplierEmailPolicy.ack_reminders_enabled !== false,
          ack_sla_hours: Math.max(6, Math.min(168, Math.floor(Number(nextSupplierEmailPolicy.ack_sla_hours || 24)))),
          ack_repeat_hours: Math.max(6, Math.min(168, Math.floor(Number(nextSupplierEmailPolicy.ack_repeat_hours || 24)))),
        };
        await setSettingValue(SUPPLIER_EMAIL_POLICY_KEY, payload, req.user.id);
      }

      const [maintenance, aiGovernance, runtimeLimits] = await Promise.all([
        getSettingValue('maintenance_mode', { enabled: false, message: '' }),
        getSettingValue('ai_governance_v2', null),
        getSettingValue('runtime_limits_hint', null),
      ]);
      const supplierEmailPolicy = await getSettingValue(SUPPLIER_EMAIL_POLICY_KEY, SUPPLIER_EMAIL_POLICY_DEFAULT);

      return res.json({
        ok: true,
        maintenance,
        ai_governance: aiGovernance,
        runtime_limits_hint: runtimeLimits,
        supplier_email_policy: supplierEmailPolicy,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to update admin settings', details: err.message });
    }
  }
);

// GET /api/admin/perf
// Mini centre d'incidents: routes lentes + routes en erreur (fenetre glissante).
router.get('/perf', requireAuth, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;
    const windowMs = Number(req.query?.window_ms || 15 * 60 * 1000);
    const limit = Number(req.query?.limit || 8);
    return res.json(summarize({ window_ms: windowMs, limit }));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch perf summary', details: err.message });
  }
});

// GET /api/admin/rbac
// UI: matrice rôles/permissions (policy stockée en base).
router.get('/rbac', requireAuth, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;
    const [policy, defaults] = await Promise.all([getRbacPolicy(), getDefaultPolicy()]);
    return res.json({
      ok: true,
      policy,
      defaults,
      permissions: Object.values(PERMISSIONS || {}).sort(),
      permission_meta: PERMISSION_META || {},
      admin_guard: {
        technical_only_permissions: Array.from(TECHNICAL_ONLY_FOR_ADMIN.values()).sort(),
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch RBAC policy', details: err.message });
  }
});

// GET /api/admin/rbac/roles
// Liste des rôles + nombre d'utilisateurs (pour UI RBAC 3 panneaux).
router.get('/rbac/roles', requireAuth, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const defaults = getDefaultPolicy();
    const roles = Object.keys(defaults?.role_permissions || {}).sort();

    const counts = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]);
    const byRole = new Map(counts.map((x) => [String(x._id || '').toLowerCase(), Number(x.count || 0)]));

    const roleLabels = {
      admin: 'Admin',
      responsable: 'Responsable',
      magasinier: 'Magasinier',
      demandeur: 'Demandeur',
    };

    return res.json({
      ok: true,
      roles: roles.map((id) => ({
        id,
        label: roleLabels[id] || id,
        users_count: byRole.get(id) || 0,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch roles', details: err.message });
  }
});

// GET /api/admin/rbac/roles/:roleId/available-permissions
// Retourne les permissions possibles pour un rôle (politique RBAC), + meta (label/area).
router.get('/rbac/roles/:roleId/available-permissions', requireAuth, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const roleId = String(req.params.roleId || '').trim().toLowerCase();
    const defaults = getDefaultPolicy();
    if (!defaults?.role_permissions?.[roleId]) {
      return res.status(404).json({ error: 'Role inconnu' });
    }

    const set = await getRolePermissions(roleId);
    const permissions = Array.from((set && typeof set.values === 'function') ? set.values() : []).sort();

    const permission_meta = {};
    for (const p of permissions) {
      const meta = PERMISSION_META?.[p];
      if (!meta) continue;
      permission_meta[p] = meta;
    }

    return res.json({ ok: true, roleId, permissions, permission_meta });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch available permissions', details: err.message });
  }
});

// PATCH /api/admin/rbac
router.patch(
  '/rbac',
  requireAuth,
  strictBody(['role_permissions']),
  async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;
      const next = await setRbacPolicy(req.body, req.user.id);
      await logSecurityEvent({
        event_type: 'rbac_policy_updated',
        user: req.user.id,
        role: req.user.role,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || '',
        success: true,
        details: 'RBAC policy updated by admin',
        after: { policy: next },
      });
      return res.json({ ok: true, policy: next });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to update RBAC policy', details: err.message });
    }
  }
);

// GET /api/admin/sessions
// Liste des sessions actives (monitoring IT).
router.get('/sessions', requireAuth, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;
    const limit = Math.max(5, Math.min(200, Number(req.query?.limit || 40)));
    const now = new Date();
    const items = await UserSession.find({ is_active: true, expires_at: { $gt: now } })
      .sort({ last_activity_at: -1, updatedAt: -1 })
      .limit(limit)
      .populate('user', 'username email role status')
      .select('user session_id ip_address user_agent login_time last_activity_at expires_at is_active revoked_reason')
      .lean();
    const count = await UserSession.countDocuments({ is_active: true, expires_at: { $gt: now } });
    return res.json({ ok: true, count, items: Array.isArray(items) ? items : [] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to list sessions', details: err.message });
  }
});

// POST /api/admin/sessions/:id/revoke
router.post('/sessions/:id/revoke', requireAuth, strictBody(['reason']), async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'session id invalide' });

    const reason = String(req.body?.reason || '').slice(0, 140).trim();
    if (!isSafeText(reason, { min: 5, max: 140 })) {
      return res.status(400).json({
        error: 'Motif obligatoire',
        details: 'Le motif de revocation doit contenir entre 5 et 140 caracteres.',
      });
    }
    const now = new Date();

    const session = await UserSession.findById(id).populate('user', 'username email role').lean();
    if (!session) return res.status(404).json({ error: 'Session introuvable' });

    await UserSession.updateOne(
      { _id: id, is_active: true },
      { $set: { is_active: false, logout_time: now, revoked_reason: reason } }
    );
    if (typeof requireAuth.invalidateSessionCache === 'function') {
      requireAuth.invalidateSessionCache(session.session_id, session?.user?._id);
    }

    await logSecurityEvent({
      event_type: 'session_revoked',
      user: req.user.id,
      role: req.user.role,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'] || '',
      success: true,
      details: `Session revoked by admin (${reason})`,
      after: {
        revoked_session_id: id,
        target_user_email: session?.user?.email || null,
        target_user_role: session?.user?.role || null,
      },
    });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to revoke session', details: err.message });
  }
});

module.exports = router;
