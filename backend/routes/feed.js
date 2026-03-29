const router = require('express').Router();
const requireAuth = require('../middlewares/requireAuth');
const History = require('../models/History');
const Request = require('../models/Request');

const SAFE_USER_FIELDS = 'username email role status telephone image_profile';

function asPositiveInt(value, fallback = 30) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function buildBaseFilterForRole(req) {
  const role = String(req.user?.role || '').toLowerCase();
  const filter = {};

  if (role === 'responsable') return filter;

  if (role === 'magasinier') {
    filter.actor_role = { $in: ['magasinier', 'responsable', 'system', 'ia'] };
    return filter;
  }

  // Demandeur: only own actions + events on own requests.
  if (role === 'demandeur') {
    filter.$or = [
      { user: req.user.id },
      { actor_role: 'demandeur', user: req.user.id },
    ];
    return filter;
  }

  // Unknown role -> no data
  filter._id = { $exists: false };
  return filter;
}

function mapSeverity(item) {
  const type = item?.action_type;
  const source = item?.source;
  const tags = Array.isArray(item?.tags) ? item.tags : [];
  if (tags.includes('critical') || tags.includes('urgent')) return 'critical';
  if (source === 'ia') return 'warning';
  if (type === 'block' || type === 'product_delete') return 'warning';
  return 'info';
}

function buildTitle(item) {
  const type = String(item?.action_type || '');
  const productName = item?.product?.name || item?.product?.code_product || 'Produit';
  const qty = item?.quantity != null ? Number(item.quantity) : null;

  if (type === 'request') return `Demande: ${productName}${qty ? ` x${qty}` : ''}`;
  if (type === 'validation') return `Validation demande: ${productName}${qty ? ` x${qty}` : ''}`;
  if (type === 'entry') return `Entrée stock: ${productName}${qty ? ` +${qty}` : ''}`;
  if (type === 'exit') return `Sortie stock: ${productName}${qty ? ` -${qty}` : ''}`;
  if (type === 'inventory') return `Inventaire: ${productName}${qty ? ` (écart ${qty > 0 ? '+' : ''}${qty})` : ''}`;
  if (type === 'purchase_order') return 'Commande fournisseur';
  if (type === 'supplier') return 'Fournisseur';
  if (type === 'product_create') return `Nouveau produit: ${productName}`;
  if (type === 'product_update') return `Mise à jour produit: ${productName}`;
  if (type === 'product_delete') return `Suppression produit: ${productName}`;
  return item?.description ? String(item.description).slice(0, 80) : `Opération: ${type || 'action'}`;
}

function buildSubtitle(item) {
  const userName = item?.user?.username || 'Utilisateur';
  const when = item?.date_action ? new Date(item.date_action).toLocaleString('fr-FR') : '';
  const after = item?.status_after ? `→ ${item.status_after}` : '';
  const desc = item?.description ? String(item.description).trim() : '';
  const parts = [
    `${userName} ${after}`.trim(),
    when,
    desc && desc.length <= 140 ? desc : null,
  ].filter(Boolean);
  return parts.join(' • ');
}

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(100, asPositiveInt(req.query?.limit, 40));
    const roleFilter = buildBaseFilterForRole(req);
    const filter = { ...roleFilter };

    // Demandeur role: also include events on their requests (last N) to support "threads" on validations/serving.
    if (String(req.user?.role || '').toLowerCase() === 'demandeur') {
      const reqIds = await Request.find({ demandeur: req.user.id }).select('_id').sort({ createdAt: -1 }).limit(200).lean();
      const idList = reqIds.map((r) => r._id);
      filter.$or = [
        ...(Array.isArray(filter.$or) ? filter.$or : []),
        { request: { $in: idList } },
      ];
    }

    const docs = await History.find(filter)
      .populate('user', SAFE_USER_FIELDS)
      .populate('product', 'name code_product category')
      .sort({ date_action: -1 })
      .limit(limit)
      .lean();

    const items = docs.map((d) => ({
      _id: d._id,
      action_type: d.action_type,
      severity: mapSeverity(d),
      title: buildTitle(d),
      subtitle: buildSubtitle(d),
      date_action: d.date_action,
      source: d.source,
      actor_role: d.actor_role,
      request_id: d.request || null,
      product_id: d.product?._id || d.product || null,
    }));

    return res.json({ ok: true, items });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch feed', details: err.message });
  }
});

module.exports = router;

