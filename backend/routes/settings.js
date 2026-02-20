const router = require('express').Router();
const bcrypt = require('bcryptjs');
const AppSetting = require('../models/AppSetting');
const User = require('../models/User');
const requireAuth = require('../middlewares/requireAuth');
const { enqueueMail } = require('../services/mailQueueService');

const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
const USER_PREFS_DEFAULT = Object.freeze({
  language: 'fr',
  dark_mode: false,
  notifications: {
    email: true,
    push: false,
    stockAlerts: true,
    demandesAlerts: true,
  },
});

const STOCK_RULES_DEFAULT = Object.freeze({
  seuilAlerte: 10,
  joursInactivite: 30,
  validationObligatoire: true,
});

const AI_SETTINGS_DEFAULT = Object.freeze({
  predictionsEnabled: true,
  alertesAuto: true,
  analyseConsommation: true,
});

function isStrongPassword(password) {
  if (typeof password !== 'string') return false;
  if (password.length < 8 || password.length > 64) return false;
  return /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
}

async function getAppSettingValue(settingKey, fallback) {
  const item = await AppSetting.findOne({ setting_key: settingKey }).lean();
  return item?.setting_value ?? fallback;
}

async function setAppSettingValue(settingKey, value, userId) {
  return AppSetting.findOneAndUpdate(
    { setting_key: settingKey },
    { $set: { setting_value: value, updated_by: userId } },
    { new: true, upsert: true }
  );
}

async function getUserPreferences(userId) {
  const settingKey = `user_prefs_${userId}`;
  const prefs = await getAppSettingValue(settingKey, USER_PREFS_DEFAULT);
  return {
    language: prefs?.language || USER_PREFS_DEFAULT.language,
    dark_mode: Boolean(prefs?.dark_mode),
    notifications: {
      email: prefs?.notifications?.email ?? USER_PREFS_DEFAULT.notifications.email,
      push: prefs?.notifications?.push ?? USER_PREFS_DEFAULT.notifications.push,
      stockAlerts: prefs?.notifications?.stockAlerts ?? USER_PREFS_DEFAULT.notifications.stockAlerts,
      demandesAlerts: prefs?.notifications?.demandesAlerts ?? USER_PREFS_DEFAULT.notifications.demandesAlerts,
    },
  };
}

router.use(requireAuth);

router.get('/me', async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('username email telephone role image_profile status').lean();
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const preferences = await getUserPreferences(req.user.id);
    return res.json({ user, preferences });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch profile settings' });
  }
});

router.patch('/me/profile', async (req, res) => { 
  try { 
    const user = await User.findById(req.user.id); 
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' }); 

    if (req.body.username !== undefined) { 
      const username = String(req.body.username || '').trim(); 
      if (!username) return res.status(400).json({ error: 'username invalide' }); 
      user.username = username; 
    } 
    if (req.body.email !== undefined) { 
      const email = String(req.body.email || '').trim().toLowerCase(); 
      // Keep existing email if front sends an empty value. 
      if (email) user.email = email; 
    } 
    if (req.body.telephone !== undefined) { 
      const telephone = String(req.body.telephone || '').trim(); 
      // Keep existing phone if front sends an empty value. 
      if (telephone) user.telephone = telephone; 
    } 
    if (req.body.image_profile !== undefined) { 
      user.image_profile = req.body.image_profile ? String(req.body.image_profile).trim() : undefined; 
    } 

    await user.save();
    return res.json({
      message: 'Profil mis a jour',
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        telephone: user.telephone,
        role: user.role,
        image_profile: user.image_profile || null,
        status: user.status,
      },
    });
  } catch (err) {
    if (String(err?.message || '').includes('duplicate key')) {
      return res.status(409).json({ error: 'Username ou email deja utilise' });
    }
    return res.status(500).json({ error: 'Failed to update profile', details: err.message });
  }
});

router.patch('/me/password', async (req, res) => {
  try {
    const currentPassword = String(req.body?.current_password || '');
    const newPassword = String(req.body?.new_password || '');
    const confirmPassword = String(req.body?.confirm_password || '');

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'current_password, new_password, confirm_password obligatoires' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Les mots de passe ne correspondent pas' });
    }
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ error: 'Mot de passe faible (min 8, 1 maj, 1 min, 1 chiffre)' });
    }

    const user = await User.findById(req.user.id).select('+password_hash');
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });

    user.password_hash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await user.save();

    return res.json({ message: 'Mot de passe mis a jour' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update password' });
  }
});

router.patch('/me/preferences', async (req, res) => {
  try {
    const settingKey = `user_prefs_${req.user.id}`;
    const current = await getUserPreferences(req.user.id);

    const next = {
      language: req.body?.language || current.language,
      dark_mode: req.body?.dark_mode !== undefined ? Boolean(req.body.dark_mode) : current.dark_mode,
      notifications: {
        email: req.body?.notifications?.email !== undefined ? Boolean(req.body.notifications.email) : current.notifications.email,
        push: req.body?.notifications?.push !== undefined ? Boolean(req.body.notifications.push) : current.notifications.push,
        stockAlerts: req.body?.notifications?.stockAlerts !== undefined ? Boolean(req.body.notifications.stockAlerts) : current.notifications.stockAlerts,
        demandesAlerts: req.body?.notifications?.demandesAlerts !== undefined ? Boolean(req.body.notifications.demandesAlerts) : current.notifications.demandesAlerts,
      },
    };

    if (!['fr', 'ar', 'en'].includes(next.language)) {
      return res.status(400).json({ error: 'language invalide (fr/ar/en)' });
    }

    await setAppSettingValue(settingKey, next, req.user.id);
    return res.json({ message: 'Preferences mises a jour', preferences: next });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update preferences' });
  }
});

router.post('/me/test-email', async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('email username role').lean();
    if (!user?.email) return res.status(400).json({ error: 'Email utilisateur introuvable' });

    await enqueueMail({
      kind: 'settings_test_mail',
      role: user.role,
      to: user.email,
      subject: 'Test email - PFE Sentinel',
      text: `Bonjour ${user.username || ''}, ceci est un test d'envoi email.`,
      html: `<p>Bonjour <b>${user.username || ''}</b>, ceci est un test d'envoi email.</p>`,
      job_id: `settings_test_mail_${user._id}_${Date.now()}`,
    });
    return res.json({ message: 'Email de test envoye' });
  } catch (err) {
    return res.status(500).json({ error: 'Echec envoi email de test', details: err.message });
  }
});

router.get('/stock-rules/config', async (req, res) => {
  try {
    if (req.user.role !== 'responsable') return res.status(403).json({ error: 'Acces refuse' });
    const value = await getAppSettingValue('stock_rules_config', STOCK_RULES_DEFAULT);
    return res.json({ value });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch stock rules config' });
  }
});

router.patch('/stock-rules/config', async (req, res) => {
  try {
    if (req.user.role !== 'responsable') return res.status(403).json({ error: 'Acces refuse' });
    const payload = {
      seuilAlerte: Number(req.body?.seuilAlerte ?? STOCK_RULES_DEFAULT.seuilAlerte),
      joursInactivite: Number(req.body?.joursInactivite ?? STOCK_RULES_DEFAULT.joursInactivite),
      validationObligatoire: Boolean(req.body?.validationObligatoire),
    };
    if (!Number.isFinite(payload.seuilAlerte) || payload.seuilAlerte < 0) {
      return res.status(400).json({ error: 'seuilAlerte invalide' });
    }
    if (!Number.isFinite(payload.joursInactivite) || payload.joursInactivite < 1) {
      return res.status(400).json({ error: 'joursInactivite invalide' });
    }
    await setAppSettingValue('stock_rules_config', payload, req.user.id);
    return res.json({ message: 'Regles stock mises a jour', value: payload });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update stock rules config' });
  }
});

router.get('/ai/config', async (req, res) => {
  try {
    if (req.user.role !== 'responsable') return res.status(403).json({ error: 'Acces refuse' });
    const value = await getAppSettingValue('ai_config', AI_SETTINGS_DEFAULT);
    return res.json({ value });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch ai config' });
  }
});

router.patch('/ai/config', async (req, res) => {
  try {
    if (req.user.role !== 'responsable') return res.status(403).json({ error: 'Acces refuse' });
    const payload = {
      predictionsEnabled: Boolean(req.body?.predictionsEnabled),
      alertesAuto: Boolean(req.body?.alertesAuto),
      analyseConsommation: Boolean(req.body?.analyseConsommation),
    };
    await setAppSettingValue('ai_config', payload, req.user.id);
    return res.json({ message: 'Configuration IA mise a jour', value: payload });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update ai config' });
  }
});

module.exports = router;
