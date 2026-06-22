// BLOC 1 - Role du fichier.
// Ce fichier expose les endpoints REST du domaine security-audit et controle les regles d'acces cote API.
// Point de vigilance: verifier l'authentification, les roles et les validations avant toute modification.

const router = require('express').Router();
const SecurityAudit = require('../models/SecurityAudit');
const requireAuth = require('../middlewares/requireAuth');
const requirePermission = require('../middlewares/requirePermission');
const { PERMISSIONS } = require('../constants/permissions');

router.get('/', requireAuth, requirePermission(PERMISSIONS.SECURITY_AUDIT_READ), async (req, res) => {
  try {
    const items = await SecurityAudit.find()
      .populate('user', 'username email role image_profile')
      .sort({ createdAt: -1 })
      .limit(500);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch security audit logs' });
  }
});

module.exports = router;
