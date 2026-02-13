const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const PasswordReset = require('../models/PasswordReset');

const RESET_CODE_TTL_MINUTES = Number(process.env.RESET_CODE_TTL_MINUTES || 10);
const RESET_JWT_EXPIRES_IN = process.env.RESET_JWT_EXPIRES_IN || '15m';
// Security policy: application sessions are limited to 15 minutes max.
const JWT_EXPIRES_IN = '15m';
const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 12);

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT || 587),
  secure: String(process.env.MAIL_SECURE) === 'true',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

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

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { identifier, password, role } = req.body;

    if (!identifier || !password || !role) {
      return res.status(400).json({ error: 'identifier, password et role sont obligatoires' });
    }

    const normalizedIdentifier = String(identifier).trim().toLowerCase();
    const rawIdentifier = String(identifier).trim();

    const user = await User.findOne({
      role,
      $or: [{ email: normalizedIdentifier }, { telephone: rawIdentifier }]
    }).select('+password_hash');

    if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
    if (user.status !== 'active') return res.status(403).json({ error: 'Compte bloque' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Mot de passe incorrect' });

    user.last_login = new Date();
    await user.save();

    const token = jwt.sign(
      { id: user._id, role: user.role, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      token,
      session_expires_in: JWT_EXPIRES_IN,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        email: user.email,
        telephone: user.telephone
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

    const normalizedEmail = String(email).trim().toLowerCase();
    const query = role ? { email: normalizedEmail, role } : { email: normalizedEmail };
    const user = await User.findOne(query);

    if (!user) return res.json({ message: 'Si ce compte existe, un code a ete envoye.' });
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

    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to: user.email,
      subject: 'Code de reinitialisation mot de passe',
      text: `Votre code est: ${rawCode}. Il expire dans ${RESET_CODE_TTL_MINUTES} minutes.`,
      html: `<p>Votre code de reinitialisation est: <b>${rawCode}</b></p><p>Il expire dans ${RESET_CODE_TTL_MINUTES} minutes.</p>`
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

    const normalizedEmail = String(email).trim().toLowerCase();
    const query = role ? { email: normalizedEmail, role } : { email: normalizedEmail };
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

    return res.json({ message: 'Mot de passe mis a jour avec succes' });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
