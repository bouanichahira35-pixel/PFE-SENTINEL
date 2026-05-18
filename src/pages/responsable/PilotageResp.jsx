import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, Package, RefreshCw, XCircle } from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get, patch } from '../../services/api';
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
  if (Number(reqItem.quantite || 0) <= 2) return 'Conseil : validation possible';
  return 'Conseil : validation possible';
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
  dateSoumission: (r.date_request || r.createdAt)
    ? new Date(r.date_request || r.createdAt).toLocaleString('fr-FR')
    : '-',
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

const PilotageResp = ({ userName, onLogout }) => {
  const toast = useToast();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  ));

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [pendingRequests, setPendingRequests] = useState([]);
  const [urgentRequestsOnly, setUrgentRequestsOnly] = useState(false);
  const [urgentRequestsFirst, setUrgentRequestsFirst] = useState(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const pendingReqs = await get('/requests?status=pending').catch(() => []);
      setPendingRequests(Array.isArray(pendingReqs) ? pendingReqs : []);
    } catch (err) {
      toast.error('Impossible de charger les demandes. Veuillez réessayer.');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

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
      await loadData();
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
  }, [loadData, toast]);

  const nowTs = Date.now();

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
            title="Demandes à traiter"
            showSearch={false}
            onMenuClick={() => setSidebarCollapsed((prev) => !prev)}
          />
          <main className="main-content">
            {(isLoading || isSubmitting) && <LoadingSpinner overlay text="Chargement..." />}

            <div className="pilotage-page">
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
                      onClick={loadData}
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
            </div>
          </main>
        </div>
      </div>
    </ProtectedPage>
  );
};

export default PilotageResp;
