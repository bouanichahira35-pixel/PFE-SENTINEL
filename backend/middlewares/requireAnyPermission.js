// BLOC 1 - Role du fichier.
// Ce fichier controle les requetes avant les routes pour le sujet requireAnyPermission.
// Point de vigilance: modifier avec prudence car ce fichier peut etre importe par plusieurs modules.

const { getRolePermissions } = require('../services/rbacPolicyService');

function requireAnyPermission(...permissions) {
  const required = (permissions || []).map((p) => String(p || '').trim()).filter(Boolean);
  if (!required.length) {
    throw new Error('requireAnyPermission: au moins une permission est requise');
  }

  return async (req, res, next) => {
    const role = req.user?.role;
    if (!role) return res.status(401).json({ error: 'Authentification requise' });

    const rolePerms = await getRolePermissions(role);
    if (!rolePerms) return res.status(403).json({ error: 'Permission refusee' });

    const override = req.user?.rbac_permissions;
    if (Array.isArray(override)) {
      const allowed = new Set(override.map((p) => String(p || '').trim()).filter(Boolean));
      for (const p of required) {
        if (allowed.has(p) && rolePerms.has(p)) return next();
      }
      return res.status(403).json({ error: 'Permission refusee' });
    }

    for (const p of required) {
      if (rolePerms.has(p)) return next();
    }

    return res.status(403).json({ error: 'Permission refusee' });
  };
}

module.exports = requireAnyPermission;
