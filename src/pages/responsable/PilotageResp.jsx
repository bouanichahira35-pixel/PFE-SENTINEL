import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle,
  Clock,
  Eye,
  ArrowLeftRight,
  Gauge,
  MessageSquare,
  Package,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  Trophy,
  Users,
  Wrench,
  XCircle,
} from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
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
  if (days < 1) return "Créée aujourd'hui";
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
  if (!Number.isFinite(current)) return { label: 'Stock à vérifier', cls: 'unknown' };
  if (current <= 0) return { label: 'Stock insuffisant', cls: 'bad' };
  if (current < qty) return { label: 'Stock insuffisant', cls: 'bad' };
  return { label: 'Stock disponible', cls: 'ok' };
}

function adviceLabel(reqItem, nowTs) {
  const badge = priorityBadge(reqItem, nowTs);
  if (badge.cls === 'late' || badge.cls === 'urgent') return 'Conseil : traiter cette demande en priorité';
  const stock = stockIndicator(reqItem);
  if (stock.cls === 'unknown') return 'Conseil : vérifier le stock avant validation';
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
  if (!ts) return 'Détection non datée';
  const hours = Math.max(0, Math.floor((nowTs - ts) / MS_PER_HOUR));
  if (hours < 1) return 'Détectée maintenant';
  if (hours < 24) return `Détectée il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Détectée il y a ${days} jour${days > 1 ? 's' : ''}`;
}

const ALERT_TYPE_LABELS = {
  anomaly: 'Anomalie détectée',
  rupture: 'Risque de rupture',
  surconsommation: 'Surconsommation',
};

const RISK_LABELS = {
  high: 'Critique',
  medium: 'À surveiller',
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

function alertDecisionId(alertItem) {
  return `ai-alert-${alertItem?.id || alertItem?.productId || alertItem?.productCode || 'unknown'}`;
}

function rootCauseHint(alertItem) {
  const text = `${alertItem?.productName || ''} ${alertItem?.productCode || ''} ${alertItem?.message || ''}`.toLowerCase();
  if (alertItem?.type === 'surconsommation' && /(filtre|carburant|fuel|injection|generatrice|groupe)/.test(text)) {
    return {
      title: 'Cause probable: maintenance equipement',
      detail: 'Verifier generatrice #4, temperature moteur et defaut injection avant de commander en masse.',
      source: 'Signal IA + famille technique; capteur IoT a confirmer.',
    };
  }
  if (alertItem?.type === 'surconsommation') {
    return {
      title: 'Cause probable: usage terrain atypique',
      detail: 'Comparer les sorties recentes avec les OT maintenance et les demandes par direction.',
      source: 'Signal consommation + historique stock.',
    };
  }
  if (alertItem?.type === 'rupture') {
    return {
      title: 'Cause probable: couverture insuffisante',
      detail: 'Le stock est sous la cible de securite; securiser une commande ou un transfert interne.',
      source: 'Seuil minimum + stock courant.',
    };
  }
  return {
    title: 'Cause probable: anomalie operationnelle',
    detail: 'Controler la derniere sortie, le beneficiaire et le lot avant de cloturer cette alerte.',
    source: 'Detection IA explicable.',
  };
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
    message: a?.message || 'Signal IA à examiner.',
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
      toast.error('Impossible de charger les demandes. Veuillez réessayer.');
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
      toast.error('Impossible de charger les alertes IA. Veuillez réessayer.');
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

  const mappedAiAlerts = useMemo(
    () => (Array.isArray(aiAlerts) ? aiAlerts : []).map(mapAiAlert),
    [aiAlerts]
  );

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

  const batchReordering = useMemo(() => {
    const candidates = mappedAiAlerts
      .filter((a) => a.status !== 'reviewed' && (a.type === 'rupture' || a.risk === 'high'))
      .sort((a, b) => {
        const riskRank = { high: 3, medium: 2, low: 1 };
        const r = (riskRank[b.risk] || 0) - (riskRank[a.risk] || 0);
        if (r !== 0) return r;
        return recommendedQty(b) - recommendedQty(a);
      });
    return {
      candidates,
      first: candidates[0] || null,
      totalQty: candidates.reduce((sum, item) => sum + recommendedQty(item), 0),
    };
  }, [mappedAiAlerts]);

  const topCrisisAlert = useMemo(
    () => mappedAiAlerts.find((a) => a.status !== 'reviewed' && a.risk === 'high') || mappedAiAlerts.find((a) => a.status !== 'reviewed') || null,
    [mappedAiAlerts]
  );

  const copilotByProduct = useMemo(() => {
    const map = new Map();
    const actionPlan = Array.isArray(aiCopilot?.action_plan) ? aiCopilot.action_plan : [];
    actionPlan.forEach((step) => {
      const id = String(step?.product_id || '').trim();
      if (id) map.set(id, step);
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
      const input = window.prompt('Motif du rejet (optionnel) :');
      if (input === null) return;
      note = String(input || '').trim();
    }

    setIsSubmitting(true);
    try {
      await patch(`/requests/${id}/validate`, note ? { status: next, note } : { status: next });
      await loadRequests();
      toast.success(next === 'validated'
        ? 'Demande validée et envoyée au magasinier.'
        : 'Demande rejetée avec succès.');
    } catch (err) {
      const msg = String(err?.message || '');
      if (next === 'validated' && msg.toLowerCase().includes('stock insuffisant')) {
        toast.error('Stock insuffisant : vérification nécessaire avant validation.');
      } else {
        toast.error('Impossible de traiter cette demande. Veuillez réessayer.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [loadRequests, toast]);

  const handleRefreshAiAlerts = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await post('/ai/alerts/refresh', { window_days: 90, max_products: 400, max_anomalies: 25 });
      await loadAiAlerts();
      toast.success('Alertes IA recalculées.');
    } catch (err) {
      toast.error('Impossible de recalculer les alertes IA pour le moment.');
    } finally {
      setIsSubmitting(false);
    }
  }, [loadAiAlerts, toast]);

  const handleReviewAlert = useCallback(async (alertId, actionTaken = 'Revue responsable depuis le centre alertes IA') => {
    if (!alertId) return;
    setIsSubmitting(true);
    try {
      await patch(`/ai/alerts/${alertId}/review`, { action_taken: actionTaken });
      await loadAiAlerts();
      toast.success('Alerte IA marquée comme revue.');
    } catch (err) {
      toast.error('Impossible de mettre à jour cette alerte IA.');
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

  const openCrisisRoom = useCallback((alertItem) => {
    const params = new URLSearchParams({
      source: 'alerte_ia',
      product: alertItem?.productCode || alertItem?.productName || 'stock',
      decision: alertDecisionId(alertItem),
    });
    navigate(`/responsable/chatbot?${params.toString()}`);
  }, [navigate]);

  const openProductStock = useCallback((alertItem) => {
    navigate(`/responsable/produits?q=${encodeURIComponent(alertItem?.productCode || alertItem?.productName || '')}`);
  }, [navigate]);

  const nowTs = Date.now();
  const pageTitle = activeTab === 'alertes' ? 'Alertes IA' : 'Demandes à traiter';

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
                  <div className="pilotage-ai-hero">
                    <div className="pilotage-ai-orbit" aria-hidden="true">
                      <Bot size={26} />
                    </div>
                    <div>
                      <span className="pilotage-eyebrow">Surveillance intelligente</span>
                      <h2>Alertes IA stock et consommation</h2>
                      <p>
                        Les signaux critiques sont priorisés par niveau de risque pour agir avant rupture,
                        anomalie ou surconsommation.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="pilotage-refresh ai"
                      onClick={handleRefreshAiAlerts}
                      disabled={isLoading || isSubmitting}
                      title="Recalculer les alertes IA"
                    >
                      <RefreshCw size={16} />
                      <span>Recalculer</span>
                    </button>
                  </div>

                  <div className="pilotage-ai-kpis">
                    <div className="pilotage-ai-kpi critical"><AlertTriangle size={18} /><span>Critiques</span><strong>{alertKpis.high}</strong></div>
                    <div className="pilotage-ai-kpi"><Activity size={18} /><span>Nouvelles</span><strong>{alertKpis.newAlerts}</strong></div>
                    <div className="pilotage-ai-kpi"><Package size={18} /><span>Ruptures</span><strong>{alertKpis.rupture}</strong></div>
                    <div className="pilotage-ai-kpi health"><Gauge size={18} /><span>Stock Health Index</span><strong>{healthIndex.score}/100</strong></div>
                  </div>

                  <section className="pilotage-intelligence-grid">
                    <div className={`pilotage-health-panel ${healthIndex.level}`}>
                      <div className="pilotage-health-score" style={{ '--score': `${healthIndex.score}%` }}>
                        <span>{healthIndex.score}</span>
                      </div>
                      <div className="pilotage-health-copy">
                        <span className="pilotage-eyebrow">SHI dynamique</span>
                        <h3>{healthIndex.label}</h3>
                        <p>{healthIndex.active} alerte(s) active(s), {healthIndex.reviewed} revue(s). Objectif equipe: traiter les critiques en moins de 2h.</p>
                        <div className="pilotage-badges">
                          <span><Trophy size={14} /> Sprint critique</span>
                          <span><CheckCircle size={14} /> Tracabilite revue</span>
                        </div>
                      </div>
                    </div>

                    <div className="pilotage-smart-reorder">
                      <div className="pilotage-panel-head">
                        <h3><ShoppingCart size={18} /> Micro-validation commandes</h3>
                        <span>{batchReordering.candidates.length} candidat(s)</span>
                      </div>
                      <p>
                        Lot propose: {batchReordering.totalQty} unite(s) sur les ruptures et risques critiques.
                        Prix, delai et fournisseur seront recalcules dans le formulaire de commande.
                      </p>
                      <div className="pilotage-panel-actions">
                        <button
                          type="button"
                          className="pilotage-btn primary"
                          onClick={() => batchReordering.first && openOrderDraft(batchReordering.first)}
                          disabled={!batchReordering.first}
                        >
                          <ShoppingCart size={15} /> Preparer premier lot
                        </button>
                        <button
                          type="button"
                          className="pilotage-btn ghost"
                          onClick={() => navigate('/responsable/produits?filter=critiques')}
                        >
                          <Package size={15} /> Voir critiques
                        </button>
                      </div>
                    </div>

                    <div className="pilotage-crisis-room">
                      <div className="pilotage-panel-head">
                        <h3><Users size={18} /> Salle de crise IA</h3>
                        <span>{topCrisisAlert ? topCrisisAlert.riskLabel : 'Stable'}</span>
                      </div>
                      {topCrisisAlert ? (
                        <>
                          <p>
                            Triage propose pour {topCrisisAlert.productName}: responsable site, acheteur et magasinier.
                            L'assistant prepare les faits, l'ordre du jour et le compte-rendu.
                          </p>
                          <button type="button" className="pilotage-btn ghost" onClick={() => openCrisisRoom(topCrisisAlert)}>
                            <MessageSquare size={15} /> Ouvrir triage IA
                          </button>
                        </>
                      ) : (
                        <p>Aucune alerte active ne necessite de salle de crise.</p>
                      )}
                    </div>
                  </section>

                  <section className="pilotage-card">
                    <div className="pilotage-card-head ai-head">
                      <h3><Sparkles size={18} /> Signaux IA à traiter</h3>
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
                    </div>

                    {!filteredAiAlerts.length ? (
                      <div className="pilotage-empty-box ai-empty">
                        <Sparkles size={22} />
                        <div>Aucune alerte IA ne correspond aux filtres.</div>
                        <div className="pilotage-empty-sub">Recalculez les signaux ou élargissez les filtres.</div>
                      </div>
                    ) : (
                      <div className="pilotage-alert-grid">
                        {filteredAiAlerts.map((alertItem, index) => {
                          const ratio = alertItem.currentStock != null && alertItem.minStock
                            ? Math.min(100, Math.max(0, Math.round((alertItem.currentStock / alertItem.minStock) * 100)))
                            : null;
                          const cause = rootCauseHint(alertItem);
                          const qty = recommendedQty(alertItem);
                          const copilotStep = alertItem.productId ? copilotByProduct.get(String(alertItem.productId)) : null;
                          return (
                            <article
                              key={alertItem.id || `${alertItem.productCode}-${index}`}
                              className={`pilotage-alert-card ${alertItem.risk} ${alertItem.status === 'reviewed' ? 'reviewed' : ''}`}
                              style={{ '--delay': `${Math.min(index, 10) * 55}ms` }}
                            >
                              <div className="pilotage-alert-top">
                                <span className={`pilotage-risk-dot ${alertItem.risk}`} />
                                <div>
                                  <strong>{alertItem.productName}</strong>
                                  <span>{alertItem.productCode}</span>
                                </div>
                                <span className={`pilotage-risk-pill ${alertItem.risk}`}>{alertItem.riskLabel}</span>
                              </div>

                              <div className="pilotage-alert-type">
                                <Sparkles size={16} />
                                <span>{alertItem.typeLabel}</span>
                              </div>

                              <p>{alertItem.message}</p>

                              <div className="pilotage-alert-metrics">
                                <div><span>Stock actuel</span><strong>{alertItem.currentStock ?? '-'}</strong></div>
                                <div><span>Seuil min.</span><strong>{alertItem.minStock ?? '-'}</strong></div>
                                <div><span>Statut</span><strong>{alertItem.productStatus}</strong></div>
                              </div>

                              {ratio != null ? (
                                <div className="pilotage-stock-track" aria-label={`Couverture stock ${ratio}%`}>
                                  <span style={{ width: `${ratio}%` }} />
                                </div>
                              ) : null}

                              <div className="pilotage-root-cause">
                                <Wrench size={16} />
                                <div>
                                  <strong>{cause.title}</strong>
                                  <span>{cause.detail}</span>
                                  <small>{cause.source}</small>
                                </div>
                              </div>

                              <div className="pilotage-playbook">
                                <div className="pilotage-playbook-head">
                                  <Sparkles size={15} />
                                  <strong>GenAI Playbook</strong>
                                  {copilotStep?.action ? <span>{copilotStep.action}</span> : null}
                                </div>
                                <div className="pilotage-playbook-options">
                                  <button type="button" onClick={() => openProductStock(alertItem)}>
                                    <ArrowLeftRight size={15} />
                                    <span>Option A</span>
                                    <strong>Verifier transfert interne {qty} u.</strong>
                                  </button>
                                  <button type="button" onClick={() => openOrderDraft(alertItem)}>
                                    <ShoppingCart size={15} />
                                    <span>Option B</span>
                                    <strong>Commande fournisseur express</strong>
                                  </button>
                                  <button type="button" onClick={() => openCrisisRoom(alertItem)}>
                                    <MessageSquare size={15} />
                                    <span>Option C</span>
                                    <strong>Triage collaboratif IA</strong>
                                  </button>
                                </div>
                              </div>

                              <div className="pilotage-alert-footer">
                                <span><Clock size={14} /> {alertAgeLabel(alertItem.detectedAt, nowTs)}</span>
                                <span>{alertItem.detectedAtLabel}</span>
                              </div>

                              <div className="pilotage-alert-actions">
                                <button
                                  type="button"
                                  className="pilotage-btn ghost"
                                  onClick={() => navigate(`/responsable/produits?q=${encodeURIComponent(alertItem.productCode || alertItem.productName)}`)}
                                >
                                  <Eye size={15} /> Voir produit
                                </button>
                                {alertItem.status !== 'reviewed' ? (
                                  <button
                                    type="button"
                                    className="pilotage-btn primary"
                                    onClick={() => handleReviewAlert(alertItem.id, `Revue responsable apres playbook IA: ${cause.title}`)}
                                    disabled={isSubmitting}
                                  >
                                    <CheckCircle size={15} /> Marquer revue
                                  </button>
                                ) : (
                                  <span className="pilotage-reviewed-badge"><CheckCircle size={15} /> Revue</span>
                                )}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </section>
              ) : (
                <section className="pilotage-card pilotage-validations-card">
                  <div className="pilotage-card-head">
                    <div className="pilotage-card-titleblock">
                      <h3><Package size={18} /> Demandes à valider</h3>
                      <small>Flux : demandeur → responsable → magasinier</small>
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
                      <div>Aucune demande à traiter pour le moment.</div>
                      <div className="pilotage-empty-sub">Les nouvelles demandes apparaîtront ici dès leur création.</div>
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
                              <div><label>Quantité</label><span>{reqItem.quantite}</span></div>
                              <div><label>Demandeur</label><span>{reqItem.demandeur}</span></div>
                              <div><label>Direction</label><span>{reqItem.direction}</span></div>
                            </div>

                            <div className="pilotage-pending-meta">
                              <span className="pilotage-meta">{waitLabel(reqItem.createdAtRaw, nowTs)}</span>
                              <span className={`pilotage-meta stock ${stock.cls}`}>{stock.label}</span>
                              <span className="pilotage-meta advice">{advice}</span>
                            </div>

                            <div className="pilotage-impact">
                              Après validation, la demande sera envoyée au magasinier pour préparation.
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
