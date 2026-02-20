const router = require('express').Router();
const Request = require('../models/Request');
const Product = require('../models/Product');
const StockExit = require('../models/StockExit');
const Notification = require('../models/Notification');
const User = require('../models/User');
const History = require('../models/History');
const requireAuth = require('../middlewares/requireAuth');
const requirePermission = require('../middlewares/requirePermission');
const strictBody = require('../middlewares/strictBody');
const { PERMISSIONS } = require('../constants/permissions');
const { runInTransaction } = require('../services/transactionService');
const { logSecurityEvent } = require('../services/securityAuditService');
const { enqueueMail } = require('../services/mailQueueService');
const { getUserPreferences } = require('../services/userPreferencesService');
const { requestStatusTemplate } = require('../services/mailTemplates');
const { asPositiveNumber, isValidObjectIdLike, asOptionalString } = require('../utils/validation');
const SAFE_USER_FIELDS = 'username email role status telephone';

async function notifyDemandeurOnProcessing(requestDoc, actorUsername) {
  const demandeur = requestDoc?.demandeur;
  if (!demandeur?._id) return;

  const status = String(requestDoc.status || '').toLowerCase();
  const statusLabelMap = {
    accepted: 'ACCEPTEE',
    refused: 'REFUSEE',
    served: 'SERVIE',
  };
  const statusLabel = statusLabelMap[status] || String(requestDoc.status || '').toUpperCase();
  const productName = requestDoc.product?.name || 'Produit';
  const quantity = Number(requestDoc.quantity_requested || 0);
  const subject = `Statut de votre demande: ${statusLabel}`;
  const actor = actorUsername || 'le magasinier';
  const responseNote = String(requestDoc.note || '').trim();
  const dateValue = requestDoc.date_processing || requestDoc.date_served || requestDoc.updatedAt || new Date();
  const dateLabel = new Date(dateValue).toLocaleString('fr-FR');
  const text = [
    `Votre demande a ete ${statusLabel.toLowerCase()}.`,
    `Produit: ${productName}`,
    `Quantite demandee: ${quantity}`,
    `Reponse magasinier: ${statusLabel}`,
    `Traitee par: ${actor}`,
    `Date de traitement: ${dateLabel}`,
    responseNote ? `Commentaire: ${responseNote}` : null,
  ].filter(Boolean).join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111">
      <p>Votre demande a ete <strong>${statusLabel.toLowerCase()}</strong>.</p>
      <ul>
        <li><strong>Produit:</strong> ${productName}</li>
        <li><strong>Quantite demandee:</strong> ${quantity}</li>
        <li><strong>Reponse magasinier:</strong> ${statusLabel}</li>
        <li><strong>Traitee par:</strong> ${actor}</li>
        <li><strong>Date de traitement:</strong> ${dateLabel}</li>
        ${responseNote ? `<li><strong>Commentaire:</strong> ${responseNote}</li>` : ''}
      </ul>
    </div>
  `;

  try {
    await Notification.create({
      user: demandeur._id,
      title: subject,
      message: text,
      type: status === 'refused' ? 'warning' : 'info',
      is_read: false,
    });
  } catch {
    // Keep request processing resilient even if notification persistence fails.
  }

  if (!demandeur.email) return;
  const demandeurPrefs = await getUserPreferences(demandeur._id);
  if (!demandeurPrefs?.notifications?.email) return;
  if (!demandeurPrefs?.notifications?.demandesAlerts) return;
  try {
    const appUrl = process.env.APP_BASE_URL || process.env.FRONTEND_URL || '';
    const htmlTemplate = requestStatusTemplate({
      statusLabel,
      productName,
      quantity,
      actor,
      dateLabel,
      note: responseNote,
      appUrl: appUrl ? `${appUrl}/demandeur/mes-demandes` : '',
    });
    await enqueueMail({
      kind: 'request_status',
      role: 'demandeur',
      to: demandeur.email,
      subject,
      text,
      html: htmlTemplate || html,
      job_id: `request_status_${requestDoc._id}_${requestDoc.status}_${Date.now()}`,
    });
  } catch (err) {
    await logSecurityEvent({
      event_type: 'email_failed',
      user: demandeur._id,
      email: demandeur.email,
      role: demandeur.role,
      success: false,
      details: `Request status mail enqueue failed (${requestDoc.status})`,
      after: { request_id: requestDoc._id, request_status: requestDoc.status, subject },
    });
    // Keep request processing resilient if email provider is unavailable.
  }
}

async function notifyStockTeamsOnNewRequest(requestDoc) {
  try {
    const teams = await User.find({
      role: { $in: ['magasinier', 'responsable'] },
      status: 'active',
    }).select('_id email username role').lean();
    if (!teams.length) return;

    const productName = requestDoc?.product?.name || 'Produit';
    const quantity = Number(requestDoc?.quantity_requested || 0);
    const demandeur = requestDoc?.demandeur?.username || 'Demandeur';
    const subject = 'Nouvelle demande produit';
    const text = `Nouvelle demande: ${productName}, quantite ${quantity}, demandeur ${demandeur}.`;

    await Notification.insertMany(
      teams.map((u) => ({
        user: u._id,
        title: subject,
        message: text,
        type: 'info',
        is_read: false,
      }))
    );
    // Policy: no email is sent when a demandeur creates a request.
    // Only request responses (accepted/refused/served) may trigger email for demandeur.
  } catch {
    // Keep request creation resilient.
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

router.post(
  '/',
  requireAuth,
  requirePermission(PERMISSIONS.REQUEST_CREATE),
  strictBody(['product', 'quantity_requested', 'direction_laboratory', 'beneficiary', 'note']),
  async (req, res) => {
  try {
    if (!isValidObjectIdLike(req.body.product)) {
      return res.status(400).json({ error: 'product id invalide' });
    }
    const quantityRequested = asPositiveNumber(req.body.quantity_requested);
    if (Number.isNaN(quantityRequested) || quantityRequested === undefined) {
      return res.status(400).json({ error: 'quantity_requested doit etre > 0' });
    }

    const directionLaboratory = asOptionalString(req.body.direction_laboratory);
    if (!directionLaboratory) {
      return res.status(400).json({ error: 'direction_laboratory obligatoire' });
    }
    // Security/business rule: beneficiary is always the demandeur account name.
    const beneficiary = req.user.username;

    const payload = {
      product: req.body.product,
      quantity_requested: quantityRequested,
      direction_laboratory: directionLaboratory,
      beneficiary,
      note: asOptionalString(req.body.note),
      demandeur: req.user.id,
      status: 'pending',
      date_request: new Date(),
    };

    const item = await runInTransaction(async (session) => {
      const created = session ? (await Request.create([payload], { session }))[0] : await Request.create(payload);
      const historyPayload = {
        action_type: 'request',
        user: req.user.id,
        product: created.product,
        request: created._id,
        quantity: created.quantity_requested,
        source: 'ui',
        description: 'Demande creee',
        status_after: created.status,
        actor_role: req.user.role,
        tags: ['request', 'create'],
        context: {
          note: created.note || null,
          direction_laboratory: created.direction_laboratory || null,
          beneficiary: created.beneficiary || null,
        },
        ai_features: {
          quantity_requested: Number(created.quantity_requested || 0),
        },
      };
      if (session) await History.create([historyPayload], { session });
      else await History.create(historyPayload);
      return created;
    });

    const requestWithRefs = await Request.findById(item._id)
      .populate('product')
      .populate('demandeur', SAFE_USER_FIELDS);
    await notifyStockTeamsOnNewRequest(requestWithRefs);
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create request', details: err.message });
  }
});

router.patch(
  '/:id/process',
  requireAuth,
  requirePermission(PERMISSIONS.STOCK_EXIT_CREATE),
  strictBody(['status', 'note']),
  async (req, res) => {
  try {
    const status = String(req.body.status || '').trim().toLowerCase();
    if (!['accepted', 'refused'].includes(status)) {
      return res.status(400).json({ error: 'status doit etre accepted ou refused' });
    }

    const updated = await runInTransaction(async (session) => {
      const reqDoc = await Request.findById(req.params.id)
        .populate('product')
        .populate('demandeur', SAFE_USER_FIELDS)
        .session(session);
      if (!reqDoc) throw new Error('Request not found');
      if (reqDoc.status !== 'pending') throw new Error('Request deja traitee');

      const statusBefore = reqDoc.status;
      reqDoc.status = status;
      reqDoc.note = asOptionalString(req.body.note) || reqDoc.note;
      if (status === 'accepted') reqDoc.date_acceptance = new Date();
      reqDoc.date_processing = new Date();
      reqDoc.processed_by = req.user.id;

      if (status === 'accepted') {
        const qty = Number(reqDoc.quantity_requested || 0);
        const product = await Product.findById(reqDoc.product?._id || reqDoc.product).session(session);
        if (!product) throw new Error('Produit introuvable');
        if (Number(product.quantity_current || 0) < qty) {
          throw new Error('Stock insuffisant pour accepter la demande');
        }
      }

      await reqDoc.save({ session });
      const historyPayload = {
        action_type: 'request',
        user: req.user.id,
        product: reqDoc.product?._id || reqDoc.product,
        request: reqDoc._id,
        quantity: reqDoc.quantity_requested,
        source: 'ui',
        description: `Demande traitee: ${statusBefore} -> ${reqDoc.status}`,
        status_before: statusBefore,
        status_after: reqDoc.status,
        actor_role: req.user.role,
        tags: ['request', 'process', reqDoc.status],
        context: {
          note: reqDoc.note || null,
          processed_by: req.user.id,
        },
        ai_features: {
          quantity_requested: Number(reqDoc.quantity_requested || 0),
          accepted: reqDoc.status === 'accepted' ? 1 : 0,
        },
      };
      if (session) await History.create([historyPayload], { session });
      else await History.create(historyPayload);
      return reqDoc;
    });
    await notifyDemandeurOnProcessing(updated, req.user.username);
    return res.json(updated);
  } catch (err) {
    if (String(err?.message || '').includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(400).json({ error: 'Failed to process request', details: err.message });
  }
});

router.patch(
  '/:id/serve',
  requireAuth,
  requirePermission(PERMISSIONS.STOCK_EXIT_CREATE),
  strictBody(['stock_exit_id', 'note']),
  async (req, res) => {
  try {
    if (!isValidObjectIdLike(req.params.id)) {
      return res.status(400).json({ error: 'request id invalide' });
    }

    const stockExitId = asOptionalString(req.body.stock_exit_id);
    if (!stockExitId) {
      return res.status(400).json({ error: 'stock_exit_id obligatoire pour marquer une demande servie' });
    }
    if (!isValidObjectIdLike(stockExitId)) {
      return res.status(400).json({ error: 'stock_exit_id invalide' });
    }

    const updated = await runInTransaction(async (session) => {
      const reqDoc = await Request.findById(req.params.id)
        .populate('product')
        .populate('demandeur', SAFE_USER_FIELDS)
        .session(session);
      if (!reqDoc) throw new Error('Request not found');
      if (reqDoc.status === 'refused') throw new Error('Request refusee');
      if (reqDoc.status === 'served') throw new Error('Request deja servie');

      const linked = await StockExit.findById(stockExitId).session(session);
      if (!linked || linked.canceled) throw new Error('Bon de prelevement invalide ou annule');
      if (String(linked.product) !== String(reqDoc.product?._id || reqDoc.product)) {
        throw new Error('Bon de prelevement non lie au meme produit');
      }
      if (reqDoc.demandeur?._id && linked.demandeur && String(linked.demandeur) !== String(reqDoc.demandeur._id)) {
        throw new Error('Bon de prelevement non lie au meme demandeur');
      }
      if (linked.request && String(linked.request) !== String(reqDoc._id)) {
        throw new Error('Bon de prelevement lie a une autre demande');
      }
      if (Number(linked.quantity || 0) < Number(reqDoc.quantity_requested || 0)) {
        throw new Error('Quantite servie insuffisante pour cloturer la demande');
      }

      const statusBefore = reqDoc.status;
      if (reqDoc.status === 'pending') {
        reqDoc.status = 'accepted';
        reqDoc.date_acceptance = new Date();
      }

      reqDoc.status = 'served';
      reqDoc.date_served = new Date();
      reqDoc.date_processing = reqDoc.date_served;
      reqDoc.processed_by = req.user.id;
      reqDoc.served_by = req.user.id;
      reqDoc.note = asOptionalString(req.body.note) || reqDoc.note;
      reqDoc.stock_exit = linked._id;
      await reqDoc.save({ session });

      const historyPayload = {
        action_type: 'request',
        user: req.user.id,
        product: reqDoc.product?._id || reqDoc.product,
        request: reqDoc._id,
        quantity: reqDoc.quantity_requested,
        source: 'ui',
        description: `Demande traitee: ${statusBefore} -> served`,
        status_before: statusBefore,
        status_after: reqDoc.status,
        actor_role: req.user.role,
        tags: ['request', 'serve', reqDoc.status],
        context: {
          note: reqDoc.note || null,
          processed_by: req.user.id,
          stock_exit_id: reqDoc.stock_exit || null,
        },
        ai_features: {
          quantity_requested: Number(reqDoc.quantity_requested || 0),
          accepted: 1,
          served: 1,
        },
      };
      if (session) await History.create([historyPayload], { session });
      else await History.create(historyPayload);

      return reqDoc;
    });

    await notifyDemandeurOnProcessing(updated, req.user.username);
    return res.json(updated);
  } catch (err) {
    if (String(err?.message || '').includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(400).json({ error: 'Failed to serve request', details: err.message });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    if (!isValidObjectIdLike(req.params.id)) {
      return res.status(400).json({ error: 'request id invalide' });
    }
    const item = await Request.findById(req.params.id)
      .populate('product')
      .populate('demandeur', SAFE_USER_FIELDS)
      .populate('processed_by', SAFE_USER_FIELDS);
    if (!item) return res.status(404).json({ error: 'Request not found' });
    if (req.user.role === 'demandeur' && String(item.demandeur?._id || item.demandeur) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return res.json(item);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch request', details: err.message });
  }
});

module.exports = router;
