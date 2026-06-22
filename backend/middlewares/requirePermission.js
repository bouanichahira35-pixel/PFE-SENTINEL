// BLOC 1 - Role du fichier.
// Ce fichier controle les requetes avant les routes pour le sujet requirePermission.
// Point de vigilance: modifier avec prudence car ce fichier peut etre importe par plusieurs modules.

const { getRolePermissions } = require('../services/rbacPolicyService');

function requirePermission(permission) {
  return async (req, res, next) => {
    const role = req.user?.role;
    if (!role) return res.status(401).json({ error: 'Authentification requise' });

    const rolePerms = await getRolePermissions(role);
    if (!rolePerms || !rolePerms.has(permission)) {
      return res.status(403).json({ error: 'Permission refusee' });
    }

    const override = req.user?.rbac_permissions;
    if (Array.isArray(override)) {
      const allowed = new Set(override.map((p) => String(p || '').trim()).filter(Boolean));
      if (!allowed.has(permission)) {
        return res.status(403).json({ error: 'Permission refusee' });
      }
    }

    return next();
  };
}

module.exports = requirePermission;
