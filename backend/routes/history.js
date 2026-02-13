const router = require('express').Router();
const History = require('../models/History');
const requireAuth = require('../middlewares/requireAuth');
const requireRole = require('../middlewares/requireRole');
const SAFE_USER_FIELDS = 'username email role status telephone';

router.get('/', requireAuth, requireRole('magasinier', 'responsable', 'demandeur'), async (req, res) => {
  try {
    const items = await History.find()
      .populate('user', SAFE_USER_FIELDS)
      .populate('product');
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

module.exports = router;
