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

async function getUserPreferences(userId) {
  const settingKey = `user_prefs_${userId}`;
  const item = await AppSetting.findOne({ setting_key: settingKey }).lean();
  const prefs = item?.setting_value || USER_PREFS_DEFAULT;
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

module.exports = {
  USER_PREFS_DEFAULT,
  getUserPreferences,
};

