const { hasPermission } = require('../constants/permissions');

function requirePermission(permission) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role) return res.status(401).json({ error: 'Authentification requise' });
    if (!hasPermission(role, permission)) {
      return res.status(403).json({ error: 'Permission refusee' });
    }
    return next();
  };
}

module.exports = requirePermission;
