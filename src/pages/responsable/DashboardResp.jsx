import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FlaskConical,
  Moon,
  ShieldAlert,
  ShoppingCart,
  Sun,
  TrendingDown,
  TrendingUp,
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

const PERIODS = [
  { key: 'today', label: 'Auj.', days: 1 },
  { key: '7d', label: '7j', days: 7 },
  { key: '30d', label: '30j', days: 30 },
  { key: 'custom', label: 'Perso.', days: 90 },
];

const FAMILY_LABELS = {
  economat: 'Économat',
  produit_chimique: 'Produit chimique',
  gaz: 'Gaz',
  consommable_laboratoire: 'Laboratoire',
  consommable_informatique: 'Informatique',
};

const CHART_WIDTH = 420;
const CHART_HEIGHT = 110;
const CHART_PAD = 18;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mean(values = []) {
  const usable = values.map((v) => Number(v || 0)).filter((v) => Number.isFinite(v));
  if (!usable.length) return 0;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function buildRange(periodDays) {
  const days = Math.max(1, Number(periodDays || 30));
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to, days };
}

function buildPreviousRange(range) {
  const spanMs = Math.max(24 * 60 * 60 * 1000, range.to.getTime() - range.from.getTime());
  return {
    from: new Date(range.from.getTime() - spanMs),
    to: new Date(range.from.getTime()),
  };
}

function formatIsoDay(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function formatDayLabel(dayValue) {
  if (!dayValue) return '-';
  const date = new Date(dayValue);
  if (Number.isNaN(date.getTime())) return String(dayValue).slice(5);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function formatDateTimeLabel(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function encodeRange(range) {
  return `from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}`;
}

function pctSafe(numerator, denominator) {
  const den = Number(denominator || 0);
  if (den <= 0) return 0;
  return (Number(numerator || 0) / den) * 100;
}

function getProductId(value) {
  return String(value?._id || value?.id || value?.product_id || value?.product || '');
}

function toBusinessCategory(product) {
  return FAMILY_LABELS[product?.family] || product?.category_proposal || product?.category?.name || 'Métier';
}

function toChartPoints(values, minValue, maxValue) {
  const span = Math.max(1, Number(maxValue || 1) - Number(minValue || 0));
  const step = values.length > 1 ? (CHART_WIDTH - CHART_PAD * 2) / (values.length - 1) : 0;
  return values.map((raw, index) => {
    const normalized = (Number(raw || 0) - Number(minValue || 0)) / span;
    return {
      x: CHART_PAD + index * step,
      y: CHART_HEIGHT - CHART_PAD - normalized * (CHART_HEIGHT - CHART_PAD * 2),
      value: Number(raw || 0),
    };
  });
}

function smoothPath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  const commands = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const midX = (prev.x + curr.x) / 2;
    commands.push(`C ${midX} ${prev.y}, ${midX} ${curr.y}, ${curr.x} ${curr.y}`);
  }
  return commands.join(' ');
}

function areaPath(points) {
  if (!points.length) return '';
  const baseline = CHART_HEIGHT - CHART_PAD;
  return `${smoothPath(points)} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`;
}

function TrendBadge({ value, label }) {
  const n = Number(value || 0);
  const positive = n > 0;
  const negative = n < 0;
  const Icon = positive ? TrendingUp : negative ? TrendingDown : null;
  return (
    <span className={`resp-trend-badge ${positive ? 'up' : negative ? 'down' : 'flat'}`}>
      {Icon ? <Icon size={12} /> : <span aria-hidden="true">=</span>}
      {positive ? '+' : ''}{Math.round(n)} {label}
    </span>
  );
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
    if (!Number.isFinite(target) || !Number.isFinite(start) || Math.abs(target - start) < 0.0001) {
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
      setShown(start + (target - start) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [durationMs, prefersReducedMotion, value]);

  return <span>{Number(shown || 0).toFixed(decimals)}</span>;
}

function DashboardResp({ userName, onLogout }) {
  const toast = useToast();
  const navigate = useNavigate();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [periodKey, setPeriodKey] = useState('7d');
  const [dashboardTheme, setDashboardTheme] = useState(() => {
    try {
      return localStorage.getItem('resp_dashboard_theme') || 'dark';
    } catch {
      return 'dark';
    }
  });
  const [allProducts, setAllProducts] = useState([]);
  const [historyTrend, setHistoryTrend] = useState([]);
  const [previousTrend, setPreviousTrend] = useState([]);
  const [topConsumedProducts, setTopConsumedProducts] = useState([]);
  const [previousTopConsumedProducts, setPreviousTopConsumedProducts] = useState([]);
  const [stockoutForecast, setStockoutForecast] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [chemicalSummary, setChemicalSummary] = useState(() => ({
    total: 0,
    missingFds: 0,
    toComplete: 0,
  }));

  const activePeriod = PERIODS.find((p) => p.key === periodKey) || PERIODS[1];

  useEffect(() => {
    try {
      localStorage.setItem('resp_dashboard_theme', dashboardTheme);
    } catch {
      // local preference only
    }
  }, [dashboardTheme]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const range = buildRange(activePeriod.days);
      const previousRange = buildPreviousRange(range);
      const now = new Date();
      const chemYear = now.getFullYear();
      const chemMonth = now.getMonth() + 1;

      const [
        productsRes,
        insights,
        previousInsights,
        stockoutRes,
        pendingRequests,
        chemicalRegister,
      ] = await Promise.all([
        get('/products'),
        get(`/history/insights?${encodeRange(range)}`).catch(() => ({ daily_trend: [], top_consumed_products: [] })),
        get(`/history/insights?${encodeRange(previousRange)}`).catch(() => ({ daily_trend: [], top_consumed_products: [] })),
        post('/ai/predict/stockout', { horizon_days: 7 }).catch(() => ({ predictions: [] })),
        get('/requests?status=pending').catch(() => []),
        get(`/reports/chemical-register?year=${encodeURIComponent(chemYear)}&month=${encodeURIComponent(chemMonth)}`).catch(() => ({ rows: [] })),
      ]);

      const products = Array.isArray(productsRes) ? productsRes : [];
      setAllProducts(products);
      setStockoutForecast(Array.isArray(stockoutRes?.predictions) ? stockoutRes.predictions : []);
      setPendingRequestsCount(Array.isArray(pendingRequests) ? pendingRequests.length : 0);

      const chemRows = Array.isArray(chemicalRegister?.rows) ? chemicalRegister.rows : [];
      const chemSignals = chemRows.map((row) => computeChemicalRegisterSignals(row));
      setChemicalSummary({
        total: chemRows.length,
        missingFds: chemSignals.filter((signal) => signal.missingFds).length,
        toComplete: chemSignals.filter((signal) => signal.needsComplete).length,
      });

      const normalizeTrend = (rows) => {
        const byDay = new Map();
        (Array.isArray(rows) ? rows : []).forEach((row) => {
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
        return Array.from(byDay.values()).sort((a, b) => new Date(a.day) - new Date(b.day));
      };

      setHistoryTrend(normalizeTrend(insights?.daily_trend));
      setPreviousTrend(normalizeTrend(previousInsights?.daily_trend));
      setTopConsumedProducts(Array.isArray(insights?.top_consumed_products) ? insights.top_consumed_products : []);
      setPreviousTopConsumedProducts(Array.isArray(previousInsights?.top_consumed_products) ? previousInsights.top_consumed_products : []);
      setLastUpdatedAt(new Date().toISOString());
    } catch (err) {
      toast.error(err.message || 'Erreur chargement dashboard');
    } finally {
      setIsLoading(false);
    }
  }, [activePeriod.days, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) loadData();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  const productById = useMemo(() => {
    const map = new Map();
    allProducts.forEach((product) => {
      map.set(getProductId(product), product);
      if (product?.code_product) map.set(String(product.code_product), product);
    });
    return map;
  }, [allProducts]);

  const stats = useMemo(() => {
    const total = allProducts.length;
    const sousSeuil = allProducts.filter((p) => Number(p.quantity_current || 0) <= Number(p.seuil_minimum || 0) && Number(p.quantity_current || 0) > 0).length;
    const rupture = allProducts.filter((p) => Number(p.quantity_current || 0) === 0).length;
    const ok = Math.max(0, total - sousSeuil - rupture);
    return { total, sousSeuil, rupture, ok, critical: sousSeuil + rupture };
  }, [allProducts]);

  const availabilityRate = clamp(pctSafe(stats.ok, stats.total), 0, 100);
  const availabilityTone = availabilityRate >= 85 ? 'green' : availabilityRate >= 70 ? 'orange' : 'red';

  const fallbackRiskSource = useMemo(() => (
    allProducts.map((row) => {
      const stock = Number(row.quantity_current || 0);
      const seuil = Number(row.seuil_minimum || 0);
      const risk = stock <= 0
        ? 100
        : stock <= seuil
          ? clamp(62 + ((seuil - stock) / Math.max(1, seuil)) * 38, 62, 98)
          : clamp(20 + (seuil / Math.max(1, stock)) * 35, 5, 58);
      return {
        product_id: row._id || row.id,
        code_product: row.code_product,
        product_name: row.name || row.code_product || 'Produit',
        risk_probability: Number(risk.toFixed(1)),
        current_stock: stock,
        seuil_minimum: seuil,
        projected_stock_end: Math.max(0, stock - Math.max(1, seuil * 0.35)),
        expected_need: Math.max(1, seuil * 0.35),
        horizon_days: 7,
      };
    })
  ), [allProducts]);

  const riskSource = useMemo(() => {
    const source = stockoutForecast.length ? stockoutForecast : fallbackRiskSource;
    return [...source].sort((a, b) => Number(b.risk_probability || 0) - Number(a.risk_probability || 0));
  }, [fallbackRiskSource, stockoutForecast]);

  const topRiskProduct = riskSource[0] || null;

  const requestSeries = useMemo(() => {
    const rows = historyTrend.slice(-7);
    if (!rows.length) return [];
    return rows.map((row) => ({ label: formatDayLabel(row.day), value: Number(row.request || 0) }));
  }, [historyTrend]);

  const requestValues = requestSeries.map((item) => item.value);
  const requestMax = Math.max(1, ...requestValues);
  const requestPoints = toChartPoints(requestValues, 0, requestMax);
  const requestDeltaPercent = useMemo(() => {
    const current = mean(requestValues.slice(-3));
    const previous = mean(requestValues.slice(-6, -3));
    if (!previous) return 0;
    return ((current - previous) / previous) * 100;
  }, [requestValues]);

  const previousRequestCount = previousTrend.reduce((sum, row) => sum + Number(row.request || 0), 0);
  const currentRequestCount = historyTrend.reduce((sum, row) => sum + Number(row.request || 0), 0);
  const requestDeltaJ7 = currentRequestCount - previousRequestCount;

  const estimatedCriticalBaseline = useCallback((daysAgo) => {
    return allProducts.filter((product) => {
      const forecast = riskSource.find((row) => String(row.product_id) === getProductId(product));
      const expectedDaily = Number(forecast?.expected_need || 0) / Math.max(1, Number(forecast?.horizon_days || 7));
      const estimatedPastStock = Number(product.quantity_current || 0) + expectedDaily * daysAgo;
      return estimatedPastStock <= Number(product.seuil_minimum || 0);
    }).length;
  }, [allProducts, riskSource]);

  const priorityCards = useMemo(() => ([
    {
      key: 'requests',
      icon: ClipboardList,
      tone: 'urgent',
      value: pendingRequestsCount,
      label: pendingRequestsCount > 1 ? 'demandes à valider' : 'demande à valider',
      onClick: () => navigate('/responsable/demandes-a-traiter'),
      deltaJ1: pendingRequestsCount - Number(historyTrend.at(-1)?.request || 0),
      deltaJ7: requestDeltaJ7,
    },
    {
      key: 'critical',
      icon: AlertTriangle,
      tone: 'warn',
      value: stats.critical,
      label: stats.critical > 1 ? 'produits critiques' : 'produit critique',
      onClick: () => navigate('/responsable/produits-critiques'),
      deltaJ1: stats.critical - estimatedCriticalBaseline(1),
      deltaJ7: stats.critical - estimatedCriticalBaseline(7),
    },
    {
      key: 'chemical',
      icon: FlaskConical,
      tone: 'info',
      value: chemicalSummary.missingFds,
      label: chemicalSummary.missingFds > 1 ? 'FDS manquantes' : 'FDS manquante',
      onClick: () => navigate('/responsable/registre-chimique'),
      deltaJ1: 0,
      deltaJ7: 0,
    },
  ]), [
    chemicalSummary.missingFds,
    estimatedCriticalBaseline,
    historyTrend,
    navigate,
    pendingRequestsCount,
    requestDeltaJ7,
    stats.critical,
  ]);

  const stockCurve = useMemo(() => {
    if (!topRiskProduct) return null;
    const current = Number(topRiskProduct.current_stock || 0);
    const threshold = Number(topRiskProduct.seuil_minimum || 0);
    const expectedNeed = Number(topRiskProduct.expected_need || 0);
    const horizon = Math.max(1, Number(topRiskProduct.horizon_days || 7));
    const dailyBurn = Math.max(0.2, expectedNeed / horizon, threshold * 0.08);
    const trendRows = historyTrend.slice(-7);

    const past = [];
    let runningStock = current;
    for (let i = trendRows.length - 1; i >= 0; i -= 1) {
      const row = trendRows[i];
      const netOut = Number(row.exit || 0) - Number(row.entry || 0);
      runningStock = Math.max(0, runningStock + netOut);
      past.unshift(Number(runningStock.toFixed(2)));
    }
    while (past.length < 7) {
      const idx = 7 - past.length;
      past.unshift(Number(Math.max(current + dailyBurn * idx * 0.75, current).toFixed(2)));
    }

    const projection = Array.from({ length: 8 }, (_, idx) => Number(Math.max(0, current - dailyBurn * idx).toFixed(2)));
    const values = [...past.slice(-7), ...projection];
    const labels = ['J-7', 'J-6', 'J-5', 'J-4', 'J-3', 'J-2', 'J-1', 'Auj.', 'J+1', 'J+2', 'J+3', 'J+4', 'J+5', 'J+6', 'J+7'];
    const offsets = [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7];
    const max = Math.max(threshold + 1, ...values);
    const min = Math.min(0, threshold, ...values);
    const points = toChartPoints(values, min, max);
    const thresholdY = toChartPoints([threshold], min, max)[0]?.y || 0;
    const crossingIndex = values.findIndex((value, index) => offsets[index] >= 0 && value <= threshold);
    let crossing = null;
    if (crossingIndex >= 0) {
      const prevIndex = Math.max(0, crossingIndex - 1);
      const prevValue = values[prevIndex];
      const nextValue = values[crossingIndex];
      const ratio = prevValue === nextValue ? 0 : clamp((prevValue - threshold) / (prevValue - nextValue), 0, 1);
      const x = points[prevIndex].x + (points[crossingIndex].x - points[prevIndex].x) * ratio;
      crossing = {
        x,
        y: thresholdY,
        label: offsets[crossingIndex] === 0 ? 'J+0' : `J+${Math.max(0, offsets[crossingIndex] - (ratio < 1 ? 1 : 0) + ratio).toFixed(ratio % 1 ? 1 : 0)}`,
      };
    }

    return {
      product: topRiskProduct,
      values,
      labels,
      points,
      threshold,
      thresholdY,
      crossing,
      min,
      max,
    };
  }, [historyTrend, topRiskProduct]);

  const topConsumed = useMemo(() => {
    const previousByProduct = new Map();
    previousTopConsumedProducts.forEach((row) => {
      previousByProduct.set(String(row.product_id || row.code_product || row.designation || ''), Number(row.total_qty || 0));
    });

    const rows = topConsumedProducts.slice(0, 5);
    const maxQty = Math.max(1, ...rows.map((row) => Number(row.total_qty || 0)));
    return rows.map((row, index) => {
      const product = productById.get(String(row.product_id || '')) || productById.get(String(row.code_product || '')) || {};
      const key = String(row.product_id || row.code_product || row.designation || '');
      const qty = Number(row.total_qty || 0);
      return {
        key: key || `${row.designation}-${index}`,
        rank: index + 1,
        code: row.code_product || product.code_product || '-',
        name: row.designation || product.name || row.code_product || 'Produit',
        category: toBusinessCategory(product),
        qty,
        ratio: clamp(qty / maxQty, 0, 1),
        trend: Math.round(qty - Number(previousByProduct.get(key) || 0)),
      };
    });
  }, [previousTopConsumedProducts, productById, topConsumedProducts]);

  const criticalNow = Boolean(stockCurve && stockCurve.values[7] <= stockCurve.threshold);
  const alertProductName = topRiskProduct?.product_name || topRiskProduct?.code_product || 'Produit critique';

  const openConsumption = useCallback((query) => {
    const range = buildRange(activePeriod.days);
    const params = new URLSearchParams();
    params.set('from', formatIsoDay(range.from));
    params.set('to', formatIsoDay(range.to));
    if (query) params.set('q', String(query).trim());
    navigate(`/responsable/consommation?${params.toString()}`);
  }, [activePeriod.days, navigate]);

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
            subtitle="Vue rapide du stock et des priorités"
            showSearch={false}
            onRefresh={loadData}
            onMenuClick={() => setSidebarCollapsed((prev) => !prev)}
          />
          <main className={`main-content dashboard-main resp-dashboard-main-${dashboardTheme}`}>
            {isLoading && <LoadingSpinner overlay text="Chargement..." />}

            <div className={`resp-dash-page theme-${dashboardTheme}`}>
              <section className="resp-dash-topbar">
                <div>
                  <h2>Tableau de bord responsable</h2>
                  <p>Vue rapide du stock et des priorités · Mis à jour {formatDateTimeLabel(lastUpdatedAt)}</p>
                </div>
                <div className="resp-dash-actions">
                  <div className="resp-period-selector" aria-label="Sélecteur de période">
                    {PERIODS.map((period) => (
                      <button
                        type="button"
                        key={period.key}
                        className={`resp-period-btn ${periodKey === period.key ? 'active' : ''}`}
                        onClick={() => setPeriodKey(period.key)}
                      >
                        {period.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="resp-theme-toggle"
                    onClick={() => setDashboardTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                  >
                    {dashboardTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                    {dashboardTheme === 'dark' ? 'Mode clair' : 'Mode sombre'}
                  </button>
                </div>
              </section>

              {criticalNow && (
                <section className="resp-alert-banner" aria-live="polite">
                  <ShieldAlert size={20} className="resp-alert-icon" />
                  <div className="resp-alert-copy">
                    <strong>Stock critique atteint dès J+0</strong>
                    <span>Le stock de {alertProductName} est sous le seuil aujourd’hui. Réapprovisionnement urgent requis.</span>
                  </div>
                  <button type="button" className="resp-alert-action" onClick={() => navigate('/responsable/commandes/nouvelle')}>
                    Agir maintenant
                    <ChevronRight size={15} />
                  </button>
                </section>
              )}

              <section className="resp-priorities" aria-label="Priorités du jour">
                {priorityCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <button type="button" className={`resp-priority-card ${card.tone}`} key={card.key} onClick={card.onClick}>
                      <span className="resp-priority-icon"><Icon size={24} /></span>
                      <span className="resp-priority-copy">
                        <strong><AnimatedNumber value={card.value} /></strong>
                        <span>{card.label}</span>
                      </span>
                      <span className="resp-priority-trends">
                        <TrendBadge value={card.deltaJ1} label="vs J-1" />
                        <TrendBadge value={card.deltaJ7} label="vs J-7" />
                      </span>
                    </button>
                  );
                })}
              </section>

              <section className="resp-grid two">
                <article className="resp-card">
                  <div className="resp-card-header">
                    <h3><BarChart3 size={17} /> Évolution des demandes</h3>
                    <span className="resp-improve-tag">Annoté</span>
                  </div>
                  {requestPoints.length > 1 ? (
                    <div className="resp-chart-area">
                      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" className="resp-chart-svg">
                        <defs>
                          <linearGradient id="respRequestsGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.30" />
                            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <line x1="0" y1="90" x2="420" y2="90" className="resp-grid-line strong" />
                        <line x1="0" y1="60" x2="420" y2="60" className="resp-grid-line" />
                        <line x1="0" y1="30" x2="420" y2="30" className="resp-grid-line" />
                        <path d={areaPath(requestPoints)} fill="url(#respRequestsGrad)" />
                        <path d={smoothPath(requestPoints)} className="resp-line accent" />
                        {requestPoints[requestPoints.length - 2] && (
                          <>
                            <circle cx={requestPoints[requestPoints.length - 2].x} cy={requestPoints[requestPoints.length - 2].y} r="5" className="resp-point warn" />
                            <line
                              x1={requestPoints[requestPoints.length - 2].x}
                              y1={Math.max(10, requestPoints[requestPoints.length - 2].y - 6)}
                              x2={requestPoints[requestPoints.length - 2].x}
                              y2="18"
                              className="resp-marker-line"
                            />
                            <rect x={Math.max(8, requestPoints[requestPoints.length - 2].x - 48)} y="5" width="96" height="16" rx="4" className="resp-annotation-box" />
                            <text x={requestPoints[requestPoints.length - 2].x} y="16" className="resp-annotation-text" textAnchor="middle">Commande lancée</text>
                          </>
                        )}
                      </svg>
                      <div className="resp-x-labels">
                        {requestSeries.map((item, index) => <span key={`${item.label}-${index}`}>{index % 2 === 0 ? item.label : ''}</span>)}
                      </div>
                    </div>
                  ) : (
                    <div className="resp-empty-state">Pas assez de données sur les demandes.</div>
                  )}
                  <p className="resp-card-note">
                    Demandes {requestDeltaPercent >= 0 ? 'en hausse' : 'en baisse'} ·
                    <strong>{requestDeltaPercent >= 0 ? '+' : ''}{requestDeltaPercent.toFixed(1)}% vs période récente</strong>
                  </p>
                </article>

                <article className="resp-card">
                  <div className="resp-card-header">
                    <h3><CalendarDays size={17} /> Stock vs seuil critique</h3>
                    <span className="resp-improve-tag">Courbe réelle</span>
                  </div>
                  {stockCurve ? (
                    <>
                      <div className="resp-chart-area seuil">
                        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" className="resp-chart-svg">
                          <defs>
                            <linearGradient id="respStockGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--accent2)" stopOpacity="0.22" />
                              <stop offset="100%" stopColor="var(--accent2)" stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          <rect x={stockCurve.points[7]?.x || 210} y="0" width={CHART_WIDTH - (stockCurve.points[7]?.x || 210)} height="92" className="resp-projection-zone" />
                          <line x1="0" y1="90" x2="420" y2="90" className="resp-grid-line strong" />
                          <line x1="0" y1={stockCurve.thresholdY} x2="420" y2={stockCurve.thresholdY} className="resp-threshold-line" />
                          <text x="410" y={Math.max(10, stockCurve.thresholdY - 4)} className="resp-threshold-label" textAnchor="end">Seuil</text>
                          <path d={areaPath(stockCurve.points)} fill="url(#respStockGrad)" />
                          <path d={smoothPath(stockCurve.points)} className="resp-line stock" />
                          <text x="326" y="13" className="resp-projection-label" textAnchor="middle">Projection J+7</text>
                          {stockCurve.crossing && (
                            <>
                              <circle cx={stockCurve.crossing.x} cy={stockCurve.crossing.y} r="4.5" className="resp-point danger" />
                              <text x={Math.max(30, stockCurve.crossing.x - 8)} y={Math.max(14, stockCurve.crossing.y - 8)} className="resp-crossing-label">{stockCurve.crossing.label}</text>
                            </>
                          )}
                        </svg>
                        <div className="resp-x-labels stock">
                          <span>J-7</span>
                          <span>Auj.</span>
                          <span>J+7</span>
                        </div>
                      </div>
                      <div className="resp-seuil-note">
                        <AlertTriangle size={14} />
                        {stockCurve.crossing
                          ? `Le stock croise le seuil autour de ${stockCurve.crossing.label}. Action recommandée aujourd’hui.`
                          : "Aucun croisement détecté sur l’horizon J+7."}
                      </div>
                      <div className="resp-legend">
                        <span><i className="dot stock" /> Stock réel</span>
                        <span><i className="dot threshold" /> Seuil critique</span>
                        <span><i className="dot projection" /> Projection</span>
                      </div>
                    </>
                  ) : (
                    <div className="resp-empty-state">Aucun produit critique pour tracer Stock/Seuil.</div>
                  )}
                </article>
              </section>

              <section className="resp-grid two lower">
                <article className="resp-card">
                  <div className="resp-card-header">
                    <h3><ShoppingCart size={17} /> Top produits consommés</h3>
                    <span className="resp-improve-tag">Top 5 + tendance</span>
                  </div>
                  <div className="resp-products-list">
                    {topConsumed.length ? topConsumed.map((row) => (
                      <button
                        type="button"
                        className="resp-product-row"
                        key={row.key}
                        onClick={() => openConsumption(row.code || row.name)}
                      >
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
                          {row.trend >= 0 ? '↑' : '↓'}{row.trend >= 0 ? '+' : ''}{row.trend}
                        </span>
                      </button>
                    )) : (
                      <div className="resp-empty-state compact">Pas de données de consommation sur la période.</div>
                    )}
                  </div>
                </article>

                <div className="resp-side-stack">
                  <article className="resp-card">
                    <div className="resp-card-header">
                      <h3><CheckCircle2 size={17} /> Disponibilité stock</h3>
                      <span className="resp-improve-tag">Seuils colorés</span>
                    </div>
                    <div className="resp-availability-wrap">
                      <div className={`resp-donut ${availabilityTone}`}>
                        <svg viewBox="0 0 100 100" width="100" height="100">
                          <circle cx="50" cy="50" r="38" className="resp-donut-track" />
                          <circle
                            cx="50"
                            cy="50"
                            r="38"
                            className="resp-donut-progress"
                            style={{
                              strokeDasharray: `${2 * Math.PI * 38}`,
                              strokeDashoffset: `${(2 * Math.PI * 38) * (1 - availabilityRate / 100)}`,
                            }}
                          />
                        </svg>
                        <div className="resp-donut-label">
                          <strong><AnimatedNumber value={availabilityRate} decimals={1} />%</strong>
                          <span>Disponibilité</span>
                        </div>
                      </div>
                      <div className="resp-availability-stats">
                        <div><span className="ok">● OK</span><strong>{stats.ok}</strong></div>
                        <div><span className="danger">● Critiques</span><strong>{stats.critical}</strong></div>
                        <div><span>Total</span><strong>{stats.total}</strong></div>
                        <p className={availabilityTone}>
                          Seuil affiché : vert &gt;85%, orange 70–85%, rouge &lt;70%.
                        </p>
                      </div>
                    </div>
                  </article>

                  <article className="resp-card">
                    <div className="resp-card-header">
                      <h3><FlaskConical size={17} /> Registre chimique</h3>
                      <span className="resp-danger-tag">{chemicalSummary.missingFds} FDS manquantes</span>
                    </div>
                    <div className="resp-register-list">
                      <div><span>Produits enregistrés</span><strong>{chemicalSummary.total}</strong></div>
                      <div><span>FDS manquantes</span><strong className="danger">{chemicalSummary.missingFds}</strong></div>
                      <div>
                        <span>Taux conformité</span>
                        <strong className={chemicalSummary.missingFds > 0 ? 'danger' : 'ok'}>
                          {chemicalSummary.total ? Math.round(((chemicalSummary.total - chemicalSummary.missingFds) / chemicalSummary.total) * 100) : 0}%
                        </strong>
                      </div>
                    </div>
                    <button type="button" className="resp-register-action" onClick={() => navigate('/responsable/registre-chimique')}>
                      Ouvrir registre et compléter FDS
                      <ChevronRight size={15} />
                    </button>
                  </article>
                </div>
              </section>

              <footer className="resp-dashboard-footer">
                Maquette intégrée au langage React de l’application ETAP · Dernière MàJ : {formatDateTimeLabel(lastUpdatedAt)}
              </footer>
            </div>
          </main>
        </div>
      </div>
    </ProtectedPage>
  );
}

export default DashboardResp;
