const router = require('express').Router();
const Category = require('../models/Category');
const requireAuth = require('../middlewares/requireAuth');
const requirePermission = require('../middlewares/requirePermission');
const strictBody = require('../middlewares/strictBody');
const { PERMISSIONS } = require('../constants/permissions');
const { isValidObjectIdLike } = require('../utils/validation');

router.get('/', requireAuth, async (req, res) => {
  try {
    const q = {};
    if (req.user?.role === 'demandeur') {
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
    const payload = {
      ...req.body,
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
  strictBody(['name', 'description', 'audiences']),
  async (req, res) => {
    try {
      if (!isValidObjectIdLike(req.params.id)) {
        return res.status(400).json({ error: 'category id invalide' });
      }

      const category = await Category.findById(req.params.id);
      if (!category) return res.status(404).json({ error: 'Category not found' });

      if (req.body.name !== undefined) {
        const name = String(req.body.name || '').trim();
        if (!name) return res.status(400).json({ error: 'name ne peut pas etre vide' });
        category.name = name;
      }

      if (req.body.description !== undefined) {
        category.description = String(req.body.description || '');
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

      await category.save();
      return res.json(category);
    } catch (err) {
      return res.status(400).json({ error: 'Failed to update category', details: err.message });
    }
  }
);

module.exports = router;
