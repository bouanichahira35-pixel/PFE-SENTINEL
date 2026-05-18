import { useCallback, useEffect, useMemo, useRef, useState } from 'react'; 
import { 
  AlertTriangle, 
  Package, 
  Activity,
  CheckCircle2,
  RefreshCw,
  Clock,
  ClipboardCheck,
  FlaskConical,
  ShieldAlert,
  LineChart,
  PieChart,
  ShoppingCart,
  Sparkles,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get, post } from '../../services/api';
import ProtectedImage from '../../components/shared/ProtectedImage';
import { computeChemicalRegisterSignals } from '../../utils/chemicalRegister';
import './DashboardResp.css';

const CHART_WIDTH = 360;
const CHART_HEIGHT = 170;
const CHART_PAD_X = 18; 
const CHART_PAD_Y = 16; 

function clamp(value, min, max) { 
  return Math.min(max, Math.max(min, value)); 
} 

function mean(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function formatDayLabel(dayValue) {
  if (!dayValue) return '-';
  const date = new Date(dayValue);
  if (Number.isNaN(date.getTime())) return String(dayValue).slice(5);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function formatIsoDay(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function levelFromRisk(probability, stock, seuil) {
  const inRupture = Number(stock || 0) <= 0;
  const underThreshold = Number(stock || 0) > 0 && Number(stock || 0) <= Number(seuil || 0);
  if (inRupture || Number(probability || 0) >= 70) return 'Critique';
  if (underThreshold || Number(probability || 0) >= 40) return 'Moyen';
  return 'Faible';
}

function toLineCoords(values, minValue, maxValue) {
  if (!Array.isArray(values) || !values.length) return [];
  const usableMin = Number.isFinite(minValue) ? minValue : 0;
  const usableMax = Number.isFinite(maxValue) ? maxValue : 1;
  const span = Math.max(1, usableMax - usableMin);
  const stepX = values.length > 1
    ? (CHART_WIDTH - CHART_PAD_X * 2) / (values.length - 1)
    : 0;

  return values.map((v, index) => {
    const normalized = (Number(v || 0) - usableMin) / span;
    const x = CHART_PAD_X + index * stepX;
    const y = CHART_HEIGHT - CHART_PAD_Y - normalized * (CHART_HEIGHT - CHART_PAD_Y * 2);
    return { x, y };
  });
}

function toPolylinePoints(coords) {
  return coords.map((point) => `${point.x},${point.y}`).join(' ');
}

function toAreaPath(coords) {
  if (!coords.length) return '';
  const baselineY = CHART_HEIGHT - CHART_PAD_Y;
  const start = coords[0];
  const end = coords[coords.length - 1];
  return [
    `M ${start.x} ${baselineY}`,
    ...coords.map((point) => `L ${point.x} ${point.y}`),
    `L ${end.x} ${baselineY}`,
    'Z',
  ].join(' ');
}

function formatDateTimeLabel(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function buildRange(periodDays) {
  const days = Math.max(1, Number(periodDays || 30));
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to, days };
}

function buildMonthToDateRange() {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), 1);
  const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
  return { from, to, days };
}

function pctSafe(numerator, denominator) {
  const den = Number(denominator || 0);
  if (den <= 0) return 0;
  return (Number(numerator || 0) / den) * 100;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(Boolean(query.matches));
    update();
    if (typeof query.addEventListener === 'function') query.addEventListener('change', update);
    else query.addListener?.(update);
    return () => {
      if (typeof query.removeEventListener === 'function') query.removeEventListener('change', update);
      else query.removeListener?.(update);
    };
  }, []);

  return reduced;
}

function AnimatedNumber({ value, decimals = 0, durationMs = 650 }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [shown, setShown] = useState(() => Number(value || 0));
  const shownRef = useRef(shown);

  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  useEffect(() => {
    const target = Number(value || 0);
    const start = Number(shownRef.current || 0);
    if (!Number.isFinite(target) || !Number.isFinite(start)) {
      setShown(target);
      return undefined;
    }
    if (Math.abs(target - start) < 0.0001) {
      setShown(target);
      return undefined;
    }

    if (prefersReducedMotion || typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') {
      setShown(target);
      return undefined;
    }

    const startedAt = performance.now();
    let raf = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - startedAt) / Math.max(120, durationMs));
      const eased = 1 - (1 - t) * (1 - t);
      const next = start + (target - start) * eased;
      setShown(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [decimals, durationMs, prefersReducedMotion, value]);

  const formatted = Number(shown || 0).toFixed(decimals);
  return <span>{formatted}</span>;
}

const DashboardResp = ({ userName, onLogout }) => {
  const toast = useToast();
  const navigate = useNavigate();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [periodDays, setPeriodDays] = useState(30);
  const [allProducts, setAllProducts] = useState([]);
  const [historyTrend, setHistoryTrend] = useState([]);
  const [topConsumedProducts, setTopConsumedProducts] = useState([]);
  const [historyAnomalies, setHistoryAnomalies] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [, setAiModelStatus] = useState(null);
  const [assistantStatus, setAssistantStatus] = useState(null);
  const [stockoutForecast, setStockoutForecast] = useState([]);
  const [aiAlerts, setAiAlerts] = useState([]);
  const [supplierOps, setSupplierOps] = useState(() => ({ active_suppliers: 0, open_orders: 0, late_open_orders: 0 }));
  const [isLoading, setIsLoading] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [pendingUrgentCount, setPendingUrgentCount] = useState(0);
  const [pendingAvgWaitDays, setPendingAvgWaitDays] = useState(0);
  const [prioritiesTodayCount, setPrioritiesTodayCount] = useState(0);
  const [inventoriesToValidateCount, setInventoriesToValidateCount] = useState(0);
  const [inactiveProductsCount, setInactiveProductsCount] = useState(0);
  const [expiringLotsCount, setExpiringLotsCount] = useState(0);
  const [opsTab, setOpsTab] = useState('alertes');
  const [chemicalSummary, setChemicalSummary] = useState(() => ({
    total: 0,
    missingFds: 0,
    withoutClass: 0,
    toComplete: 0,
    toWatch: 0,
    sensitive: 0,
    expiringLots: 0,
  }));

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const range = periodDays === 'month' ? buildMonthToDateRange() : buildRange(periodDays);
      const fromIso = encodeURIComponent(range.from.toISOString());
      const toIso = encodeURIComponent(range.to.toISOString());
      const now = new Date();
      const chemYear = now.getFullYear();
      const chemMonth = now.getMonth() + 1;

      await post('/ai/alerts/refresh', { window_days: range.days }).catch(() => null);

      const [
        all,
        insights,
        stockoutRes,
        activityRes,
        modelStatusRes,
        assistantStatusRes,
        supplierInsightsRes,
        aiAlertsRes,
        pendingRequests,
        inventoriesToValidate,
        expiringLots,
        inactiveProducts,
        chemicalRegister,
      ] = await Promise.all([
        get('/products'),
        get(`/history/insights?from=${fromIso}&to=${toIso}`).catch(() => ({ daily_trend: [], top_consumed_products: [], anomalies: [] })),
        post('/ai/predict/stockout', { horizon_days: 7 }).catch(() => ({ predictions: [] })),
        get(`/history?limit=12&from=${fromIso}&to=${toIso}`).catch(() => ({ items: [] })),
        get('/ai/models/status').catch(() => null),
        get('/ai/assistant/status').catch(() => null),
        get('/suppliers/insights?max=3&window_days=180').catch(() => null),
        get('/ai/alerts').catch(() => []),
        get('/requests?status=pending').catch(() => []),
        get('/inventory/responsable/to-validate').catch(() => ({ items: [] })),
        get('/stock/lots/expiring?days=30').catch(() => ({ count: 0 })),
        get('/products/inactive?days=60').catch(() => ({ items: [] })),
        get(`/reports/chemical-register?year=${encodeURIComponent(chemYear)}&month=${encodeURIComponent(chemMonth)}`).catch(() => ({ rows: [] })),
      ]);

      setAllProducts(Array.isArray(all) ? all : []);
      setStockoutForecast(Array.isArray(stockoutRes?.predictions) ? stockoutRes.predictions : []);

      const pendingList = Array.isArray(pendingRequests) ? pendingRequests : [];
      setPendingRequestsCount(pendingList.length);

      const nowTs = Date.now();
      const msPerDay = 24 * 60 * 60 * 1000;

      const waitDays = pendingList
        .map((r) => {
          const raw = r?.date_request || r?.createdAt || null;
          if (!raw) return null;
          const d = new Date(raw);
          const ts = d.getTime();
          if (Number.isNaN(ts)) return null;
          return Math.max(0, (nowTs - ts) / msPerDay);
        })
        .filter((x) => typeof x === 'number' && Number.isFinite(x));

      const hasWaitData = waitDays.length > 0;
      const avgWait = waitDays.length ? waitDays.reduce((sum, v) => sum + v, 0) / waitDays.length : 0;
      setPendingAvgWaitDays(waitDays.length ? Math.max(0, Math.round(avgWait * 10) / 10) : 0);
      // If dates are missing/unparseable, fall back to a simple note in the UI.
      if (!hasWaitData && pendingList.length) setPendingAvgWaitDays(null);

      const urgentCount = pendingList.filter((r) => {
        const p = String(r?.priority || '').toLowerCase();
        if (p === 'urgent' || p === 'critical') return true;
        const raw = r?.date_request || r?.createdAt || null;
        if (!raw) return false;
        const d = new Date(raw);
        const ts = d.getTime();
        if (Number.isNaN(ts)) return false;
        return nowTs - ts >= 48 * 60 * 60 * 1000;
      }).length;
      setPendingUrgentCount(urgentCount);
      setPrioritiesTodayCount(urgentCount);

      const toValidateCount = Array.isArray(inventoriesToValidate?.items) ? inventoriesToValidate.items.length : 0;
      setInventoriesToValidateCount(toValidateCount);

      const inactiveCount = Array.isArray(inactiveProducts?.items) ? inactiveProducts.items.length : 0;
      setInactiveProductsCount(inactiveCount);

      setExpiringLotsCount(Math.max(0, Math.floor(Number(expiringLots?.count || 0))));

      const chemRows = Array.isArray(chemicalRegister?.rows) ? chemicalRegister.rows : [];
      const chemSignals = chemRows.map((r) => computeChemicalRegisterSignals(r));
      const chemTotal = chemRows.length;
      const chemMissingFds = chemSignals.filter((s) => s.missingFds).length;
      const chemWithoutClass = chemSignals.filter((s) => s.missingClass).length;
      const chemToComplete = chemSignals.filter((s) => s.status === 'À compléter').length;
      const chemSensitive = chemSignals.filter((s) => s.sensitive).length;
      const chemToWatch = chemSignals.filter((s) => s.status === 'À surveiller' || s.status === 'Sensible').length;
      const chemExpiringLots = chemRows.reduce((acc, r) => acc + Math.max(0, Math.floor(Number(r?.lots_expiring_30d || 0))), 0);
      setChemicalSummary({
        total: chemTotal,
        missingFds: chemMissingFds,
        withoutClass: chemWithoutClass,
        toComplete: chemToComplete,
        toWatch: chemToWatch,
        sensitive: chemSensitive,
        expiringLots: chemExpiringLots,
      });

      const dailyRows = Array.isArray(insights?.daily_trend) ? insights.daily_trend : [];
      const byDay = new Map();
      dailyRows.forEach((row) => {
        const day = row?._id?.day;
        const actionType = row?._id?.action_type;
        const count = Number(row?.count || 0);
        if (!day) return;
        if (!byDay.has(day)) byDay.set(day, { day, entry: 0, exit: 0, request: 0 });
        const item = byDay.get(day);
        if (actionType === 'entry') item.entry += count;
        if (actionType === 'exit') item.exit += count;
        if (actionType === 'request') item.request += count;
      });
      setHistoryTrend(
        Array.from(byDay.values())
          .sort((a, b) => new Date(a.day) - new Date(b.day))
          .slice(-20)
      );

      setTopConsumedProducts(Array.isArray(insights?.top_consumed_products) ? insights.top_consumed_products : []);
      setHistoryAnomalies(Array.isArray(insights?.anomalies) ? insights.anomalies : []);
      setRecentActivity(Array.isArray(activityRes?.items) ? activityRes.items.slice(0, 6) : []);
      setAiModelStatus(modelStatusRes && typeof modelStatusRes === 'object' ? modelStatusRes : null);
      setAssistantStatus(assistantStatusRes && typeof assistantStatusRes === 'object' ? assistantStatusRes : null);
      setAiAlerts(Array.isArray(aiAlertsRes) ? aiAlertsRes : []);
      setSupplierOps(
        supplierInsightsRes?.summary && supplierInsightsRes?.ok
          ? supplierInsightsRes.summary
          : { active_suppliers: 0, open_orders: 0, late_open_orders: 0 }
      );
    } catch (err) {
      toast.error(err.message || 'Erreur chargement dashboard');
    } finally {
      setIsLoading(false);
    }
  }, [periodDays, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) loadData();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  const stats = useMemo(() => {
    const totalProduits = allProducts.length;
    const sousSeuilCount = allProducts.filter(
      (p) => Number(p.quantity_current || 0) <= Number(p.seuil_minimum || 0) && Number(p.quantity_current || 0) > 0
    ).length;
    const ruptureCount = allProducts.filter((p) => Number(p.quantity_current || 0) === 0).length;
    const disponiblesCount = Math.max(0, totalProduits - sousSeuilCount - ruptureCount);
    return { totalProduits, sousSeuilCount, ruptureCount, disponiblesCount };
  }, [allProducts]);

  const movementStats = useMemo(() => {
    const entries = historyTrend.reduce((acc, x) => acc + Number(x.entry || 0), 0);
    const exits = historyTrend.reduce((acc, x) => acc + Number(x.exit || 0), 0);
    const total = entries + exits;
    return { entries, exits, total };
  }, [historyTrend]);

  const availabilityRate = useMemo(() => {
    const ok = Number(stats.disponiblesCount || 0);
    const total = Number(stats.totalProduits || 0);
    return clamp(pctSafe(ok, total), 0, 100);
  }, [stats.disponiblesCount, stats.totalProduits]);

  const fallbackRiskSource = useMemo(() => (
    allProducts.map((row) => {
      const stock = Number(row.quantity_current || 0);
      const seuil = Number(row.seuil_minimum || 0);
      const inRupture = stock <= 0;
      const underThreshold = stock > 0 && stock <= seuil;
      const closeToThreshold = seuil > 0 && stock > seuil && stock <= seuil * 1.2;

      const baseRisk = inRupture
        ? 100
        : underThreshold
          ? clamp(60 + ((seuil - stock) / Math.max(1, seuil)) * 40, 60, 98)
          : (closeToThreshold ? 35 : 10);

      const recommendedOrder = Math.max(0, Math.ceil((seuil * 1.25) - stock));
      return {
        product_id: row._id || row.id,
        product_name: row.name || row.code_product || 'Produit',
        risk_probability: Number(baseRisk.toFixed(1)),
        current_stock: stock,
        seuil_minimum: seuil,
        recommended_order_qty: recommendedOrder,
      };
    })
  ), [allProducts]);

  const riskSource = useMemo(() => {
    const source = stockoutForecast.length ? stockoutForecast : fallbackRiskSource;
    return [...source].sort((a, b) => Number(b.risk_probability || 0) - Number(a.risk_probability || 0));
  }, [fallbackRiskSource, stockoutForecast]);

  const topRiskProduct = useMemo(() => (riskSource.length ? riskSource[0] : null), [riskSource]);

  const productImageById = useMemo(() => {
    const map = {};
    (allProducts || []).forEach((p) => {
      const id = p?._id || p?.id;
      if (!id) return;
      map[String(id)] = p?.image_product || p?.image || '';
    });
    return map;
  }, [allProducts]);

  const smartAlerts = useMemo(() => ( 
    riskSource
      .filter((row) => Number(row.risk_probability || 0) >= 25 || Number(row.current_stock || 0) <= Number(row.seuil_minimum || 0))
      .slice(0, 6)
      .map((row, idx) => { 
        const stock = Number(row.current_stock || 0); 
        const seuil = Number(row.seuil_minimum || 0); 
        const inRupture = stock <= 0;
        const underThreshold = stock > 0 && stock <= seuil;
        const suggestedOrder = Number(row.recommended_order_qty || 0);
        const pid = String(row.product_id || '');
        const type = inRupture ? 'Rupture' : underThreshold ? 'Sous seuil' : 'Sous seuil';
        return {
          id: `${row.product_id || 'p'}-${idx}`,
          productId: pid,
          image: pid ? (productImageById[pid] || '') : '',
          productName: row.product_name || 'Produit', 
          type,
          level: levelFromRisk(row.risk_probability, stock, seuil), 
          action: suggestedOrder > 0 ? `Commander ${suggestedOrder} u.` : 'Surveillance active.',
          reason: inRupture
            ? 'Rupture immediate: stock a zero.'
            : underThreshold
              ? `Stock sous seuil minimum (${stock} / ${seuil}).`
              : `Stock proche du seuil (${stock} / ${seuil}).`,
          riskProbability: Number(row.risk_probability || 0), 
        }; 
      }) 
  ), [productImageById, riskSource]); 

  const opsAlertsTop = useMemo(() => {
    const list = Array.isArray(smartAlerts) ? smartAlerts : [];
    const top = list.slice(0, 3);
    const fdsMissing = Number(chemicalSummary.missingFds || 0);
    if (fdsMissing > 0 && top.length < 3) {
      top.push({
        id: 'chem_fds_missing',
        productId: '',
        image: '',
        productName: 'Registre chimique',
        type: 'FDS manquante',
        level: 'Important',
        action: 'Compléter les fiches.',
        reason: 'FDS ou classe manquante.',
        riskProbability: Math.min(99, Math.max(25, 40 + fdsMissing)),
        isChem: true,
      });
    }
    return top.slice(0, 3);
  }, [chemicalSummary.missingFds, smartAlerts]);

  const criticalAlertsCount = useMemo(() => (
    smartAlerts.filter((a) => String(a.level || '').toLowerCase() === 'critique').length
  ), [smartAlerts]);

  const aiAlertsSummary = useMemo(() => {
    const list = Array.isArray(aiAlerts) ? aiAlerts : [];
    const normalized = list.map((a) => {
      const risk = String(a?.risk_level || '').toLowerCase();
      const type = String(a?.alert_type || '').toLowerCase();
      const status = String(a?.status || 'new').toLowerCase();
      const productName = a?.product?.name || a?.product?.code_product || a?.product_name || 'Produit';
      return {
        id: String(a?._id || `${type}_${productName}_${a?.detected_at || ''}`),
        productName,
        risk,
        type,
        status,
        message: String(a?.message || '').trim(),
        detected_at: a?.detected_at || a?.createdAt || null,
      };
    });

    const newAlerts = normalized.filter((a) => a.status === 'new');
    const criticalNew = newAlerts.filter((a) => a.risk === 'high' || a.type === 'rupture').length;

    const top = [...newAlerts]
      .sort((a, b) => {
        const pa = a.risk === 'high' ? 3 : a.risk === 'medium' ? 2 : 1;
        const pb = b.risk === 'high' ? 3 : b.risk === 'medium' ? 2 : 1;
        if (pb !== pa) return pb - pa;
        return new Date(b.detected_at || 0) - new Date(a.detected_at || 0);
      })
      .slice(0, 3);

    return { newCount: newAlerts.length, criticalNewCount: criticalNew, top };
  }, [aiAlerts]);

  const alertsBadgeCount = useMemo(() => (
    aiAlerts.length ? aiAlertsSummary.criticalNewCount : criticalAlertsCount
  ), [aiAlerts.length, aiAlertsSummary.criticalNewCount, criticalAlertsCount]);

  const alertsToWatchCount = useMemo(() => {
    const n = Array.isArray(aiAlerts) ? aiAlerts.length : 0;
    return n > 0 ? n : alertsBadgeCount;
  }, [aiAlerts, alertsBadgeCount]);

  const decisionWhy = useMemo(() => {
    if (!topRiskProduct) return 'Aucun signal critique détecté.';
    const stock = Number(topRiskProduct.current_stock || 0);
    const seuil = Number(topRiskProduct.seuil_minimum || 0);
    if (stock <= 0) return 'Stock à zéro ou rupture imminente. Action immédiate conseillée.';
    if (stock <= seuil) return 'Seuil atteint ou dépassé. Action rapide conseillée.';
    return 'Signal de risque détecté (stock proche du seuil).';
  }, [topRiskProduct]);

  const requestsSeries = useMemo(() => {
    return historyTrend.slice(-10).map((x) => ({
      label: formatDayLabel(x.day),
      value: Number(x.request || 0),
    }));
  }, [historyTrend]);

  const chemicalCardTone = useMemo(() => {
    if (chemicalSummary.sensitive > 0) return { card: 'danger', icon: 'danger' };
    if (chemicalSummary.missingFds > 0 || chemicalSummary.withoutClass > 0 || chemicalSummary.toComplete > 0) return { card: 'warn', icon: 'warn' };
    return { card: '', icon: 'ok' };
  }, [chemicalSummary.missingFds, chemicalSummary.sensitive, chemicalSummary.toComplete, chemicalSummary.withoutClass]);

  const requestsInsight = useMemo(() => {
    const values = requestsSeries.map((x) => Number(x.value || 0));
    if (values.length < 6) return 'Pas assez de données pour mesurer une tendance fiable.';
    const recentAvg = mean(values.slice(-3));
    const prevAvg = Math.max(0.0001, mean(values.slice(-6, -3)));
    const delta = ((recentAvg - prevAvg) / prevAvg) * 100;
    const direction = delta >= 0 ? 'hausse' : 'baisse';
    const level = Math.abs(delta) >= 12 ? 'à surveiller' : 'stable';
    return `Demandes en ${direction} de ${Math.abs(delta).toFixed(1)}% (niveau ${level}).`;
  }, [requestsSeries]);

  const requestsValues = requestsSeries.map((x) => Number(x.value || 0));
  const requestsMax = Math.max(1, ...requestsValues);
  const requestsCoords = toLineCoords(requestsValues, 0, requestsMax);

  const stockVsSeuil = useMemo(() => {
    if (!topRiskProduct) return { labels: [], stock: [], seuil: [], crossingDay: null };
    const currentStock = Number(topRiskProduct.current_stock || 0);
    const expectedNeed = Number(topRiskProduct.expected_need || 0);
    const projectedStockEnd = Number.isFinite(Number(topRiskProduct.projected_stock_end))
      ? Number(topRiskProduct.projected_stock_end)
      : (currentStock - expectedNeed);
    const threshold = Number(topRiskProduct.seuil_minimum || 0);

    const points = 8;
    const stock = Array.from({ length: points }, (_, idx) => {
      const ratio = points === 1 ? 0 : idx / (points - 1);
      return Number((currentStock + (projectedStockEnd - currentStock) * ratio).toFixed(2));
    });
    const seuil = Array.from({ length: points }, () => threshold);
    const labels = Array.from({ length: points }, (_, idx) => `J+${idx}`);
    const crossingIndex = stock.findIndex((value) => Number(value) <= threshold);

    return {
      labels,
      stock,
      seuil,
      crossingDay: crossingIndex >= 0 ? labels[crossingIndex] : null,
    };
  }, [topRiskProduct]);

  const stockVsSeuilMax = Math.max(1, ...stockVsSeuil.stock, ...stockVsSeuil.seuil);
  const stockVsSeuilCoords = toLineCoords(stockVsSeuil.stock, 0, stockVsSeuilMax);
  const seuilCoords = toLineCoords(stockVsSeuil.seuil, 0, stockVsSeuilMax);

  const decisionSummary = useMemo(() => {
    if (!topRiskProduct) {
      return {
        priorityProduct: '-',
        priorityRisk: 0,
        nextDecision: 'Aucune action urgente.',
        thresholdSignal: 'Pas de croisement seuil imminent.',
      };
    }
    const risk = Number(topRiskProduct.risk_probability || 0);
    const orderQty = Number(topRiskProduct.recommended_order_qty || 0);
    const qtyLabel = orderQty === 1 ? '1 unité' : `${orderQty} unités`;
    const crossingSignal = stockVsSeuil.crossingDay
      ? `Croisement seuil vers ${stockVsSeuil.crossingDay}`
      : "Pas de croisement seuil sur l'horizon";
    return {
      priorityProduct: topRiskProduct.product_name || 'Produit',
      priorityRisk: risk,
      nextDecision: orderQty > 0 ? `Commander ${qtyLabel} aujourd'hui` : 'Surveillance active sans commande immédiate',
      thresholdSignal: crossingSignal,
    };
  }, [topRiskProduct, stockVsSeuil.crossingDay]);

  const topConsumed = useMemo(() => {
    const rows = Array.isArray(topConsumedProducts) ? topConsumedProducts : [];
    const maxQty = Math.max(1, ...rows.map((r) => Number(r.total_qty || 0)));
    return {
      rows: rows.map((r) => ({
        id: r.product_id || r.code_product || r.designation,
        code: r.code_product || '-',
        name: r.designation || r.code_product || 'Produit',
        qty: Number(r.total_qty || 0),
        events: Number(r.events || 0),
        ratio: clamp(Number(r.total_qty || 0) / maxQty, 0, 1),
      })),
      maxQty,
    };
  }, [topConsumedProducts]);

  const recentFeed = useMemo(() => {
    const items = Array.isArray(recentActivity) ? recentActivity : [];
    const labelByAction = {
      entry: 'Entrée',
      exit: 'Sortie',
      request: 'Demande',
      validation: 'Validation',
      product_create: 'Création produit',
      product_update: 'Mise à jour produit',
      block: 'Blocage',
    };
    return items.map((it) => ({
      id: String(it?._id || Math.random()),
      when: it?.date_action || it?.createdAt || null,
      action: String(it?.action_type || '-'),
      actionLabel: labelByAction[String(it?.action_type || '').toLowerCase()] || String(it?.action_type || '-'),
      qty: Number(it?.quantity || 0),
      description: String(it?.description || '').trim(),
      product: it?.product?.name || it?.product?.code_product || '-',
      role: it?.actor_role || it?.user?.role || '-',
      source: it?.source || '-',
    }));
  }, [recentActivity]);

  const anomalyFeed = useMemo(() => {
    const rows = Array.isArray(historyAnomalies) ? historyAnomalies : [];
    return rows.slice(0, 3).map((a, idx) => ({
      id: `${a?.product_id || 'p'}_${idx}`,
      product_id: a?.product_id || null,
      qty: Number(a?.quantity || 0),
      when: a?.date_action || null,
      threshold: Number(a?.threshold || 0),
    }));
  }, [historyAnomalies]);

  const assistantSummary = useMemo(() => {
    const geminiConfigured = Boolean(assistantStatus?.gemini?.configured);
    const predictionsEnabled = assistantStatus?.ai_config?.predictionsEnabled !== false;
    const trained = Boolean(assistantStatus?.models?.trained);
    const lastTrainedAt = assistantStatus?.models?.trained_at || null;

    const assistantOk = geminiConfigured;
    const predictionsOk = predictionsEnabled && trained;
    const predictionsLabel = predictionsOk ? 'Disponibles' : predictionsEnabled ? 'En cours' : 'Désactivées';

    return {
      assistantLabel: assistantOk ? 'Actif' : 'À configurer',
      assistantHint: assistantOk
        ? 'Résumé et recommandations disponibles.'
        : "Activez l'assistant dans Paramètres > IA.",
      predictionsLabel,
      lastUpdateLabel: lastTrainedAt ? formatDateTimeLabel(lastTrainedAt) : '-',
    };
  }, [assistantStatus]);

  const pendingBiNote = useMemo(() => {
    if (!pendingRequestsCount) return 'Aucune demande en attente';
    if (pendingAvgWaitDays == null) {
      return `${pendingRequestsCount} demande${pendingRequestsCount > 1 ? 's' : ''} en attente`;
    }
    const avg = Number(pendingAvgWaitDays || 0);
    const avgLabel = Number.isFinite(avg) ? String(avg).replace(/\.0$/, '') : '0';
    if (pendingUrgentCount > 0) {
      return `${pendingUrgentCount} urgente${pendingUrgentCount > 1 ? 's' : ''} · attente moyenne : ${avgLabel} j`;
    }
    return `Aucune urgence · attente moyenne : ${avgLabel} j`;
  }, [pendingAvgWaitDays, pendingRequestsCount, pendingUrgentCount]);

  const rangeLabel = useMemo(() => {
    if (periodDays === 1) return "Aujourd'hui";
    if (periodDays === 7) return '7 jours';
    if (periodDays === 30) return '30 jours';
    if (periodDays === 'month') return 'Mois en cours';
    return 'Période';
  }, [periodDays]);

  const openConsumption = useCallback((prefillQuery) => {
    const range = periodDays === 'month' ? buildMonthToDateRange() : buildRange(periodDays);
    const params = new URLSearchParams();
    const fromIso = formatIsoDay(range.from);
    const toIso = formatIsoDay(range.to);
    if (fromIso) params.set('from', fromIso);
    if (toIso) params.set('to', toIso);
    if (prefillQuery) params.set('q', String(prefillQuery || '').trim());
    const search = params.toString();
    navigate(`/responsable/consommation${search ? `?${search}` : ''}`);
  }, [navigate, periodDays]);

  const openPriorityProduct = useCallback(() => {
    const rawQuery = String(topRiskProduct?.product_name || decisionSummary?.priorityProduct || '').trim();
    const query = rawQuery ? encodeURIComponent(rawQuery) : '';
    navigate(`/responsable/produits${query ? `?q=${query}` : ''}`);
  }, [decisionSummary?.priorityProduct, navigate, topRiskProduct?.product_name]);

  const daySynthesis = useMemo(() => {
    const demandes = pendingRequestsCount || 0;
    const critiques = (stats.ruptureCount + stats.sousSeuilCount) || 0;
    const chemToComplete = chemicalSummary.toComplete || 0;
    const action = String(decisionSummary?.nextDecision || '').trim();
    const actionLine = action && action !== 'Aucune action urgente.' ? action : 'Surveiller les indicateurs.';

    return {
      title: 'Synthèse du jour',
      indicators: [
        { key: 'req', value: demandes, label: `demande${demandes > 1 ? 's' : ''} à valider` },
        { key: 'crit', value: critiques, label: `produit${critiques > 1 ? 's' : ''} critique${critiques > 1 ? 's' : ''}` },
        {
          key: 'chem',
          value: chemToComplete,
          label: `fiche${chemToComplete > 1 ? 's' : ''} chimique${chemToComplete > 1 ? 's' : ''} à compléter`,
        },
      ],
      actionLine,
    };
  }, [
    chemicalSummary.toComplete,
    decisionSummary?.nextDecision,
    pendingRequestsCount,
    stats.ruptureCount,
    stats.sousSeuilCount,
  ]);

  return (
    <ProtectedPage userName={userName}>
      <div className="app-layout">
        <div
          className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`}
          onClick={() => setSidebarCollapsed(true)}
        />
        <SidebarResp
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          onLogout={onLogout}
          userName={userName}
        />

        <div className="main-container">
          <HeaderPage
            userName={userName}
            title="Tableau de bord responsable"
            subtitle="Vue d’ensemble des validations, du stock, des alertes et des actions prioritaires."
            showSearch={false}
            onRefresh={loadData}
            onMenuClick={() => setSidebarCollapsed((prev) => !prev)}
          />
          <main className="main-content">
            {isLoading && <LoadingSpinner overlay text="Chargement..." />}

            <div className="dashboard-page saas-dashboard">
              <div className="resp-hero">
                <div className="resp-hero-left">
                  <div className="dash-toolbar-left">
                    <span className="dash-range-label">Période : {rangeLabel}</span>
                    <div className="dash-pills" role="tablist" aria-label="Sélection de période">
                      <button type="button" className={`dash-pill ${periodDays === 1 ? 'active' : ''}`} onClick={() => setPeriodDays(1)} disabled={isLoading}>Aujourd&apos;hui</button>
                      <button type="button" className={`dash-pill ${periodDays === 7 ? 'active' : ''}`} onClick={() => setPeriodDays(7)} disabled={isLoading}>7 jours</button>
                      <button type="button" className={`dash-pill ${periodDays === 30 ? 'active' : ''}`} onClick={() => setPeriodDays(30)} disabled={isLoading}>30 jours</button>
                      <button type="button" className={`dash-pill ${periodDays === 'month' ? 'active' : ''}`} onClick={() => setPeriodDays('month')} disabled={isLoading}>Mois</button>
                    </div>
                    <button type="button" className="dash-action subtle" onClick={loadData} disabled={isLoading} title="Actualiser">
                      <RefreshCw size={16} />
                      <span>Actualiser</span>
                    </button>
                  </div>
                </div>
                <div className="resp-hero-right">
                  <button
                    type="button"
                    className="resp-pill"
                    onClick={() => navigate('/responsable/produits?inactive_only=1')}
                    disabled={isLoading}
                    title="Voir les produits inactifs"
                  >
                    <Activity size={16} />
                    <span>Inactifs</span>
                    <span className="resp-pill-badge warn">{inactiveProductsCount}</span>
                  </button>
                  <button
                    type="button"
                    className="resp-pill primary"
                    onClick={() => navigate('/responsable/pilotage?tab=validations')}
                    disabled={isLoading}
                    title="Voir les priorités du jour"
                  >
                    <ShieldAlert size={16} />
                    <span>Priorités du jour</span>
                    <span className="resp-pill-badge hot">{prioritiesTodayCount}</span>
                  </button>
                </div>
              </div>

              <section className="bi-summary bi-summary-compact" aria-label="Synthèse du jour">
                <div className="bi-summary-head">
                  <h2 className="bi-summary-title">{daySynthesis.title}</h2>
                </div>

                <div className="bi-mini-indicators" aria-label="Indicateurs du jour">
                  {daySynthesis.indicators.map((it, idx) => (
                    <div
                      key={it.key}
                      className={`bi-mini-indicator ${it.key === 'crit' && Number(it.value || 0) > 0 ? 'critical' : ''}`}
                      style={{ '--i': idx }}
                    >
                      <div className="bi-mi-value"><AnimatedNumber value={it.value} /></div>
                      <div className="bi-mi-label">{it.label}</div>
                    </div>
                  ))}
                </div>

                <div className="bi-summary-actionline">
                  <span className="bi-action-label">Action du jour :</span>
                  <strong className="bi-action-value">{daySynthesis.actionLine}</strong>
                </div>

                <div className="bi-shortcuts" aria-label="Accès rapide">
                  <button type="button" className="dash-action compact" onClick={() => navigate('/responsable/pilotage?tab=validations')} disabled={isLoading}>
                    <Package size={14} />
                    <span>Voir demandes</span>
                  </button>
                  <button type="button" className="dash-action compact" onClick={() => navigate('/responsable/pilotage?tab=alertes')} disabled={isLoading}>
                    <AlertTriangle size={14} />
                    <span>Voir alertes</span>
                  </button>
                  <button type="button" className="dash-action compact" onClick={() => navigate('/responsable/commandes/nouvelle')} disabled={isLoading}>
                    <ShoppingCart size={14} />
                    <span>Créer commande</span>
                  </button>
                  <button
                    type="button"
                    className="dash-action compact ai-alerts"
                    onClick={() => navigate('/responsable/chatbot')}
                    disabled={isLoading}
                    title="Obtenir un résumé"
                  >
                    <Sparkles size={14} />
                    <span>Obtenir un résumé</span>
                  </button>
                </div>
              </section>

              <div className="resp-kpi-grid">
                <article className="resp-kpi-card" style={{ '--i': 0 }}>
                  <div className="resp-kpi-icon ok"><Package size={18} /></div>
                  <div className="resp-kpi-body">
                    <div className="resp-kpi-title">
                      Demandes à valider
                      <span className={`resp-kpi-badge ${pendingUrgentCount > 0 ? 'urgent' : 'ok'}`}>
                        {pendingUrgentCount > 0 ? 'Urgent' : 'OK'}
                      </span>
                    </div>
                    <div className="resp-kpi-row">
                      <div className="resp-kpi-value"><AnimatedNumber value={pendingRequestsCount} /></div>
                      <button
                        className="resp-kpi-chip"
                        type="button"
                        onClick={() => navigate('/responsable/pilotage?tab=validations')}
                        disabled={isLoading}
                      >
                        Voir demandes
                      </button>
                    </div>
                    <div className="resp-kpi-sub">{pendingBiNote}</div>
                  </div>
                </article>

                <article className="resp-kpi-card" style={{ '--i': 1 }}>
                  <div className="resp-kpi-icon info"><ClipboardCheck size={18} /></div>
                  <div className="resp-kpi-body">
                    <div className="resp-kpi-title">Inventaires à valider</div>
                    <div className="resp-kpi-row">
                      <div className="resp-kpi-value"><AnimatedNumber value={inventoriesToValidateCount} /></div>
                      <button
                        className="resp-kpi-chip"
                        type="button"
                        onClick={() => navigate('/responsable/inventaires/a-valider')}
                        disabled={isLoading}
                      >
                        Voir inventaires
                      </button>
                    </div>
                    <div className="resp-kpi-sub">{inventoriesToValidateCount ? 'Inventaires soumis' : 'Aucun inventaire soumis'}</div>
                  </div>
                </article>

                <article className="resp-kpi-card danger" style={{ '--i': 2 }}>
                  <div className="resp-kpi-icon danger"><AlertTriangle size={18} /></div>
                  <div className="resp-kpi-body">
                    <div className="resp-kpi-title">
                      Produits critiques
                      <span className={`resp-kpi-badge ${(stats.ruptureCount + stats.sousSeuilCount) > 0 ? 'critique' : 'ok'}`}>
                        {(stats.ruptureCount + stats.sousSeuilCount) > 0 ? 'Critique' : 'OK'}
                      </span>
                    </div>
                    <div className="resp-kpi-row">
                      <div className="resp-kpi-value"><AnimatedNumber value={stats.ruptureCount + stats.sousSeuilCount} /></div>
                      <button
                        className="resp-kpi-chip danger"
                        type="button"
                        onClick={() => navigate('/responsable/pilotage?tab=alertes')}
                        disabled={isLoading}
                      >
                        Voir alertes
                      </button>
                    </div>
                    <div className="resp-kpi-metrics">
                      <span>Ruptures <strong><AnimatedNumber value={stats.ruptureCount} /></strong></span>
                      <span>Sous seuil <strong><AnimatedNumber value={stats.sousSeuilCount} /></strong></span>
                    </div>
                  </div>
                </article>

                <article className="resp-kpi-card" style={{ '--i': 3 }}>
                  <div className="resp-kpi-icon ok"><Clock size={18} /></div>
                  <div className="resp-kpi-body">
                    <div className="resp-kpi-title">Péremption ≤ 30 jours</div>
                    <div className="resp-kpi-row">
                      <div className="resp-kpi-value"><AnimatedNumber value={expiringLotsCount} /></div>
                      <button
                        className="resp-kpi-chip"
                        type="button"
                        onClick={() => navigate('/responsable/produits')}
                        disabled={isLoading}
                      >
                        Voir produits
                      </button>
                    </div>
                    <div className="resp-kpi-sub">{expiringLotsCount ? 'Lots à risque' : 'Aucun lot critique'}</div>
                  </div>
                </article>

                <article className={`resp-kpi-card kpi-chem ${chemicalCardTone.card}`} style={{ '--i': 4 }}>
                  <div className={`resp-kpi-icon ${chemicalCardTone.icon}`}><FlaskConical size={18} /></div>
                  <div className="resp-kpi-body">
                    <div className="resp-kpi-title">
                      Registre chimique
                      <span className={`resp-kpi-badge ${chemicalSummary.toComplete > 0 ? 'urgent' : 'ok'}`}>
                        {chemicalSummary.toComplete > 0 ? 'À compléter' : 'OK'}
                      </span>
                    </div>
                    <div className="resp-kpi-row">
                      <div className="resp-kpi-value">
                        <AnimatedNumber value={chemicalSummary.total} />
                        <span className="resp-kpi-unit">produits</span>
                      </div>
                      <button
                        className={`resp-kpi-chip info ${chemicalCardTone.card === 'danger' ? 'danger' : chemicalCardTone.card === 'warn' ? 'warn' : ''}`}
                        type="button"
                        onClick={() => navigate('/responsable/registre-chimique')}
                        disabled={isLoading}
                      >
                        Ouvrir registre
                      </button>
                    </div>
                    <div className="resp-kpi-metrics">
                      <span>
                        <strong><AnimatedNumber value={chemicalSummary.toComplete} /></strong>
                        <span>{` fiche${chemicalSummary.toComplete > 1 ? 's' : ''} à compléter`}</span>
                      </span>
                      <span>
                        <strong><AnimatedNumber value={chemicalSummary.sensitive} /></strong>
                        <span>{` produit${chemicalSummary.sensitive > 1 ? 's' : ''} sensible${chemicalSummary.sensitive > 1 ? 's' : ''}`}</span>
                      </span>
                    </div>
                    {chemicalSummary.toComplete > 0 ? (
                      <div className="resp-kpi-sub">FDS ou classe à compléter</div>
                    ) : null}
                  </div>
                </article>
              </div>



              <div className="activity-bar" aria-label="Activité période">
                <div className="activity-bar-metrics">
                  <span className="activity-metric">
                    <Activity size={14} />
                    <strong><AnimatedNumber value={movementStats.total} /></strong>
                    <span>mouvements</span>
                  </span>
                  <span className="activity-sep">|</span>
                  <span className="activity-metric">
                    <Package size={14} />
                    <strong><AnimatedNumber value={movementStats.entries} /></strong>
                    <span>{movementStats.entries > 1 ? 'entrées' : 'entrée'}</span>
                  </span>
                  <span className="activity-sep">|</span>
                  <button
                    type="button"
                    className="activity-metric activity-metric-btn"
                    onClick={() => openConsumption()}
                    disabled={isLoading}
                    title="Voir consommation par bénéficiaire"
                  >
                    <Clock size={14} />
                    <strong><AnimatedNumber value={movementStats.exits} /></strong>
                    <span>{movementStats.exits > 1 ? 'sorties' : 'sortie'}</span>
                  </button>
                  <span className="activity-sep">|</span>
                  <span className="activity-metric">
                    <ShieldAlert size={14} />
                    <strong><AnimatedNumber value={supplierOps.late_open_orders || 0} /></strong>
                    <span>{Number(supplierOps.late_open_orders || 0) > 1 ? 'retards fournisseurs' : 'retard fournisseur'}</span>
                  </span>
                  <span className="activity-sep">|</span>
                  <span className="activity-metric">
                    <AlertTriangle size={14} />
                    <strong>{alertsToWatchCount > 99 ? '99+' : <AnimatedNumber value={alertsToWatchCount} />}</strong>
                    <span>alertes enregistrées</span>
                  </span>
                </div>
                <div className="activity-bar-actions">
                  <button type="button" className="activity-link" onClick={() => navigate('/responsable/transactions')} disabled={isLoading}>
                    Voir activité
                  </button>
                  <button type="button" className="activity-link" onClick={() => openConsumption()} disabled={isLoading}>
                    Voir consommation
                  </button>
                  <button type="button" className="activity-link" onClick={() => navigate('/responsable/alertes')} disabled={isLoading}>
                    Voir les plus importantes
                  </button>
                </div>
              </div>

              <section className="decision-day" id="priorites" aria-label="Décision du jour">
                <div className="decision-day-head">
                  <div className="decision-day-title">
                    <Sparkles size={18} />
                    <h3>Décision du jour</h3>
                  </div>
                  <div
                    className={`decision-risk ${decisionSummary.priorityRisk >= 70 ? 'high' : decisionSummary.priorityRisk >= 40 ? 'mid' : 'low'}`}
                    style={{ '--risk-pct': clamp(Number(decisionSummary.priorityRisk || 0), 0, 100) }}
                    aria-label={`Risque ${Math.round(clamp(Number(decisionSummary.priorityRisk || 0), 0, 100))}%`}
                  >
                    <div className="decision-risk-top">
                      <span>Risque</span>
                      <strong><AnimatedNumber value={decisionSummary.priorityRisk} decimals={0} />%</strong>
                    </div>
                    <div className="decision-risk-bar" aria-hidden="true">
                      <div className="decision-risk-fill" />
                    </div>
                  </div>
                </div>

                  <div className="decision-day-grid">
                    <div className="decision-day-main">
                      <div className="decision-row emphasis">
                      <span className="decision-label">Action principale</span>
                      <strong className="decision-action">{decisionSummary.nextDecision}</strong>
                    </div>
                    <div className="decision-row">
                      <span className="decision-label">Produit prioritaire</span>
                      <strong className="decision-value">{decisionSummary.priorityProduct}</strong>
                    </div>
                    <div className="decision-row">
                      <span className="decision-label">Pourquoi ?</span>
                      <span className="decision-why">{decisionWhy}</span>
                    </div>
                    <div className="decision-row minor">
                      <span className="decision-label">Signal</span>
                      <span className="decision-why">{decisionSummary.thresholdSignal}</span>
                    </div>
                  </div>

                  <div className="decision-day-side">
                    <div className="decision-side-title">Actions</div>
                    <div className="decision-side-meta">
                      Aide : {assistantSummary.predictionsLabel} · MAJ : {assistantSummary.lastUpdateLabel}
                    </div>
                    <div className="decision-ctas" aria-label="Actions décision">
                      <button type="button" className="dash-action" onClick={() => navigate('/responsable/commandes/nouvelle')} disabled={isLoading}>
                        <ShoppingCart size={16} />
                        <span>Créer commande</span>
                      </button>
                      <button type="button" className="dash-action subtle" onClick={openPriorityProduct} disabled={isLoading}>
                        <Package size={16} />
                        <span>Voir produit</span>
                      </button>
                      <button type="button" className="dash-action ai-alerts" onClick={() => navigate('/responsable/chatbot')} disabled={isLoading}>
                        <Sparkles size={16} />
                        <span>Obtenir résumé</span>
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <div className="charts-grid"> 
                <article className="chart-card"> 
                  <div className="chart-head"> 
                    <h3><LineChart size={17} /> Évolution des demandes</h3>
                    <span className="chart-subtitle">Sur la période sélectionnée</span>
                  </div> 
                  {requestsCoords.length > 1 ? ( 
                    <div className="chart-wrap"> 
                      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="chart-svg" preserveAspectRatio="none"> 
                        <line x1={CHART_PAD_X} y1={CHART_HEIGHT - CHART_PAD_Y} x2={CHART_WIDTH - CHART_PAD_X} y2={CHART_HEIGHT - CHART_PAD_Y} className="axis-line" />
                        <path d={toAreaPath(requestsCoords)} className="area-fill blue" />
                        <polyline points={toPolylinePoints(requestsCoords)} className="line-main blue" />
                        {requestsCoords.length > 0 && (
                          <circle cx={requestsCoords[requestsCoords.length - 1].x} cy={requestsCoords[requestsCoords.length - 1].y} r="3.5" className="point-main blue" />
                        )}
                      </svg> 
                      <div
                        className="x-labels"
                        style={{ gridTemplateColumns: `repeat(${Math.max(2, requestsSeries.length)}, minmax(0, 1fr))` }}
                      > 
                        {requestsSeries.map((item, idx) => ( 
                          <span key={`${item.label}-${idx}`}>{idx % 2 === 0 ? item.label : ''}</span> 
                        ))} 
                      </div> 
                    </div> 
                  ) : (
                    <div className="chart-empty">Pas assez de données sur les demandes.</div>
                  )}
                  <p className="chart-insight">{requestsInsight}</p>
                </article>

                <article className="chart-card"> 
                  <div className="chart-head"> 
                    <h3><PieChart size={17} /> Stock vs seuil critique</h3>
                    <span className="chart-subtitle">Projection simple jusqu’à J+7</span>
                  </div> 
                  {stockVsSeuilCoords.length > 1 ? ( 
                    <div className="chart-wrap"> 
                      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="chart-svg" preserveAspectRatio="none"> 
                        <line x1={CHART_PAD_X} y1={CHART_HEIGHT - CHART_PAD_Y} x2={CHART_WIDTH - CHART_PAD_X} y2={CHART_HEIGHT - CHART_PAD_Y} className="axis-line" />
                        <polyline points={toPolylinePoints(stockVsSeuilCoords)} className="line-main green" />
                        <polyline points={toPolylinePoints(seuilCoords)} className="line-main threshold" />
                      </svg>
                      <div className="legend-row"> 
                        <span><i className="legend-dot green" />Stock</span> 
                        <span><i className="legend-dot threshold" />Seuil</span> 
                      </div> 
                      <div
                        className="x-labels"
                        style={{ gridTemplateColumns: `repeat(${Math.max(2, stockVsSeuil.labels.length)}, minmax(0, 1fr))` }}
                      > 
                        {stockVsSeuil.labels.map((label) => ( 
                          <span key={label}>{label}</span> 
                        ))} 
                      </div> 
                    </div> 
                  ) : (
                    <div className="chart-empty">Aucun produit critique pour tracer Stock/Seuil.</div>
                  )}
                  <p className="chart-insight">
                    {stockVsSeuil.crossingDay
                      ? `Le seuil risque d’être atteint dès ${stockVsSeuil.crossingDay}. Action recommandée aujourd’hui.`
                      : "Pas de croisement de seuil détecté sur l'horizon J+7."}
                  </p>
                </article>

                <article className="chart-card">
                  <div className="chart-head">
                    <h3><Sparkles size={17} /> Top produits consommés</h3>
                    <span className="chart-subtitle">Produits les plus consommés sur la période</span>
                  </div>
                  {topConsumed.rows.length ? (
                    <div className="bar-chart-wrap">
                      {topConsumed.rows.slice(0, 8).map((row) => (
                        <button
                          type="button"
                          className="bar-row bar-row-btn"
                          key={row.id}
                          onClick={() => openConsumption(row.code || row.name)}
                          disabled={isLoading}
                          title="Voir le détail de consommation"
                        >
                          <span className="bar-label" title={row.name}>{row.code}</span>
                          <div className="bar-track" aria-hidden="true">
                            <div className="bar-fill" style={{ width: `${Math.round(row.ratio * 100)}%` }} />
                          </div>
                          <span className="bar-value">{Math.round(row.qty)}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="chart-empty">Pas de donnees de consommation sur la periode.</div>
                  )}
                  <p className="chart-insight">
                    {topConsumed.rows.length
                      ? `Top 1 : ${topConsumed.rows[0].name} (${Math.round(topConsumed.rows[0].qty)} unité(s)).`
                      : 'Aucun top produit calculé.'}
                  </p>
                </article>

                <article className="chart-card">
                  <div className="chart-head">
                    <h3><CheckCircle2 size={17} /> Disponibilité stock</h3>
                    <span className="chart-subtitle">Produits OK / total</span>
                  </div>
                  <div className="gauge-wrap" aria-label="Disponibilite stock">
                    <div className="gauge-ring" aria-hidden="true">
                      <svg viewBox="0 0 120 120" className="gauge-svg">
                        <circle className="gauge-track" cx="60" cy="60" r="50" />
                        <circle
                          className="gauge-progress"
                          cx="60"
                          cy="60"
                          r="50"
                          style={(() => {
                            const circ = 2 * Math.PI * 50;
                            const pct = clamp(Number(availabilityRate || 0), 0, 100) / 100;
                            const offset = circ * (1 - pct);
                            return { '--gauge-circ': String(circ), '--gauge-offset': String(offset) };
                          })()}
                        />
                      </svg>
                      <div className="gauge-center">
                        <div className="gauge-value">
                          <AnimatedNumber value={availabilityRate} decimals={1} />%
                        </div>
                        <div className="gauge-label">Disponibilité</div>
                      </div>
                    </div>
                    <div className="gauge-meta">
                      <span>OK: {stats.disponiblesCount}</span>
                      <span>Total: {stats.totalProduits}</span>
                    </div>
                  </div>
                  <p className="chart-insight">
                    {availabilityRate >= 85
                      ? 'Situation globalement correcte, mais surveillez les sous-seuil pour éviter les ruptures.'
                      : 'Situation tendue : priorisez les références critiques et les urgences.'}
                  </p>
                </article>
              </div>

              <section className="dashboard-card ops-card" aria-label="Suivi opérationnel">
                <div className="card-header">
                  <div className="card-head-left">
                    <h3 className="card-title"><AlertTriangle size={17} /><span>Suivi opérationnel</span></h3>
                    <span className="card-subtitle">Activité, alertes, anomalies</span>
                  </div>
                  <div className="ops-tabs" role="tablist" aria-label="Onglets suivi opérationnel">
                    <button type="button" className={`ops-tab ${opsTab === 'alertes' ? 'active' : ''}`} onClick={() => setOpsTab('alertes')}>Alertes</button>
                    <button type="button" className={`ops-tab ${opsTab === 'activite' ? 'active' : ''}`} onClick={() => setOpsTab('activite')}>Activité</button>
                    <button type="button" className={`ops-tab ${opsTab === 'anomalies' ? 'active' : ''}`} onClick={() => setOpsTab('anomalies')}>Anomalies</button>
                  </div>
                </div>

                {opsTab === 'activite' ? (
                  <div className="ops-body">
                    <div className="ops-head">
                      <div className="ops-hint">Dernières opérations</div>
                      <button type="button" className="dash-action compact" onClick={() => navigate('/responsable/transactions')} disabled={isLoading}>
                        <span>Voir toute l’activité</span>
                      </button>
                    </div>
                    <div className="feed-list">
                      {recentFeed.slice(0, 5).map((item) => (
                        <div className="feed-item" key={item.id}>
                          <div className={`feed-dot ${item.action}`} aria-hidden="true" />
                          <div className="feed-main">
                            <div className="feed-title">
                              <strong>{item.product}</strong>
                              <span className="feed-badge">{item.actionLabel}</span>
                              {item.qty ? <span className="feed-qty">{item.qty}</span> : null}
                            </div>
                            <div className="feed-meta">
                              <span>{formatDateTimeLabel(item.when)}</span>
                              <span>{item.role}</span>
                              <span>{item.source}</span>
                            </div>
                            {item.description ? <div className="feed-desc">{item.description}</div> : null}
                          </div>
                        </div>
                      ))}
                      {!recentFeed.length && <div className="feed-empty">Aucune activité récente sur la période.</div>}
                    </div>
                  </div>
                ) : null}

                {opsTab === 'anomalies' ? (
                  <div className="ops-body">
                    <div className="ops-head">
                      <div className="ops-hint">Signaux issus de l’historique</div>
                      <button type="button" className="dash-action compact" onClick={() => navigate('/responsable/transactions')} disabled={isLoading}>
                        <span>Voir tout</span>
                      </button>
                    </div>
                    <div className="anomaly-list">
                      {anomalyFeed.map((row) => (
                        <div className="anomaly-item" key={row.id}>
                          <div className="anomaly-qty">{Math.round(row.qty)}</div>
                          <div className="anomaly-main">
                            <div className="anomaly-when">{formatDateTimeLabel(row.when)}</div>
                            <div className="anomaly-note">Seuil {Math.round(row.threshold)}</div>
                          </div>
                        </div>
                      ))}
                      {!anomalyFeed.length && <div className="feed-empty">Aucune anomalie importante récente.</div>}
                    </div>
                  </div>
                ) : null}

                {opsTab === 'alertes' ? (
                  <div className="ops-body">
                    <div className="ops-head">
                      <div className="ops-hint">Les plus importantes</div>
                      <button type="button" className="dash-action compact" onClick={() => navigate('/responsable/alertes')} disabled={isLoading}>
                        <span>Voir toutes les alertes</span>
                      </button>
                    </div>

                    {aiAlertsSummary.newCount > 0 && (
                      <div className="ai-alerts-banner">
                        <div className="ai-alerts-banner-head">
                          <div className="ai-alerts-banner-title">
                            Alertes (nouvelles) : {aiAlertsSummary.newCount}
                          </div>
                          <button
                            type="button"
                            className="dash-action compact"
                            onClick={() => navigate('/responsable/pilotage?tab=alertes')}
                          >
                            <Sparkles size={14} />
                            <span>Voir</span>
                          </button>
                        </div>
                        <div className="ai-alerts-banner-list">
                          {aiAlertsSummary.top.map((a) => (
                            <div key={a.id} className="ai-alerts-banner-item">
                              <span className={`ai-alerts-banner-type risk-${a.risk || 'low'}`}>
                                {a.type.toUpperCase()}
                              </span>
                              <span className="ai-alerts-banner-product">{a.productName}</span>
                              <span className="ai-alerts-banner-message">{a.message || 'Signal détecté'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="alert-table-wrap">
                      <table className="alert-table">
                        <thead>
                          <tr>
                            <th>Type</th>
                            <th>Produit</th>
                            <th>Pourquoi</th>
                            <th>Action immédiate</th>
                            <th>Risque</th>
                          </tr>
                        </thead>
                        <tbody>
                          {opsAlertsTop.map((row) => (
                            <tr key={row.id}>
                              <td>
                                <span className={`alert-type-pill ${String(row.type || '').toLowerCase().includes('rupture') ? 'danger' : String(row.type || '').toLowerCase().includes('fds') ? 'warn' : 'mid'}`}>
                                  {row.type || 'Alerte'}
                                </span>
                              </td>
                              <td>
                                <div className="dash-product-cell">
                                  {!row.isChem ? (
                                    <ProtectedImage
                                      filePath={row.image}
                                      alt={row.productName}
                                      className="dash-product-thumb"
                                      fallbackText=""
                                    />
                                  ) : (
                                    <div className="dash-product-thumb chem" aria-hidden="true">
                                      <FlaskConical size={14} />
                                    </div>
                                  )}
                                  <strong>{row.productName}</strong>
                                </div>
                              </td>
                              <td className="reason-col">{row.reason || 'Signal détecté'}</td>
                              <td>{row.action}</td>
                              <td className="risk-col">{Number(row.riskProbability || 0).toFixed(0)}%</td>
                            </tr>
                          ))}
                          {!opsAlertsTop.length && (
                            <tr>
                              <td colSpan={5} className="empty-cell">Aucune alerte prioritaire actuellement.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          </main>
        </div>
      </div>
    </ProtectedPage>
  );
};

export default DashboardResp;
