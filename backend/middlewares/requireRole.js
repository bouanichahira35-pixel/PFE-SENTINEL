// Role aliases to align technical roles with business wording from cahier des charges.
const ROLE_ALIASES = {
  admin_app: 'responsable',
  administrateur: 'responsable',
  responsable: 'responsable',
  stock_manager: 'magasinier',
  gestionnaire: 'magasinier',
  magasinier: 'magasinier',
  viewer: 'demandeur',
  demandeur: 'demandeur',
};

function normalizeRole(role) {
  return ROLE_ALIASES[String(role || '').toLowerCase()] || String(role || '').toLowerCase();
}

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
