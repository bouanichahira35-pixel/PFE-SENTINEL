const router = require('express').Router();
const Notification = require('../models/Notification');
const requireAuth = require('../middlewares/requireAuth');

router.get('/', requireAuth, async (req, res) => {
  try {
    const items = await Notification.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(200);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

router.patch('/:id/read', requireAuth, async (req, res) => {
  try {
    const item = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { $set: { is_read: true } },
      { new: true }
    );
    if (!item) return res.status(404).json({ error: 'Notification not found' });
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update notification' });
  }
});

module.exports = router;
