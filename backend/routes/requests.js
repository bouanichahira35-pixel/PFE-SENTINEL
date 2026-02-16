const router = require('express').Router();
const nodemailer = require('nodemailer');
const Request = require('../models/Request');
const Product = require('../models/Product');
const Notification = require('../models/Notification');
const History = require('../models/History');
const requireAuth = require('../middlewares/requireAuth');
const requirePermission = require('../middlewares/requirePermission');
const { PERMISSIONS } = require('../constants/permissions');
const { logSecurityEvent } = require('../services/securityAuditService');
const { asPositiveNumber, isValidObjectIdLike, asOptionalString } = require('../utils/validation');
const SAFE_USER_FIELDS = 'username email role status telephone';

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT || 587),
  secure: String(process.env.MAIL_SECURE) === 'true',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

async function notifyDemandeurOnProcessing(requestDoc, actorUsername) {
  const demandeur = requestDoc?.demandeur;
  if (!demandeur?._id) return;

  const isAccepted = requestDoc.status === 'accepted';
  const statusLabel = isAccepted ? 'ACCEPTEE' : 'REFUSEE';
  const productName = requestDoc.product?.name || 'Produit';
  const quantity = Number(requestDoc.quantity_requested || 0);
  const subject = `Statut de votre demande: ${statusLabel}`;
  const text = `Votre demande (${productName}, quantite ${quantity}) a ete ${statusLabel.toLowerCase()} par ${actorUsername || 'le magasinier'}.`;

  try {
    await Notification.create({
      user: demandeur._id,
      title: subject,
      message: text,
      type: isAccepted ? 'info' : 'warning',
      is_read: false,
    });
  } catch {
    // Keep request processing resilient even if notification persistence fails.
  }

  if (!demandeur.email) return;
  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to: demandeur.email,
      subject,
      text,
      html: `<p>${text}</p>`,
    });
    await logSecurityEvent({
      event_type: 'email_sent',
      user: demandeur._id,
      email: demandeur.email,
      role: demandeur.role,
      success: true,
      details: `Request status mail sent (${requestDoc.status})`,
      after: { request_id: requestDoc._id, request_status: requestDoc.status, subject },
    });
  } catch {
    await logSecurityEvent({
      event_type: 'email_failed',
      user: demandeur._id,
      email: demandeur.email,
      role: demandeur.role,
      success: false,
      details: `Request status mail failed (${requestDoc.status})`,
      after: { request_id: requestDoc._id, request_status: requestDoc.status, subject },
    });
    // Keep request processing resilient if email provider is unavailable.
  }
}

router.get('/', requireAuth, async (req, res) => {
  try {
    // Demandeur only sees own requests. Magasinier/responsable can see all.
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
    await History.create({
      action_type: 'request',
      user: req.user.id,
      product: item.product,
      request: item._id,
      quantity: item.quantity_requested,
      source: 'ui',
      description: 'Demande creee',
      status_after: item.status,
      actor_role: req.user.role,
      tags: ['request', 'create'],
      context: {
        note: item.note || null,
      },
      ai_features: {
        quantity_requested: Number(item.quantity_requested || 0),
      },
    });
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create request', details: err.message });
  }
});

router.patch('/:id/process', requireAuth, requirePermission(PERMISSIONS.STOCK_EXIT_CREATE), async (req, res) => {
  try {
    const request = await Request.findById(req.params.id)
      .populate('product')
      .populate('demandeur', SAFE_USER_FIELDS);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') return res.status(400).json({ error: 'Request deja traitee' });

    const status = String(req.body.status || '').trim().toLowerCase();
    if (!['accepted', 'refused'].includes(status)) {
      return res.status(400).json({ error: 'status doit etre accepted ou refused' });
    }

    const statusBefore = request.status;
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
    await History.create({
      action_type: 'request',
      user: req.user.id,
      product: request.product?._id || request.product,
      request: request._id,
      quantity: request.quantity_requested,
      source: 'ui',
      description: `Demande traitee: ${statusBefore} -> ${request.status}`,
      status_before: statusBefore,
      status_after: request.status,
      actor_role: req.user.role,
      tags: ['request', 'process', request.status],
      context: {
        note: request.note || null,
        processed_by: req.user.id,
      },
      ai_features: {
        quantity_requested: Number(request.quantity_requested || 0),
        accepted: request.status === 'accepted' ? 1 : 0,
      },
    });
    await notifyDemandeurOnProcessing(request, req.user.username);
    return res.json(request);
  } catch (err) {
    return res.status(400).json({ error: 'Failed to process request', details: err.message });
  }
});

module.exports = router;
