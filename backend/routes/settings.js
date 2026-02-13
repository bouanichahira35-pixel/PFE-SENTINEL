const router = require('express').Router();
const StockRule = require('../models/StockRule');
const Notification = require('../models/Notification');
const AppSetting = require('../models/AppSetting');

router.get('/stock-rules', async (req, res) => {
  try {
    const items = await StockRule.find();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stock rules' });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const items = await Notification.find();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

router.get('/app-settings', async (req, res) => {
  try {
    const items = await AppSetting.find();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch app settings' });
  }
});

module.exports = router;
