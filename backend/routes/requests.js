const router = require('express').Router();
const Request = require('../models/Request');
const requireAuth = require('../middlewares/requireAuth');
const requireRole = require('../middlewares/requireRole');
const SAFE_USER_FIELDS = 'username email role status telephone';

router.get('/', requireAuth, async (req, res) => {
  try {
    // Viewer/demandeur only sees own requests. Stock manager/admin can see all.
    const filter = req.user.role === 'demandeur' ? { demandeur: req.user.id } : {};
    const items = await Request.find(filter)
      .populate('product')
      .populate('demandeur', SAFE_USER_FIELDS)
      .populate('processed_by', SAFE_USER_FIELDS);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

router.post('/', requireAuth, requireRole('demandeur'), async (req, res) => {
  try {
    const payload = {
      ...req.body,
      demandeur: req.user.id,
      status: 'pending',
      date_request: new Date(),
    };

    const item = await Request.create(payload);
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create request', details: err.message });
  }
});

module.exports = router;
