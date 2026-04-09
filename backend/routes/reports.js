const router = require('express').Router();
const Product = require('../models/Product');
const StockEntry = require('../models/StockEntry');
const StockExit = require('../models/StockExit');
const requireAuth = require('../middlewares/requireAuth');
const requirePermission = require('../middlewares/requirePermission');
const { PERMISSIONS } = require('../constants/permissions');

function parseDateRange(from, to) {
  const now = new Date();
  const dateFrom = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const dateTo = to ? new Date(to) : now;
  if (Number.isNaN(dateFrom.getTime()) || Number.isNaN(dateTo.getTime())) return null;
  return { dateFrom, dateTo };
}

router.get('/movements/detail', requireAuth, requirePermission(PERMISSIONS.HISTORY_READ), async (req, res) => {
  try {
    const range = parseDateRange(req.query.from, req.query.to);
    if (!range) return res.status(400).json({ error: 'from/to invalides' });

    const entryFilter = { canceled: false, date_entry: { $gte: range.dateFrom, $lte: range.dateTo } };
    const exitFilter = { canceled: false, date_exit: { $gte: range.dateFrom, $lte: range.dateTo } };

    if (req.query.product) {
      entryFilter.product = req.query.product;
      exitFilter.product = req.query.product;
    }
    if (req.query.demandeur) {
      exitFilter.demandeur = req.query.demandeur;
    }

    const [entries, exits] = await Promise.all([
      StockEntry.find(entryFilter).populate('product', 'code_product name family emplacement').populate('magasinier', 'username'),
      StockExit.find(exitFilter).populate('product', 'code_product name family emplacement').populate('magasinier', 'username').populate('demandeur', 'username'),
    ]);

    const movements = [
      ...entries.map((e) => ({
        type: 'entry',
        date: e.date_entry,
        product: e.product,
        quantity_in: e.quantity,
        quantity_out: 0,
        actor: e.magasinier?.username || '-',
        direction_laboratory: null,
        beneficiary: e.beneficiary || null,
        source: e.supplier || e.service_requester || e.delivery_note_number || null,
      })),
      ...exits.map((x) => ({
        type: 'exit',
        date: x.date_exit,
        product: x.product,
        quantity_in: 0,
        quantity_out: x.quantity,
        actor: x.magasinier?.username || '-',
        demandeur: x.demandeur?.username || null,
        direction_laboratory: x.direction_laboratory || null,
        beneficiary: x.beneficiary || null,
        source: x.withdrawal_paper_number || x.note || null,
      })),
    ].sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({ period: range, count: movements.length, movements });
  } catch (err) {
    res.status(500).json({ error: 'Failed to build detailed movement report', details: err.message });
  }
});

router.get('/movements/global', requireAuth, requirePermission(PERMISSIONS.HISTORY_READ), async (req, res) => {
  try {
    const range = parseDateRange(req.query.from, req.query.to);
    if (!range) return res.status(400).json({ error: 'from/to invalides' });

    const products = await Product.find().populate('category', 'name').lean();

    const [entryAgg, exitAgg] = await Promise.all([
      StockEntry.aggregate([
        { $match: { canceled: false, date_entry: { $gte: range.dateFrom, $lte: range.dateTo } } },
        { $group: { _id: '$product', qty: { $sum: '$quantity' } } },
      ]),
      StockExit.aggregate([
        { $match: { canceled: false, date_exit: { $gte: range.dateFrom, $lte: range.dateTo } } },
        { $group: { _id: '$product', qty: { $sum: '$quantity' } } },
      ]),
    ]);

    const entriesByProduct = new Map(entryAgg.map((x) => [String(x._id), Number(x.qty || 0)]));
    const exitsByProduct = new Map(exitAgg.map((x) => [String(x._id), Number(x.qty || 0)]));

    const rows = products.map((p) => {
      const pid = String(p._id);
      const entries = entriesByProduct.get(pid) || 0;
      const exits = exitsByProduct.get(pid) || 0;
      const available = Number(p.quantity_current || 0);
      return {
        product_id: p._id,
        code_product: p.code_product,
        designation: p.name,
        family: p.family,
        category: p.category?.name || null,
        emplacement: p.emplacement || null,
        stock_initial_year: Number(p.stock_initial_year || 0),
        quantity_in_period_in: entries,
        quantity_in_period_out: exits,
        stock_available: available,
      };
    });

    res.json({ period: range, count: rows.length, rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to build global movement report', details: err.message });
  }
});

router.get('/consumption/person', requireAuth, requirePermission(PERMISSIONS.HISTORY_READ), async (req, res) => {
  try {
    const range = parseDateRange(req.query.from, req.query.to);
    if (!range) return res.status(400).json({ error: 'from/to invalides' });

    const exits = await StockExit.find({
      canceled: false,
      date_exit: { $gte: range.dateFrom, $lte: range.dateTo },
    }).populate('product', 'name family').lean();

    const rows = exits
      .filter((x) => ['economat', 'consommable_informatique'].includes(x.product?.family))
      .map((x) => ({
        beneficiaire: x.beneficiary || 'N/A',
        designation: x.product?.name || '-',
        quantity: Number(x.quantity || 0),
        date_prelevement: x.date_exit,
      }));

    res.json({ period: range, count: rows.length, rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to build consumption report', details: err.message });
  }
});

router.get('/chemical-register', requireAuth, requirePermission(PERMISSIONS.HISTORY_READ), async (req, res) => {
  try {
    const year = Number(req.query.year || new Date().getFullYear());
    const month = Number(req.query.month || new Date().getMonth() + 1);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'year/month invalides' });
    }

    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);
    const prevStart = new Date(year, month - 2, 1);
    const prevEnd = new Date(year, month - 1, 0, 23, 59, 59, 999);

    const products = await Product.find({ family: 'produit_chimique' }).lean();

    const [entryPrevAgg, exitPrevAgg, stockBeforeAgg] = await Promise.all([
      StockEntry.aggregate([
        { $match: { canceled: false, date_entry: { $gte: prevStart, $lte: prevEnd } } },
        { $group: { _id: '$product', qty: { $sum: '$quantity' } } },
      ]),
      StockExit.aggregate([
        { $match: { canceled: false, date_exit: { $gte: prevStart, $lte: prevEnd } } },
        { $group: { _id: '$product', qty: { $sum: '$quantity' } } },
      ]),
      StockEntry.aggregate([
        { $match: { canceled: false, date_entry: { $lt: periodStart } } },
        { $group: { _id: '$product', qty: { $sum: '$quantity' } } },
      ]),
    ]);

    const stockBeforeOutAgg = await StockExit.aggregate([
      { $match: { canceled: false, date_exit: { $lt: periodStart } } },
      { $group: { _id: '$product', qty: { $sum: '$quantity' } } },
    ]);

    const mapInPrev = new Map(entryPrevAgg.map((x) => [String(x._id), Number(x.qty || 0)]));
    const mapOutPrev = new Map(exitPrevAgg.map((x) => [String(x._id), Number(x.qty || 0)]));
    const mapInBefore = new Map(stockBeforeAgg.map((x) => [String(x._id), Number(x.qty || 0)]));
    const mapOutBefore = new Map(stockBeforeOutAgg.map((x) => [String(x._id), Number(x.qty || 0)]));

    const rows = products.map((p) => {
      const pid = String(p._id);
      const stockDebutMois = (mapInBefore.get(pid) || 0) - (mapOutBefore.get(pid) || 0);
      return {
        date_jour: new Date(),
        product_id: p._id,
        designation: p.name,
        stock_debut_mois: stockDebutMois,
        quantite_achetee_mois_precedent: mapInPrev.get(pid) || 0,
        quantite_consommee_mois_precedent: mapOutPrev.get(pid) || 0,
        quantite_restante: Number(p.quantity_current || 0),
        period_start: periodStart,
        period_end: periodEnd,
      };
    });

    res.json({ year, month, count: rows.length, rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to build chemical register', details: err.message });
  }
});

module.exports = router;
