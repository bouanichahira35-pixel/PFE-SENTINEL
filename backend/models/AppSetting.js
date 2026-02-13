const mongoose = require('../db');

const appSettingSchema = new mongoose.Schema(
  {
    setting_key: { type: String, required: true, unique: true },
    setting_value: mongoose.Schema.Types.Mixed,
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AppSetting', appSettingSchema);
