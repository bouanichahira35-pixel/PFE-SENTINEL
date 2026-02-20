const jwt = require('jsonwebtoken');
const { normalizeRole } = require('../constants/roles');
const UserSession = require('../models/UserSession');
const User = require('../models/User');
const { logSecurityEvent } = require('../services/securityAuditService');

const SESSION_INACTIVITY_MS = Math.max(
  60 * 1000,
  Number(process.env.SESSION_INACTIVITY_MS || 15 * 60 * 1000)
);

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
    const session = await UserSession.findOne({
      session_id: payload.sid,
      user: payload.id,
      is_active: true,
      expires_at: { $gt: now },
    }).select('_id session_id login_time updatedAt last_activity_at');

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
      return res.status(401).json({ error: 'Session expiree apres 15 min d inactivite' });
    }

    await UserSession.updateOne(
      { _id: session._id, is_active: true },
      { $set: { last_activity_at: now } }
    );

    const user = await User.findById(payload.id).select('_id role status username');
    if (!user || user.status !== 'active') {
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
        details: 'Compte bloque ou introuvable',
      });
      return res.status(403).json({ error: 'Compte bloque' });
    }

    req.user = {
      id: String(user._id),
      role: normalizeRole(user.role),
      username: user.username || payload.username,
      sessionId: payload.sid,
    };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide ou expire' });
  }
}

module.exports = requireAuth;
