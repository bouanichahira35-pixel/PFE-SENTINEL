import { useCallback, useEffect, useMemo, useState } from 'react'; 
import { 
  AlertTriangle, 
  Package, 
  Activity,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  LineChart,
  PieChart,
  RefreshCw,
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

function pctSafe(numerator, denominator) {
  const den = Number(denominator || 0);
  if (den <= 0) return 0;
  return (Number(numerator || 0) / den) * 100;
}

function AnimatedNumber({ value, decimals = 0, durationMs = 650 }) {
  const [shown, setShown] = useState(() => Number(value || 0));

  useEffect(() => {
    const target = Number(value || 0);
    const start = Number(shown || 0);
    if (!Number.isFinite(target) || !Number.isFinite(start)) {
      setShown(target);
      return undefined;
    }
    if (Math.abs(target - start) < 0.0001) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals, durationMs]);

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

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const range = buildRange(periodDays);
      const fromIso = encodeURIComponent(range.from.toISOString());
      const toIso = encodeURIComponent(range.to.toISOString());

      await post('/ai/alerts/refresh', { window_days: range.days }).catch(() => null);

      const [all, insights, stockoutRes, activityRes, modelStatusRes, assistantStatusRes, supplierInsightsRes, aiAlertsRes] = await Promise.all([
        get('/products'),
        get(`/history/insights?from=${fromIso}&to=${toIso}`).catch(() => ({ daily_trend: [], top_consumed_products: [], anomalies: [] })),
        post('/ai/predict/stockout', { horizon_days: 7 }).catch(() => ({ predictions: [] })),
        get(`/history?limit=12&from=${fromIso}&to=${toIso}`).catch(() => ({ items: [] })),
        get('/ai/models/status').catch(() => null),
        get('/ai/assistant/status').catch(() => null),
        get('/suppliers/insights?max=3&window_days=180').catch(() => null),
        get('/ai/alerts').catch(() => []),
      ]);

      setAllProducts(Array.isArray(all) ? all : []);
      setStockoutForecast(Array.isArray(stockoutRes?.predictions) ? stockoutRes.predictions : []);

      const dailyRows = Array.isArray(insights?.daily_trend) ? insights.daily_trend : [];
      const byDay = new Map();
      dailyRows.forEach((row) => {
        const day = row?._id?.day;
        const actionType = row?._id?.action_type;
        const count = Number(row?.count || 0);
        if (!day) return;
        if (!byDay.has(day)) byDay.set(day, { day, entry: 0, exit: 0 });
        const item = byDay.get(day);
        if (actionType === 'entry') item.entry += count;
        if (actionType === 'exit') item.exit += count;
      });
      setHistoryTrend(
        Array.from(byDay.values())
          .sort((a, b) => new Date(a.day) - new Date(b.day))
          .slice(-20)
      );

      setTopConsumedProducts(Array.isArray(insights?.top_consumed_products) ? insights.top_consumed_products : []);
      setHistoryAnomalies(Array.isArray(insights?.anomalies) ? insights.anomalies : []);
      setRecentActivity(Array.isArray(activityRes?.items) ? activityRes.items.slice(0, 12) : []);
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

  const rangeLabel = useMemo(() => {
    const range = buildRange(periodDays);
    const fr = range.from.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    const tr = range.to.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    return `${fr} → ${tr} (J-${range.days})`;
  }, [periodDays]);

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
        return {
          id: `${row.product_id || 'p'}-${idx}`,
          productId: pid,
          image: pid ? (productImageById[pid] || '') : '',
          productName: row.product_name || 'Produit', 
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

  const consumptionSeries = useMemo(() => {
    return historyTrend.slice(-10).map((x) => ({
      label: formatDayLabel(x.day),
      value: Number(x.exit || 0),
    }));
  }, [historyTrend]);

  const consumptionInsight = useMemo(() => {
    const values = consumptionSeries.map((x) => Number(x.value || 0));
    if (values.length < 6) return 'Donnees insuffisantes pour mesurer une tendance fiable.';
    const recentAvg = mean(values.slice(-3));
    const prevAvg = Math.max(0.0001, mean(values.slice(-6, -3)));
    const delta = ((recentAvg - prevAvg) / prevAvg) * 100;
    const direction = delta >= 0 ? 'hausse' : 'baisse';
    const level = Math.abs(delta) >= 12 ? 'alerte' : 'stable';
    return `Consommation en ${direction} de ${Math.abs(delta).toFixed(1)}% (niveau ${level}).`;
  }, [consumptionSeries]);

  const consumptionValues = consumptionSeries.map((x) => Number(x.value || 0));
  const consumptionMax = Math.max(1, ...consumptionValues);
  const consumptionCoords = toLineCoords(consumptionValues, 0, consumptionMax);

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
    const crossingSignal = stockVsSeuil.crossingDay
      ? `Croisement seuil vers ${stockVsSeuil.crossingDay}`
      : "Pas de croisement seuil sur l'horizon";
    return {
      priorityProduct: topRiskProduct.product_name || 'Produit',
      priorityRisk: risk,
      nextDecision: orderQty > 0 ? `Commander ${orderQty} unite(s) aujourd'hui` : 'Surveillance active sans commande immediate',
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
    return rows.slice(0, 6).map((a, idx) => ({
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
    const predictionsLabel = predictionsOk ? 'Actives' : predictionsEnabled ? 'En cours' : 'Desactivees';

    return {
      assistantLabel: assistantOk ? 'Actif' : 'Non actif', 
      assistantHint: assistantOk
        ? 'Vous pouvez demander un resume et des recommandations.'
        : 'Activez l assistant dans Parametres > Intelligence Artificielle.', 
      predictionsLabel, 
      lastUpdateLabel: lastTrainedAt ? formatDateTimeLabel(lastTrainedAt) : '-',
    };
  }, [assistantStatus]);

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
            title="Dashboard"
            showSearch={false}
            onMenuClick={() => setSidebarCollapsed((prev) => !prev)}
          />
          <main className="main-content">
            {isLoading && <LoadingSpinner overlay text="Chargement..." />}

            <div className="dashboard-page saas-dashboard">
              <div className="dash-toolbar">
                <div className="dash-toolbar-left">
                  <span className="dash-range-label">{rangeLabel}</span>
                  <div className="dash-pills" role="tablist" aria-label="Periode dashboard">
                    {[7, 30, 90].map((days) => (
                      <button
                        key={days}
                        type="button"
                        className={`dash-pill ${periodDays === days ? 'active' : ''}`}
                        onClick={() => setPeriodDays(days)}
                        disabled={isLoading}
                      >
                        {days}j
                      </button>
                    ))}
                  </div>
                </div>
                <div className="dash-toolbar-right">
                  <button
                    type="button"
                    className="dash-action ai-alerts"
                    onClick={() => navigate('/responsable/pilotage?tab=alertes')}
                    disabled={isLoading}
                    aria-label="Voir alertes IA"
                    title="Voir alertes IA"
                  >
                    <Sparkles size={16} />
                    <span>Alertes</span>
                    <span className={`dash-badge ${alertsBadgeCount > 0 ? 'hot' : ''}`}>
                      {alertsBadgeCount}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="dash-action"
                    onClick={loadData}
                    disabled={isLoading}
                    aria-label="Actualiser"
                    title="Actualiser"
                  >
                    <RefreshCw size={16} />
                    <span>Actualiser</span>
                  </button>
                </div>
              </div>

              <div className="kpi-grid">
                <div className="kpi-card success">
                  <div className="kpi-icon"><Package size={20} /></div>
                  <div className="kpi-content">
                    <span className="kpi-value"><AnimatedNumber value={stats.totalProduits} /></span>
                    <span className="kpi-label">Total produits</span>
                  </div>
                  <div className="kpi-trend up"><ArrowUpRight size={14} /><span>Actif</span></div>
                </div>

                <div className="kpi-card warning">
                  <div className="kpi-icon"><AlertTriangle size={20} /></div>
                  <div className="kpi-content">
                    <span className="kpi-value"><AnimatedNumber value={stats.sousSeuilCount} /></span>
                    <span className="kpi-label">Sous seuil</span>
                  </div>
                  <div className="kpi-trend down"><ArrowDownRight size={14} /><span>Attention</span></div>
                </div>

                <div className="kpi-card danger">
                  <div className="kpi-icon"><Activity size={20} /></div>
                  <div className="kpi-content">
                    <span className="kpi-value"><AnimatedNumber value={stats.ruptureCount} /></span>
                    <span className="kpi-label">En rupture</span>
                  </div>
                  <div className="kpi-trend down"><ArrowDownRight size={14} /><span>Critique</span></div>
                </div>

                <div className="kpi-card info">
                  <div className="kpi-icon"><CheckCircle2 size={20} /></div>
                  <div className="kpi-content">
                    <span className="kpi-value"><AnimatedNumber value={stats.disponiblesCount} /></span>
                    <span className="kpi-label">Produits disponibles</span>
                  </div>
                  <div className={`kpi-trend ${stats.disponiblesCount >= stats.sousSeuilCount ? 'up' : 'down'}`}>
                    {stats.disponiblesCount >= stats.sousSeuilCount ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    <span>{stats.disponiblesCount >= stats.sousSeuilCount ? 'Maitrise' : 'A surveiller'}</span>
                  </div>
                </div>
              </div>

              <div className="perf-strip">
                <div className="perf-chip">
                  <span>Mouvements (periode)</span>
                  <strong><AnimatedNumber value={movementStats.total} /></strong>
                </div>
                <div className="perf-chip">
                  <span>Entrées</span>
                  <strong><AnimatedNumber value={movementStats.entries} /></strong>
                </div>
	                <div className="perf-chip">
	                  <span>Sorties</span>
	                  <strong><AnimatedNumber value={movementStats.exits} /></strong>
	                </div>
	                <button
	                  type="button"
	                  className="perf-chip"
	                  onClick={() => navigate('/responsable/parametres?tab=fournisseurs')}
	                  style={{ cursor: 'pointer', textAlign: 'left' }}
	                  title="Voir les incidents fournisseurs"
	                >
	                  <span>Retards fournisseurs</span>
	                  <strong><AnimatedNumber value={supplierOps.late_open_orders || 0} /></strong>
	                </button>
	                <div className="perf-chip">
	                  <span>Alertes (critiques)</span>
	                  <strong><AnimatedNumber value={alertsBadgeCount} /></strong>
	                </div>
              </div>

              <div className="decision-strip">
                <div className="decision-chip">
                  <span>Produit prioritaire</span>
                  <strong>{decisionSummary.priorityProduct}</strong>
                  <small>Risque {decisionSummary.priorityRisk.toFixed(1)}%</small>
                </div>
                <div className="decision-chip">
                  <span>Action recommandee</span>
                  <strong>{decisionSummary.nextDecision}</strong>
                  <small>Base: stock actuel, seuil minimum et horizon J+7</small>
                </div>
                <div className="decision-chip">
                  <span>Signal seuil</span>
                  <strong>{decisionSummary.thresholdSignal}</strong>
                  <small>Horizon J+7</small>
                </div>
              </div> 

              <div className="charts-grid"> 
                <article className="chart-card"> 
                  <div className="chart-head"> 
                    <h3><LineChart size={17} /> Demande recente</h3> 
                  </div> 
                  {consumptionCoords.length > 1 ? ( 
                    <div className="chart-wrap"> 
                      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="chart-svg" preserveAspectRatio="none"> 
                        <line x1={CHART_PAD_X} y1={CHART_HEIGHT - CHART_PAD_Y} x2={CHART_WIDTH - CHART_PAD_X} y2={CHART_HEIGHT - CHART_PAD_Y} className="axis-line" />
                        <path d={toAreaPath(consumptionCoords)} className="area-fill blue" />
                        <polyline points={toPolylinePoints(consumptionCoords)} className="line-main blue" />
                        {consumptionCoords.length > 0 && (
                          <circle cx={consumptionCoords[consumptionCoords.length - 1].x} cy={consumptionCoords[consumptionCoords.length - 1].y} r="3.5" className="point-main blue" />
                        )}
                      </svg> 
                      <div
                        className="x-labels"
                        style={{ gridTemplateColumns: `repeat(${Math.max(2, consumptionSeries.length)}, minmax(0, 1fr))` }}
                      > 
                        {consumptionSeries.map((item, idx) => ( 
                          <span key={`${item.label}-${idx}`}>{idx % 2 === 0 ? item.label : ''}</span> 
                        ))} 
                      </div> 
                    </div> 
                  ) : (
                    <div className="chart-empty">Pas assez de donnees de consommation.</div>
                  )}
                  <p className="chart-insight">{consumptionInsight}</p>
                </article>

                <article className="chart-card"> 
                  <div className="chart-head"> 
                    <h3><PieChart size={17} /> Stock vs seuil critique</h3> 
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
                      ? `Croisement seuil prevu vers ${stockVsSeuil.crossingDay}. Action immediate recommandee.`
                      : "Pas de croisement seuil detecte sur l'horizon J+7."}
                  </p>
                </article>

                <article className="chart-card">
                  <div className="chart-head">
                    <h3><Sparkles size={17} /> Top produits consommes</h3>
                    <span className="chart-subtitle">Sur la periode</span>
                  </div>
                  {topConsumed.rows.length ? (
                    <div className="bar-chart-wrap">
                      {topConsumed.rows.slice(0, 8).map((row) => (
                        <div className="bar-row" key={row.id}>
                          <span className="bar-label" title={row.name}>{row.code}</span>
                          <div className="bar-track" aria-hidden="true">
                            <div className="bar-fill" style={{ width: `${Math.round(row.ratio * 100)}%` }} />
                          </div>
                          <span className="bar-value">{Math.round(row.qty)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="chart-empty">Pas de donnees de consommation sur la periode.</div>
                  )}
                  <p className="chart-insight">
                    {topConsumed.rows.length
                      ? `Top 1: ${topConsumed.rows[0].name} (${Math.round(topConsumed.rows[0].qty)} unite(s)).`
                      : 'Aucun top produit calcule.'}
                  </p>
                </article>

                <article className="chart-card">
                  <div className="chart-head">
                    <h3><CheckCircle2 size={17} /> Disponibilite stock</h3>
                    <span className="chart-subtitle">Produits OK / total</span>
                  </div>
                  <div className="gauge-wrap" aria-label="Disponibilite stock">
                    <div className="gauge-ring" style={{ '--gauge': `${availabilityRate.toFixed(2)}%` }}>
                      <div className="gauge-center">
                        <div className="gauge-value">
                          <AnimatedNumber value={availabilityRate} decimals={1} />%
                        </div>
                        <div className="gauge-label">Disponibilite</div>
                      </div>
                    </div>
                    <div className="gauge-meta">
                      <span>OK: {stats.disponiblesCount}</span>
                      <span>Total: {stats.totalProduits}</span>
                    </div>
                  </div>
                  <p className="chart-insight">
                    {availabilityRate >= 85
                      ? 'Disponibilite bonne. Surveille les sous-seuil pour eviter les ruptures.'
                      : 'Disponibilite faible. Prioriser les references critiques a risque.'}
                  </p>
                </article>
              </div>

              <div className="lower-grid">
                <div className="dashboard-card compact-card">
                  <div className="card-header">
                    <h3 className="card-title"><Clock size={17} /><span>Activite recente</span></h3>
                    <span className="card-subtitle">Dernieres operations</span>
                  </div>
                  <div className="feed-list">
                    {recentFeed.map((item) => (
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
                    {!recentFeed.length && <div className="feed-empty">Aucune activite recente sur la periode.</div>}
                  </div>
                </div>

                <div className="dashboard-card compact-card">
                  <div className="card-header">
                    <h3 className="card-title"><AlertTriangle size={17} /><span>Anomalies detectees</span></h3>
                    <span className="card-subtitle">Signaux issus de l’historique</span>
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
                    {!anomalyFeed.length && <div className="feed-empty">Aucune anomalie forte recente.</div>}
                  </div>
                </div>

                <div className="dashboard-card compact-card">
                  <div className="card-header">
                    <h3 className="card-title"><Sparkles size={17} /><span>Aide a la decision</span></h3>
                    <span className="card-subtitle">Assistant & previsions</span>
                  </div>
                  <div className="ai-status">
                    <div className="ai-status-row">
                      <span>Assistant</span>
                      <strong>{assistantSummary.assistantLabel}</strong>
                    </div>
                    <div className="ai-status-row">
                      <span>Previsions</span>
                      <strong>{assistantSummary.predictionsLabel}</strong>
                    </div>
                    <div className="ai-status-row">
                      <span>Derniere mise a jour</span>
                      <strong>{assistantSummary.lastUpdateLabel}</strong>
                    </div>
                    <div className="ai-status-row">
                      <span>Action</span>
                      <strong>{assistantSummary.assistantHint}</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="dashboard-card alert-table-card compact-alerts">
                <div className="card-header">
                  <h3 className="card-title"><AlertTriangle size={17} /><span>Alertes prioritaires</span></h3>
                </div>
                {aiAlertsSummary.newCount > 0 && (
                  <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(148,163,184,.35)', background: 'rgba(99,102,241,.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ fontWeight: 950, color: '#0f172a' }}>
                        Alertes IA (nouvelles): {aiAlertsSummary.newCount}
                      </div>
                      <button
                        type="button"
                        className="dash-action"
                        onClick={() => navigate('/responsable/pilotage?tab=alertes')}
                        style={{ padding: '6px 10px' }}
                      >
                        <Sparkles size={14} />
                        <span>Voir</span>
                      </button>
                    </div>
                    <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                      {aiAlertsSummary.top.map((a) => (
                        <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 13 }}>
                          <span style={{ fontWeight: 950, color: a.risk === 'high' ? '#b91c1c' : a.risk === 'medium' ? '#b45309' : '#334155' }}>
                            {a.type.toUpperCase()}
                          </span>
                          <span style={{ fontWeight: 900, color: '#0f172a' }}>{a.productName}</span>
                          <span style={{ color: '#475569' }}>{a.message || 'Signal detecte'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="alert-table-wrap">
                  <table className="alert-table">
                    <thead>
                      <tr> 
                        <th>Produit</th> 
                        <th>Niveau</th> 
                        <th>Pourquoi</th>
                        <th>Action immediate</th> 
                        <th>Risque</th> 
                      </tr> 
                    </thead> 
                    <tbody> 
                      {smartAlerts.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <ProtectedImage
                                filePath={row.image}
                                alt={row.productName}
                                className="dash-product-thumb"
                                fallbackText=""
                                style={{ width: 28, height: 28, borderRadius: 10, objectFit: 'cover' }}
                              />
                              <strong>{row.productName}</strong>
                            </div>
                          </td> 
                          <td><span className={`level-pill ${row.level.toLowerCase()}`}>{row.level}</span></td> 
                          <td className="reason-col">{row.reason}</td>
                          <td>{row.action}</td> 
                          <td>{row.riskProbability.toFixed(1)}%</td> 
                        </tr> 
                      ))} 
                      {!smartAlerts.length && ( 
                        <tr> 
                          <td colSpan={5} className="empty-cell">Aucune alerte prioritaire actuellement.</td> 
                        </tr> 
                      )} 
                    </tbody> 
                  </table> 
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </ProtectedPage>
  );
};

export default DashboardResp;
