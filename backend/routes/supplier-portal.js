const router = require('express').Router();
const Supplier = require('../models/Supplier');
const PurchaseOrder = require('../models/PurchaseOrder');
const { verifySupplierPortalToken } = require('../services/supplierPortalTokenService');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { logSecurityEvent } = require('../services/securityAuditService');
const { isSafeText } = require('../utils/validation');

// Public (no auth): read-only supplier portal

router.get('/orders', async (req, res) => {
  try {
    const token = String(req.query?.token || '').trim();
    if (!token) return res.status(400).json({ error: 'token manquant' });

    const payload = verifySupplierPortalToken(token);
    const supplierId = String(payload?.supplier_id || '');
    if (!supplierId) return res.status(400).json({ error: 'token invalide' });

    const supplier = await Supplier.findById(supplierId).select('_id name status').lean();
    if (!supplier || supplier.status !== 'active') return res.status(404).json({ error: 'Fournisseur introuvable' });

    const items = await PurchaseOrder.find({ supplier: supplier._id })
      .sort({ ordered_at: -1, createdAt: -1 })
      .limit(30)
      .populate('lines.product', 'name code_product')
      .select('status ordered_at promised_at delivered_at received_at lines supplier')
      .lean();

    return res.json({
      ok: true,
      supplier: { id: supplier._id, name: supplier.name },
      purchase_orders: items.map((po) => ({
        id: po._id,
        status: po.status,
        ordered_at: po.ordered_at,
        promised_at: po.promised_at,
        delivered_at: po.delivered_at,
        received_at: po.received_at,
        lines: (po.lines || []).slice(0, 20).map((l) => ({
          product_name: l?.product?.name || 'Produit',
          product_code: l?.product?.code_product || null,
          quantity: Number(l?.quantity || 0),
        })),
      })),
    });
  } catch (err) {
    return res.status(401).json({ error: 'token invalide', details: err?.message || 'invalid' });
  }
});

// POST /api/supplier-portal/orders/:id/ack
// Limited action: supplier confirms ETA or signals delay (token-scoped).
router.post('/orders/:id/ack', async (req, res) => {
  try {
    const token = String(req.query?.token || '').trim();
    if (!token) return res.status(400).json({ error: 'token manquant' });

    const payload = verifySupplierPortalToken(token);
    const supplierId = String(payload?.supplier_id || '');
    if (!supplierId) return res.status(400).json({ error: 'token invalide' });

    const poId = String(req.params.id || '').trim();
    if (!poId) return res.status(400).json({ error: 'id manquant' });

    const po = await PurchaseOrder.findById(poId).populate('supplier', '_id name status').lean();
    if (!po) return res.status(404).json({ error: 'Commande introuvable' });
    if (String(po?.supplier?._id || '') !== supplierId) return res.status(403).json({ error: 'Acces refuse' });
    if (po.status !== 'ordered') return res.status(409).json({ error: 'Commande non modifiable' });

    const status = String(req.body?.status || '').trim();
    if (!['confirmed', 'delayed'].includes(status)) return res.status(400).json({ error: 'status invalide' });
    const noteRaw = String(req.body?.note || '').slice(0, 240);
    const note = noteRaw ? noteRaw : '';
    if (note && !isSafeText(note, { min: 0, max: 240 })) return res.status(400).json({ error: 'note invalide' });

    let etaDate = null;
    if (req.body?.eta_date) {
      const d = new Date(req.body.eta_date);
      if (!Number.isNaN(d.getTime())) etaDate = d;
    }

    await PurchaseOrder.updateOne(
      { _id: po._id },
      {
        $set: {
          supplier_ack: {
            status,
            eta_date: etaDate || undefined,
            note: note || undefined,
            updated_at: new Date(),
          },
        },
      }
    );

    await logSecurityEvent({
      event_type: 'supplier_ack',
      email: null,
      role: 'supplier',
      success: true,
      details: `Supplier ACK: ${status}${etaDate ? ` (ETA ${etaDate.toISOString().slice(0, 10)})` : ''}`,
      after: {
        purchase_order_id: String(po._id),
        supplier_id: supplierId,
        status,
        eta_date: etaDate ? etaDate.toISOString() : null,
      },
    });

    // Notify admins + responsables in-app (best-effort).
    const targets = await User.find({ role: { $in: ['admin', 'responsable'] }, status: 'active' })
      .select('_id')
      .limit(50)
      .lean();
    if (targets.length) {
      await Notification.insertMany(targets.map((t) => ({
        user: t._id,
        title: status === 'delayed' ? 'Fournisseur: retard signale' : 'Fournisseur: ETA confirme',
        message: [
          `Commande: ${String(po._id).slice(-8).toUpperCase()}`,
          `Fournisseur: ${po?.supplier?.name || 'Fournisseur'}`,
          etaDate ? `ETA: ${etaDate.toLocaleDateString('fr-FR')}` : null,
          note ? `Note: ${note}` : null,
        ].filter(Boolean).join('\n'),
        type: status === 'delayed' ? 'alert' : 'info',
        is_read: false,
      })));
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.status(401).json({ error: 'token invalide', details: err?.message || 'invalid' });
  }
});

module.exports = router;
