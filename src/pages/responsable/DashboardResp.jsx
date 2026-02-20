import { useCallback, useEffect, useMemo, useState } from 'react'; 
import { 
  AlertTriangle, 
  TrendingDown, 
  Package, 
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  LineChart,
  BarChart3,
  PieChart,
  Bot,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get, post, getApiPerfMetrics, subscribeApiPerf } from '../../services/api';
import './DashboardResp.css';

const CHART_WIDTH = 360;
const CHART_HEIGHT = 170;
const CHART_PAD_X = 18; 
const CHART_PAD_Y = 16; 

function clamp(value, min, max) { 
  return Math.min(max, Math.max(min, value)); 
} 

function shortReason(row) {
  const fromExplanation = String(row?.explanation || '').trim();
  if (fromExplanation) return fromExplanation;
  const factors = Array.isArray(row?.factors) ? row.factors.filter(Boolean) : [];
  if (!factors.length) return 'Variation recente detectee.';
  return factors.slice(0, 2).join(' + ');
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

function aggregateCurve(curves, key) {
  const sumByLabel = new Map();
  for (const curve of curves) {
    const labels = curve?.[key]?.labels || [];
    const values = curve?.[key]?.values || [];
    for (let i = 0; i < labels.length; i += 1) {
      const label = labels[i];
      const value = Number(values[i] || 0);
      if (!label) continue;
      sumByLabel.set(label, Number((sumByLabel.get(label) || 0) + value));
    }
  }
  return Array.from(sumByLabel.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => new Date(a.label) - new Date(b.label));
}

function levelFromRisk(probability, underThreshold) {
  if (underThreshold || Number(probability || 0) >= 70) return 'Critique';
  if (Number(probability || 0) >= 40) return 'Moyen';
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

const DashboardResp = ({ userName, onLogout }) => {
  const navigate = useNavigate();
  const toast = useToast();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [allProducts, setAllProducts] = useState([]);
  const [historyTrend, setHistoryTrend] = useState([]);
  const [aiStockout, setAiStockout] = useState([]);
  const [aiConsumption, setAiConsumption] = useState([]);
  const [aiAnomaly, setAiAnomaly] = useState([]);
  const [aiCopilot, setAiCopilot] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastLoadMs, setLastLoadMs] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState('');
  const [apiPerf, setApiPerf] = useState(() => getApiPerfMetrics());

  const loadData = useCallback(async () => {
    const startedAt = Date.now();
    setIsLoading(true);
    try {
      const [all, insights, stockoutRes, consumptionRes, anomalyRes, copilotRes] = await Promise.all([
        get('/products'),
        get('/history/insights').catch(() => ({ daily_trend: [] })),
        post('/ai/predict/stockout', { horizon_days: 7 }).catch(() => ({ predictions: [] })),
        post('/ai/predict/consumption', { horizon_days: 14 }).catch(() => ({ predictions: [] })),
        post('/ai/predict/anomaly', {}).catch(() => ({ predictions: [] })),
        post('/ai/copilot/recommendations', { horizon_days: 14, top_n: 10, simulations: [] }).catch(() => null),
      ]);

      setAllProducts(Array.isArray(all) ? all : []);
      setAiStockout(Array.isArray(stockoutRes?.predictions) ? stockoutRes.predictions : []);
      setAiConsumption(Array.isArray(consumptionRes?.predictions) ? consumptionRes.predictions : []);
      setAiAnomaly(Array.isArray(anomalyRes?.predictions) ? anomalyRes.predictions : []);
      setAiCopilot(copilotRes || null);

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
    } catch (err) {
      toast.error(err.message || 'Erreur chargement dashboard');
    } finally {
      setLastLoadMs(Math.max(0, Date.now() - startedAt));
      setLastSyncAt(new Date().toISOString());
      setApiPerf(getApiPerfMetrics());
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) loadData();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    setApiPerf(getApiPerfMetrics());
    const unsubscribe = subscribeApiPerf((metrics) => {
      setApiPerf(metrics);
    });
    return unsubscribe;
  }, []);

  const stats = useMemo(() => {
    const totalProduits = allProducts.length;
    const sousSeuilCount = allProducts.filter(
      (p) => Number(p.quantity_current || 0) <= Number(p.seuil_minimum || 0) && Number(p.quantity_current || 0) > 0
    ).length;
    const ruptureCount = allProducts.filter((p) => Number(p.quantity_current || 0) === 0).length;
    return { totalProduits, sousSeuilCount, ruptureCount };
  }, [allProducts]);

  const riskSource = useMemo(() => {
    const fromCopilot = Array.isArray(aiCopilot?.top_risk_products) ? aiCopilot.top_risk_products : [];
    const source = fromCopilot.length ? fromCopilot : aiStockout;
    return [...source].sort((a, b) => Number(b.risk_probability || 0) - Number(a.risk_probability || 0));
  }, [aiCopilot, aiStockout]);

  const topRiskProduct = useMemo(() => (riskSource.length ? riskSource[0] : null), [riskSource]);

  const aiScoreGlobal = useMemo(() => {
    const avgRisk = mean(riskSource.slice(0, 8).map((x) => Number(x.risk_probability || 0)));
    const avgAnomaly = mean(
      [...aiAnomaly]
        .sort((a, b) => Number(b.anomaly_score || 0) - Number(a.anomaly_score || 0))
        .slice(0, 8)
        .map((x) => Number(x.anomaly_score || 0))
    );
    const ratioSousSeuil = stats.totalProduits ? stats.sousSeuilCount / stats.totalProduits : 0;
    const ratioRupture = stats.totalProduits ? stats.ruptureCount / stats.totalProduits : 0;

    const penalty = avgRisk * 0.45 + avgAnomaly * 0.2 + ratioSousSeuil * 25 + ratioRupture * 35;
    return clamp(Number((100 - penalty).toFixed(1)), 0, 100);
  }, [aiAnomaly, riskSource, stats]);

  const smartAlerts = useMemo(() => ( 
    riskSource.slice(0, 6).map((row, idx) => { 
      const stock = Number(row.current_stock || 0); 
      const seuil = Number(row.seuil_minimum || 0); 
      const underThreshold = stock <= seuil; 
      return {
        id: `${row.product_id || 'p'}-${idx}`,
        productName: row.product_name || 'Produit', 
        level: levelFromRisk(row.risk_probability, underThreshold), 
        action: `Commander ${Number(row.recommended_order_qty || 0)} u.`, 
        reason: shortReason(row),
        riskProbability: Number(row.risk_probability || 0), 
      }; 
    }) 
  ), [riskSource]); 

  const consumptionSeries = useMemo(() => {
    const curves = Array.isArray(aiCopilot?.dashboard_curves) ? aiCopilot.dashboard_curves : [];
    if (curves.length) {
      return aggregateCurve(curves, 'history_30d')
        .slice(-10)
        .map((x) => ({ label: formatDayLabel(x.label), value: Number(x.value || 0) }));
    }
    return historyTrend.slice(-10).map((x) => ({
      label: formatDayLabel(x.day),
      value: Number(x.exit || 0),
    }));
  }, [aiCopilot, historyTrend]);

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

  const forecastSeries = useMemo(() => {
    const curves = Array.isArray(aiCopilot?.dashboard_curves) ? aiCopilot.dashboard_curves : [];
    const preferred = curves.find((x) => String(x.product_id) === String(topRiskProduct?.product_id || '')) || curves[0];

    if (preferred) {
      return {
        productName: preferred.product_name || topRiskProduct?.product_name || 'Produit',
        historyLabels: (preferred.history_30d?.labels || []).slice(-8).map(formatDayLabel),
        historyValues: (preferred.history_30d?.values || []).slice(-8).map((v) => Number(v || 0)),
        futureLabels: (preferred.forecast_14d?.labels || []).slice(0, 8).map(formatDayLabel),
        futureValues: (preferred.forecast_14d?.values || []).slice(0, 8).map((v) => Number(v || 0)),
      };
    }

    const fallbackHistory = consumptionSeries.slice(-8);
    const fallbackHistoryValues = fallbackHistory.map((x) => Number(x.value || 0));
    const fallbackDaily = Number(aiConsumption?.[0]?.expected_daily || mean(fallbackHistoryValues) || 0);

    return {
      productName: topRiskProduct?.product_name || aiConsumption?.[0]?.product_name || 'Produit',
      historyLabels: fallbackHistory.map((x) => x.label),
      historyValues: fallbackHistoryValues,
      futureLabels: Array.from({ length: 8 }, (_, idx) => `J+${idx + 1}`),
      futureValues: Array.from({ length: 8 }, () => fallbackDaily),
    };
  }, [aiConsumption, aiCopilot, consumptionSeries, topRiskProduct]);

  const forecastCombinedValues = [...forecastSeries.historyValues, ...forecastSeries.futureValues];
  const forecastMax = Math.max(1, ...forecastCombinedValues);
  const forecastCoords = toLineCoords(forecastCombinedValues, 0, forecastMax);
  const historyCount = forecastSeries.historyValues.length;
  const forecastHistoryCoords = forecastCoords.slice(0, historyCount);
  const forecastFutureCoords = forecastCoords.slice(Math.max(0, historyCount - 1));
  const forecastInsight = useMemo(() => {
    if (!forecastSeries.futureValues.length) return 'Prevision indisponible pour le moment.';
    const avgFuture = mean(forecastSeries.futureValues);
    const avgPast = Math.max(0.0001, mean(forecastSeries.historyValues));
    const delta = ((avgFuture - avgPast) / avgPast) * 100;
    const state = delta > 10 ? 'hausse attendue' : delta < -10 ? 'baisse attendue' : 'tendance stable';
    return `Prevision ${forecastSeries.productName}: ${state} (${delta.toFixed(1)}% vs historique).`;
  }, [forecastSeries]);

  const anomalySeries = useMemo(() => (
    [...aiAnomaly]
      .sort((a, b) => Number(b.anomaly_score || 0) - Number(a.anomaly_score || 0))
      .slice(0, 6)
      .map((item, idx) => ({
        id: `${item.product_id || idx}`,
        label: String(item.product_name || item.code_product || `P${idx + 1}`).slice(0, 12),
        score: Number(item.anomaly_score || 0),
      }))
  ), [aiAnomaly]);

  const anomalyMax = Math.max(1, ...anomalySeries.map((x) => x.score));
  const anomalyInsight = useMemo(() => { 
    if (!anomalySeries.length) return 'Aucune anomalie forte detectee.'; 
    const top = anomalySeries[0]; 
    return `Anomalie prioritaire: ${top.label} (${top.score.toFixed(1)}%). Verification conseillee aujourd'hui.`; 
  }, [anomalySeries]); 

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

  const performanceSummary = useMemo(() => {
    const totalRequests = Number(apiPerf?.total_requests || 0);
    const networkRequests = Number(apiPerf?.network_requests || 0);
    const cacheHits = Number(apiPerf?.cached_requests || 0);
    const failed = Number(apiPerf?.failed_requests || 0);
    const avgLatency = Number(apiPerf?.avg_latency_ms || 0);
    const cacheRate = totalRequests > 0 ? ((cacheHits / totalRequests) * 100) : 0;
    const successRate = networkRequests > 0 ? (((networkRequests - failed) / networkRequests) * 100) : 100;
    return {
      cacheRate,
      successRate,
      avgLatency,
    };
  }, [apiPerf]);

  return (
    <ProtectedPage userName={userName}>
      <div className="app-layout">
        <SidebarResp
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          onLogout={onLogout}
          userName={userName}
        />

        <div className="main-container">
          <HeaderPage userName={userName} title="Dashboard" showSearch={false} />
          <main className="main-content">
            {isLoading && <LoadingSpinner overlay text="Chargement..." />}

            <div className="dashboard-page saas-dashboard">
              <div className="kpi-grid">
                <div className="kpi-card success">
                  <div className="kpi-icon"><Package size={20} /></div>
                  <div className="kpi-content">
                    <span className="kpi-value">{stats.totalProduits}</span>
                    <span className="kpi-label">Total produits</span>
                  </div>
                  <div className="kpi-trend up"><ArrowUpRight size={14} /><span>Actif</span></div>
                </div>

                <div className="kpi-card warning">
                  <div className="kpi-icon"><AlertTriangle size={20} /></div>
                  <div className="kpi-content">
                    <span className="kpi-value">{stats.sousSeuilCount}</span>
                    <span className="kpi-label">Sous seuil</span>
                  </div>
                  <div className="kpi-trend down"><ArrowDownRight size={14} /><span>Attention</span></div>
                </div>

                <div className="kpi-card danger">
                  <div className="kpi-icon"><Activity size={20} /></div>
                  <div className="kpi-content">
                    <span className="kpi-value">{stats.ruptureCount}</span>
                    <span className="kpi-label">En rupture</span>
                  </div>
                  <div className="kpi-trend down"><ArrowDownRight size={14} /><span>Critique</span></div>
                </div>

                <div className="kpi-card info">
                  <div className="kpi-icon"><TrendingDown size={20} /></div>
                  <div className="kpi-content">
                    <span className="kpi-value">{aiScoreGlobal.toFixed(1)}%</span>
                    <span className="kpi-label">Score global stabilite</span>
                  </div>
                  <div className={`kpi-trend ${aiScoreGlobal >= 75 ? 'up' : 'down'}`}>
                    {aiScoreGlobal >= 75 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    <span>{aiScoreGlobal >= 75 ? 'Stable' : 'Risque'}</span>
                  </div>
                </div>
              </div>

              <div className="perf-strip"> 
                <div className="perf-chip"> 
                  <span>Latence API moyenne</span> 
                  <strong>{performanceSummary.avgLatency.toFixed(1)} ms</strong> 
                </div> 
                <div className="perf-chip"> 
                  <span>Fiabilite API</span> 
                  <strong>{performanceSummary.successRate.toFixed(1)}%</strong> 
                </div> 
                <div className="perf-chip"> 
                  <span>Derniere sync</span> 
                  <strong>{lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString('fr-FR') : '-'}</strong> 
                </div> 
                <div className="perf-chip"> 
                  <span>Dernier chargement</span> 
                  <strong>{lastLoadMs} ms</strong> 
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
                  <small>Base: stock vs demande projetee</small>
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
                    <h3><LineChart size={17} /> Projection 14 jours</h3> 
                  </div> 
                  {forecastCombinedValues.length > 1 ? ( 
                    <div className="chart-wrap"> 
                      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="chart-svg" preserveAspectRatio="none"> 
                        <line x1={CHART_PAD_X} y1={CHART_HEIGHT - CHART_PAD_Y} x2={CHART_WIDTH - CHART_PAD_X} y2={CHART_HEIGHT - CHART_PAD_Y} className="axis-line" />
                        <path d={toAreaPath(forecastFutureCoords)} className="area-fill teal" />
                        <polyline points={toPolylinePoints(forecastHistoryCoords)} className="line-main blue" />
                        <polyline points={toPolylinePoints(forecastFutureCoords)} className="line-main forecast" />
                      </svg>
                      <div className="legend-row">
                        <span><i className="legend-dot blue" />Historique</span>
                        <span><i className="legend-dot forecast" />Projection</span>
                      </div>
                      <div className="x-labels dual">
                        {[...forecastSeries.historyLabels.slice(-4), ...forecastSeries.futureLabels.slice(0, 4)].map((label, idx) => (
                          <span key={`${label}-${idx}`}>{label}</span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="chart-empty">Prevision indisponible.</div>
                  )}
                  <p className="chart-insight">{forecastInsight}</p>
                </article>

                <article className="chart-card"> 
                  <div className="chart-head"> 
                    <h3><BarChart3 size={17} /> Anomalies recentes</h3> 
                  </div> 
                  {anomalySeries.length ? (
                    <div className="bar-chart-wrap">
                      {anomalySeries.map((item) => (
                        <div key={item.id} className="bar-row">
                          <span className="bar-label">{item.label}</span>
                          <div className="bar-track">
                            <div
                              className="bar-fill"
                              style={{ width: `${Math.max(6, (item.score / anomalyMax) * 100)}%` }}
                            />
                          </div>
                          <span className="bar-value">{item.score.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="chart-empty">Aucune anomalie forte detectee.</div>
                  )}
                  <p className="chart-insight">{anomalyInsight}</p>
                </article>
              </div>

              <div className="dashboard-card alert-table-card compact-alerts">
                <div className="card-header">
                  <h3 className="card-title"><AlertTriangle size={17} /><span>Alertes prioritaires</span></h3>
                </div>
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
                          <td><strong>{row.productName}</strong></td> 
                          <td><span className={`level-pill ${row.level.toLowerCase()}`}>{row.level}</span></td> 
                          <td className="reason-col">{row.reason}</td>
                          <td>{row.action}</td> 
                          <td>{row.riskProbability.toFixed(1)}%</td> 
                        </tr> 
                      ))} 
                      {!smartAlerts.length && ( 
                        <tr> 
                          <td colSpan={5} className="empty-cell">Aucune alerte critique actuellement.</td> 
                        </tr> 
                      )} 
                    </tbody> 
                  </table> 
                </div>
              </div>

              <button
                className="chatbot-logo-fab"
                onClick={() => navigate('/responsable/chatbot')}
                aria-label="Ouvrir le chatbot"
                title="Ouvrir le chatbot"
              >
                <Bot size={20} />
              </button>
            </div>
          </main>
        </div>
      </div>
    </ProtectedPage>
  );
};

export default DashboardResp;
