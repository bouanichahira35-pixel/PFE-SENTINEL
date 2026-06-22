// BLOC 1 - Role du fichier.
// Ce fichier controle les requetes avant les routes pour le sujet requireAuth.
// Point de vigilance: modifier avec prudence car ce fichier peut etre importe par plusieurs modules.

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
const AUTH_CONTEXT_CACHE_TTL_MS = Math.max(
  0,
  Math.min(15 * 1000, Number(process.env.AUTH_CONTEXT_CACHE_TTL_MS || 5 * 1000))
);
const AUTH_CONTEXT_CACHE_MAX = Math.max(50, Number(process.env.AUTH_CONTEXT_CACHE_MAX || 1000));

const userCache = new Map();
const authContextCache = new Map();

function getAuthContextCacheKey(userId, sessionId) {
  const uid = String(userId || '');
  const sid = String(sessionId || '');
  if (!uid || !sid) return '';
  return `${uid}:${sid}`;
}

function readAuthContextCache(userId, sessionId, nowMsValue) {
  if (!AUTH_CONTEXT_CACHE_TTL_MS) return null;

  const key = getAuthContextCacheKey(userId, sessionId);
  if (!key) return null;

  const item = authContextCache.get(key);
  if (!item) return null;
  if (nowMsValue - item.checked_at_ms > AUTH_CONTEXT_CACHE_TTL_MS) {
    authContextCache.delete(key);
    return null;
  }
  if (item.expires_at_ms && item.expires_at_ms <= nowMsValue) {
    authContextCache.delete(key);
    return null;
  }

  authContextCache.delete(key);
  authContextCache.set(key, item);
  return {
    session: item.session,
    user: item.user,
  };
}

function writeAuthContextCache(userId, sessionId, session, user, nowMsValue) {
  if (!AUTH_CONTEXT_CACHE_TTL_MS) return;
  const key = getAuthContextCacheKey(userId, sessionId);
  if (!key || !session || !user) return;

  const expiresAt = session?.expires_at ? new Date(session.expires_at).getTime() : 0;
  authContextCache.set(key, {
    checked_at_ms: nowMsValue,
    expires_at_ms: Number.isFinite(expiresAt) ? expiresAt : 0,
    session,
    user,
  });

  while (authContextCache.size > AUTH_CONTEXT_CACHE_MAX) {
    const oldestKey = authContextCache.keys().next().value;
    if (!oldestKey) break;
    authContextCache.delete(oldestKey);
  }
}

function invalidateSessionCache(sessionId, userId = null) {
  const sid = String(sessionId || '');
  const uid = userId ? String(userId) : '';
  if (!sid) return;

  if (uid) {
    authContextCache.delete(getAuthContextCacheKey(uid, sid));
    return;
  }

  for (const key of authContextCache.keys()) {
    if (key.endsWith(`:${sid}`)) authContextCache.delete(key);
  }
}

function invalidateUserSessionsCache(userId) {
  const uid = String(userId || '');
  if (!uid) return;
  userCache.delete(uid);
  for (const key of authContextCache.keys()) {
    if (key.startsWith(`${uid}:`)) authContextCache.delete(key);
  }
}

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
      logSecurityEvent({
        event_type: 'token_rejected',
        user: payload.id,
        role: payload.role,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || '',
        success: false,
        details: 'Token sans session id',
      }).catch(() => {});
      return res.status(401).json({ error: 'Token session invalide' });
    }

    const now = new Date();
    const nowMsValue = now.getTime();
    const cachedContext = readAuthContextCache(payload.id, payload.sid, nowMsValue);
    let session = cachedContext?.session || null;
    let user = cachedContext?.user || null;
    let userFromDb = false;

    if (!session) {
      session = await UserSession.findOne({
        session_id: payload.sid,
        user: payload.id,
        is_active: true,
        expires_at: { $gt: now },
      })
        .select('_id session_id login_time updatedAt last_activity_at expires_at')
        .lean();
    }

    if (!session) {
      invalidateSessionCache(payload.sid, payload.id);
      logSecurityEvent({
        event_type: 'token_rejected',
        user: payload.id,
        role: payload.role,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || '',
        success: false,
        details: 'Session introuvable ou inactive',
      }).catch(() => {});
      return res.status(401).json({ error: 'Session invalide ou expiree' });
    }

    if (isSessionInactive(session, now)) {
      invalidateSessionCache(payload.sid, payload.id);
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

      logSecurityEvent({
        event_type: 'token_rejected',
        user: payload.id,
        role: payload.role,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || '',
        success: false,
        details: 'Session expiree apres inactivite',
      }).catch(() => {});
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

    if (!user) {
      user = readUserCache(payload.id, nowMsValue);

      if (!user) {
        userFromDb = true;
        user = await User.findById(payload.id)
          .select('_id role status username demandeur_profile service_direction rbac_permissions')
          .lean();
        if (user) writeUserCache(payload.id, user, nowMsValue);
      }
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
      invalidateUserSessionsCache(payload.id);
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
      logSecurityEvent({
        event_type: 'token_rejected',
        user: payload.id,
        role: payload.role,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || '',
        success: false,
        details: 'Compte bloque, role invalide ou introuvable',
      }).catch(() => {});
      return res.status(403).json({ error: 'Compte bloque' });
    }

    const sessionForCache = shouldTouchSession
      ? { ...session, last_activity_at: now, updatedAt: now }
      : session;
    writeAuthContextCache(payload.id, payload.sid, sessionForCache, user, nowMsValue);

    req.user = {
      id: String(user._id),
      role: normalizedRole,
      username: user.username || payload.username,
      sessionId: payload.sid,
      demandeur_profile: user.demandeur_profile || payload.demandeur_profile || 'bureautique',
      service_direction: user.service_direction || payload.service_direction || '',
      rbac_permissions: Array.isArray(user.rbac_permissions) ? user.rbac_permissions : null,
    };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide ou expire' });
  }
}

requireAuth.invalidateSessionCache = invalidateSessionCache;
requireAuth.invalidateUserSessionsCache = invalidateUserSessionsCache;

module.exports = requireAuth;
