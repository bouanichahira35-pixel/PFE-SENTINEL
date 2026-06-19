import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  FlaskConical,
  RefreshCw,
  ShieldAlert,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get, post } from '../../services/api';
import { computeChemicalRegisterSignals } from '../../utils/chemicalRegister';
import './DashboardResp.css';

/* ─── Périodes ─────────────────────────────────── */
const PERIODS = [
  { key: 'today',  label: 'Auj.',  days: 1  },
  { key: '7d',     label: '7 j',   days: 7  },
  { key: '30d',    label: '30 j',  days: 30 },
  { key: 'custom', label: 'Perso.', days: null },
];

const AVAILABILITY_TARGET = 85;
const TOP_CONSUMED_FALLBACKS = [
  { days: 30, label: '30 jours' },
  { days: 90, label: '3 mois' },
];

/* ─── Familles produit ──────────────────────────── */
const FAMILY_LABELS = {
  economat:                 'Économat',
  produit_chimique:         'Chimique',
  gaz:                      'Gaz',
  consommable_laboratoire:  'Laboratoire',
  consommable_informatique: 'Informatique',
};

const RECOMMENDATION_TYPES = {
  restock: { icon: '📦', label: 'Réappro', color: 'danger' },
  optimize: { icon: '⚙️', label: 'Optimisation', color: 'blue' },
  archive: { icon: '🗂️', label: 'Archivage', color: 'warn' },
  investigate: { icon: '🔍', label: 'Enquête', color: 'info' },
};

/* ─── Graphique ─────────────────────────────────── */
const CW = 420, CH = 110, CP = 18;
const DAY_MS = 86_400_000;

/* ─── Utilitaires ───────────────────────────────── */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function mean(arr = []) {
  const vals = arr.map(Number).filter(Number.isFinite);
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
}

function buildRange(days) {
  const d = Math.max(1, Number(days || 30));
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (d - 1));
  return { from: startOfDay(from), to: endOfDay(to), days: d };
}

function buildPrevRange(r) {
  const span = Math.max(86_400_000, r.to - r.from);
  return { from: new Date(r.from.getTime() - span), to: new Date(r.from.getTime() - 1) };
}

function startOfDay(v) {
  const d = new Date(v);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(v) {
  const d = new Date(v);
  d.setHours(23, 59, 59, 999);
  return d;
}

function parseDateInput(v) {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildCustomRange(fromRaw, toRaw) {
  const fallback = buildRange(30);
  const fromDate = parseDateInput(fromRaw) || fallback.from;
  const toDate = parseDateInput(toRaw) || fallback.to;
  const from = startOfDay(fromDate <= toDate ? fromDate : toDate);
  const to = endOfDay(fromDate <= toDate ? toDate : fromDate);
  const days = Math.max(1, Math.round((to - from) / DAY_MS) + 1);
  return { from, to, days };
}

const isoInput = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

const isoDay = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

const fmtDay = (v) => {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? String(v).slice(5)
    : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
};

const fmtShortRange = (r) => {
  if (!r?.from || !r?.to) return '-';
  return `${fmtDay(r.from)} - ${fmtDay(r.to)}`;
};

const fmtDateTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const encRange = (r) =>
  `from=${encodeURIComponent(r.from.toISOString())}&to=${encodeURIComponent(r.to.toISOString())}`;

const pctSafe = (n, d) => {
  const den = Number(d || 0);
  return den > 0 ? (Number(n || 0) / den) * 100 : 0;
};

const productId = (v) => String(v?._id || v?.id || v?.product_id || v?.product || '');

function completeTrendRows(rows, range) {
  const byDay = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const day = isoDay(row?.day);
    if (!day) return;
    byDay.set(day, {
      day,
      entry: Number(row.entry || 0),
      exit: Number(row.exit || 0),
      request: Number(row.request || 0),
    });
  });

  const out = [];
  const cursor = startOfDay(range.from);
  const last = startOfDay(range.to);
  while (cursor <= last) {
    const day = isoInput(cursor);
    out.push(byDay.get(day) || { day, entry: 0, exit: 0, request: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

const bizCat = (p) =>
  FAMILY_LABELS[p?.family] || p?.category_proposal || p?.category?.name || 'Métier';

function toPoints(vals, minV, maxV) {
  const span = Math.max(1, Number(maxV || 1) - Number(minV || 0));
  const step = vals.length > 1 ? (CW - CP * 2) / (vals.length - 1) : 0;
  return vals.map((raw, i) => ({
    x: CP + i * step,
    y: CH - CP - ((Number(raw || 0) - Number(minV || 0)) / span) * (CH - CP * 2),
    value: Number(raw || 0),
  }));
}

function smooth(pts) {
  if (!pts.length) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  const c = [`M ${pts[0].x} ${pts[0].y}`];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i], mx = (p.x + q.x) / 2;
    c.push(`C ${mx} ${p.y}, ${mx} ${q.y}, ${q.x} ${q.y}`);
  }
  return c.join(' ');
}

const areaPth = (pts) => {
  if (!pts.length) return '';
  const base = CH - CP;
  return `${smooth(pts)} L ${pts.at(-1).x} ${base} L ${pts[0].x} ${base} Z`;
};

/* ─── Sous-composants ───────────────────────────── */
function TrendBadge({ value, label }) {
  const n = Number(value || 0);
  const Icon = n > 0 ? TrendingUp : n < 0 ? TrendingDown : null;
  return (
    <span className={`resp-trend-badge ${n > 0 ? 'up' : n < 0 ? 'down' : 'flat'}`}>
      {Icon ? <Icon size={11} /> : <span>—</span>}
      {n > 0 ? '+' : ''}{Math.round(n)} {label}
    </span>
  );
}

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    const upd = () => setR(Boolean(q.matches));
    upd();
    q.addEventListener?.('change', upd) ?? q.addListener?.(upd);
    return () => { q.removeEventListener?.('change', upd) ?? q.removeListener?.(upd); };
  }, []);
  return r;
}

function AnimNum({ value, decimals = 0, ms = 600 }) {
  const rm = useReducedMotion();
  const [shown, setShown] = useState(() => Number(value || 0));
  const ref = useRef(shown);
  useEffect(() => { ref.current = shown; }, [shown]);
  useEffect(() => {
    const target = Number(value || 0);
    const start = Number(ref.current || 0);
    if (!Number.isFinite(target) || Math.abs(target - start) < 0.001 || rm) { setShown(target); return; }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / Math.max(120, ms));
      setShown(start + (target - start) * (1 - (1 - t) ** 2));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ms, rm, value]);
  return <span>{Number(shown || 0).toFixed(decimals)}</span>;
}

/* ─── Composant principal ───────────────────────── */
export default function DashboardResp({ userName, onLogout }) {
  const toast    = useToast();
  const navigate = useNavigate();

  /* UI */
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  const [periodKey, setPeriodKey] = useState('7d');
  const [customFrom, setCustomFrom] = useState(() => isoInput(buildRange(30).from));
  const [customTo, setCustomTo] = useState(() => isoInput(new Date()));

  /* Données */
  const [products,    setProducts]    = useState([]);
  const [trend,       setTrend]       = useState([]);
  const [prevTrend,   setPrevTrend]   = useState([]);
  const [topConsumed, setTopConsumed] = useState([]);
  const [prevTop,     setPrevTop]     = useState([]);
  const [forecast,    setForecast]    = useState([]);
  const [pendingTotal,setPendingTotal]= useState(0);
  const [inventoryToValidate, setInventoryToValidate] = useState(0);
  const [chem,        setChem]        = useState({ total: 0, missingFds: 0 });
  const [aiAlerts,    setAiAlerts]    = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [updatedAt,   setUpdatedAt]   = useState(null);
  const [topConsumedRange, setTopConsumedRange] = useState(null);
  const [topConsumedLabel, setTopConsumedLabel] = useState('Sur la période');
  
  const [recommendations, setRecommendations] = useState([]);

  const period = PERIODS.find((p) => p.key === periodKey) ?? PERIODS[1];
  const selectedRange = useMemo(
    () => (periodKey === 'custom' ? buildCustomRange(customFrom, customTo) : buildRange(period.days)),
    [customFrom, customTo, period.days, periodKey],
  );
  const periodLabel = periodKey === 'custom' ? fmtShortRange(selectedRange) : period.label;

  const loadOptionalSignals = useCallback(async () => {
    const now = new Date();
    const [fcRes, chemRes] = await Promise.all([
      post('/ai/predict/stockout', { horizon_days: 7 }).catch(() => ({ predictions: [] })),
      get(`/reports/chemical-register?year=${now.getFullYear()}&month=${now.getMonth() + 1}`).catch(() => ({ rows: [] })),
    ]);

    setForecast(Array.isArray(fcRes?.predictions) ? fcRes.predictions : []);

    const chemRows = Array.isArray(chemRes?.rows) ? chemRes.rows : [];
    const sigs = chemRows.map((row) => computeChemicalRegisterSignals(row));
    setChem({ total: chemRows.length, missingFds: sigs.filter((s) => s.missingFds).length });
  }, []);

  /* Chargement */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r  = selectedRange;
      const pr = buildPrevRange(r);
      const fetchInsights = (range) =>
        get(`/history/insights?${encRange(range)}`).catch(() => ({ daily_trend: [], top_consumed_products: [] }));

      const [prodRes, ins, prevIns, reqRes, aiAlertRes, invRes] = await Promise.all([
        get('/products'),
        fetchInsights(r),
        fetchInsights(pr),
        get('/requests?status=pending').catch(() => []),
        get('/ai/alerts').catch(() => []),
        get('/inventory/responsable/to-validate').catch(() => ({ items: [] })),
      ]);

      const prods = Array.isArray(prodRes) ? prodRes : [];
      setProducts(prods);
      const pendingRows = Array.isArray(reqRes) ? reqRes : [];
      setPendingTotal(pendingRows.length);
      setAiAlerts(Array.isArray(aiAlertRes) ? aiAlertRes : []);
      setInventoryToValidate(Array.isArray(invRes?.items) ? invRes.items.length : 0);

      const normTrend = (rows) => {
        const map = new Map();
        (Array.isArray(rows) ? rows : []).forEach((row) => {
          const day = row?._id?.day;
          if (!day) return;
          if (!map.has(day)) map.set(day, { day, entry: 0, exit: 0, request: 0 });
          const it = map.get(day);
          const at = row?._id?.action_type;
          const c  = Number(row?.count || 0);
          if (at === 'entry') it.entry += c;
          if (at === 'exit') it.exit += c;
          if (at === 'request') it.request += c;
        });
        return [...map.values()].sort((a, b) => new Date(a.day) - new Date(b.day));
      };

      setTrend(normTrend(ins?.daily_trend));
      setPrevTrend(normTrend(prevIns?.daily_trend));

      let prevTopInsights = prevIns;
      let topRange = r;
      let topLabel = periodKey === 'custom' ? 'Période sélectionnée' : period.label;
      let topList = Array.isArray(ins?.top_consumed_products) ? ins.top_consumed_products : [];

      if (topList.length === 0 && Number(r.days || 0) <= 7) {
        for (const fallback of TOP_CONSUMED_FALLBACKS) {
          const fallbackRange = buildRange(fallback.days);
          const fallbackInsights = await fetchInsights(fallbackRange);
          const fallbackRows = Array.isArray(fallbackInsights?.top_consumed_products)
            ? fallbackInsights.top_consumed_products
            : [];
          if (fallbackRows.length > 0 || fallback.days === TOP_CONSUMED_FALLBACKS.at(-1).days) {
            prevTopInsights = await fetchInsights(buildPrevRange(fallbackRange));
            topRange = fallbackRange;
            topLabel = `${fallback.label} auto`;
            topList = fallbackRows;
            break;
          }
        }
      }

      setTopConsumed(topList);
      setPrevTop(Array.isArray(prevTopInsights?.top_consumed_products) ? prevTopInsights.top_consumed_products : []);
      setTopConsumedRange(topRange);
      setTopConsumedLabel(topLabel);
      setUpdatedAt(new Date().toISOString());
      void loadOptionalSignals();
    } catch (err) {
      toast.error(err.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [loadOptionalSignals, period.label, periodKey, selectedRange, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) load(); }, 5 * 60_000);
    return () => clearInterval(id);
  }, [load]);

  /* Calculs dérivés */
  const byId = useMemo(() => {
    const m = new Map();
    products.forEach((p) => { m.set(productId(p), p); if (p?.code_product) m.set(String(p.code_product), p); });
    return m;
  }, [products]);

  const stats = useMemo(() => {
    const total     = products.length;
    const sousSeuil = products.filter((p) => Number(p.quantity_current || 0) <= Number(p.seuil_minimum || 0) && Number(p.quantity_current || 0) > 0).length;
    const rupture   = products.filter((p) => Number(p.quantity_current || 0) === 0).length;
    return { total, sousSeuil, rupture, ok: Math.max(0, total - sousSeuil - rupture), critical: sousSeuil + rupture };
  }, [products]);

  const avail     = clamp(pctSafe(stats.ok, stats.total), 0, 100);
  const availTone = avail >= AVAILABILITY_TARGET ? 'green' : 'red';
  const availabilityGap = Math.round(avail - AVAILABILITY_TARGET);

  const fallbackRisk = useMemo(() => products.map((row) => {
    const stock = Number(row.quantity_current || 0);
    const seuil = Number(row.seuil_minimum   || 0);
    const risk  = stock <= 0 ? 100
      : stock <= seuil ? clamp(62 + ((seuil - stock) / Math.max(1, seuil)) * 38, 62, 98)
      : clamp(20 + (seuil / Math.max(1, stock)) * 35, 5, 58);
    return { product_id: row._id || row.id, code_product: row.code_product, product_name: row.name || row.code_product || 'Produit', risk_probability: +risk.toFixed(1), current_stock: stock, seuil_minimum: seuil, expected_need: Math.max(1, seuil * 0.35), horizon_days: 7 };
  }), [products]);

  const riskSource  = useMemo(() => {
    const src = forecast.length ? forecast : fallbackRisk;
    return [...src].sort((a, b) => Number(b.risk_probability || 0) - Number(a.risk_probability || 0));
  }, [fallbackRisk, forecast]);

  const topRisk    = riskSource[0] ?? null;
  const avgRisk    = Math.round(mean(riskSource.slice(0, 5).map((r) => Number(r.risk_probability || 0))));
  const periodTrendRows = useMemo(() => completeTrendRows(trend, selectedRange), [selectedRange, trend]);
  const prevReqTotal = prevTrend.reduce((s, r) => s + Number(r.request || 0), 0);
  const currReqTotal = periodTrendRows.reduce((s, r) => s + Number(r.request || 0), 0);
  const reqDeltaJ7   = currReqTotal - prevReqTotal;

  /* Graphique demandes */
  const reqSeries = useMemo(() => periodTrendRows.map((r) => ({ label: fmtDay(r.day), value: Number(r.request || 0) })), [periodTrendRows]);
  const reqAxisLabels = useMemo(() => {
    if (reqSeries.length <= 7) return reqSeries.map((s, i) => ({ ...s, key: `${s.label}-${i}` }));
    const step = Math.max(1, Math.ceil((reqSeries.length - 1) / 5));
    return reqSeries
      .map((s, i) => ({ ...s, key: `${s.label}-${i}`, index: i }))
      .filter((s) => s.index === 0 || s.index === reqSeries.length - 1 || s.index % step === 0);
  }, [reqSeries]);
  const reqVals   = reqSeries.map((s) => s.value);
  const reqMax    = Math.max(1, ...reqVals);
  const reqPts    = toPoints(reqVals, 0, reqMax);
  const reqDeltaPct = useMemo(() => {
    return prevReqTotal ? ((currReqTotal - prevReqTotal) / prevReqTotal) * 100 : (currReqTotal ? 100 : 0);
  }, [currReqTotal, prevReqTotal]);

  const estCrit = useCallback((daysAgo) => products.filter((p) => {
    const fc = riskSource.find((r) => String(r.product_id) === productId(p));
    const daily = Number(fc?.expected_need || 0) / Math.max(1, Number(fc?.horizon_days || 7));
    return (Number(p.quantity_current || 0) + daily * daysAgo) <= Number(p.seuil_minimum || 0);
  }).length, [products, riskSource]);

  const workflowCards = useMemo(() => [
    {
      key: 'requests',
      icon: ClipboardList,
      tone: 'urgent',
      value: pendingTotal,
      label: 'Demandes en attente de validation',
      onClick: () => navigate('/responsable/pilotage'),
      deltaJ1: pendingTotal - Number(periodTrendRows.at(-1)?.request || 0),
      deltaJ7: reqDeltaJ7,
    },
    {
      key: 'inventory',
      icon: FileText,
      tone: 'info',
      value: inventoryToValidate,
      label: "Missions d'inventaire à valider",
      onClick: () => navigate('/responsable/inventaires/a-valider'),
      deltaJ1: 0,
      deltaJ7: 0,
    },
  ], [inventoryToValidate, navigate, pendingTotal, periodTrendRows, reqDeltaJ7]);

  const stockHealthCards = useMemo(() => [
    {
      key: 'critical',
      icon: AlertTriangle,
      tone: 'warn',
      value: stats.critical,
      label: stats.critical > 1 ? 'Produits critiques' : 'Produit critique',
      onClick: () => navigate('/responsable/produits?filter=critiques'),
      deltaJ1: stats.critical - estCrit(1),
      deltaJ7: stats.critical - estCrit(7),
    },
    {
      key: 'chemical',
      icon: FlaskConical,
      tone: 'info',
      value: chem.missingFds,
      label: chem.missingFds > 1 ? 'FDS manquantes' : 'FDS manquante',
      onClick: () => navigate('/responsable/registre-chimique'),
      deltaJ1: 0,
      deltaJ7: 0,
    },
  ], [chem.missingFds, estCrit, navigate, stats.critical]);

  /* Courbe stock / seuil */
  const stockCurve = useMemo(() => {
    if (!topRisk) return null;
    const cur  = Number(topRisk.current_stock || 0);
    const thr  = Number(topRisk.seuil_minimum || 0);
    const burn = Math.max(0.2, Number(topRisk.expected_need || 0) / Math.max(1, Number(topRisk.horizon_days || 7)), thr * 0.08);
    const rows = periodTrendRows.slice(-7);
    const past = [];
    let runStock = cur;
    for (let i = rows.length - 1; i >= 0; i--) {
      runStock = Math.max(0, runStock + Number(rows[i].exit || 0) - Number(rows[i].entry || 0));
      past.unshift(+runStock.toFixed(2));
    }
    while (past.length < 7) { const idx = 7 - past.length; past.unshift(+(Math.max(cur + burn * idx * 0.75, cur)).toFixed(2)); }
    const proj    = Array.from({ length: 8 }, (_, i) => +(Math.max(0, cur - burn * i)).toFixed(2));
    const vals    = [...past.slice(-7), ...proj];
    const offsets = [-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7];
    const mx      = Math.max(thr + 1, ...vals);
    const mn      = Math.min(0, thr, ...vals);
    const pts     = toPoints(vals, mn, mx);
    const thrY    = toPoints([thr], mn, mx)[0]?.y ?? 0;
    const ci      = vals.findIndex((v, i) => offsets[i] >= 0 && v <= thr);
    let crossing  = null;
    if (ci >= 0) {
      const pi = Math.max(0, ci - 1);
      const rr = vals[pi] === vals[ci] ? 0 : clamp((vals[pi] - thr) / (vals[pi] - vals[ci]), 0, 1);
      crossing  = { x: pts[pi].x + (pts[ci].x - pts[pi].x) * rr, y: thrY, label: offsets[ci] === 0 ? 'J+0' : `J+${Math.max(0, offsets[ci] - (rr < 1 ? 1 : 0) + rr).toFixed(rr % 1 ? 1 : 0)}` };
    }
    return { vals, pts, thr, thrY, crossing };
  }, [periodTrendRows, topRisk]);

  /* Top consommés */
  const topRows = useMemo(() => {
    const prevMap = new Map();
    prevTop.forEach((r) => prevMap.set(String(r.product_id || r.code_product || r.designation || ''), Number(r.total_qty || 0)));
    const rows = topConsumed.slice(0, 5);
    const maxQ = Math.max(1, ...rows.map((r) => Number(r.total_qty || 0)));
    return rows.map((row, i) => {
      const p   = byId.get(String(row.product_id || '')) ?? byId.get(String(row.code_product || '')) ?? {};
      const key = String(row.product_id || row.code_product || row.designation || '');
      const qty = Number(row.total_qty || 0);
      return { key: key || `${row.designation}-${i}`, rank: i + 1, code: row.code_product || p.code_product || '-', name: row.designation || p.name || row.code_product || 'Produit', category: bizCat(p), qty, ratio: clamp(qty / maxQ, 0, 1), trend: Math.round(qty - Number(prevMap.get(key) || 0)) };
    });
  }, [byId, prevTop, topConsumed]);

  const criticalNow = Boolean(stockCurve && stockCurve.vals[7] <= stockCurve.thr);
  const alertName   = topRisk?.product_name || topRisk?.code_product || 'Produit critique';
  const criticalActionCount = criticalNow ? 1 : 0;
  const aiAlertSummary = useMemo(() => {
    const rows = Array.isArray(aiAlerts) ? aiAlerts : [];
    const active = rows.filter((a) => String(a?.status || 'new').toLowerCase() !== 'reviewed');
    const highRows = active.filter((a) => String(a?.risk_level || '').toLowerCase() === 'high');
    const ruptureRows = active.filter((a) => String(a?.alert_type || '').toLowerCase() === 'rupture');
    const criticalRuptures = active.filter((a) =>
      String(a?.risk_level || '').toLowerCase() === 'high'
      && String(a?.alert_type || '').toLowerCase() === 'rupture'
    );
    const focusRows = criticalRuptures.length ? criticalRuptures : active.slice(0, 10);
    const latest = focusRows[0] || rows[0] || null;
    const product = latest?.product?.name || latest?.product?.code_product || 'Aucun signal actif';
    return {
      total: rows.length,
      active: active.length,
      high: highRows.length,
      rupture: ruptureRows.length,
      criticalRuptures: criticalRuptures.length,
      focus: focusRows.length,
      focusMode: criticalRuptures.length ? 'ruptures critiques' : 'top 10 priorités',
      product,
    };
  }, [aiAlerts]);

  const openConso = useCallback((q) => {
    const range = topConsumedRange || selectedRange;
    const p = new URLSearchParams({ from: isoDay(range.from), to: isoDay(range.to) });
    if (q) p.set('q', String(q).trim());
    navigate(`/responsable/consommation?${p}`);
  }, [navigate, selectedRange, topConsumedRange]);

  const generateRecommendations = useCallback(() => {
    const recs = [];

    if (topRisk && Number(topRisk.risk_probability || 0) > 50) {
      recs.push({
        id: 'rec-1',
        type: 'restock',
        product: topRisk.product_name || topRisk.code_product || 'Produit',
        quantity: Math.ceil(Number(topRisk.seuil_minimum || 0) * 1.5),
        urgency: Number(topRisk.risk_probability || 0) > 80 ? 'URGENT' : 'NORMAL',
        action: () => navigate('/responsable/commandes/nouvelle'),
      });
    }

    if (stats.critical > 2) {
      recs.push({
        id: 'rec-2',
        type: 'optimize',
        detail: `Optimiser FIFO/FEFO pour ${stats.critical} produits critiques`,
        gain: '15-20%',
        action: () => navigate('/responsable/produits?filter=critiques'),
      });
    }

    const unused = products.filter((p) => {
      const lastMove = p.last_movement_date;
      if (!lastMove) return true;
      const days = (new Date() - new Date(lastMove)) / DAY_MS;
      return days > 180;
    });

    if (unused.length > 0) {
      recs.push({
        id: 'rec-3',
        type: 'archive',
        count: unused.length,
        action: () => navigate('/responsable/produits?filter=inutilises'),
      });
    }

    return recs;
  }, [navigate, products, stats.critical, topRisk]);

  useEffect(() => {
    setRecommendations(generateRecommendations());
  }, [generateRecommendations]);

  /* ─── Rendu ─────────────────────────────────── */
  return (
    <ProtectedPage userName={userName}>
      <div className="app-layout">
        <div className={`sidebar-backdrop ${collapsed ? 'hidden' : ''}`} onClick={() => setCollapsed(true)} />
        <SidebarResp collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} onLogout={onLogout} userName={userName} />

        <div className="main-container">
          <HeaderPage
            userName={userName}
            title="Tableau de bord"
            subtitle={`Mis à jour ${fmtDateTime(updatedAt)}`}
            showSearch={false}
            onRefresh={load}
            onMenuClick={() => setCollapsed((v) => !v)}
          />

          <main className="main-content dashboard-main">
            {loading && <LoadingSpinner overlay text="Chargement..." />}

            <div className="resp-dash-page">

              {/* Filtres du dashboard */}
              <section className="resp-dash-topbar" aria-label="Filtres du tableau de bord">
                <div className="resp-period-summary">
                  <CalendarDays size={16} />
                  <span>
                    <small>Activite analysee</small>
                    <strong>{periodLabel}</strong>
                  </span>
                </div>
                <div className="resp-dash-actions">
                  <nav className="resp-period-selector" aria-label="Période">
                    {PERIODS.map((p) => (
                      <button type="button" key={p.key} className={`resp-period-btn${periodKey === p.key ? ' active' : ''}`} onClick={() => setPeriodKey(p.key)}>
                        {p.label}
                      </button>
                    ))}
                  </nav>
                  <button type="button" className="resp-refresh-btn" onClick={load} disabled={loading}>
                    <RefreshCw size={14} />
                    Actualiser
                  </button>
                </div>
                {periodKey === 'custom' && (
                  <div className="resp-custom-range" aria-label="Plage personnalisee">
                    <label>
                      Du
                      <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                    </label>
                    <label>
                      Au
                      <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                    </label>
                  </div>
                )}
              </section>

              {/* ── Alerte critique ── */}
              {criticalNow && (
                <section className="resp-alert-banner" aria-live="polite">
                  <ShieldAlert size={18} className="resp-alert-icon" />
                  <div className="resp-alert-copy">
                    <strong>Stock critique — rupture aujourd'hui</strong>
                    <span>{alertName} est sous le seuil. Réapprovisionnement urgent requis.</span>
                  </div>
                  <button type="button" className="resp-alert-action" onClick={() => navigate('/responsable/commandes/nouvelle')}>
                    Agir maintenant ({criticalActionCount}) <ChevronRight size={13} />
                  </button>
                </section>
              )}

              {/* ── Synthèse rapide ── */}
              <section className="resp-summary-row focused" aria-label="Synthèse directive">
                {[
                  { label: 'Concentration du risque', value: `${avgRisk || 0}%`, color: 'warn', hint: 'Top 5 produits à sécuriser' },
                  {
                    label: 'Disponibilité',
                    value: `${Math.round(avail)}%`,
                    color: availTone === 'green' ? 'green' : 'danger',
                    hint: availabilityGap < 0 ? `${availabilityGap}% sous l'objectif` : 'Objectif atteint',
                  },
                ].map((m) => (
                  <div key={m.label} className={`resp-summary-pill ${m.color}`}>
                    <strong>{m.value}</strong>
                    <span>{m.label}</span>
                    <small>{m.hint}</small>
                  </div>
                ))}
              </section>

              <section className="resp-action-lanes" aria-label="Actions responsable">
                {[
                  { title: 'Ligne A', subtitle: 'Flux - à valider', cards: workflowCards },
                  { title: 'Ligne B', subtitle: 'Santé du stock', cards: stockHealthCards },
                ].map((lane) => (
                  <div className="resp-action-lane" key={lane.title}>
                    <div className="resp-action-lane-head">
                      <span>{lane.title}</span>
                      <strong>{lane.subtitle}</strong>
                    </div>
                    <div className="resp-priorities compact">
                      {lane.cards.map((card) => {
                        const Icon = card.icon;
                        return (
                          <button type="button" className={`resp-priority-card ${card.tone}`} key={card.key} onClick={card.onClick}>
                            <span className="resp-priority-icon"><Icon size={22} /></span>
                            <span className="resp-priority-copy">
                              <strong><AnimNum value={card.value} /></strong>
                              <span>{card.label}</span>
                            </span>
                            <span className="resp-priority-trends">
                              <TrendBadge value={card.deltaJ1} label="vs J-1" />
                              <TrendBadge value={card.deltaJ7} label="vs J-7" />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </section>

              {/* ── Section IA & Recommandations ── */}
              <section className="resp-ia-section elevated">
                <div className="resp-ia-container">

                  <article className="resp-ai-alerts-panel">
                    <div className="resp-card-header">
                      <h3><ShieldAlert size={15} /> Alertes IA prioritaires</h3>
                      <span className={`resp-badge ${aiAlertSummary.focus > 0 ? 'danger' : 'green'}`}>
                        {aiAlertSummary.focus > 0 ? `${aiAlertSummary.focus} prioritaires` : 'À jour'}
                      </span>
                    </div>

                    <div className="resp-ai-alerts-grid focused">
                      <div>
                        <span>Rupture critique</span>
                        <strong className={aiAlertSummary.criticalRuptures > 0 ? 'danger' : 'ok'}>{aiAlertSummary.criticalRuptures}</strong>
                      </div>
                      <div>
                        <span>Critiques</span>
                        <strong className={aiAlertSummary.high > 0 ? 'danger' : 'ok'}>{aiAlertSummary.high}</strong>
                      </div>
                      <div>
                        <span>Vue</span>
                        <strong className="resp-ai-mode">{aiAlertSummary.focusMode}</strong>
                      </div>
                    </div>

                    <p className="resp-ai-alerts-note">
                      {aiAlertSummary.focus > 0
                        ? `Dernier signal prioritaire: ${aiAlertSummary.product}`
                        : 'Aucune rupture critique active à traiter pour le moment.'}
                    </p>

                    <button
                      type="button"
                      className="resp-ai-alerts-action"
                      onClick={() => navigate('/responsable/pilotage?tab=alertes')}
                    >
                      Ouvrir les priorités IA <ChevronRight size={14} />
                    </button>
                  </article>

                  <article className="resp-recommendations-panel">
                    <div className="resp-card-header">
                      <h3><Zap size={15} /> Recommandations IA</h3>
                      <span className="resp-badge blue">{recommendations.length} actions</span>
                    </div>

                    {recommendations.length > 0 ? (
                      <div className="resp-recommendations-list">
                        {recommendations.map((rec) => {
                          const type = RECOMMENDATION_TYPES[rec.type];
                          return (
                            <button
                              key={rec.id}
                              type="button"
                              className={`resp-recommendation-item ${type.color}`}
                              onClick={rec.action}
                            >
                              <span className="resp-rec-icon">{type.icon}</span>
                              <span className="resp-rec-content">
                                <strong>{type.label}</strong>
                                {rec.product && <small>{rec.product} - {rec.quantity} unités</small>}
                                {rec.detail && <small>{rec.detail}</small>}
                                {rec.count && <small>{rec.count} éléments concernés</small>}
                              </span>
                              {rec.urgency && <span className={`resp-rec-urgency ${rec.urgency.toLowerCase()}`}>{rec.urgency}</span>}
                              {rec.gain && <span className="resp-rec-gain">+{rec.gain}</span>}
                              <ChevronRight size={12} className="resp-rec-arrow" />
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="resp-empty-state compact">Aucune recommandation pour le moment.</div>
                    )}
                  </article>

                </div>
              </section>

              {/* ── Graphiques ── */}
              <section className="resp-grid two">

                {/* Évolution demandes */}
                <article className="resp-card">
                  <div className="resp-card-header">
                    <h3><BarChart3 size={15} /> Évolution des demandes</h3>
                    <span className="resp-badge blue">Sur la période</span>
                  </div>
                  {reqPts.length > 0 ? (
                    <>
                      <div className="resp-chart-area">
                        <svg viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" className="resp-chart-svg">
                          <defs>
                            <linearGradient id="gDem" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%"   stopColor="var(--accent)" stopOpacity="0.18" />
                              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          <line x1="0" y1={CH - CP} x2={CW} y2={CH - CP} className="resp-grid-line strong" />
                          <path d={areaPth(reqPts)} fill="url(#gDem)" />
                          <path d={smooth(reqPts)} className="resp-line accent" />
                          {reqSeries.map((s, i) => reqPts[i] && (
                            <circle key={s.label} cx={reqPts[i].x} cy={reqPts[i].y} r="3" className="resp-point accent" />
                          ))}
                        </svg>
                        <div className="resp-x-labels" style={{ gridTemplateColumns: `repeat(${Math.max(1, reqAxisLabels.length)}, minmax(0, 1fr))` }}>
                          {reqAxisLabels.map((s) => <span key={s.key}>{s.label}</span>)}
                        </div>
                      </div>
                      <p className="resp-card-note">
                        {reqDeltaPct >= 0 ? 'En hausse' : 'En baisse'}
                        <strong> {reqDeltaPct >= 0 ? '+' : ''}{reqDeltaPct.toFixed(1)}%</strong> vs période précédente
                      </p>
                    </>
                  ) : (
                    <div className="resp-empty-state">Aucune donnée sur la période.</div>
                  )}
                </article>

                {/* Stock vs Seuil */}
                <article className="resp-card">
                  <div className="resp-card-header">
                    <h3><CalendarDays size={15} /> Stock vs seuil critique</h3>
                    <span className="resp-badge sky">Projection J+7</span>
                  </div>
                  {stockCurve ? (
                    <>
                      <div className="resp-chart-area seuil">
                        <svg viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" className="resp-chart-svg">
                          <defs>
                            <linearGradient id="gStock" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%"   stopColor="var(--accent2)" stopOpacity="0.18" />
                              <stop offset="100%" stopColor="var(--accent2)" stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          <rect x={stockCurve.pts[7]?.x ?? 210} y="0" width={CW - (stockCurve.pts[7]?.x ?? 210)} height={CH - CP} className="resp-projection-zone" />
                          <line x1="0" y1={CH - CP} x2={CW} y2={CH - CP} className="resp-grid-line strong" />
                          <line x1="0" y1={stockCurve.thrY} x2={CW} y2={stockCurve.thrY} className="resp-threshold-line" />
                          <text x={CW - 6} y={Math.max(10, stockCurve.thrY - 5)} className="resp-threshold-label" textAnchor="end">Seuil</text>
                          <path d={areaPth(stockCurve.pts)} fill="url(#gStock)" />
                          <path d={smooth(stockCurve.pts)} className="resp-line stock" />
                          <text x={CW - 90} y="12" className="resp-projection-label" textAnchor="middle">Projection J+7</text>
                          {stockCurve.crossing && (
                            <>
                              <circle cx={stockCurve.crossing.x} cy={stockCurve.crossing.y} r="4.5" className="resp-point danger" />
                              <text x={Math.max(30, stockCurve.crossing.x - 8)} y={Math.max(14, stockCurve.crossing.y - 8)} className="resp-crossing-label">
                                {stockCurve.crossing.label}
                              </text>
                            </>
                          )}
                        </svg>
                        <div className="resp-x-labels stock">
                          <span>J-7</span><span>Auj.</span><span>J+7</span>
                        </div>
                      </div>
                      <div className="resp-seuil-note">
                        <AlertTriangle size={13} />
                        {stockCurve.crossing
                          ? `Croisement du seuil estimé à ${stockCurve.crossing.label}. Agir aujourd'hui.`
                          : 'Aucun croisement détecté sur J+7.'}
                      </div>
                      <div className="resp-legend">
                        <span><i className="dot stock" /> Stock réel</span>
                        <span><i className="dot threshold" /> Seuil</span>
                        <span><i className="dot projection" /> Projection</span>
                      </div>
                    </>
                  ) : (
                    <div className="resp-empty-state">Aucun produit critique à afficher.</div>
                  )}
                </article>
              </section>

              {/* ── Grille basse ── */}
              <section className="resp-grid two lower">

                {/* Top produits */}
                <article className="resp-card">
                  <div className="resp-card-header">
                    <h3><ShoppingCart size={15} /> Top produits consommés</h3>
                    <span className="resp-badge violet">Top 5 - {topConsumedLabel}</span>
                  </div>
                  <div className="resp-products-list">
                    {topRows.length ? topRows.map((row) => (
                      <button type="button" className="resp-product-row" key={row.key} onClick={() => openConso(row.code || row.name)}>
                        <span className="resp-product-rank">#{row.rank}</span>
                        <span className="resp-product-info">
                          <strong title={row.name}>{row.name}</strong>
                          <small>{row.code} · {row.category}</small>
                        </span>
                        <span className="resp-product-bar-wrap" aria-hidden="true">
                          <span className={`resp-product-bar rank-${row.rank}`} style={{ width: `${Math.round(row.ratio * 100)}%` }} />
                        </span>
                        <span className="resp-product-count">{Math.round(row.qty)}</span>
                        <span className={`resp-product-trend ${row.trend >= 0 ? 'up' : 'down'}`}>
                          {row.trend >= 0 ? `+${row.trend}` : row.trend}
                        </span>
                      </button>
                    )) : (
                      <div className="resp-empty-state compact">Aucune consommation exploitable sur 7 jours, 30 jours ou 3 mois.</div>
                    )}
                  </div>
                </article>

                <div className="resp-side-stack">

                  {/* Disponibilité */}
                  <article className="resp-card">
                    <div className="resp-card-header">
                      <h3><CheckCircle2 size={15} /> Disponibilité stock</h3>
                      <span className={`resp-badge ${availTone === 'green' ? 'green' : 'danger'}`}>
                        {availTone === 'green' ? 'Bon niveau' : availTone === 'orange' ? 'Attention' : 'Critique'}
                      </span>
                    </div>
                    <div className="resp-availability-wrap">
                      <div className={`resp-donut ${availTone}`}>
                        <svg viewBox="0 0 100 100" width="96" height="96">
                          <circle cx="50" cy="50" r="38" className="resp-donut-track" />
                          <circle cx="50" cy="50" r="38" className="resp-donut-progress"
                            style={{ strokeDasharray: `${2 * Math.PI * 38}`, strokeDashoffset: `${(2 * Math.PI * 38) * (1 - avail / 100)}` }} />
                        </svg>
                        <div className="resp-donut-label">
                          <strong><AnimNum value={avail} decimals={1} />%</strong>
                          <span>Disponible</span>
                        </div>
                      </div>
                      <div className="resp-availability-stats">
                        <div><span className="ok">● OK</span><strong>{stats.ok}</strong></div>
                        <div><span className="danger">● Critiques</span><strong>{stats.critical}</strong></div>
                        <div><span>Total</span><strong>{stats.total}</strong></div>
                        <p className={availTone}>
                          Objectif &gt; {AVAILABILITY_TARGET}% · {availabilityGap < 0 ? `${availabilityGap}% sous l'objectif` : 'objectif atteint'}
                        </p>
                      </div>
                    </div>
                  </article>

                  {/* Registre chimique */}
                  <article className="resp-card">
                    <div className="resp-card-header">
                      <h3><FlaskConical size={15} /> Registre chimique</h3>
                      {chem.missingFds > 0
                        ? <span className="resp-badge danger">{chem.missingFds} FDS</span>
                        : <span className="resp-badge green">✓ Conforme</span>}
                    </div>
                    <div className="resp-register-list">
                      <div><span>Produits</span><strong>{chem.total}</strong></div>
                      <div><span>FDS manquantes</span><strong className={chem.missingFds > 0 ? 'danger' : 'ok'}>{chem.missingFds}</strong></div>
                      <div>
                        <span>Conformité</span>
                        <strong className={chem.missingFds === 0 ? 'ok' : 'danger'}>
                          {chem.total ? Math.round(((chem.total - chem.missingFds) / chem.total) * 100) : 0}%
                        </strong>
                      </div>
                    </div>
                    <div className="resp-register-progress">
                      <div className="resp-progress-bar">
                        <div className="resp-progress-fill" style={{width: `${chem.total ? Math.round(((chem.total - chem.missingFds) / chem.total) * 100) : 0}%`}}></div>
                      </div>
                    </div>
                    <button 
                      type="button" 
                      className={`resp-register-action ${chem.missingFds > 0 ? 'urgent' : ''}`}
                      onClick={() => navigate('/responsable/registre-chimique')}
                    >
                      {chem.missingFds > 0 ? '⚠️ Compléter maintenant' : '✓ Consulter'} <ChevronRight size={13} />
                    </button>
                  </article>

                </div>
              </section>

            </div>
          </main>
        </div>
      </div>
    </ProtectedPage>
  );
}
