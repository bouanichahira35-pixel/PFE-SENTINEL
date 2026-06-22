// BLOC 1 - Role du fichier.
// Ce fichier affiche une page de l'espace responsable pour PilotageResp.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  CheckCircle,
  Clock,
  Eye,
  ArrowLeftRight,
  Package,
  RefreshCw,
  SlidersHorizontal,
  ShoppingCart,
  Sparkles,
  XCircle,
} from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { usePrompt } from '../../components/shared/ConfirmDialog';
import { get, patch, post } from '../../services/api';
import './PilotageResp.css';

const MS_PER_HOUR = 60 * 60 * 1000;

function asTimestamp(value) {
  if (!value) return null;
  const d = new Date(value);
  const ts = d.getTime();
  if (Number.isNaN(ts)) return null;
  return ts;
}

function requestAgeHours(createdAtRaw, nowTs) {
  const ts = asTimestamp(createdAtRaw);
  if (!ts) return null;
  return Math.max(0, (nowTs - ts) / MS_PER_HOUR);
}

function requestAgeDays(createdAtRaw, nowTs) {
  const h = requestAgeHours(createdAtRaw, nowTs);
  if (h == null) return null;
  return h / 24;
}

function waitLabel(createdAtRaw, nowTs) {
  const days = requestAgeDays(createdAtRaw, nowTs);
  if (days == null) return 'En attente (date inconnue)';
  if (days < 1) return "Creee aujourd'hui";
  const whole = Math.floor(days);
  return `En attente depuis ${whole} jour${whole > 1 ? 's' : ''}`;
}

function priorityBadge(reqItem, nowTs) {
  const hours = requestAgeHours(reqItem.createdAtRaw, nowTs);
  if (hours != null && hours >= 48) return { label: 'En retard', cls: 'late' };
  if (reqItem.priority && reqItem.priority !== 'normal') return { label: 'Urgente', cls: 'urgent' };
  return { label: 'Normale', cls: 'normal' };
}

function stockIndicator(reqItem) {
  const qty = Number(reqItem.quantite || 0);
  const current = Number(reqItem.stockCurrent);
  if (!Number.isFinite(current)) return { label: 'Stock a verifier', cls: 'unknown' };
  if (current <= 0) return { label: 'Stock insuffisant', cls: 'bad' };
  if (current < qty) return { label: 'Stock insuffisant', cls: 'bad' };
  return { label: 'Stock disponible', cls: 'ok' };
}

function adviceLabel(reqItem, nowTs) {
  const badge = priorityBadge(reqItem, nowTs);
  if (badge.cls === 'late' || badge.cls === 'urgent') return 'Conseil : traiter cette demande en priorite';
  const stock = stockIndicator(reqItem);
  if (stock.cls === 'unknown') return 'Conseil : verifier le stock avant validation';
  if (stock.cls === 'bad') return 'Conseil : stock insuffisant';
  return 'Conseil : validation possible';
}

function formatDateTime(value) {
  const ts = asTimestamp(value);
  if (!ts) return '-';
  return new Date(ts).toLocaleString('fr-FR');
}

function alertAgeLabel(value, nowTs) {
  const ts = asTimestamp(value);
  if (!ts) return 'Detection non datee';
  const hours = Math.max(0, Math.floor((nowTs - ts) / MS_PER_HOUR));
  if (hours < 1) return 'Detectee maintenant';
  if (hours < 24) return `Detectee il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Detectee il y a ${days} jour${days > 1 ? 's' : ''}`;
}

const ALERT_TYPE_LABELS = {
  anomaly: 'Anomalie detectee',
  rupture: 'Risque de rupture',
  surconsommation: 'Surconsommation',
};

const RISK_LABELS = {
  high: 'Critique',
  medium: 'A surveiller',
  low: 'Faible',
};

function riskClass(level) {
  const value = String(level || '').toLowerCase();
  if (value === 'high') return 'high';
  if (value === 'medium') return 'medium';
  return 'low';
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function recommendedQty(alertItem) {
  const current = safeNumber(alertItem?.currentStock, 0);
  const min = safeNumber(alertItem?.minStock, 0);
  const target = min > 0 ? min * 2 : current + 10;
  return Math.max(10, Math.ceil(target - current));
}

function healthFromAlerts(alerts) {
  const active = alerts.filter((a) => a.status !== 'reviewed');
  const high = active.filter((a) => a.risk === 'high').length;
  const medium = active.filter((a) => a.risk === 'medium').length;
  const rupture = active.filter((a) => a.type === 'rupture').length;
  const surconsommation = active.filter((a) => a.type === 'surconsommation').length;
  const reviewed = alerts.filter((a) => a.status === 'reviewed').length;
  const score = Math.max(0, Math.min(100, Math.round(100 - high * 9 - medium * 4 - rupture * 3 - surconsommation * 2 + Math.min(reviewed, 12))));
  const level = score >= 85 ? 'excellent' : score >= 70 ? 'watch' : score >= 45 ? 'tense' : 'critical';
  const label = {
    excellent: 'Stock sain',
    watch: 'Sous surveillance',
    tense: 'Tension stock',
    critical: 'Crise active',
  }[level];
  return { score, level, label, active: active.length, reviewed };
}

function formatUnits(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${Math.round(n)} u.`;
}

function diagnosticForAlert(alertItem, copilotSignal) {
  const current = alertItem?.currentStock ?? '-';
  const daysCover = Number(copilotSignal?.days_cover_estimate);
  const riskPct = Number(copilotSignal?.risk_probability);
  const anomalyScore = Number(copilotSignal?.anomaly_score);

  if (alertItem?.type === 'rupture') {
    const label = alertItem.risk === 'high' || Number(alertItem.currentStock || 0) <= 0
      ? 'Rupture critique'
      : 'Risque de rupture';
    const detail = Number.isFinite(daysCover) && daysCover <= 7
      ? `couverture ${Math.max(0, Math.round(daysCover))} j`
      : `stock ${current}`;
    return { label, detail, tone: alertItem.risk === 'high' ? 'critical' : 'warning' };
  }

  if (alertItem?.type === 'surconsommation') {
    const detail = Number.isFinite(riskPct) ? `risque ${Math.round(riskPct)}%` : 'consommation anormale';
    return { label: 'Surconsommation detectee', detail, tone: 'warning' };
  }

  const detail = Number.isFinite(anomalyScore) ? `score anomalie ${Math.round(anomalyScore)}%` : 'ecart a verifier';
  return {
    label: alertItem?.risk === 'high' ? 'Ecart suspect critique' : 'Ecart inventaire suspect',
    detail,
    tone: alertItem?.risk === 'high' ? 'critical' : 'info',
  };
}

function adaptiveThresholdLabel(alertItem, copilotSignal) {
  const recommended = Number(copilotSignal?.recommended_threshold);
  const minimum = Number(alertItem?.minStock);
  if (Number.isFinite(recommended) && recommended > 0 && Math.abs(recommended - minimum) >= 1) {
    return `Seuil conseille: ${formatUnits(recommended)}`;
  }
  if (Number.isFinite(minimum)) return `Fixe: min ${formatUnits(minimum)}`;
  return 'Seuil dynamique';
}

function actionLabelForAlert(alertItem, copilotStep) {
  if (copilotStep?.action) return String(copilotStep.action);
  if (alertItem?.type === 'surconsommation') return 'Verifier fuite / audit';
  if (alertItem?.type === 'anomaly') return 'Inventaire tournant';
  return `Commander ${formatUnits(recommendedQty(alertItem))}`;
}

function riskFromAiScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'low';
  if (n >= 70) return 'high';
  if (n >= 40) return 'medium';
  return 'low';
}

function mapCopilotRiskAlert(row, index) {
  const currentStock = Number(row?.current_stock ?? row?.stock_anchor ?? 0);
  const minStock = Number(row?.seuil_minimum ?? row?.recommended_threshold ?? 0);
  const risk = riskFromAiScore(row?.risk_probability);
  const anomaly = Number(row?.anomaly_score || 0);
  const daysCover = Number(row?.days_cover_estimate);
  const type = anomaly >= 55 && risk !== 'high'
    ? 'anomaly'
    : Number.isFinite(daysCover) && daysCover > 7 && risk === 'medium'
      ? 'surconsommation'
      : 'rupture';

  return {
    id: `ai-risk-${row?.product_id || row?.code_product || index}`,
    productId: row?.product_id || null,
    type,
    typeLabel: ALERT_TYPE_LABELS[type] || 'Alerte IA',
    risk,
    riskLabel: RISK_LABELS[risk],
    message: row?.explanation || row?.why || 'Signal calcule depuis les donnees stock et consommation.',
    status: 'new',
    detectedAt: row?.generated_at || new Date().toISOString(),
    detectedAtLabel: formatDateTime(row?.generated_at || new Date().toISOString()),
    productName: row?.product_name || row?.name || 'Produit',
    productCode: row?.code_product || row?.product_code || '-',
    productStatus: currentStock <= 0 ? 'rupture' : currentStock <= minStock ? 'sous seuil' : 'a surveiller',
    family: row?.family || '-',
    currentStock: Number.isFinite(currentStock) ? currentStock : null,
    minStock: Number.isFinite(minStock) ? minStock : null,
  };
}

const mapRequest = (r) => ({
  id: r._id,
  reference: `DEM-${String(r._id || '').slice(-6).toUpperCase()}`,
  produit: r.product?.name || 'Produit',
  codeProduit: r.product?.code_product || '-',
  quantite: Number(r.quantity_requested || 0),
  demandeur: r.demandeur?.username || r.beneficiary || 'Demandeur',
  direction: r.direction_laboratory || '-',
  createdAtRaw: r.date_request || r.createdAt || null,
  dateSoumission: formatDateTime(r.date_request || r.createdAt),
  note: r.note || '',
  priority: String(r.priority || 'normal').toLowerCase(),
  priorityLabel:
    r.priority_label
    || (String(r.priority || '').toLowerCase() === 'critical'
      ? 'TRES URGENT'
      : String(r.priority || '').toLowerCase() === 'urgent'
        ? 'URGENT'
        : 'NORMAL'),
  stockCurrent: r.product?.quantity_current,
  stockMin: r.product?.seuil_minimum,
});

const mapAiAlert = (a) => {
  const product = a?.product || {};
  const currentStock = Number(product.quantity_current);
  const minStock = Number(product.seuil_minimum);
  const risk = riskClass(a?.risk_level);

  return {
    id: a?._id,
    productId: product?._id,
    type: String(a?.alert_type || 'anomaly').toLowerCase(),
    typeLabel: ALERT_TYPE_LABELS[String(a?.alert_type || '').toLowerCase()] || 'Alerte IA',
    risk,
    riskLabel: RISK_LABELS[risk],
    message: a?.message || 'Signal IA a examiner.',
    status: String(a?.status || 'new').toLowerCase(),
    detectedAt: a?.detected_at || a?.createdAt,
    detectedAtLabel: formatDateTime(a?.detected_at || a?.createdAt),
    productName: product.name || 'Produit',
    productCode: product.code_product || '-',
    productStatus: product.status || '-',
    family: product.family || '-',
    currentStock: Number.isFinite(currentStock) ? currentStock : null,
    minStock: Number.isFinite(minStock) ? minStock : null,
  };
};

const PilotageResp = ({ userName, onLogout }) => {
  const toast = useToast();
  const promptAction = usePrompt();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'alertes' ? 'alertes' : 'validations';

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  ));

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [pendingRequests, setPendingRequests] = useState([]);
  const [aiAlerts, setAiAlerts] = useState([]);
  const [aiCopilot, setAiCopilot] = useState(null);
  const [urgentRequestsOnly, setUrgentRequestsOnly] = useState(false);
  const [urgentRequestsFirst, setUrgentRequestsFirst] = useState(true);
  const [alertRiskFilter, setAlertRiskFilter] = useState('all');
  const [alertStatusFilter, setAlertStatusFilter] = useState('new');
  const [alertTypeFilter, setAlertTypeFilter] = useState('all');

  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    try {
      const pendingReqs = await get('/requests?status=pending');
      setPendingRequests(Array.isArray(pendingReqs) ? pendingReqs : []);
    } catch (err) {
      toast.error('Impossible de charger les demandes. Veuillez reessayer.');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const loadAiAlerts = useCallback(async () => {
    setIsLoading(true);
    try {
      const [rows, copilotRes] = await Promise.all([
        get('/ai/alerts'),
        post('/ai/copilot/recommendations', { horizon_days: 14, top_n: 12, simulations: [] }).catch(() => null),
      ]);
      setAiAlerts(Array.isArray(rows) ? rows : []);
      setAiCopilot(copilotRes || null);
    } catch (err) {
      toast.error('Impossible de charger les alertes IA. Veuillez reessayer.');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const loadData = useCallback(async () => {
    if (activeTab === 'alertes') {
      await loadAiAlerts();
    } else {
      await loadRequests();
    }
  }, [activeTab, loadAiAlerts, loadRequests]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const mappedPendingRequests = useMemo(
    () => (Array.isArray(pendingRequests) ? pendingRequests : []).map(mapRequest),
    [pendingRequests]
  );

  const filteredPendingRequests = useMemo(() => {
    let next = mappedPendingRequests;
    const nowTs = Date.now();

    if (urgentRequestsOnly) {
      next = next.filter((r) => {
        const badge = priorityBadge(r, nowTs);
        return badge.cls === 'urgent' || badge.cls === 'late';
      });
    }

    if (urgentRequestsFirst) {
      const weight = (r) => {
        const badge = priorityBadge(r, nowTs);
        if (badge.cls === 'late') return 3;
        const p = String(r.priority || '').toLowerCase();
        if (p === 'critical') return 2;
        if (p === 'urgent') return 1;
        return 0;
      };
      next = [...next].sort((a, b) => {
        const d = weight(b) - weight(a);
        if (d !== 0) return d;
        const at = asTimestamp(a.createdAtRaw) ?? Number.POSITIVE_INFINITY;
        const bt = asTimestamp(b.createdAtRaw) ?? Number.POSITIVE_INFINITY;
        if (at !== bt) return at - bt;
        return String(a.reference || '').localeCompare(String(b.reference || ''));
      });
    }

    return next;
  }, [mappedPendingRequests, urgentRequestsFirst, urgentRequestsOnly]);

  const persistedAiAlerts = useMemo(
    () => (Array.isArray(aiAlerts) ? aiAlerts : []).map(mapAiAlert),
    [aiAlerts]
  );

  const copilotRiskAlerts = useMemo(() => (
    Array.isArray(aiCopilot?.top_risk_products)
      ? aiCopilot.top_risk_products.map(mapCopilotRiskAlert)
      : []
  ), [aiCopilot]);

  const mappedAiAlerts = useMemo(() => (
    persistedAiAlerts.some((a) => a.status !== 'reviewed') || !copilotRiskAlerts.length
      ? persistedAiAlerts
      : copilotRiskAlerts
  ), [copilotRiskAlerts, persistedAiAlerts]);

  const alertKpis = useMemo(() => {
    const total = mappedAiAlerts.length;
    const high = mappedAiAlerts.filter((a) => a.risk === 'high').length;
    const medium = mappedAiAlerts.filter((a) => a.risk === 'medium').length;
    const newAlerts = mappedAiAlerts.filter((a) => a.status !== 'reviewed').length;
    const rupture = mappedAiAlerts.filter((a) => a.type === 'rupture').length;
    const surconsommation = mappedAiAlerts.filter((a) => a.type === 'surconsommation').length;
    return { total, high, medium, newAlerts, rupture, surconsommation };
  }, [mappedAiAlerts]);

  const healthIndex = useMemo(() => healthFromAlerts(mappedAiAlerts), [mappedAiAlerts]);

  const analyticSummary = useMemo(() => {
    const copilotScore = Number(aiCopilot?.operational_intelligence?.global_score);
    const globalScore = Number.isFinite(copilotScore) ? Math.round(copilotScore) : healthIndex.score;
    const anomalyActive = mappedAiAlerts.filter((a) => a.status !== 'reviewed' && a.type === 'anomaly').length;
    const ruptureActive = mappedAiAlerts.filter((a) => a.status !== 'reviewed' && a.type === 'rupture').length;
    return {
      globalScore,
      stockTone: globalScore >= 70 ? 'ok' : globalScore >= 45 ? 'warning' : 'critical',
      stockLabel: globalScore >= 70 ? 'Stable' : globalScore >= 45 ? 'Sous surveillance' : 'Critique',
      anomalyActive,
      anomalyLabel: anomalyActive > 0 ? 'Actives' : 'Aucune',
      ruptureActive,
    };
  }, [aiCopilot, healthIndex.score, mappedAiAlerts]);

  const copilotByProduct = useMemo(() => {
    const map = new Map();
    const actionPlan = Array.isArray(aiCopilot?.action_plan) ? aiCopilot.action_plan : [];
    const topRiskProducts = Array.isArray(aiCopilot?.top_risk_products) ? aiCopilot.top_risk_products : [];
    topRiskProducts.forEach((signal) => {
      const id = String(signal?.product_id || '').trim();
      if (id) map.set(id, { signal });
    });
    actionPlan.forEach((step) => {
      const id = String(step?.product_id || '').trim();
      if (id) map.set(id, { ...(map.get(id) || {}), step });
    });
    return map;
  }, [aiCopilot]);

  const filteredAiAlerts = useMemo(() => (
    mappedAiAlerts.filter((a) => {
      if (alertRiskFilter !== 'all' && a.risk !== alertRiskFilter) return false;
      if (alertStatusFilter === 'new' && a.status === 'reviewed') return false;
      if (alertStatusFilter === 'reviewed' && a.status !== 'reviewed') return false;
      if (alertTypeFilter !== 'all' && a.type !== alertTypeFilter) return false;
      return true;
    })
  ), [alertRiskFilter, alertStatusFilter, alertTypeFilter, mappedAiAlerts]);

  const handleValidateRequest = useCallback(async (id, status) => {
    const next = status === 'rejected' ? 'rejected' : 'validated';
    let note = null;
    if (next === 'rejected') {
      const input = await promptAction({
        title: 'Rejeter la decision',
        badge: 'Motif optionnel',
        message: 'Ajoutez un motif si necessaire pour garder une trace claire.',
        label: 'Motif du rejet',
        confirmLabel: 'Rejeter',
        variant: 'danger',
        required: false,
      });
      if (input === null) return;
      note = String(input || '').trim();
    }

    setIsSubmitting(true);
    try {
      await patch(`/requests/${id}/validate`, note ? { status: next, note } : { status: next });
      await loadRequests();
      toast.success(next === 'validated'
        ? 'Demande validee et envoyee au magasinier.'
        : 'Demande rejetee avec succes.');
    } catch (err) {
      const msg = String(err?.message || '');
      if (next === 'validated' && msg.toLowerCase().includes('stock insuffisant')) {
        toast.error('Stock insuffisant : verification necessaire avant validation.');
      } else {
        toast.error('Impossible de traiter cette demande. Veuillez reessayer.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [loadRequests, promptAction, toast]);

  const handleReviewAlert = useCallback(async (alertId, actionTaken = 'Revue responsable depuis le centre alertes IA') => {
    if (!alertId) return;
    setIsSubmitting(true);
    try {
      await patch(`/ai/alerts/${alertId}/review`, { action_taken: actionTaken });
      await loadAiAlerts();
      toast.success('Alerte IA marquee comme revue.');
    } catch (err) {
      toast.error('Impossible de mettre a jour cette alerte IA.');
    } finally {
      setIsSubmitting(false);
    }
  }, [loadAiAlerts, toast]);

  const openOrderDraft = useCallback((alertItem) => {
    if (!alertItem?.productId) {
      navigate(`/responsable/produits?q=${encodeURIComponent(alertItem?.productCode || alertItem?.productName || '')}`);
      toast.error('Produit introuvable pour pre-remplir la commande.');
      return;
    }
    const params = new URLSearchParams({
      produitId: String(alertItem.productId),
      quantite: String(recommendedQty(alertItem)),
      source: 'ALERTE_IA_PLAYBOOK',
    });
    navigate(`/responsable/commandes/nouvelle?${params.toString()}`);
  }, [navigate, toast]);

  const openProductStock = useCallback((alertItem) => {
    navigate(`/responsable/produits?q=${encodeURIComponent(alertItem?.productCode || alertItem?.productName || '')}`);
  }, [navigate]);

  const nowTs = Date.now();
  const pageTitle = activeTab === 'alertes' ? 'Alertes IA' : 'Demandes a traiter';

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
            title={pageTitle}
            showSearch={false}
            onMenuClick={() => setSidebarCollapsed((prev) => !prev)}
          />
          <main className="main-content">
            {(isLoading || isSubmitting) && <LoadingSpinner overlay text="Chargement..." />}

            <div className={`pilotage-page ${activeTab === 'validations' ? 'pilotage-page-validations' : 'pilotage-page-alertes'}`}>
              {activeTab === 'alertes' ? (
                <section className="pilotage-ai-space">
                  <div className="pilotage-performance-grid">
                    <article className={`pilotage-performance-card ${analyticSummary.stockTone}`}>
                      <div>
                        <span>Santé globale du stock</span>
                        <strong>{analyticSummary.globalScore} / 100</strong>
                        <small>Synthese operationnelle</small>
                      </div>
                      <em>{analyticSummary.stockLabel}</em>
                    </article>
                    <article className={analyticSummary.anomalyActive ? 'pilotage-performance-card warning' : 'pilotage-performance-card ok'}>
                      <div>
                        <span>Analyse des anomalies</span>
                        <strong>{analyticSummary.anomalyLabel}</strong>
                        <small>Controle automatique</small>
                      </div>
                      <em>{analyticSummary.anomalyActive} signal(aux)</em>
                    </article>
                    <article className={analyticSummary.ruptureActive ? 'pilotage-performance-card critical' : 'pilotage-performance-card ok'}>
                      <div>
                        <span>Articles en rupture</span>
                        <strong>{analyticSummary.ruptureActive}</strong>
                        <small>Surveillance stock</small>
                      </div>
                      <em>{analyticSummary.ruptureActive ? 'Alerte' : 'Stable'}</em>
                    </article>
                  </div>

                  <section className="pilotage-card">
<div className="pilotage-analytics-toolbar">
                      <div className="pilotage-inline-actions ai-filters">
                        <select value={alertRiskFilter} onChange={(e) => setAlertRiskFilter(e.target.value)} aria-label="Filtrer par risque">
                          <option value="all">Tous risques</option>
                          <option value="high">Critiques</option>
                          <option value="medium">À surveiller</option>
                          <option value="low">Faibles</option>
                        </select>
                        <select value={alertTypeFilter} onChange={(e) => setAlertTypeFilter(e.target.value)} aria-label="Filtrer par type">
                          <option value="all">Tous types</option>
                          <option value="rupture">Rupture</option>
                          <option value="surconsommation">Surconsommation</option>
                          <option value="anomaly">Anomalie</option>
                        </select>
                        <select value={alertStatusFilter} onChange={(e) => setAlertStatusFilter(e.target.value)} aria-label="Filtrer par statut">
                          <option value="new">Non revues</option>
                          <option value="reviewed">Revues</option>
                          <option value="all">Toutes</option>
                        </select>
                      </div>
                      <span>{filteredAiAlerts.length} ligne(s) / {alertKpis.total} alerte(s)</span>
                    </div>

                    {!filteredAiAlerts.length ? (
                      <div className="pilotage-empty-box ai-empty">
                        <Sparkles size={22} />
                        <div>Aucune alerte IA ne correspond aux filtres.</div>
                        <div className="pilotage-empty-sub">Recalculez les signaux ou élargissez les filtres.</div>
                      </div>
                    ) : (
                      <div className="pilotage-analytics-table-wrap">
                        <table className="pilotage-analytics-table">
                          <thead>
                            <tr>
                              <th>Produit (ID)</th>
                              <th>Diagnostic de l'IA</th>
                              <th>Seuil adaptatif</th>
                              <th>Plan d'action</th>
                              <th>Actions immédiates</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredAiAlerts.map((alertItem, index) => {
                              const copilot = alertItem.productId ? copilotByProduct.get(String(alertItem.productId)) : null;
                              const copilotStep = copilot?.step;
                              const copilotSignal = copilot?.signal;
                              const diagnostic = diagnosticForAlert(alertItem, copilotSignal);
                              return (
                                <tr
                                  key={alertItem.id || `${alertItem.productCode}-${index}`}
                                  className={alertItem.status === 'reviewed' ? 'reviewed' : ''}
                                >
                                  <td>
                                    <strong>{alertItem.productName}</strong>
                                    <span>{alertItem.productCode}</span>
                                    <small><Clock size={13} /> {alertAgeLabel(alertItem.detectedAt, nowTs)}</small>
                                  </td>
                                  <td>
                                    <span className={`pilotage-diagnostic ${diagnostic.tone}`}>{diagnostic.label}</span>
                                    <small>{diagnostic.detail} · {alertItem.message}</small>
                                  </td>
                                  <td>
                                    <span className="pilotage-threshold">{adaptiveThresholdLabel(alertItem, copilotSignal)}</span>
                                    <small>Seuil calcule automatiquement</small>
                                  </td>
                                  <td>
                                    <strong className="pilotage-action-plan">{actionLabelForAlert(alertItem, copilotStep)}</strong>
                                    <small>Action proposee par l'assistant</small>
                                  </td>
                                  <td>
                                    <div className="pilotage-table-actions">
                                      {alertItem.type === 'rupture' ? (
                                        <button type="button" className="pilotage-mini-btn danger" onClick={() => openOrderDraft(alertItem)}>
                                          <ShoppingCart size={14} /> Commande Express
                                        </button>
                                      ) : null}
                                      {alertItem.type === 'surconsommation' ? (
                                        <button type="button" className="pilotage-mini-btn warning" onClick={() => openProductStock(alertItem)}>
                                          <Eye size={14} /> Audit
                                        </button>
                                      ) : null}
                                      {alertItem.type === 'anomaly' ? (
                                        <button type="button" className="pilotage-mini-btn warning" onClick={() => navigate('/responsable/inventaires')}>
                                          <Activity size={14} /> Inventaire
                                        </button>
                                      ) : null}
                                      <button type="button" className="pilotage-mini-btn ghost" onClick={() => openProductStock(alertItem)}>
                                        <ArrowLeftRight size={14} /> Transfert
                                      </button>
                                      <button type="button" className="pilotage-mini-btn ghost" onClick={() => navigate('/responsable/regles-stock')}>
                                        <SlidersHorizontal size={14} /> Ajuster Seuil
                                      </button>
                                      {alertItem.status !== 'reviewed' ? (
                                        <button
                                          type="button"
                                          className="pilotage-mini-btn ok"
                                          onClick={() => handleReviewAlert(alertItem.id, `Revue responsable: ${diagnostic.label}`)}
                                          disabled={isSubmitting}
                                        >
                                          <CheckCircle size={14} /> Revue
                                        </button>
                                      ) : (
                                        <span className="pilotage-reviewed-badge compact"><CheckCircle size={14} /> Revue</span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </section>
              ) : (
                <section className="pilotage-card pilotage-validations-card">
                  <div className="pilotage-card-head">
                    <div className="pilotage-card-titleblock">
                      <h3><Package size={18} /> Demandes a valider</h3>
                      <small>Flux : demandeur â†’ responsable â†’ magasinier</small>
                    </div>
                    <div className="pilotage-inline-actions">
                      <label className="pilotage-checkbox">
                        <input
                          type="checkbox"
                          checked={urgentRequestsOnly}
                          onChange={(e) => setUrgentRequestsOnly(e.target.checked)}
                        />
                        Urgentes seulement
                      </label>
                      <label className="pilotage-checkbox">
                        <input
                          type="checkbox"
                          checked={urgentRequestsFirst}
                          onChange={(e) => setUrgentRequestsFirst(e.target.checked)}
                        />
                        Urgentes d&apos;abord
                      </label>
                      <button
                        type="button"
                        className="pilotage-refresh"
                        onClick={loadRequests}
                        disabled={isLoading || isSubmitting}
                        title="Actualiser"
                      >
                        <RefreshCw size={16} />
                        <span>Actualiser</span>
                      </button>
                    </div>
                  </div>

                  {!filteredPendingRequests.length ? (
                    <div className="pilotage-empty-box">
                      <div>Aucune demande a traiter pour le moment.</div>
                      <div className="pilotage-empty-sub">Les nouvelles demandes apparaitront ici des leur creation.</div>
                    </div>
                  ) : (
                    <div className="pilotage-pending-list">
                      {filteredPendingRequests.map((reqItem) => {
                        const badge = priorityBadge(reqItem, nowTs);
                        const stock = stockIndicator(reqItem);
                        const advice = adviceLabel(reqItem, nowTs);

                        return (
                          <div key={reqItem.id} className="pilotage-pending-item">
                            <div className="pilotage-pending-top">
                              <div className="pilotage-pending-title">
                                <strong>{reqItem.produit}</strong>
                                <span>{reqItem.reference}</span>
                                <span className={`pilotage-priority ${badge.cls}`}>
                                  {badge.label}
                                </span>
                              </div>
                              <span className="pilotage-pending-date">{reqItem.dateSoumission}</span>
                            </div>

                            <div className="pilotage-pending-grid">
                              <div><label>Code</label><span>{reqItem.codeProduit}</span></div>
                              <div><label>Quantite</label><span>{reqItem.quantite}</span></div>
                              <div><label>Demandeur</label><span>{reqItem.demandeur}</span></div>
                              <div><label>Direction</label><span>{reqItem.direction}</span></div>
                            </div>

                            <div className="pilotage-pending-meta">
                              <span className="pilotage-meta">{waitLabel(reqItem.createdAtRaw, nowTs)}</span>
                              <span className={`pilotage-meta stock ${stock.cls}`}>{stock.label}</span>
                              <span className="pilotage-meta advice">{advice}</span>
                            </div>

                            <div className="pilotage-impact">
                              Apres validation, la demande sera envoyee au magasinier pour preparation.
                            </div>

                            {reqItem.note ? <p className="pilotage-pending-desc">{reqItem.note}</p> : null}

                            <div className="pilotage-pending-actions">
                              <button
                                className="pilotage-btn ok"
                                onClick={() => handleValidateRequest(reqItem.id, 'validated')}
                                disabled={isSubmitting}
                              >
                                <CheckCircle size={15} /> Valider
                              </button>
                              <button
                                className="pilotage-btn no"
                                onClick={() => handleValidateRequest(reqItem.id, 'rejected')}
                                disabled={isSubmitting}
                              >
                                <XCircle size={15} /> Rejeter
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
            </div>
          </main>
        </div>
      </div>
    </ProtectedPage>
  );
};

export default PilotageResp;
