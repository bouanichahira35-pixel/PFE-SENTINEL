const router = require('express').Router();
const Request = require('../models/Request');
const Product = require('../models/Product');
const requireAuth = require('../middlewares/requireAuth');
const requirePermission = require('../middlewares/requirePermission');
const { PERMISSIONS } = require('../constants/permissions');
const { asPositiveNumber, isValidObjectIdLike, asOptionalString } = require('../utils/validation');
const SAFE_USER_FIELDS = 'username email role status telephone';

router.get('/', requireAuth, async (req, res) => {
  try {
    // Viewer/demandeur only sees own requests. Stock manager/admin can see all.
    const filter = req.user.role === 'demandeur' ? { demandeur: req.user.id } : {};
    const items = await Request.find(filter)
      .populate('product')
      .populate('demandeur', SAFE_USER_FIELDS)
      .populate('processed_by', SAFE_USER_FIELDS);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

router.post('/', requireAuth, requirePermission(PERMISSIONS.REQUEST_CREATE), async (req, res) => {
  try {
    if (!isValidObjectIdLike(req.body.product)) {
      return res.status(400).json({ error: 'product id invalide' });
    }
    const quantityRequested = asPositiveNumber(req.body.quantity_requested);
    if (Number.isNaN(quantityRequested) || quantityRequested === undefined) {
      return res.status(400).json({ error: 'quantity_requested doit etre > 0' });
    }

    const payload = {
      product: req.body.product,
      quantity_requested: quantityRequested,
      note: asOptionalString(req.body.note),
      demandeur: req.user.id,
      status: 'pending',
      date_request: new Date(),
    };

    const item = await Request.create(payload);
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create request', details: err.message });
  }
});

router.patch('/:id/process', requireAuth, requirePermission(PERMISSIONS.STOCK_EXIT_CREATE), async (req, res) => {
  try {
    const request = await Request.findById(req.params.id).populate('product');
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') return res.status(400).json({ error: 'Request deja traitee' });

    const status = String(req.body.status || '').trim().toLowerCase();
    if (!['accepted', 'refused'].includes(status)) {
      return res.status(400).json({ error: 'status doit etre accepted ou refused' });
    }

    request.status = status;
    request.note = asOptionalString(req.body.note) || request.note;
    request.date_processing = new Date();
    request.processed_by = req.user.id;

    if (status === 'accepted') {
      const qty = Number(request.quantity_requested || 0);
      const product = await Product.findById(request.product?._id || request.product);
      if (!product) return res.status(404).json({ error: 'Produit introuvable' });
      if (Number(product.quantity_current || 0) < qty) {
        return res.status(400).json({ error: 'Stock insuffisant pour accepter la demande' });
      }
    }

    await request.save();
    return res.json(request);
  } catch (err) {
    return res.status(400).json({ error: 'Failed to process request', details: err.message });
  }
});

module.exports = router;
