const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const User = require('../models/User');
const PasswordReset = require('../models/PasswordReset');
const UserSession = require('../models/UserSession');
const { normalizeRole, isTechnicalRole, getStoredRoleCandidates } = require('../constants/roles');
const { logSecurityEvent } = require('../services/securityAuditService');
const { sendMailOrThrow, isMailConfigured } = require('../services/mailerService');
const {
  isTwilioSmsConfigured,
  isTwilioWhatsappConfigured,
  sendSmsOrThrow,
  sendWhatsappOrThrow,
} = require('../services/twilioService');
const requireAuth = require('../middlewares/requireAuth');
const { getSessionInactivityMs, formatInactivityMessage } = require('../utils/sessionPolicy');

const RESET_CODE_TTL_MINUTES = Number(process.env.RESET_CODE_TTL_MINUTES || 10);
const RESET_JWT_EXPIRES_IN = process.env.RESET_JWT_EXPIRES_IN || '15m';
// Security policy: application sessions are limited to 15 minutes max.
const JWT_EXPIRES_IN = '15m';
const SESSION_INACTIVITY_MS = getSessionInactivityMs();
const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
const REFRESH_JWT_EXPIRES_IN = process.env.REFRESH_JWT_EXPIRES_IN || '7d';
const SINGLE_SESSION_MODE = String(process.env.SINGLE_SESSION_MODE || 'true') === 'true';
const RESET_MAIL_SEND_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.RESET_MAIL_SEND_TIMEOUT_MS || 8000)
);
const OTP_MAIL_SEND_RETRIES = Math.max(1, Number(process.env.OTP_MAIL_SEND_RETRIES || 2));
const OTP_MAIL_RETRY_DELAY_MS = Math.max(0, Number(process.env.OTP_MAIL_RETRY_DELAY_MS || 1200));
const IS_PROD = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
const RESET_DEV_OTP_ENABLED =
  !IS_PROD && String(process.env.RESET_DEV_OTP_ENABLED || 'true').trim().toLowerCase() === 'true';

const REFRESH_COOKIE_NAME = String(process.env.REFRESH_COOKIE_NAME || 'sentinel_refresh').trim();

const ACTIVE_STATUS_ALIASES = new Set(['active', 'actif', 'enabled', 'enable', 'true', '1']);
const BLOCKED_STATUS_ALIASES = new Set(['blocked', 'bloque', 'disabled', 'inactive', 'false', '0']);

function parseCookies(header) {
  const raw = String(header || '').trim();
  if (!raw) return {};

  const out = {};
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

function readCookie(req, name) {
  const cookies = parseCookies(req?.headers?.cookie);
  return cookies[String(name || '').trim()] || '';
}

function getRefreshCookieOptions() {
  // Refresh token cookie is HttpOnly to reduce token exfiltration risk via XSS.
  // `SameSite=Lax` is a pragmatic default for SPAs on localhost.
  // For production, `Secure` is enabled automatically.
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge,
    // Allow refresh + logout-refresh endpoints to receive the cookie.
    path: '/api/auth',
  };
}

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

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractIdentifier(payload) {
  const raw = payload?.identifier ?? payload?.email ?? payload?.username ?? payload?.telephone;
  return String(raw || '').trim();
}

function normalizePhone(raw) {
  const cleaned = String(raw || '').replace(/[^\d+]/g, '');
  if (!cleaned) return '';
  if (!cleaned.startsWith('+')) return '';
  if (!/^\+\d{8,15}$/.test(cleaned)) return '';
  return cleaned;
}

function normalizeOtpChannel(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (!key) return 'email';
  if (['email', 'mail'].includes(key)) return 'email';
  if (['sms', 'phone', 'tel', 'telephone'].includes(key)) return 'sms';
  if (['whatsapp', 'wa'].includes(key)) return 'whatsapp';
  return key;
}

function buildIdentifierQuery(identifier) {
  const rawIdentifier = String(identifier || '').trim();
  const normalizedIdentifier = rawIdentifier.toLowerCase();

  return {
    $or: [
      { email: normalizedIdentifier },
      { telephone: rawIdentifier },
      { telephone: normalizedIdentifier },
      { username: rawIdentifier },
      { username: normalizedIdentifier },
      { username: new RegExp(`^${escapeRegex(rawIdentifier)}$`, 'i') },
    ],
  };
}

function buildRoleFilter(normalizedRole) {
  const candidates = getStoredRoleCandidates(normalizedRole);
  if (!candidates.length) return null;

  return {
    $or: candidates.map((candidate) => ({
      role: new RegExp(`^${escapeRegex(candidate)}$`, 'i'),
    })),
  };
}

function buildUserLookupQuery(identifier, normalizedRole = null) {
  const filters = [buildIdentifierQuery(identifier)];
  if (normalizedRole) {
    const roleFilter = buildRoleFilter(normalizedRole);
    if (roleFilter) filters.push(roleFilter);
  }

  if (filters.length === 1) return filters[0];
  return { $and: filters };
}

function withTimeout(promise, timeoutMs, timeoutLabel) {
  let timer = null;

  const wrappedPromise = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(timeoutLabel || 'timeout'));
    }, timeoutMs);

    Promise.resolve(promise)
      .then(resolve)
      .catch(reject);
  });

  return wrappedPromise.finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendPasswordResetOtpOrThrow({ to, role, rawCode, ttlMinutes }) {
  let lastError = null;

  for (let attempt = 1; attempt <= OTP_MAIL_SEND_RETRIES; attempt += 1) {
    try {
      await withTimeout(
        sendMailOrThrow({
          to,
          subject: 'Code de reinitialisation mot de passe',
          text: `Votre code est: ${rawCode}. Il expire dans ${ttlMinutes} minutes.`,
          html: `<p>Votre code de reinitialisation est: <b>${rawCode}</b></p><p>Il expire dans ${ttlMinutes} minutes.</p>`,
        }),
        RESET_MAIL_SEND_TIMEOUT_MS,
        'mail_send_timeout'
      );
      return;
    } catch (err) {
      lastError = err;
      if (attempt < OTP_MAIL_SEND_RETRIES && OTP_MAIL_RETRY_DELAY_MS > 0) {
        await delay(OTP_MAIL_RETRY_DELAY_MS);
      }
    }
  }

  throw lastError || new Error('mail_send_failed');
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
    const identifier = extractIdentifier(req.body);
    const password = req.body?.password;
    const role = req.body?.role;

    if (!identifier || !password) {
      return res.status(400).json({ error: 'identifier et password sont obligatoires' });
    }

    const hasRoleFilter = typeof role === 'string' && String(role).trim().length > 0;
    const normalizedRole = hasRoleFilter ? normalizeRole(role) : null;
    if (hasRoleFilter && !isTechnicalRole(normalizedRole)) {
      return res.status(400).json({ error: 'Role invalide' });
    }

    const normalizedIdentifier = String(identifier).trim().toLowerCase();
    const ip = req.ip;
    const ua = req.headers['user-agent'] || '';

    const loginQuery = buildUserLookupQuery(identifier, normalizedRole);

    const candidates = await User.find(loginQuery)
      .select('+password_hash')
      .limit(15);

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
        role: normalizeRole(matchedIdentityUser.role),
        ip_address: ip,
        user_agent: ua,
        success: false,
        details: 'Mot de passe incorrect',
      });
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }

    const canonicalRole = normalizeRole(user.role);
    const canonicalStatus = normalizeUserStatus(user.status);

    if (!isTechnicalRole(canonicalRole)) {
      await logSecurityEvent({
        event_type: 'login_failed',
        user: user._id,
        email: user.email,
        role: canonicalRole,
        ip_address: ip,
        user_agent: ua,
        success: false,
        details: 'Role non supporte',
      });
      return res.status(403).json({ error: 'Compte bloque' });
    }

    if (!isUserActive(canonicalStatus)) {
      await logSecurityEvent({
        event_type: 'login_failed',
        user: user._id,
        email: user.email,
        role: canonicalRole,
        ip_address: ip,
        user_agent: ua,
        success: false,
        details: 'Compte bloque',
      });
      return res.status(403).json({ error: 'Compte bloque' });
    }

    const profilePatch = {
      last_login: new Date(),
    };
    if (canonicalRole !== user.role) {
      profilePatch.role = canonicalRole;
    }
    if (['active', 'blocked'].includes(canonicalStatus) && canonicalStatus !== user.status) {
      profilePatch.status = canonicalStatus;
    }

    await User.updateOne({ _id: user._id }, { $set: profilePatch });

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
      { id: user._id, role: canonicalRole, username: user.username, sid: sessionId },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    const refreshToken = jwt.sign(
      { id: user._id, role: canonicalRole, username: user.username, sid: sessionId, purpose: 'refresh' },
      process.env.JWT_SECRET,
      { expiresIn: REFRESH_JWT_EXPIRES_IN }
    );

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions());

    await logSecurityEvent({
      event_type: 'login_success',
      user: user._id,
      email: user.email,
      role: canonicalRole,
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
        role: canonicalRole, 
        email: user.email, 
        telephone: user.telephone, 
        image_profile: user.image_profile || null, 
        demandeur_profile: user.demandeur_profile || 'bureautique',
      }, 
    }); 
  } catch (err) { 
    return res.status(500).json({ error: 'Erreur serveur' }); 
  } 
}); 

// POST /api/auth/forgot-password/request
router.post('/forgot-password/request', async (req, res) => {
  try {
    const identifier = extractIdentifier(req.body);
    const role = req.body?.role;
    const channel = normalizeOtpChannel(req.body?.channel);

    if (!identifier) return res.status(400).json({ error: 'email ou identifier obligatoire' });
    if (!['email', 'sms', 'whatsapp'].includes(channel)) {
      return res.status(400).json({ error: 'Canal invalide (email, sms, whatsapp)' });
    }

    let normalizedRole = null;
    if (role) {
      normalizedRole = normalizeRole(role);
      if (!isTechnicalRole(normalizedRole)) {
        return res.status(400).json({ error: 'Role invalide' });
      }
    }

    const normalizedIdentifier = String(identifier).trim().toLowerCase();
    const query = buildUserLookupQuery(identifier, normalizedRole);
    const user = await User.findOne(query);
    const ip = req.ip;
    const ua = req.headers['user-agent'] || '';

    if (!user) {
      await logSecurityEvent({
        event_type: 'password_reset_request',
        email: normalizedIdentifier,
        role: normalizedRole || undefined,
        ip_address: ip,
        user_agent: ua,
        success: false,
        details: 'Compte introuvable',
      });
      return res.json({ message: 'Si ce compte existe, un code a ete envoye.' });
    }

    const canonicalRole = normalizeRole(user.role);
    const canonicalStatus = normalizeUserStatus(user.status);

    if (!isTechnicalRole(canonicalRole) || !isUserActive(canonicalStatus)) {
      return res.json({ message: 'Si ce compte existe, un code a ete envoye.' });
    }

    const canonicalPatch = {};
    if (canonicalRole !== user.role) {
      canonicalPatch.role = canonicalRole;
    }
    if (['active', 'blocked'].includes(canonicalStatus) && canonicalStatus !== user.status) {
      canonicalPatch.status = canonicalStatus;
    }
    if (Object.keys(canonicalPatch).length > 0) {
      await User.updateOne({ _id: user._id }, { $set: canonicalPatch });
    }

    await PasswordReset.updateMany(
      { user: user._id, status: 'valid' },
      { $set: { status: 'expired' } }
    );

    const rawCode = generateOtpCode();
    const codeHash = await bcrypt.hash(rawCode, BCRYPT_SALT_ROUNDS);
    const expiration = new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60 * 1000);

    const resetDoc = await PasswordReset.create({
      user: user._id,
      reset_code: codeHash,
      expiration_date: expiration,
      status: 'valid',
    });

    const cooldownSeconds = 60;

    async function expireReset() {
      await PasswordReset.updateOne({ _id: resetDoc._id }, { $set: { status: 'expired' } });
    }

    async function sendDevOtp(details) {
      await logSecurityEvent({
        event_type: 'password_reset_request',
        user: user._id,
        email: user.email,
        role: canonicalRole,
        ip_address: ip,
        user_agent: ua,
        success: true,
        details,
      });
      return res.json({
        message: 'Si ce compte existe, un code a ete envoye.',
        dev_otp: rawCode,
        cooldown_seconds: cooldownSeconds,
      });
    }

    if (channel === 'email') {
      const mailConfigured = isMailConfigured();
      if (!mailConfigured) {
        if (IS_PROD || !RESET_DEV_OTP_ENABLED) {
          await expireReset();
          return res.status(503).json({ error: 'Service email indisponible. Contactez l administrateur.' });
        }

        return await sendDevOtp('DEV_OTP returned (MAIL not configured)');
      }

      try {
        await sendPasswordResetOtpOrThrow({
          to: user.email,
          role: canonicalRole,
          rawCode,
          ttlMinutes: RESET_CODE_TTL_MINUTES,
        });

        await logSecurityEvent({
          event_type: 'email_sent',
          user: user._id,
          email: user.email,
          role: canonicalRole,
          ip_address: ip,
          user_agent: ua,
          success: true,
          details: 'OTP email envoye',
        });
      } catch (err) {
        await expireReset();

        await logSecurityEvent({
          event_type: 'email_failed',
          user: user._id,
          email: user.email,
          role: canonicalRole,
          ip_address: ip,
          user_agent: ua,
          success: false,
          details: `OTP email failed: ${err?.message || 'mail_failed'}`,
        });

        return res.status(503).json({ error: 'Echec envoi email. Reessayez dans quelques instants.' });
      }
    } else {
      const destination = normalizePhone(identifier) || normalizePhone(user.telephone);
      if (!destination) {
        await expireReset();
        return res.status(400).json({ error: 'Numero de telephone invalide' });
      }

      const configured = channel === 'sms' ? isTwilioSmsConfigured() : isTwilioWhatsappConfigured();
      if (!configured) {
        if (!IS_PROD && RESET_DEV_OTP_ENABLED) {
          return await sendDevOtp(`DEV_OTP returned (${channel} not configured)`);
        }
        await expireReset();
        return res.status(503).json({
          error:
            channel === 'sms'
              ? 'Service SMS indisponible. Contactez l administrateur.'
              : 'Service WhatsApp indisponible. Contactez l administrateur.',
        });
      }

      const body = `Votre code est: ${rawCode}. Il expire dans ${RESET_CODE_TTL_MINUTES} minutes.`;

      try {
        if (channel === 'sms') {
          await sendSmsOrThrow({ to: destination, body });
        } else {
          await sendWhatsappOrThrow({ to: destination, body });
        }
      } catch (err) {
        await expireReset();
        await logSecurityEvent({
          event_type: `${channel}_failed`,
          user: user._id,
          email: user.email,
          role: canonicalRole,
          ip_address: ip,
          user_agent: ua,
          success: false,
          details: `OTP ${channel} failed: ${err?.message || 'send_failed'}`,
        });
        return res.status(503).json({ error: 'Echec envoi code. Reessayez dans quelques instants.' });
      }

      await logSecurityEvent({
        event_type: `${channel}_sent`,
        user: user._id,
        email: user.email,
        role: canonicalRole,
        ip_address: ip,
        user_agent: ua,
        success: true,
        details: `OTP ${channel} envoye`,
      });
    }

    await logSecurityEvent({
      event_type: 'password_reset_request',
      user: user._id,
      email: user.email,
      role: canonicalRole,
      ip_address: ip,
      user_agent: ua,
      success: true,
      details: 'OTP envoye',
    });

    return res.json({ message: 'Si ce compte existe, un code a ete envoye.', cooldown_seconds: cooldownSeconds });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/forgot-password/verify
router.post('/forgot-password/verify', async (req, res) => {
  try {
    const identifier = extractIdentifier(req.body);
    const { code, role } = req.body || {};

    if (!identifier || !code) return res.status(400).json({ error: 'email/identifier et code obligatoires' });

    let normalizedRole = null;
    if (role) {
      normalizedRole = normalizeRole(role);
      if (!isTechnicalRole(normalizedRole)) {
        return res.status(400).json({ error: 'Role invalide' });
      }
    }

    const query = buildUserLookupQuery(identifier, normalizedRole);
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

    const canonicalRole = normalizeRole(user.role);

    const resetToken = jwt.sign(
      { userId: user._id.toString(), resetId: reset._id.toString(), purpose: 'reset_password' },
      process.env.JWT_SECRET,
      { expiresIn: RESET_JWT_EXPIRES_IN }
    );
    await logSecurityEvent({
      event_type: 'password_reset_verify',
      user: user._id,
      email: user.email,
      role: canonicalRole,
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
        error: 'Mot de passe faible (min 8, au moins 1 majuscule, 1 minuscule, 1 chiffre)',
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
    const refreshToken = String(req.body?.refreshToken || readCookie(req, REFRESH_COOKIE_NAME) || '');
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
      return res.status(401).json({ error: formatInactivityMessage(SESSION_INACTIVITY_MS) });
    }

    await UserSession.updateOne(
      { _id: session._id, is_active: true },
      { $set: { last_activity_at: now } }
    );

    const refreshedRole = normalizeRole(payload.role);
    const safeRole = isTechnicalRole(refreshedRole) ? refreshedRole : payload.role;

    const token = jwt.sign(
      { id: payload.id, role: safeRole, username: payload.username, sid: payload.sid },
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

    res.clearCookie(REFRESH_COOKIE_NAME, getRefreshCookieOptions());
    return res.json({ message: 'Logout OK' });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/logout-refresh
// Allows revoking a session when the access token is expired but a refresh token is still present.
router.post('/logout-refresh', async (req, res) => {
  try {
    const refreshToken = String(req.body?.refreshToken || readCookie(req, REFRESH_COOKIE_NAME) || '');

    if (refreshToken) {
      try {
        const payload = jwt.verify(refreshToken, process.env.JWT_SECRET);
        if (payload?.purpose === 'refresh' && payload?.sid && payload?.id) {
          await UserSession.updateOne(
            { session_id: payload.sid, user: payload.id, is_active: true },
            { $set: { is_active: false, logout_time: new Date(), revoked_reason: 'logout_refresh' } }
          );

          await logSecurityEvent({
            event_type: 'logout',
            user: payload.id,
            role: payload.role,
            ip_address: req.ip,
            user_agent: req.headers['user-agent'] || '',
            success: true,
            details: 'logout_refresh',
          });
        }
      } catch {
        // ignore invalid refresh token, always clear cookie below
      }
    }

    res.clearCookie(REFRESH_COOKIE_NAME, getRefreshCookieOptions());
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

    res.clearCookie(REFRESH_COOKIE_NAME, getRefreshCookieOptions());
    return res.json({ message: 'Toutes les sessions ont ete fermees' });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
