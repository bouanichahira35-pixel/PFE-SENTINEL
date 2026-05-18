const jwt = require('jsonwebtoken');
const { normalizeRole, isTechnicalRole } = require('../constants/roles');
const UserSession = require('../models/UserSession');
const User = require('../models/User');
const { logSecurityEvent } = require('../services/securityAuditService');
const { getSessionInactivityMs, formatInactivityMessage } = require('../utils/sessionPolicy');

const SESSION_INACTIVITY_MS = getSessionInactivityMs();
const SESSION_TOUCH_INTERVAL_MS = Math.max(
  1000,
  Number(process.env.AUTH_SESSION_TOUCH_INTERVAL_MS || 30 * 1000)
);
const USER_CACHE_TTL_MS = Math.max(
  1000,
  Number(process.env.AUTH_USER_CACHE_TTL_MS || 60 * 1000)
);
const USER_CACHE_MAX = Math.max(50, Number(process.env.AUTH_USER_CACHE_MAX || 500));

const userCache = new Map();

function readUserCache(userId, nowMsValue) {
  const key = String(userId || '');
  if (!key) return null;
  const item = userCache.get(key);
  if (!item) return null;
  if (nowMsValue - item.checked_at_ms > USER_CACHE_TTL_MS) return null;
  // Refresh LRU order
  userCache.delete(key);
  userCache.set(key, item);
  return item.user || null;
}

function writeUserCache(userId, user, nowMsValue) {
  const key = String(userId || '');
  if (!key || !user) return;
  userCache.set(key, {
    checked_at_ms: nowMsValue,
    user,
  });
  while (userCache.size > USER_CACHE_MAX) {
    const oldestKey = userCache.keys().next().value;
    if (!oldestKey) break;
    userCache.delete(oldestKey);
  }
}

const ACTIVE_STATUS_ALIASES = new Set(['active', 'actif', 'enabled', 'enable', 'true', '1']);
const BLOCKED_STATUS_ALIASES = new Set(['blocked', 'bloque', 'disabled', 'inactive', 'false', '0']);

function normalizeUserStatus(status) {
  const key = String(status ?? '').trim().toLowerCase();
  if (!key) return 'active';
  if (ACTIVE_STATUS_ALIASES.has(key)) return 'active';
  if (BLOCKED_STATUS_ALIASES.has(key)) return 'blocked';
  return key;
}

function isUserActive(status) {
  return normalizeUserStatus(status) === 'active';
}

function getLastActivityDate(session) {
  return session?.last_activity_at || session?.updatedAt || session?.login_time || null;
}

function isSessionInactive(session, now) {
  const lastActivity = getLastActivityDate(session);
  if (!lastActivity) return true;
  return now.getTime() - new Date(lastActivity).getTime() >= SESSION_INACTIVITY_MS;
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentification requise' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (!payload.sid) {
      await logSecurityEvent({
        event_type: 'token_rejected',
        user: payload.id,
        role: payload.role,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || '',
        success: false,
        details: 'Token sans session id',
      });
      return res.status(401).json({ error: 'Token session invalide' });
    }

    const now = new Date();
    const nowMsValue = now.getTime();
    const session = await UserSession.findOne({
      session_id: payload.sid,
      user: payload.id,
      is_active: true,
      expires_at: { $gt: now },
    })
      .select('_id session_id login_time updatedAt last_activity_at')
      .lean();

    if (!session) {
      await logSecurityEvent({
        event_type: 'token_rejected',
        user: payload.id,
        role: payload.role,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || '',
        success: false,
        details: 'Session introuvable ou inactive',
      });
      return res.status(401).json({ error: 'Session invalide ou expiree' });
    }

    if (isSessionInactive(session, now)) {
      await UserSession.updateOne(
        { _id: session._id, is_active: true },
        {
          $set: {
            is_active: false,
            logout_time: now,
            revoked_reason: 'inactive_timeout',
          },
        }
      );

      await logSecurityEvent({
        event_type: 'token_rejected',
        user: payload.id,
        role: payload.role,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || '',
        success: false,
        details: 'Session expiree apres inactivite',
      });
      return res.status(401).json({ error: formatInactivityMessage(SESSION_INACTIVITY_MS) });
    }

    const lastActivity = getLastActivityDate(session);
    const lastActivityMs = lastActivity ? new Date(lastActivity).getTime() : 0;
    const shouldTouchSession =
      !lastActivityMs || (nowMsValue - lastActivityMs) >= SESSION_TOUCH_INTERVAL_MS;

    if (shouldTouchSession) {
      UserSession.updateOne(
        { _id: session._id, is_active: true },
        { $set: { last_activity_at: now } }
      ).catch(() => {});
    }

    let user = readUserCache(payload.id, nowMsValue);
    let userFromDb = false;

    if (!user) {
      userFromDb = true;
      user = await User.findById(payload.id)
        .select('_id role status username demandeur_profile service_direction')
        .lean();
      if (user) writeUserCache(payload.id, user, nowMsValue);
    }

    const normalizedRole = normalizeRole(user?.role || payload.role);
    const normalizedStatus = user ? normalizeUserStatus(user?.status) : 'blocked';

    if (user && userFromDb) {
      const canonicalPatch = {};
      if (isTechnicalRole(normalizedRole) && normalizedRole !== user.role) {
        canonicalPatch.role = normalizedRole;
      }
      if (['active', 'blocked'].includes(normalizedStatus) && normalizedStatus !== user.status) {
        canonicalPatch.status = normalizedStatus;
      }
      if (Object.keys(canonicalPatch).length > 0) {
        User.updateOne({ _id: user._id }, { $set: canonicalPatch }).catch(() => {});
      }
    }

    if (!user || !isTechnicalRole(normalizedRole) || !isUserActive(normalizedStatus)) {
      await UserSession.updateMany(
        { user: payload.id, is_active: true },
        {
          $set: {
            is_active: false,
            logout_time: new Date(),
            revoked_reason: 'account_blocked_or_missing',
          },
        }
      );
      await logSecurityEvent({
        event_type: 'token_rejected',
        user: payload.id,
        role: payload.role,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || '',
        success: false,
        details: 'Compte bloque, role invalide ou introuvable',
      });
      return res.status(403).json({ error: 'Compte bloque' });
    }

    req.user = {
      id: String(user._id),
      role: normalizedRole,
      username: user.username || payload.username,
      sessionId: payload.sid,
      demandeur_profile: user.demandeur_profile || payload.demandeur_profile || 'bureautique',
      service_direction: user.service_direction || payload.service_direction || '',
    };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide ou expire' });
  }
}

module.exports = requireAuth;
