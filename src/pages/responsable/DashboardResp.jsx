import { useCallback, useEffect, useMemo, useState } from 'react'; 
import { 
  AlertTriangle, 
  Package, 
  Activity,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  LineChart,
  PieChart,
} from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get, post } from '../../services/api';
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

const DashboardResp = ({ userName, onLogout }) => {
  const toast = useToast();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [allProducts, setAllProducts] = useState([]);
  const [historyTrend, setHistoryTrend] = useState([]);
  const [stockoutForecast, setStockoutForecast] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [all, insights, stockoutRes] = await Promise.all([
        get('/products'),
        get('/history/insights').catch(() => ({ daily_trend: [] })),
        post('/ai/predict/stockout', { horizon_days: 7 }).catch(() => ({ predictions: [] })),
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
    } catch (err) {
      toast.error(err.message || 'Erreur chargement dashboard');
    } finally {
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

  const stats = useMemo(() => {
    const totalProduits = allProducts.length;
    const sousSeuilCount = allProducts.filter(
      (p) => Number(p.quantity_current || 0) <= Number(p.seuil_minimum || 0) && Number(p.quantity_current || 0) > 0
    ).length;
    const ruptureCount = allProducts.filter((p) => Number(p.quantity_current || 0) === 0).length;
    const disponiblesCount = Math.max(0, totalProduits - sousSeuilCount - ruptureCount);
    return { totalProduits, sousSeuilCount, ruptureCount, disponiblesCount };
  }, [allProducts]);

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
        return {
          id: `${row.product_id || 'p'}-${idx}`,
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
  ), [riskSource]); 

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
                  <div className="kpi-icon"><CheckCircle2 size={20} /></div>
                  <div className="kpi-content">
                    <span className="kpi-value">{stats.disponiblesCount}</span>
                    <span className="kpi-label">Produits disponibles</span>
                  </div>
                  <div className={`kpi-trend ${stats.disponiblesCount >= stats.sousSeuilCount ? 'up' : 'down'}`}>
                    {stats.disponiblesCount >= stats.sousSeuilCount ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    <span>{stats.disponiblesCount >= stats.sousSeuilCount ? 'Maitrise' : 'A surveiller'}</span>
                  </div>
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
