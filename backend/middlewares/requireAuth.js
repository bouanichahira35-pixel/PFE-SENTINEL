const jwt = require('jsonwebtoken');
const { normalizeRole } = require('../constants/roles');
const UserSession = require('../models/UserSession');
const { logSecurityEvent } = require('../services/securityAuditService');

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

    const session = await UserSession.findOne({
      session_id: payload.sid,
      user: payload.id,
      is_active: true,
      expires_at: { $gt: new Date() },
    }).select('_id session_id');

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

    req.user = {
      id: payload.id,
      role: normalizeRole(payload.role),
      username: payload.username,
      sessionId: payload.sid,
    };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide ou expire' });
  }
}

module.exports = requireAuth;
