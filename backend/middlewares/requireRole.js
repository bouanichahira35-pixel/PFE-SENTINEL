const { normalizeRole } = require('../constants/roles');

function requireRole(...allowedRoles) {
  const allowed = allowedRoles.map(normalizeRole);

  return (req, res, next) => {
    const userRole = normalizeRole(req.user?.role);

    if (!userRole) {
      return res.status(401).json({ error: 'Authentification requise' });
    }

    if (!allowed.includes(userRole)) {
      return res.status(403).json({ error: 'Acces refuse pour ce role' });
    }

    return next();
  };
}

module.exports = requireRole;
