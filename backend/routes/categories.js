const router = require('express').Router();
const Category = require('../models/Category');
const requireAuth = require('../middlewares/requireAuth');
const requireRole = require('../middlewares/requireRole');

router.get('/', requireAuth, async (req, res) => {
  try {
    const items = await Category.find();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.post('/', requireAuth, requireRole('magasinier', 'responsable'), async (req, res) => {
  try {
    const payload = {
      ...req.body,
      created_by: req.user.id,
    };

    const item = await Category.create(payload);
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create category', details: err.message });
  }
});

module.exports = router;
