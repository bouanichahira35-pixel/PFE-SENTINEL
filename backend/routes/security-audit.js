const router = require('express').Router();
const SecurityAudit = require('../models/SecurityAudit');
const requireAuth = require('../middlewares/requireAuth');
const requirePermission = require('../middlewares/requirePermission');
const { PERMISSIONS } = require('../constants/permissions');

router.get('/', requireAuth, requirePermission(PERMISSIONS.SECURITY_AUDIT_READ), async (req, res) => {
  try {
    const items = await SecurityAudit.find()
      .populate('user', 'username email role')
      .sort({ createdAt: -1 })
      .limit(500);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch security audit logs' });
  }
});

module.exports = router;
