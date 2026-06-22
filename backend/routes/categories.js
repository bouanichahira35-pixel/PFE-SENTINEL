// BLOC 1 - Role du fichier.
// Ce fichier expose les endpoints REST du domaine categories et controle les regles d'acces cote API.
// Point de vigilance: verifier l'authentification, les roles et les validations avant toute modification.

const router = require('express').Router();
const Category = require('../models/Category');
const Product = require('../models/Product');
const requireAuth = require('../middlewares/requireAuth');
const requirePermission = require('../middlewares/requirePermission');
const strictBody = require('../middlewares/strictBody');
const { PERMISSIONS } = require('../constants/permissions');
const { asOptionalString, asTrimmedString, isSafeText, isValidObjectIdLike } = require('../utils/validation');

function normalizeFamily(value) {
  if (!value) return null;

  const map = {
    economat: 'economat',
    'produit chimique': 'produit_chimique',
    produit_chimique: 'produit_chimique',
    chimique: 'produit_chimique',
    gaz: 'gaz',
    'consommable informatique': 'consommable_informatique',
    consommable_informatique: 'consommable_informatique',
    'consommable laboratoire': 'consommable_laboratoire',
    consommable_laboratoire: 'consommable_laboratoire',
  };

  const key = String(value).trim().toLowerCase();
  return map[key] || null;
}

function asStringArray(value, { max = 10 } = {}) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, max)
    .map((v) => String(v || '').trim())
    .filter(Boolean);
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const q = {};
    const isDemandeur = req.user?.role === 'demandeur';
    const includeArchived = String(req.query?.include_archived || '') === '1' && !isDemandeur;

    if (!includeArchived) {
      q.lifecycle_status = 'active';
    }

    if (isDemandeur) {
      const profile = String(req.user?.demandeur_profile || 'bureautique');
      q.$or = [{ audiences: { $size: 0 } }, { audiences: profile }];
    }

    const items = await Category.find(q).sort({ name: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.post('/', requireAuth, requirePermission(PERMISSIONS.CATEGORY_MANAGE), async (req, res) => {
  try {
    const errors = [];
    const name = asTrimmedString(req.body?.name);
    const description = asOptionalString(req.body?.description);
    const rawAudiences = Array.isArray(req.body?.audiences) ? req.body.audiences : [];
    const parentFamilyRaw = asOptionalString(req.body?.parent_family);
    const tagsRaw = asStringArray(req.body?.tags, { max: 12 });
    const visibleMetiersRaw = asStringArray(req.body?.visible_metiers, { max: 12 });
    const visibleSitesRaw = asStringArray(req.body?.visible_sites, { max: 12 });
    const visibleServicesRaw = asStringArray(req.body?.visible_services, { max: 12 });

    if (!name || !isSafeText(name, { min: 2, max: 60 })) errors.push('name invalide');
    if (description !== undefined && !isSafeText(description, { min: 0, max: 400 })) errors.push('description invalide');

    const allowed = new Set(['bureautique', 'menage', 'petrole']);
    const audiences = rawAudiences
      .slice(0, 10)
      .map((v) => String(v || '').trim().toLowerCase())
      .filter(Boolean);
    for (const v of audiences) {
      if (!allowed.has(v)) errors.push(`audiences invalide: ${v}`);
    }

    const parent_family = parentFamilyRaw ? normalizeFamily(parentFamilyRaw) : null;
    if (parentFamilyRaw && !parent_family) errors.push('parent_family invalide');

    const tags = tagsRaw
      .map((t) => String(t || '').trim().toLowerCase())
      .filter((t) => isSafeText(t, { min: 1, max: 24 }))
      .slice(0, 12);

    const visible_metiers = visibleMetiersRaw.filter((v) => isSafeText(v, { min: 1, max: 40 })).slice(0, 12);
    const visible_sites = visibleSitesRaw.filter((v) => isSafeText(v, { min: 1, max: 40 })).slice(0, 12);
    const visible_services = visibleServicesRaw.filter((v) => isSafeText(v, { min: 1, max: 40 })).slice(0, 12);

    const is_sensitive = Boolean(req.body?.is_sensitive);
    const requires_special_validation = Boolean(req.body?.requires_special_validation);
    const requires_fds = Boolean(req.body?.requires_fds);
    const requires_lot_tracking = Boolean(req.body?.requires_lot_tracking);
    const requires_expiry_date = Boolean(req.body?.requires_expiry_date);

    if (errors.length) return res.status(400).json({ error: 'Validation error', details: errors });

    const payload = {
      name,
      description: description || '',
      audiences: Array.from(new Set(audiences)),
      parent_family: parent_family || undefined,
      tags: Array.from(new Set(tags)),
      visible_metiers: Array.from(new Set(visible_metiers)),
      visible_sites: Array.from(new Set(visible_sites)),
      visible_services: Array.from(new Set(visible_services)),
      is_sensitive,
      requires_special_validation,
      requires_fds,
      requires_lot_tracking,
      requires_expiry_date,
      created_by: req.user.id,
    };

    const item = await Category.create(payload);
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create category', details: err.message });
  }
});

router.patch(
  '/:id',
  requireAuth,
  requirePermission(PERMISSIONS.CATEGORY_MANAGE),
  strictBody([
    'name',
    'description',
    'audiences',
    'parent_family',
    'tags',
    'visible_metiers',
    'visible_sites',
    'visible_services',
    'is_sensitive',
    'requires_special_validation',
    'requires_fds',
    'requires_lot_tracking',
    'requires_expiry_date',
  ]),
  async (req, res) => {
    try {
      if (!isValidObjectIdLike(req.params.id)) {
        return res.status(400).json({ error: 'category id invalide' });
      }

      const category = await Category.findById(req.params.id);
      if (!category) return res.status(404).json({ error: 'Category not found' });

      if (req.body.name !== undefined) {
        const name = String(req.body.name || '').trim();
        if (!name || !isSafeText(name, { min: 2, max: 60 })) return res.status(400).json({ error: 'name invalide' });
        category.name = name;
      }

      if (req.body.description !== undefined) {
        const description = String(req.body.description || '');
        if (!isSafeText(description, { min: 0, max: 400 })) return res.status(400).json({ error: 'description invalide' });
        category.description = description;
      }

      if (req.body.audiences !== undefined) {
        const allowed = new Set(['bureautique', 'menage', 'petrole']);
        const raw = Array.isArray(req.body.audiences) ? req.body.audiences : [];
        const next = raw
          .map((v) => String(v || '').trim().toLowerCase())
          .filter(Boolean);
        for (const v of next) {
          if (!allowed.has(v)) {
            return res.status(400).json({ error: 'audiences invalide', details: `Valeur invalide: ${v}` });
          }
        }
        category.audiences = Array.from(new Set(next));
      }

      if (req.body.parent_family !== undefined) {
        const raw = asOptionalString(req.body.parent_family);
        if (!raw) {
          category.parent_family = undefined;
        } else {
          const normalized = normalizeFamily(raw);
          if (!normalized) return res.status(400).json({ error: 'parent_family invalide' });
          category.parent_family = normalized;
        }
      }

      if (req.body.tags !== undefined) {
        const next = asStringArray(req.body.tags, { max: 12 })
          .map((t) => String(t || '').trim().toLowerCase())
          .filter((t) => isSafeText(t, { min: 1, max: 24 }))
          .slice(0, 12);
        category.tags = Array.from(new Set(next));
      }

      if (req.body.visible_metiers !== undefined) {
        const next = asStringArray(req.body.visible_metiers, { max: 12 }).filter((v) => isSafeText(v, { min: 1, max: 40 }));
        category.visible_metiers = Array.from(new Set(next));
      }

      if (req.body.visible_sites !== undefined) {
        const next = asStringArray(req.body.visible_sites, { max: 12 }).filter((v) => isSafeText(v, { min: 1, max: 40 }));
        category.visible_sites = Array.from(new Set(next));
      }

      if (req.body.visible_services !== undefined) {
        const next = asStringArray(req.body.visible_services, { max: 12 }).filter((v) => isSafeText(v, { min: 1, max: 40 }));
        category.visible_services = Array.from(new Set(next));
      }

      if (req.body.is_sensitive !== undefined) category.is_sensitive = Boolean(req.body.is_sensitive);
      if (req.body.requires_special_validation !== undefined) {
        category.requires_special_validation = Boolean(req.body.requires_special_validation);
      }
      if (req.body.requires_fds !== undefined) category.requires_fds = Boolean(req.body.requires_fds);
      if (req.body.requires_lot_tracking !== undefined) category.requires_lot_tracking = Boolean(req.body.requires_lot_tracking);
      if (req.body.requires_expiry_date !== undefined) category.requires_expiry_date = Boolean(req.body.requires_expiry_date);

      await category.save();
      return res.json(category);
    } catch (err) {
      return res.status(400).json({ error: 'Failed to update category', details: err.message });
    }
  }
);

// POST /api/categories/merge
// Fusionner une categorie source -> cible (deplace les produits puis archive la source).
router.post(
  '/merge',
  requireAuth,
  requirePermission(PERMISSIONS.CATEGORY_MANAGE),
  strictBody(['from_id', 'to_id']),
  async (req, res) => {
    try {
      const fromId = asOptionalString(req.body?.from_id);
      const toId = asOptionalString(req.body?.to_id);

      if (!fromId || !toId || !isValidObjectIdLike(fromId) || !isValidObjectIdLike(toId)) {
        return res.status(400).json({ error: 'from_id/to_id invalides' });
      }
      if (String(fromId) === String(toId)) {
        return res.status(400).json({ error: 'from_id et to_id doivent être différents' });
      }

      const [from, to] = await Promise.all([Category.findById(fromId), Category.findById(toId)]);
      if (!from || !to) return res.status(404).json({ error: 'Categorie introuvable' });

      const moved = await Product.updateMany({ category: from._id }, { $set: { category: to._id } });

      if (String(from.lifecycle_status || 'active') !== 'archived') {
        from.lifecycle_status = 'archived';
        from.archived_at = new Date();
        from.archived_by = req.user.id;
        from.archived_reason = `Fusionnée vers ${to.name}`;
        await from.save();
      }

      return res.json({ ok: true, moved });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to merge categories', details: err.message });
    }
  }
);

// POST /api/categories/:id/archive
router.post('/:id/archive', requireAuth, requirePermission(PERMISSIONS.CATEGORY_MANAGE), strictBody(['reason']), async (req, res) => {
  try {
    if (!isValidObjectIdLike(req.params.id)) {
      return res.status(400).json({ error: 'category id invalide' });
    }

    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    if (String(category.lifecycle_status || 'active') === 'archived') {
      return res.json({ ok: true, category });
    }

    const hasActiveProducts = await Product.exists({
      category: category._id,
      $or: [{ lifecycle_status: { $exists: false } }, { lifecycle_status: 'active' }],
    });
    if (hasActiveProducts) {
      return res.status(409).json({
        error: 'Archivage impossible',
        details: 'Cette catégorie contient des produits actifs. Archivez d’abord ces produits ou déplacez-les.',
      });
    }

    const reason = asOptionalString(req.body?.reason);
    category.lifecycle_status = 'archived';
    category.archived_at = new Date();
    category.archived_by = req.user.id;
    category.archived_reason = reason ? String(reason).slice(0, 240) : '';
    await category.save();

    return res.json({ ok: true, category });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to archive category', details: err.message });
  }
});

// POST /api/categories/:id/unarchive
router.post('/:id/unarchive', requireAuth, requirePermission(PERMISSIONS.CATEGORY_MANAGE), async (req, res) => {
  try {
    if (!isValidObjectIdLike(req.params.id)) {
      return res.status(400).json({ error: 'category id invalide' });
    }

    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    if (String(category.lifecycle_status || 'active') === 'active') {
      return res.json({ ok: true, category });
    }

    category.lifecycle_status = 'active';
    category.archived_at = undefined;
    category.archived_by = undefined;
    category.archived_reason = '';
    await category.save();

    return res.json({ ok: true, category });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to unarchive category', details: err.message });
  }
});

// DELETE /api/categories/:id
// Suppression definitive seulement si aucun produit n'est associe.
router.delete('/:id', requireAuth, requirePermission(PERMISSIONS.CATEGORY_MANAGE), async (req, res) => {
  try {
    if (!isValidObjectIdLike(req.params.id)) {
      return res.status(400).json({ error: 'category id invalide' });
    }

    const category = await Category.findById(req.params.id).select('_id name').lean();
    if (!category) return res.status(404).json({ error: 'Category not found' });

    const hasProducts = await Product.exists({ category: category._id });
    if (hasProducts) {
      return res.status(409).json({
        error: 'Suppression impossible',
        details: 'Cette catégorie contient des produits. Utilisez plutôt "Archiver".',
      });
    }

    await Category.deleteOne({ _id: category._id });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete category', details: err.message });
  }
});

module.exports = router;
