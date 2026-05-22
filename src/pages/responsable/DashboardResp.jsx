import { useCallback, useEffect, useMemo, useRef, useState } from 'react'; 
import { 
  AlertTriangle, 
  Package, 
  CheckCircle2,
  ChevronRight,
  Clock,
  ClipboardCheck,
  FlaskConical,
  LineChart,
  PieChart,
  Sparkles,
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

/*
============================
Bloc de Recommandations / Directives strictes pour IA et alertes
============================

Objectif :
Fournir des directives claires pour le développement et l'utilisation
des alertes IA et des résumés générés par le chatbot, afin de garantir
la cohérence, la fiabilité et la traçabilité dans l'application.

Recommandations strictes :

1. Traçabilité
   - Chaque alerte doit avoir un identifiant unique (alertId).
   - Chaque résumé IA doit inclure le timestamp de génération.
   - L’historique des changements d’alerte doit être stocké pour audit.

2. Responsabilité
   - Chaque alerte doit être assignée à un responsable clairement identifié.
   - Le responsable doit pouvoir confirmer, rejeter ou annoter l’alerte.

3. Qualité des résumés
   - Le résumé IA doit être concis (max 3 phrases) et explicatif.
   - Il doit inclure :
     * Le type d’alerte
     * Les facteurs principaux déclencheurs
     * Les actions recommandées ou points à surveiller
   - Toute incertitude ou hypothèse doit être explicitement signalée.

4. Interface Utilisateur
   - Les badges doivent être colorés selon la criticité :
     * Rouge : rupture critique
     * Orange : anomalie
     * Bleu : information / seuil adaptatif
   - Les popovers doivent être accessibles via un clic ou survol et
     afficher les résumés sans surcharge visuelle.

5. Automatisation et mises à jour
   - Les résumés IA doivent se régénérer automatiquement à chaque
     modification pertinente de l’alerte ou du stock.
   - Les notifications doivent être envoyées uniquement aux responsables
     concernés.

6. Sécurité et confidentialité
   - Les données sensibles (stock réel, fournisseurs) doivent être
     filtrées avant génération de résumé IA.
   - Les accès à l’API /api/ai/alert-summary doivent être authentifiés
     et audités.

7. Tests et validation
   - Chaque changement du modèle IA ou du workflow d’alerte doit
     être testé pour cohérence et non-régression.
   - Les résultats doivent être validés par un responsable avant
     mise en production.

Ce bloc peut être utilisé comme guide strict pour tout développement
futur lié aux alertes IA et aux résumés générés par le chatbot.
*/

const DashboardResp = ({ userName, onLogout }) => {
  const toast = useToast();
  const navigate = useNavigate();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const periodDays = 30;
  const [allProducts, setAllProducts] = useState([]);
  const [historyTrend, setHistoryTrend] = useState([]);
  const [topConsumedProducts, setTopConsumedProducts] = useState([]);
  const [, setAiModelStatus] = useState(null);
  const [stockoutForecast, setStockoutForecast] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [inventoriesToValidateCount, setInventoriesToValidateCount] = useState(0);
  const [expiringLotsCount, setExpiringLotsCount] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
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

      const [
        all,
        insights,
        stockoutRes,
        modelStatusRes,
        pendingRequests,
        inventoriesToValidate,
        expiringLots,
        chemicalRegister,
      ] = await Promise.all([
        get('/products'),
        get(`/history/insights?from=${fromIso}&to=${toIso}`).catch(() => ({ daily_trend: [], top_consumed_products: [], anomalies: [] })),
        post('/ai/predict/stockout', { horizon_days: 7 }).catch(() => ({ predictions: [] })),
        get('/ai/models/status').catch(() => null),
        get('/requests?status=pending').catch(() => []),
        get('/inventory/responsable/to-validate').catch(() => ({ items: [] })),
        get('/stock/lots/expiring?days=30').catch(() => ({ count: 0 })),
        get(`/reports/chemical-register?year=${encodeURIComponent(chemYear)}&month=${encodeURIComponent(chemMonth)}`).catch(() => ({ rows: [] })),
      ]);

      setAllProducts(Array.isArray(all) ? all : []);
      setStockoutForecast(Array.isArray(stockoutRes?.predictions) ? stockoutRes.predictions : []);

      const pendingList = Array.isArray(pendingRequests) ? pendingRequests : [];
      setPendingRequestsCount(pendingList.length);

      const toValidateCount = Array.isArray(inventoriesToValidate?.items) ? inventoriesToValidate.items.length : 0;
      setInventoriesToValidateCount(toValidateCount);

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
      setAiModelStatus(modelStatusRes && typeof modelStatusRes === 'object' ? modelStatusRes : null);
      setLastUpdatedAt(new Date().toISOString());
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

  const requestsSeries = useMemo(() => {
    return historyTrend.slice(-7).map((x) => ({
      label: formatDayLabel(x.day),
      value: Number(x.request || 0),
    }));
  }, [historyTrend]);

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

  const daySynthesis = useMemo(() => {
    const demandes = pendingRequestsCount || 0;
    const critiques = (stats.ruptureCount + stats.sousSeuilCount) || 0;
    const chemToComplete = chemicalSummary.toComplete || 0;

    return {
      title: 'Priorités du jour',
      indicators: [
        { key: 'req', value: demandes, label: `demande${demandes > 1 ? 's' : ''} à valider` },
        { key: 'crit', value: critiques, label: `produit${critiques > 1 ? 's' : ''} critique${critiques > 1 ? 's' : ''}` },
        {
          key: 'chem',
          value: chemToComplete,
          label: `fiche${chemToComplete > 1 ? 's' : ''} chimique${chemToComplete > 1 ? 's' : ''} à compléter`,
        },
      ],
    };
  }, [
    chemicalSummary.toComplete,
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
            subtitle="Vue rapide du stock et des priorités"
            showSearch={false}
            onRefresh={loadData}
            onMenuClick={() => setSidebarCollapsed((prev) => !prev)}
          />
          <main className="main-content dashboard-main">
            {isLoading && <LoadingSpinner overlay text="Chargement..." />}

            <div className="dashboard-page saas-dashboard">
              <section className="bi-summary bi-summary-compact priorities" aria-label="Priorités du jour">
                <div className="priorities-grid">
                  <div className="priorities-left">
                    <div className="bi-summary-head">
                      <h2 className="bi-summary-title">{daySynthesis.title}</h2>
                    </div>

                    <div className="bi-mini-indicators" aria-label="Indicateurs du jour">
                      {daySynthesis.indicators.map((it, idx) => {
                        const icon = it.key === 'req'
                          ? <ClipboardCheck size={18} />
                          : it.key === 'crit'
                            ? <AlertTriangle size={18} />
                            : <FlaskConical size={18} />;

                        const tone = it.key === 'req'
                          ? 'req'
                          : it.key === 'crit'
                            ? 'crit'
                            : 'chem';

                        return (
                          <div
                            key={it.key}
                            className={`bi-mini-indicator tone-${tone} ${it.key === 'crit' && Number(it.value || 0) > 0 ? 'critical' : ''}`}
                            style={{ '--i': idx }}
                          >
                            <div className={`bi-mi-icon tone-${tone}`} aria-hidden="true">{icon}</div>
                            <div className="bi-mi-content">
                              <div className="bi-mi-value"><AnimatedNumber value={it.value} /></div>
                              <div className="bi-mi-label">{it.label}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="priorities-ctas" aria-label="Accès rapide">
                      <button type="button" className="priorities-cta primary" onClick={() => navigate('/responsable/demandes-a-traiter')} disabled={isLoading}>
                        <span>Voir demandes</span>
                        <ChevronRight size={16} />
                      </button>
                      <button type="button" className="priorities-cta" onClick={() => navigate('/responsable/produits-critiques')} disabled={isLoading}>
                        <span>Voir produits critiques</span>
                        <ChevronRight size={16} />
                      </button>
                      <button type="button" className="priorities-cta" onClick={() => navigate('/responsable/registre-chimique')} disabled={isLoading}>
                        <span>Ouvrir registre</span>
                        <ChevronRight size={16} />
                      </button>
                      <button
                        type="button"
                        className="priorities-cta"
                        onClick={() => navigate('/responsable/chatbot')}
                        disabled={isLoading}
                        title="Résumé IA"
                      >
                        <span>Résumé IA</span>
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>

                </div>
              </section>

              <div className="kpi-action-grid" aria-label="Synthèse rapide">
                <article className="kpi-action-card tone-teal" style={{ '--i': 0 }}>
                  <div className="kpi-action-head">
                    <div className="kpi-action-icon tone-teal" aria-hidden="true"><Package size={18} /></div>
                    <div className="kpi-action-title">Inventaires</div>
                  </div>
                  <div className="kpi-action-value"><AnimatedNumber value={inventoriesToValidateCount} /></div>
                  <div className="kpi-action-sub">À valider</div>
                  <button
                    type="button"
                    className="kpi-action-btn"
                    onClick={() => navigate('/responsable/inventaires/a-valider')}
                    disabled={isLoading}
                  >
                    <span>Voir inventaires</span>
                    <ChevronRight size={16} />
                  </button>
                </article>

                <article className="kpi-action-card tone-purple" style={{ '--i': 1 }}>
                  <div className="kpi-action-head">
                    <div className="kpi-action-icon tone-purple" aria-hidden="true"><Clock size={18} /></div>
                    <div className="kpi-action-title">Péremption</div>
                  </div>
                  <div className="kpi-action-value"><AnimatedNumber value={expiringLotsCount} /></div>
                  <div className="kpi-action-sub">Lots critiques</div>
                  <button
                    type="button"
                    className="kpi-action-btn"
                    onClick={() => navigate('/responsable/lots-a-surveiller')}
                    disabled={isLoading}
                  >
                    <span>Voir lots à surveiller</span>
                    <ChevronRight size={16} />
                  </button>
                </article>

                <article className="kpi-action-card tone-green wide" style={{ '--i': 2 }}>
                  <div className="kpi-action-head">
                    <div className="kpi-action-icon tone-green" aria-hidden="true"><FlaskConical size={18} /></div>
                    <div className="kpi-action-title">Registre chimique</div>
                  </div>
                  <div className="kpi-action-lines" aria-label="Synthèse registre chimique">
                    <div className="kpi-action-line">
                      <span>Produits</span>
                      <strong><AnimatedNumber value={chemicalSummary.total} /></strong>
                    </div>
                    <div className="kpi-action-line">
                      <span>FDS manquantes</span>
                      <strong><AnimatedNumber value={chemicalSummary.missingFds} /></strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="kpi-action-btn"
                    onClick={() => navigate('/responsable/registre-chimique')}
                    disabled={isLoading}
                  >
                    <span>Ouvrir registre</span>
                    <ChevronRight size={16} />
                  </button>
                </article>
              </div>

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

              <div className="dash-footer" aria-label="Mise à jour">
                Dernière mise à jour : {formatDateTimeLabel(lastUpdatedAt)}
              </div>
            </div>
          </main>
        </div>
      </div>
    </ProtectedPage>
  );
};

export default DashboardResp;
