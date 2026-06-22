// BLOC 1 - Role du fichier.
// Ce fichier contient la logique metier reutilisable du domaine userPreferencesService, appelee par les routes ou les jobs.
// Point de vigilance: preserver les contrats appeles par plusieurs routes.

const AppSetting = require('../models/AppSetting');

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

function normalizeUserPreferences(prefs) {
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

async function getUserPreferences(userId) {
  const settingKey = `user_prefs_${userId}`;
  const item = await AppSetting.findOne({ setting_key: settingKey }).lean();
  const prefs = item?.setting_value || USER_PREFS_DEFAULT;
  return normalizeUserPreferences(prefs);
}

function canSendNotificationEmail(preferences, category = 'generic') {
  const notif = preferences?.notifications || {};
  if (!notif.email) return false;
  if (category === 'stock') return notif.stockAlerts !== false;
  if (category === 'catalogue') return notif.stockAlerts !== false;
  if (category === 'inventory') return notif.stockAlerts !== false;
  if (category === 'demandes') return notif.demandesAlerts !== false;
  return true;
}

module.exports = {
  USER_PREFS_DEFAULT,
  normalizeUserPreferences,
  getUserPreferences,
  canSendNotificationEmail,
};
