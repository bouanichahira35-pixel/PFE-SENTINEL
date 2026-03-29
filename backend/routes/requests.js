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
const { getUserPreferences, canSendNotificationEmail } = require('../services/userPreferencesService');
const { requestStatusTemplate } = require('../services/mailTemplates');
const { asPositiveNumber, isValidObjectIdLike, asOptionalString } = require('../utils/validation');
const SAFE_USER_FIELDS = 'username email role status telephone';

const LEGACY_STATUS_MAP = Object.freeze({
  accepted: 'validated',
  refused: 'rejected',
});

function normalizeRequestStatus(status) {
  const key = String(status || '').trim().toLowerCase();
  if (!key) return 'pending';
  return LEGACY_STATUS_MAP[key] || key;
}

function statusLabel(status) {
  const st = normalizeRequestStatus(status);
  const map = {
    pending: 'EN ATTENTE',
    validated: 'VALIDEE',
    preparing: 'EN PREPARATION',
    served: 'SERVIE',
    received: 'CLOTUREE',
    rejected: 'REJETEE',
    cancelled: 'ANNULEE',
  };
  return map[st] || st.toUpperCase();
}

async function canonicalizeLegacyStatusIfNeeded(reqDoc, session) {
  const current = String(reqDoc?.status || '').trim().toLowerCase();
  const next = LEGACY_STATUS_MAP[current];
  if (!next) return;
  reqDoc.status = next;
  if (session) await reqDoc.save({ session });
  else await reqDoc.save();
}

function serializeRequest(reqDoc) {
  if (!reqDoc) return reqDoc;
  const obj = typeof reqDoc.toObject === 'function' ? reqDoc.toObject({ virtuals: true }) : { ...reqDoc };
  obj.status = normalizeRequestStatus(obj.status);
  obj.status_label = statusLabel(obj.status);
  obj.priority = ['normal', 'urgent', 'critical'].includes(String(obj.priority || '').trim().toLowerCase())
    ? String(obj.priority).trim().toLowerCase()
    : 'normal';
  obj.priority_label = obj.priority === 'critical'
    ? 'TRES URGENT'
    : obj.priority === 'urgent'
      ? 'URGENT'
      : 'NORMAL';
  return obj;
}

async function notifyDemandeurOnStatusChange(requestDoc, actorUsername, actorRole) {
  const demandeur = requestDoc?.demandeur;
  if (!demandeur?._id) return;

  const status = normalizeRequestStatus(requestDoc.status);
  const statusUpper = statusLabel(status);
  const productName = requestDoc.product?.name || 'Produit';
  const quantity = Number(requestDoc.quantity_requested || 0);
  const subject = `Statut de votre demande: ${statusUpper}`;
  const actor = actorUsername || (actorRole === 'responsable' ? 'le responsable' : 'le magasinier');
  const responseNote = String(requestDoc.note || '').trim();
  const dateValue = requestDoc.validated_at
    || requestDoc.prepared_at
    || requestDoc.date_processing
    || requestDoc.date_served
    || requestDoc.updatedAt
    || new Date();
  const dateLabel = new Date(dateValue).toLocaleString('fr-FR');
  const decisionLine = status === 'served'
    ? `Execution magasinier: ${statusUpper}`
    : actorRole === 'responsable'
      ? `Decision responsable: ${statusUpper}`
      : `Traitement magasinier: ${statusUpper}`;
  const text = [
    `Votre demande est maintenant: ${statusUpper}.`,
    `Produit: ${productName}`,
    `Quantite demandee: ${quantity}`,
    decisionLine,
    `Traitee par: ${actor}`,
    `Date de traitement: ${dateLabel}`,
    responseNote ? `Commentaire: ${responseNote}` : null,
  ].filter(Boolean).join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111">
      <p>Votre demande est maintenant: <strong>${statusUpper}</strong>.</p>
      <ul>
        <li><strong>Produit:</strong> ${productName}</li>
        <li><strong>Quantite demandee:</strong> ${quantity}</li>
        <li><strong>${actorRole === 'responsable' ? 'Decision responsable' : (status === 'served' ? 'Execution magasinier' : 'Traitement magasinier')}:</strong> ${statusUpper}</li>
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
      type: status === 'rejected' ? 'warning' : 'info',
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
      statusLabel: statusUpper,
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
      job_id: `request_status_${requestDoc._id}_${status}_${Date.now()}`,
    });
  } catch (err) {
    await logSecurityEvent({
      event_type: 'email_failed',
      user: demandeur._id,
      email: demandeur.email,
      role: demandeur.role,
      success: false,
      details: `Request status mail enqueue failed (${status})`,
      after: { request_id: requestDoc._id, request_status: status, subject },
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
    const priority = String(requestDoc?.priority || 'normal').trim().toLowerCase();
    const urgent = priority === 'urgent' || priority === 'critical';
    const urgentLabel = priority === 'critical' ? 'TRES URGENT' : priority === 'urgent' ? 'URGENT' : 'NORMAL';

    const subject = urgent ? `[${urgentLabel}] Nouvelle demande produit` : 'Nouvelle demande produit';
    const text = `Nouvelle demande: ${productName}, quantite ${quantity}, demandeur ${demandeur}.`;

    await Notification.insertMany(
      teams.map((u) => ({
        user: u._id,
        title: subject,
        message: text,
        type: urgent ? 'alert' : 'info',
        is_read: false,
      }))
    );

    // Policy: demandeur does not receive email on request creation.
    // Stock teams (magasinier/responsable) can receive email based on their preferences.
    const appUrl = process.env.APP_BASE_URL || process.env.FRONTEND_URL || '';
    for (const teamUser of teams) {
      if (!teamUser.email) continue;
      try {
        const prefs = await getUserPreferences(teamUser._id);
        // For urgent requests: ensure responsables receive email (if email is enabled at all),
        // even if demandesAlerts is disabled. For non-urgent: keep preferences behavior.
        if (!prefs?.notifications?.email) continue;
        if (!urgent || teamUser.role !== 'responsable') {
          if (!canSendNotificationEmail(prefs, 'demandes')) continue;
        }

        const rolePath = teamUser.role === 'magasinier'
          ? '/magasinier/demandes'
          : teamUser.role === 'responsable'
            ? '/responsable'
            : `/${teamUser.role || ''}`;
        const targetUrl = appUrl ? `${appUrl}${rolePath}` : '';
        const teamText = [
          `Bonjour ${teamUser.username || ''},`,
          '',
          urgent ? `Priorite: ${urgentLabel}` : null,
          text,
          targetUrl ? `Ouvrir l'application: ${targetUrl}` : null,
        ].filter(Boolean).join('\n');

        await enqueueMail({
          kind: 'new_request_team',
          role: teamUser.role,
          to: teamUser.email,
          subject,
          text: teamText,
          html: `<p>${teamText.replace(/\n/g, '<br/>')}</p>`,
          job_id: `new_request_team_${requestDoc?._id || Date.now()}_${teamUser._id}_${Date.now()}`,
        });
      } catch (err) {
        await logSecurityEvent({
          event_type: 'email_failed',
          user: teamUser._id,
          email: teamUser.email,
          role: teamUser.role,
          success: false,
          details: `New request team mail enqueue failed: ${err?.message || 'unknown_error'}`,
          after: { request_id: requestDoc?._id || null },
        });
      }
    }
  } catch {
    // Keep request creation resilient.
  }
}

router.get('/', requireAuth, async (req, res) => {
  try {
    // Demandeur only sees own requests. Magasinier/responsable can see all.
    const filter = req.user.role === 'demandeur' ? { demandeur: req.user.id } : {};

    const rawStatus = asOptionalString(req.query?.status);
    if (rawStatus && rawStatus !== 'all') {
      filter.status = normalizeRequestStatus(rawStatus);
    }

    const items = await Request.find(filter)
      .populate('product')
      .populate('demandeur', SAFE_USER_FIELDS)
      .populate('processed_by', SAFE_USER_FIELDS);

    const serialized = items.map((doc) => serializeRequest(doc));
    res.json(serialized);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

router.post(
  '/',
  requireAuth,
  requirePermission(PERMISSIONS.REQUEST_CREATE),
  strictBody(['product', 'quantity_requested', 'direction_laboratory', 'beneficiary', 'note', 'priority']),
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

    const productDoc = await Product.findById(req.body.product)
      .select('_id category validation_status lifecycle_status name code_product')
      .lean();
    if (!productDoc) return res.status(404).json({ error: 'Produit introuvable' });
    if (String(productDoc.lifecycle_status || 'active') !== 'active') {
      return res.status(409).json({ error: 'Produit archive / indisponible' });
    }

    // Demandeurs: only approved products in allowed categories.
    if (req.user?.role === 'demandeur') {
      if (String(productDoc.validation_status || '') !== 'approved') {
        return res.status(409).json({ error: 'Produit non valide' });
      }
      const profile = String(req.user?.demandeur_profile || 'bureautique');
      const allowedCategories = await Category.find({
        $or: [{ audiences: { $size: 0 } }, { audiences: profile }],
      })
        .select('_id')
        .lean();
      const allowedIds = new Set(allowedCategories.map((c) => String(c._id)));
      if (productDoc.category && !allowedIds.has(String(productDoc.category))) {
        return res.status(403).json({ error: 'Categorie non autorisee pour ce demandeur' });
      }
    }

    const payload = {
      product: productDoc._id,
      quantity_requested: quantityRequested,
      direction_laboratory: directionLaboratory,
      beneficiary,
      note: asOptionalString(req.body.note),
      demandeur: req.user.id,
      status: 'pending',
      date_request: new Date(),
      priority: (() => {
        const raw = String(req.body?.priority || '').trim().toLowerCase();
        if (raw === 'urgent') return 'urgent';
        if (raw === 'critical' || raw === 'tres_urgent' || raw === 'tres_urgente') return 'critical';
        return 'normal';
      })(),
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
    res.status(201).json(serializeRequest(item));
  } catch (err) {
    res.status(400).json({ error: 'Failed to create request', details: err.message });
  }
});

router.patch(
  '/:id/validate',
  requireAuth,
  requirePermission(PERMISSIONS.REQUEST_VALIDATE),
  strictBody(['status', 'note']),
  async (req, res) => {
  try {
    if (req.user.role !== 'responsable') {
      return res.status(403).json({ error: 'Validation reservee au responsable' });
    }

    const status = normalizeRequestStatus(req.body.status);
    if (!['validated', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'status doit etre validated ou rejected' });
    }

    const updated = await runInTransaction(async (session) => {
      const reqDoc = await Request.findById(req.params.id)
        .populate('product')
        .populate('demandeur', SAFE_USER_FIELDS)
        .session(session);
      if (!reqDoc) throw new Error('Request not found');

      await canonicalizeLegacyStatusIfNeeded(reqDoc, session);
      if (normalizeRequestStatus(reqDoc.status) !== 'pending') throw new Error('Request deja traitee');

      const statusBefore = reqDoc.status;
      reqDoc.status = status;
      reqDoc.note = asOptionalString(req.body.note) || reqDoc.note;
      reqDoc.validated_at = new Date();
      reqDoc.validated_by = req.user.id;
      // Keep legacy fields filled to avoid breaking existing reporting.
      reqDoc.date_acceptance = reqDoc.validated_at;
      reqDoc.date_processing = reqDoc.validated_at;
      reqDoc.processed_by = req.user.id;

      if (status === 'validated') {
        const qty = Number(reqDoc.quantity_requested || 0);
        const product = await Product.findById(reqDoc.product?._id || reqDoc.product).session(session);
        if (!product) throw new Error('Produit introuvable');
        if (Number(product.quantity_current || 0) < qty) {
          throw new Error('Stock insuffisant pour valider la demande');
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
        description: `Demande validee: ${normalizeRequestStatus(statusBefore)} -> ${reqDoc.status}`,
        status_before: statusBefore,
        status_after: reqDoc.status,
        actor_role: req.user.role,
        tags: ['request', 'validate', reqDoc.status],
        context: {
          note: reqDoc.note || null,
          validated_by: req.user.id,
        },
        ai_features: {
          quantity_requested: Number(reqDoc.quantity_requested || 0),
          validated: reqDoc.status === 'validated' ? 1 : 0,
        },
      };
      if (session) await History.create([historyPayload], { session });
      else await History.create(historyPayload);
      return reqDoc;
    });
    await notifyDemandeurOnStatusChange(updated, req.user.username, req.user.role);
    return res.json(serializeRequest(updated));
  } catch (err) {
    if (String(err?.message || '').includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(400).json({ error: 'Failed to validate request', details: err.message });
  }
});

router.patch(
  '/:id/prepare',
  requireAuth,
  requirePermission(PERMISSIONS.STOCK_EXIT_CREATE),
  strictBody(['note']),
  async (req, res) => {
  try {
    if (req.user.role !== 'magasinier') {
      return res.status(403).json({ error: 'Preparation reservee au magasinier' });
    }

    const updated = await runInTransaction(async (session) => {
      const reqDoc = await Request.findById(req.params.id)
        .populate('product')
        .populate('demandeur', SAFE_USER_FIELDS)
        .session(session);
      if (!reqDoc) throw new Error('Request not found');

      await canonicalizeLegacyStatusIfNeeded(reqDoc, session);
      const current = normalizeRequestStatus(reqDoc.status);
      if (current === 'rejected') throw new Error('Request rejetee');
      if (current === 'cancelled') throw new Error('Request annulee');
      if (current === 'served') throw new Error('Request deja servie');
      if (current !== 'validated') throw new Error('Validation responsable requise avant preparation');

      const statusBefore = reqDoc.status;
      reqDoc.status = 'preparing';
      reqDoc.prepared_at = new Date();
      reqDoc.prepared_by = req.user.id;
      reqDoc.note = asOptionalString(req.body.note) || reqDoc.note;
      // Keep legacy fields
      reqDoc.date_processing = reqDoc.prepared_at;
      reqDoc.processed_by = req.user.id;

      await reqDoc.save({ session });

      const historyPayload = {
        action_type: 'request',
        user: req.user.id,
        product: reqDoc.product?._id || reqDoc.product,
        request: reqDoc._id,
        quantity: reqDoc.quantity_requested,
        source: 'ui',
        description: `Demande preparee: ${normalizeRequestStatus(statusBefore)} -> preparing`,
        status_before: statusBefore,
        status_after: reqDoc.status,
        actor_role: req.user.role,
        tags: ['request', 'prepare', reqDoc.status],
        context: {
          note: reqDoc.note || null,
          prepared_by: req.user.id,
        },
      };
      if (session) await History.create([historyPayload], { session });
      else await History.create(historyPayload);

      return reqDoc;
    });

    await notifyDemandeurOnStatusChange(updated, req.user.username, req.user.role);
    return res.json(serializeRequest(updated));
  } catch (err) {
    if (String(err?.message || '').includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(400).json({ error: 'Failed to prepare request', details: err.message });
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

      await canonicalizeLegacyStatusIfNeeded(reqDoc, session);
      const current = normalizeRequestStatus(reqDoc.status);
      if (current === 'rejected') throw new Error('Request rejetee');
      if (current === 'cancelled') throw new Error('Request annulee');
      if (current === 'served') throw new Error('Request deja servie');
      if (!['validated', 'preparing'].includes(current)) {
        throw new Error('Validation responsable requise avant service');
      }

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
      reqDoc.status = 'served';
      reqDoc.date_served = new Date();
      reqDoc.date_processing = reqDoc.date_served;
      reqDoc.processed_by = req.user.id;
      reqDoc.served_by = req.user.id;
      if (!reqDoc.receipt_token) {
        reqDoc.receipt_token = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
      }
      reqDoc.note = asOptionalString(req.body.note) || reqDoc.note;
      reqDoc.stock_exit = linked._id;
      if (!reqDoc.prepared_at) {
        reqDoc.prepared_at = reqDoc.date_served;
        reqDoc.prepared_by = req.user.id;
      }
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
          validated: 1,
          served: 1,
        },
      };
      if (session) await History.create([historyPayload], { session });
      else await History.create(historyPayload);

      return reqDoc;
    });

    await notifyDemandeurOnStatusChange(updated, req.user.username, req.user.role);
    return res.json(serializeRequest(updated));
  } catch (err) {
    if (String(err?.message || '').includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(400).json({ error: 'Failed to serve request', details: err.message });
  }
});

router.patch(
  '/:id/cancel',
  requireAuth,
  requirePermission(PERMISSIONS.REQUEST_CREATE),
  strictBody(['note']),
  async (req, res) => {
  try {
    if (!isValidObjectIdLike(req.params.id)) {
      return res.status(400).json({ error: 'request id invalide' });
    }

    const updated = await runInTransaction(async (session) => {
      const reqDoc = await Request.findById(req.params.id)
        .populate('product')
        .populate('demandeur', SAFE_USER_FIELDS)
        .session(session);
      if (!reqDoc) throw new Error('Request not found');

      const demandeurId = String(reqDoc.demandeur?._id || reqDoc.demandeur || '');
      if (req.user.role !== 'demandeur' || demandeurId !== String(req.user.id)) {
        throw new Error('Forbidden');
      }

      await canonicalizeLegacyStatusIfNeeded(reqDoc, session);
      const current = normalizeRequestStatus(reqDoc.status);
      if (current !== 'pending') throw new Error('Annulation possible uniquement en attente');

      const statusBefore = reqDoc.status;
      reqDoc.status = 'cancelled';
      reqDoc.cancelled_at = new Date();
      reqDoc.cancelled_by = req.user.id;
      reqDoc.note = asOptionalString(req.body.note) || reqDoc.note;

      await reqDoc.save({ session });
      const historyPayload = {
        action_type: 'request',
        user: req.user.id,
        product: reqDoc.product?._id || reqDoc.product,
        request: reqDoc._id,
        quantity: reqDoc.quantity_requested,
        source: 'ui',
        description: `Demande annulee: ${normalizeRequestStatus(statusBefore)} -> cancelled`,
        status_before: statusBefore,
        status_after: reqDoc.status,
        actor_role: req.user.role,
        tags: ['request', 'cancel', reqDoc.status],
      };
      if (session) await History.create([historyPayload], { session });
      else await History.create(historyPayload);

      return reqDoc;
    });

    await notifyDemandeurOnStatusChange(updated, req.user.username, req.user.role);
    return res.json(serializeRequest(updated));
  } catch (err) {
    const msg = String(err?.message || '');
    if (msg.includes('not found')) return res.status(404).json({ error: err.message });
    if (msg === 'Forbidden') return res.status(403).json({ error: 'Forbidden' });
    return res.status(400).json({ error: 'Failed to cancel request', details: err.message });
  }
});

router.patch(
  '/:id/confirm-receipt',
  requireAuth,
  requirePermission(PERMISSIONS.REQUEST_CREATE),
  strictBody(['receipt_token']),
  async (req, res) => {
  try {
    if (!isValidObjectIdLike(req.params.id)) {
      return res.status(400).json({ error: 'request id invalide' });
    }

    const updated = await runInTransaction(async (session) => {
      const reqDoc = await Request.findById(req.params.id)
        .populate('product')
        .populate('demandeur', SAFE_USER_FIELDS)
        .session(session);
      if (!reqDoc) throw new Error('Request not found');

      const demandeurId = String(reqDoc.demandeur?._id || reqDoc.demandeur || '');
      if (req.user.role !== 'demandeur' || demandeurId !== String(req.user.id)) {
        throw new Error('Forbidden');
      }

      await canonicalizeLegacyStatusIfNeeded(reqDoc, session);
      const current = normalizeRequestStatus(reqDoc.status);
      if (current !== 'served') throw new Error('Confirmation possible uniquement apres service');

      const tokenProvided = asOptionalString(req.body?.receipt_token);
      const stored = asOptionalString(reqDoc.receipt_token);
      if (stored && !tokenProvided) {
        throw new Error('Code de retrait requis');
      }
      if (tokenProvided && stored && tokenProvided !== stored) {
        throw new Error('Code de retrait invalide');
      }

      const statusBefore = reqDoc.status;
      reqDoc.status = 'received';
      reqDoc.received_at = new Date();
      reqDoc.received_by = req.user.id;
      await reqDoc.save({ session });

      const historyPayload = {
        action_type: 'request',
        user: req.user.id,
        product: reqDoc.product?._id || reqDoc.product,
        request: reqDoc._id,
        quantity: reqDoc.quantity_requested,
        source: 'ui',
        description: `Demande cloturee par demandeur: ${normalizeRequestStatus(statusBefore)} -> received`,
        status_before: statusBefore,
        status_after: reqDoc.status,
        actor_role: req.user.role,
        tags: ['request', 'confirm_receipt', reqDoc.status],
        context: {
          received_at: reqDoc.received_at,
          stock_exit_id: reqDoc.stock_exit || null,
        },
      };
      if (session) await History.create([historyPayload], { session });
      else await History.create(historyPayload);

      return reqDoc;
    });

    try {
      const teams = await User.find({ role: { $in: ['magasinier', 'responsable'] }, status: 'active' })
        .select('_id username role')
        .limit(40)
        .lean();
      if (teams.length) {
        await Notification.insertMany(teams.map((u) => ({
          user: u._id,
          title: 'Demande cloturee',
          message: [
            `Demande: DEM-${String(updated._id).slice(-6).toUpperCase()}`,
            `Produit: ${updated.product?.name || 'Produit'}`,
            `Par: ${updated.demandeur?.username || 'demandeur'}`,
          ].join('\n'),
          type: 'info',
          is_read: false,
        })));
      }
    } catch {
      // best-effort
    }

    return res.json(serializeRequest(updated));
  } catch (err) {
    const msg = String(err?.message || '');
    if (msg.includes('not found')) return res.status(404).json({ error: err.message });
    if (msg === 'Forbidden') return res.status(403).json({ error: 'Forbidden' });
    return res.status(400).json({ error: 'Failed to confirm receipt', details: err.message });
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
    return res.json(serializeRequest(item));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch request', details: err.message });
  }
});

module.exports = router;
