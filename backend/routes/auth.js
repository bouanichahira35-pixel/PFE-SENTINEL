const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const User = require('../models/User');
const PasswordReset = require('../models/PasswordReset');
const UserSession = require('../models/UserSession');
const { normalizeRole, isTechnicalRole } = require('../constants/roles');
const { logSecurityEvent } = require('../services/securityAuditService');
const { enqueueMail } = require('../services/mailQueueService');
const requireAuth = require('../middlewares/requireAuth');

const RESET_CODE_TTL_MINUTES = Number(process.env.RESET_CODE_TTL_MINUTES || 10);
const RESET_JWT_EXPIRES_IN = process.env.RESET_JWT_EXPIRES_IN || '15m';
// Security policy: application sessions are limited to 15 minutes max.
const JWT_EXPIRES_IN = '15m';
const SESSION_INACTIVITY_MS = Math.max(
  60 * 1000,
  Number(process.env.SESSION_INACTIVITY_MS || 15 * 60 * 1000)
);
const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
const REFRESH_JWT_EXPIRES_IN = process.env.REFRESH_JWT_EXPIRES_IN || '7d';
const SINGLE_SESSION_MODE = String(process.env.SINGLE_SESSION_MODE || 'true') === 'true';

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function isStrongPassword(password) {
  if (typeof password !== 'string') return false;
  if (password.length < 8 || password.length > 64) return false;

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);

  return hasLower && hasUpper && hasDigit;
}

function getLastActivityDate(session) {
  return session?.last_activity_at || session?.updatedAt || session?.login_time || null;
}

function isSessionInactive(session, now) {
  const lastActivity = getLastActivityDate(session);
  if (!lastActivity) return true;
  return now.getTime() - new Date(lastActivity).getTime() >= SESSION_INACTIVITY_MS;
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { identifier, password, role } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ error: 'identifier et password sont obligatoires' });
    }

    const hasRoleFilter = typeof role === 'string' && String(role).trim().length > 0;
    const normalizedRole = hasRoleFilter ? normalizeRole(role) : null;
    if (hasRoleFilter && !isTechnicalRole(normalizedRole)) {
      return res.status(400).json({ error: 'Role invalide' });
    }

    const normalizedIdentifier = String(identifier).trim().toLowerCase();
    const rawIdentifier = String(identifier).trim();
    const ip = req.ip;
    const ua = req.headers['user-agent'] || '';

    const loginQuery = {
      $or: [
        { email: normalizedIdentifier },
        { telephone: rawIdentifier },
        { username: rawIdentifier },
        { username: normalizedIdentifier },
      ],
    };
    if (normalizedRole) {
      loginQuery.role = normalizedRole;
    }

    const candidates = await User.find(loginQuery)
      .select('+password_hash')
      .limit(10);

    if (!candidates.length) {
      await logSecurityEvent({
        event_type: 'login_failed',
        email: normalizedIdentifier,
        role: normalizedRole || undefined,
        ip_address: ip,
        user_agent: ua,
        success: false,
        details: 'Utilisateur introuvable',
      });
      return res.status(401).json({ error: 'Utilisateur introuvable' });
    }

    let user = null;
    for (const candidate of candidates) {
      const passwordOk = await bcrypt.compare(password, candidate.password_hash);
      if (passwordOk) {
        user = candidate;
        break;
      }
    }

    if (!user) {
      const matchedIdentityUser = candidates[0];
      await logSecurityEvent({
        event_type: 'login_failed',
        user: matchedIdentityUser._id,
        email: matchedIdentityUser.email,
        role: matchedIdentityUser.role,
        ip_address: ip,
        user_agent: ua,
        success: false,
        details: 'Mot de passe incorrect',
      });
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }

    if (user.status !== 'active') {
      await logSecurityEvent({
        event_type: 'login_failed',
        user: user._id,
        email: user.email,
        role: user.role,
        ip_address: ip,
        user_agent: ua,
        success: false,
        details: 'Compte bloque',
      });
      return res.status(403).json({ error: 'Compte bloque' });
    }

    user.last_login = new Date();
    await user.save();

    if (SINGLE_SESSION_MODE) {
      await UserSession.updateMany(
        { user: user._id, is_active: true },
        { $set: { is_active: false, logout_time: new Date(), revoked_reason: 'new_login' } }
      );
    }

    const sessionId = randomUUID();
    const accessExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await UserSession.create({
      user: user._id,
      session_id: sessionId,
      device: req.headers['sec-ch-ua-platform'] || 'web',
      ip_address: ip,
      user_agent: ua,
      last_activity_at: new Date(),
      expires_at: refreshExpiresAt,
      is_active: true,
    });

    const token = jwt.sign(
      { id: user._id, role: user.role, username: user.username, sid: sessionId },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    const refreshToken = jwt.sign(
      { id: user._id, role: user.role, username: user.username, sid: sessionId, purpose: 'refresh' },
      process.env.JWT_SECRET,
      { expiresIn: REFRESH_JWT_EXPIRES_IN }
    );

    await logSecurityEvent({
      event_type: 'login_success',
      user: user._id,
      email: user.email,
      role: user.role,
      ip_address: ip,
      user_agent: ua,
      success: true,
      details: `Session ${sessionId}`,
    });

    return res.json({
      token,
      refreshToken,
      session_expires_in: JWT_EXPIRES_IN,
      session_id: sessionId,
      access_expires_at: accessExpiresAt,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        email: user.email,
        telephone: user.telephone,
        image_profile: user.image_profile || null
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/forgot-password/request
router.post('/forgot-password/request', async (req, res) => {
  try {
    const { email, role } = req.body;
    if (!email) return res.status(400).json({ error: 'email obligatoire' });
    if (role) {
      const normalizedRole = normalizeRole(role);
      if (!isTechnicalRole(normalizedRole)) {
        return res.status(400).json({ error: 'Role invalide' });
      }
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const query = role ? { email: normalizedEmail, role: normalizeRole(role) } : { email: normalizedEmail };
    const user = await User.findOne(query);
    const ip = req.ip;
    const ua = req.headers['user-agent'] || '';

    if (!user) {
      await logSecurityEvent({
        event_type: 'password_reset_request',
        email: normalizedEmail,
        role: role ? normalizeRole(role) : undefined,
        ip_address: ip,
        user_agent: ua,
        success: false,
        details: 'Compte introuvable',
      });
      return res.json({ message: 'Si ce compte existe, un code a ete envoye.' });
    }
    if (user.status !== 'active') return res.json({ message: 'Si ce compte existe, un code a ete envoye.' });

    await PasswordReset.updateMany(
      { user: user._id, status: 'valid' },
      { $set: { status: 'expired' } }
    );

    const rawCode = generateOtpCode();
    const codeHash = await bcrypt.hash(rawCode, BCRYPT_SALT_ROUNDS);
    const expiration = new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60 * 1000);

    await PasswordReset.create({
      user: user._id,
      reset_code: codeHash,
      expiration_date: expiration,
      status: 'valid'
    });

    await enqueueMail({
      kind: 'password_reset_otp',
      role: user.role,
      to: user.email,
      subject: 'Code de reinitialisation mot de passe',
      text: `Votre code est: ${rawCode}. Il expire dans ${RESET_CODE_TTL_MINUTES} minutes.`,
      html: `<p>Votre code de reinitialisation est: <b>${rawCode}</b></p><p>Il expire dans ${RESET_CODE_TTL_MINUTES} minutes.</p>`,
      job_id: `otp_${user._id}_${Date.now()}`,
    });
    await logSecurityEvent({
      event_type: 'password_reset_request',
      user: user._id,
      email: user.email,
      role: user.role,
      ip_address: ip,
      user_agent: ua,
      success: true,
      details: 'OTP envoye',
    });

    return res.json({ message: 'Si ce compte existe, un code a ete envoye.' });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/forgot-password/verify
router.post('/forgot-password/verify', async (req, res) => {
  try {
    const { email, code, role } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'email et code obligatoires' });
    if (role) {
      const normalizedRole = normalizeRole(role);
      if (!isTechnicalRole(normalizedRole)) {
        return res.status(400).json({ error: 'Role invalide' });
      }
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const query = role ? { email: normalizedEmail, role: normalizeRole(role) } : { email: normalizedEmail };
    const user = await User.findOne(query);
    if (!user) return res.status(400).json({ error: 'Code invalide' });

    const reset = await PasswordReset.findOne({ user: user._id, status: 'valid' }).sort({ createdAt: -1 });
    if (!reset) return res.status(400).json({ error: 'Code invalide ou expire' });

    if (new Date() > reset.expiration_date) {
      reset.status = 'expired';
      await reset.save();
      return res.status(400).json({ error: 'Code expire' });
    }

    const ok = await bcrypt.compare(String(code), reset.reset_code);
    reset.attempts += 1;
    if (!ok) {
      if (reset.attempts >= 5) reset.status = 'expired';
      await reset.save();
      return res.status(400).json({ error: 'Code invalide' });
    }

    reset.verified_at = new Date();
    await reset.save();

    const resetToken = jwt.sign(
      { userId: user._id.toString(), resetId: reset._id.toString(), purpose: 'reset_password' },
      process.env.JWT_SECRET,
      { expiresIn: RESET_JWT_EXPIRES_IN }
    );
    await logSecurityEvent({
      event_type: 'password_reset_verify',
      user: user._id,
      email: user.email,
      role: user.role,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'] || '',
      success: true,
      details: 'OTP valide',
    });

    return res.json({ message: 'Code valide', resetToken });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/forgot-password/reset
router.post('/forgot-password/reset', async (req, res) => {
  try {
    const { resetToken, newPassword, confirmPassword } = req.body;

    if (!resetToken || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'resetToken, newPassword, confirmPassword obligatoires' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Les mots de passe ne correspondent pas' });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        error: 'Mot de passe faible (min 8, au moins 1 majuscule, 1 minuscule, 1 chiffre)'
      });
    }

    let payload;
    try {
      payload = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Token de reinitialisation invalide ou expire' });
    }

    if (payload.purpose !== 'reset_password') {
      return res.status(401).json({ error: 'Token invalide' });
    }

    const reset = await PasswordReset.findById(payload.resetId);
    if (!reset || reset.status !== 'valid') {
      return res.status(400).json({ error: 'Session de reinitialisation invalide' });
    }

    if (!reset.verified_at) {
      return res.status(400).json({ error: 'Code OTP non verifie' });
    }

    if (new Date() > reset.expiration_date) {
      reset.status = 'expired';
      await reset.save();
      return res.status(400).json({ error: 'Session expiree' });
    }

    const hash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await User.updateOne({ _id: payload.userId }, { $set: { password_hash: hash } });

    reset.status = 'used';
    await reset.save();

    await UserSession.updateMany(
      { user: payload.userId, is_active: true },
      { $set: { is_active: false, logout_time: new Date(), revoked_reason: 'password_reset' } }
    );

    await logSecurityEvent({
      event_type: 'password_reset_done',
      user: payload.userId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'] || '',
      success: true,
      details: 'Password updated and sessions revoked',
    });

    return res.json({ message: 'Mot de passe mis a jour avec succes' });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken obligatoire' });

    let payload;
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Refresh token invalide ou expire' });
    }

    if (payload.purpose !== 'refresh' || !payload.sid) {
      return res.status(401).json({ error: 'Refresh token invalide' });
    }

    const now = new Date();
    const session = await UserSession.findOne({
      session_id: payload.sid,
      user: payload.id,
      is_active: true,
      expires_at: { $gt: now },
    }).select('_id session_id login_time updatedAt last_activity_at');

    if (!session) return res.status(401).json({ error: 'Session invalide' });

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
      return res.status(401).json({ error: 'Session expiree apres 15 min d inactivite' });
    }

    await UserSession.updateOne(
      { _id: session._id, is_active: true },
      { $set: { last_activity_at: now } }
    );

    const token = jwt.sign(
      { id: payload.id, role: payload.role, username: payload.username, sid: payload.sid },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({ token, session_expires_in: JWT_EXPIRES_IN });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/logout', requireAuth, async (req, res) => {
  try {
    const sessionId = req.user.sessionId;
    if (sessionId) {
      await UserSession.updateOne(
        { session_id: sessionId, user: req.user.id, is_active: true },
        { $set: { is_active: false, logout_time: new Date(), revoked_reason: 'logout' } }
      );
    }

    await logSecurityEvent({
      event_type: 'logout',
      user: req.user.id,
      role: req.user.role,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'] || '',
      success: true,
    });

    return res.json({ message: 'Logout OK' });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/logout-all', requireAuth, async (req, res) => {
  try {
    await UserSession.updateMany(
      { user: req.user.id, is_active: true },
      { $set: { is_active: false, logout_time: new Date(), revoked_reason: 'logout_all' } }
    );

    await logSecurityEvent({
      event_type: 'logout_all',
      user: req.user.id,
      role: req.user.role,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'] || '',
      success: true,
    });

    return res.json({ message: 'Toutes les sessions ont ete fermees' });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
