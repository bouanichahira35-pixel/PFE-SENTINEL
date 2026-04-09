const router = require('express').Router();
const Laboratory = require('../models/Laboratory');
const requireAuth = require('../middlewares/requireAuth');
const requirePermission = require('../middlewares/requirePermission');
const { PERMISSIONS } = require('../constants/permissions');
const { asOptionalString, asTrimmedString, isSafeText } = require('../utils/validation');

router.get('/', requireAuth, async (req, res) => {
  try {
    const items = await Laboratory.find().sort({ name: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch laboratories' });
  }
});

router.post('/', requireAuth, requirePermission(PERMISSIONS.CATEGORY_MANAGE), async (req, res) => {
  try {
    const code = asTrimmedString(req.body.code);
    const name = asTrimmedString(req.body.name);
    if (!code || !name) return res.status(400).json({ error: 'code et name obligatoires' });
    if (!isSafeText(code, { min: 2, max: 24 })) return res.status(400).json({ error: 'code invalide' });
    if (!isSafeText(name, { min: 2, max: 80 })) return res.status(400).json({ error: 'name invalide' });

    const direction = asOptionalString(req.body.direction);
    const description = asOptionalString(req.body.description);
    if (direction !== undefined && !isSafeText(direction, { min: 0, max: 80 })) return res.status(400).json({ error: 'direction invalide' });
    if (description !== undefined && !isSafeText(description, { min: 0, max: 600 })) return res.status(400).json({ error: 'description invalide' });

    const item = await Laboratory.create({
      code,
      name,
      direction,
      description,
      active: req.body.active !== false,
      created_by: req.user.id,
    });
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create laboratory', details: err.message });
  }
});

router.put('/:id', requireAuth, requirePermission(PERMISSIONS.CATEGORY_MANAGE), async (req, res) => {
  try {
    const item = await Laboratory.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Laboratory not found' });

    if (req.body.code !== undefined) {
      const next = asTrimmedString(req.body.code) || item.code;
      if (!isSafeText(next, { min: 2, max: 24 })) return res.status(400).json({ error: 'code invalide' });
      item.code = next;
    }
    if (req.body.name !== undefined) {
      const next = asTrimmedString(req.body.name) || item.name;
      if (!isSafeText(next, { min: 2, max: 80 })) return res.status(400).json({ error: 'name invalide' });
      item.name = next;
    }
    if (req.body.direction !== undefined) {
      const next = asOptionalString(req.body.direction);
      if (next !== undefined && !isSafeText(next, { min: 0, max: 80 })) return res.status(400).json({ error: 'direction invalide' });
      item.direction = next;
    }
    if (req.body.description !== undefined) {
      const next = asOptionalString(req.body.description);
      if (next !== undefined && !isSafeText(next, { min: 0, max: 600 })) return res.status(400).json({ error: 'description invalide' });
      item.description = next;
    }
    if (req.body.active !== undefined) item.active = Boolean(req.body.active);

    await item.save();
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update laboratory', details: err.message });
  }
});

router.delete('/:id', requireAuth, requirePermission(PERMISSIONS.CATEGORY_MANAGE), async (req, res) => {
  try {
    const item = await Laboratory.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: 'Laboratory not found' });
    res.json({ message: 'Laboratory deleted' });
  } catch (err) {
    res.status(400).json({ error: 'Failed to delete laboratory', details: err.message });
  }
});

module.exports = router;
