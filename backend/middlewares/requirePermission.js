const { hasPermission } = require('../services/rbacPolicyService');

function requirePermission(permission) {
  return async (req, res, next) => {
    const role = req.user?.role;
    if (!role) return res.status(401).json({ error: 'Authentification requise' });
    if (!(await hasPermission(role, permission))) {
      return res.status(403).json({ error: 'Permission refusee' });
    }
    return next();
  };
}

module.exports = requirePermission;
