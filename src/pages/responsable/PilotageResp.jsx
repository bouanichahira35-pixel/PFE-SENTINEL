import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle,
  Clock,
  Eye,
  Package,
  RefreshCw,
  Sparkles,
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
    currentStock: Number.isFinite(currentStock) ? currentStock : null,
    minStock: Number.isFinite(minStock) ? minStock : null,
  };
};

const PilotageResp = ({ userName, onLogout }) => {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'alertes' ? 'alertes' : 'validations';

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  ));

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [pendingRequests, setPendingRequests] = useState([]);
  const [aiAlerts, setAiAlerts] = useState([]);
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
      const rows = await get('/ai/alerts');
      setAiAlerts(Array.isArray(rows) ? rows : []);
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
    const newAlerts = mappedAiAlerts.filter((a) => a.status !== 'reviewed').length;
    const rupture = mappedAiAlerts.filter((a) => a.type === 'rupture').length;
    return { total, high, newAlerts, rupture };
  }, [mappedAiAlerts]);

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

  const handleReviewAlert = useCallback(async (alertId) => {
    if (!alertId) return;
    setIsSubmitting(true);
    try {
      await patch(`/ai/alerts/${alertId}/review`, { action_taken: 'Revue responsable depuis le centre alertes IA' });
      await loadAiAlerts();
      toast.success('Alerte IA marquée comme revue.');
    } catch (err) {
      toast.error('Impossible de mettre à jour cette alerte IA.');
    } finally {
      setIsSubmitting(false);
    }
  }, [loadAiAlerts, toast]);

  const switchTab = useCallback((tab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab === 'alertes' ? 'alertes' : 'validations');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

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

            <div className="pilotage-page">
              <div className="pilotage-tabs" role="tablist" aria-label="Pilotage responsable">
                <button
                  type="button"
                  className={`pilotage-tab ${activeTab === 'validations' ? 'active' : ''}`}
                  onClick={() => switchTab('validations')}
                >
                  <Package size={16} />
                  Demandes à valider
                </button>
                <button
                  type="button"
                  className={`pilotage-tab ${activeTab === 'alertes' ? 'active' : ''}`}
                  onClick={() => switchTab('alertes')}
                >
                  <Sparkles size={16} />
                  Alertes IA
                  {alertKpis.newAlerts > 0 ? <span className="pilotage-tab-badge">{alertKpis.newAlerts}</span> : null}
                </button>
              </div>

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
                    <div className="pilotage-ai-kpi"><Sparkles size={18} /><span>Total IA</span><strong>{alertKpis.total}</strong></div>
                  </div>

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
                                    onClick={() => handleReviewAlert(alertItem.id)}
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
                <section className="pilotage-card">
                  <div className="pilotage-card-head">
                    <h3><Package size={18} /> Demandes à valider</h3>
                    <small>Flux : demandeur → responsable → magasinier</small>
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
