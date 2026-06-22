// BLOC 1 - Role du fichier.
// Ce fichier contient la logique metier reutilisable du domaine stockRulesService, appelee par les routes ou les jobs.
// Point de vigilance: preserver les contrats appeles par plusieurs routes.

const AppSetting = require('../models/AppSetting');
const { STOCK_RULES_DEFAULT, sanitizeStockRulesConfig } = require('../constants/stockRules');

async function getStockRulesConfig() {
  const item = await AppSetting.findOne({ setting_key: 'stock_rules_config' }).lean();
  const value = item?.setting_value ?? STOCK_RULES_DEFAULT;
  return sanitizeStockRulesConfig(value);
}

module.exports = {
  getStockRulesConfig,
};

