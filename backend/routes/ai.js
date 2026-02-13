const router = require('express').Router();
const AIAlert = require('../models/AIAlert');
const AIPrediction = require('../models/AIPrediction');

router.get('/alerts', async (req, res) => {
  try {
    const items = await AIAlert.find().populate('product');
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch AI alerts' });
  }
});

router.get('/predictions', async (req, res) => {
  try {
    const items = await AIPrediction.find().populate('product');
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch AI predictions' });
  }
});

module.exports = router;
