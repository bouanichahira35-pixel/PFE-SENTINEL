import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, RefreshCw, CheckCircle, Truck, Package, AlertTriangle } from 'lucide-react';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get, patch, post } from '../../services/api';
import { normalizeRequestStatus } from '../../utils/requestStatus';
import './InboxMag.css';

function priorityPill(priority) {
  const p = String(priority || 'normal').toLowerCase();
  if (p === 'critical') return { label: 'TRES URGENT', className: 'critique' };
  if (p === 'urgent') return { label: 'URGENT', className: 'moyen' };
  return null;
}

const InboxMag = ({ userName, onLogout }) => {
  const toast = useToast();
  const navigate = useNavigate();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [incidentModalOpen, setIncidentModalOpen] = useState(false);
  const [incidentTarget, setIncidentTarget] = useState(null);
  const [incidentSeverity, setIncidentSeverity] = useState('warning');
  const [incidentMessage, setIncidentMessage] = useState('');

  const [inbox, setInbox] = useState(() => ({
    decisions: [],
    requests: [],
    purchase_orders_to_receive: [],
    counts: null,
    generated_at: null,
  }));

  const loadInbox = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await get('/ai/magasinier-inbox');
      setInbox({
        decisions: Array.isArray(data?.decisions) ? data.decisions : [],
        requests: Array.isArray(data?.requests) ? data.requests : [],
        purchase_orders_to_receive: Array.isArray(data?.purchase_orders_to_receive) ? data.purchase_orders_to_receive : [],
        counts: data?.counts || null,
        generated_at: data?.generated_at || null,
      });
    } catch (err) {
      toast.error(err.message || 'Impossible de charger la boite de reception');
      setInbox({ decisions: [], requests: [], purchase_orders_to_receive: [], counts: null, generated_at: null });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  const goToSortieStock = useCallback((reqItem) => {
    if (!reqItem?.product?.id) return;
    navigate('/magasinier/sortie-stock', {
      state: {
        product: {
          id: reqItem.product.id,
          code: reqItem.product.code,
          nom: reqItem.product.name,
          quantite: reqItem.product.stock,
          categorie: '-',
          unite: 'Unite',
        },
        demandeInfo: {
          id: reqItem.id,
          reference: `DEM-${String(reqItem.id || '').slice(-6).toUpperCase()}`,
          quantite: reqItem.quantity_requested,
          demandeur: reqItem.demandeur,
          direction: reqItem.direction_laboratory,
          beneficiaire: reqItem.demandeur,
          statut: normalizeRequestStatus(reqItem.status),
        },
      },
    });
  }, [navigate]);

  const prepareRequest = useCallback(async (reqId) => {
    const id = String(reqId || '').trim();
    if (!id) return;
    setIsSubmitting(true);
    try {
      await patch(`/requests/${encodeURIComponent(id)}/prepare`, {});
      toast.success('Demande mise en preparation');
      await loadInbox();
    } catch (err) {
      toast.error(err.message || 'Echec preparation demande');
    } finally {
      setIsSubmitting(false);
    }
  }, [loadInbox, toast]);

  const receivePurchaseOrder = useCallback(async (poId) => {
    const id = String(poId || '').trim();
    if (!id) return;
    setIsSubmitting(true);
    try {
      await post(`/purchase-orders/${encodeURIComponent(id)}/receive`, {});
      toast.success('Commande receptionnee: entree stock creee');
      await loadInbox();
    } catch (err) {
      toast.error(err.message || 'Echec reception commande');
    } finally {
      setIsSubmitting(false);
    }
  }, [loadInbox, toast]);

  const openIncidentModal = useCallback((po) => {
    if (!po?.id) return;
    setIncidentTarget(po);
    setIncidentSeverity('warning');
    setIncidentMessage('');
    setIncidentModalOpen(true);
  }, []);

  const submitIncident = useCallback(async () => {
    if (!incidentTarget?.id) return;
    if (!String(incidentMessage || '').trim()) {
      toast.error('Message obligatoire');
      return;
    }
    setIsSubmitting(true);
    try {
      await post(`/purchase-orders/${encodeURIComponent(incidentTarget.id)}/incidents`, {
        severity: incidentSeverity,
        message: incidentMessage,
      });
      toast.success('Litige signale au responsable');
      setIncidentModalOpen(false);
      setIncidentTarget(null);
      await loadInbox();
    } catch (err) {
      toast.error(err.message || 'Echec creation litige');
    } finally {
      setIsSubmitting(false);
    }
  }, [incidentMessage, incidentSeverity, incidentTarget, loadInbox, toast]);

  const markDecisionDone = useCallback(async (decisionId) => {
    const did = String(decisionId || '').trim();
    if (!did) return;
    setIsSubmitting(true);
    try {
      await post('/ai/magasinier/decision-done', { decision_id: did, note: 'Traitement magasinier termine' });
      toast.success('Decision marquee terminee');
      await loadInbox();
    } catch (err) {
      toast.error(err.message || 'Echec marquage decision');
    } finally {
      setIsSubmitting(false);
    }
  }, [loadInbox, toast]);

  const decisionCount = inbox?.decisions?.length || 0;
  const requestCount = inbox?.requests?.length || 0;
  const poCount = inbox?.purchase_orders_to_receive?.length || 0;

  const requestsSorted = useMemo(() => {
    const weight = (p) => (p === 'critical' ? 2 : p === 'urgent' ? 1 : 0);
    return [...(inbox.requests || [])].sort((a, b) => {
      const d = weight(b.priority) - weight(a.priority);
      if (d !== 0) return d;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
  }, [inbox.requests]);

  return (
    <ProtectedPage userName={userName}>
      <div className="inboxmag-root">
        <SidebarMag
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((p) => !p)}
          onLogout={onLogout}
          userName={userName}
        />

        <div className={`inboxmag-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <HeaderPage title="Centre d'actions" onLogout={onLogout} />

          <main className="inboxmag-page">
            <div className="inboxmag-top">
              <div className="inboxmag-kpis">
                <div className="inboxmag-kpi">
                  <span>Decisions assignees</span>
                  <strong>{decisionCount}</strong>
                </div>
                <div className="inboxmag-kpi">
                  <span>Demandes a traiter</span>
                  <strong>{requestCount}</strong>
                </div>
                <div className="inboxmag-kpi">
                  <span>Commandes a receptionner</span>
                  <strong>{poCount}</strong>
                </div>
              </div>

              <button className="inboxmag-refresh" type="button" onClick={loadInbox} disabled={isLoading || isSubmitting}>
                <RefreshCw size={16} /> Actualiser
              </button>
            </div>

            {isLoading ? (
              <LoadingSpinner message="Chargement..." />
            ) : (
              <div className="inboxmag-grid">
                <section className="inboxmag-card">
                  <div className="inboxmag-card-head">
                    <h3><ClipboardList size={18} /> Decisions</h3>
                    <small>Assignees par le responsable</small>
                  </div>
                  {!inbox.decisions.length ? (
                    <div className="inboxmag-empty">Aucune decision assignee.</div>
                  ) : (
                    <div className="inboxmag-list">
                      {inbox.decisions.slice(0, 15).map((d) => (
                        <div key={d.decision_id} className="inboxmag-item">
                          <div className="inboxmag-item-top">
                            <div className="inboxmag-title">
                              <strong>{d.title || 'Decision'}</strong>
                              <span>{d.product_name || '-'}</span>
                            </div>
                            <span className={`inboxmag-pill ${String(d.level || '').toLowerCase().includes('crit') ? 'critique' : 'moyen'}`}>
                              {d.level || 'Moyen'}
                            </span>
                          </div>
                          {d.note ? <div className="inboxmag-note">{d.note}</div> : null}
                          <div className="inboxmag-actions">
                            <button className="inboxmag-btn ok" type="button" onClick={() => markDecisionDone(d.decision_id)} disabled={isSubmitting}>
                              <CheckCircle size={15} /> Marquer termine
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="inboxmag-card">
                  <div className="inboxmag-card-head">
                    <h3><Package size={18} /> Demandes</h3>
                    <small>Validees par le responsable</small>
                  </div>
                  {!requestsSorted.length ? (
                    <div className="inboxmag-empty">Aucune demande a traiter.</div>
                  ) : (
                    <div className="inboxmag-list">
                      {requestsSorted.slice(0, 18).map((r) => {
                        const pill = priorityPill(r.priority);
                        const insufficient = Number(r.product?.stock || 0) < Number(r.quantity_requested || 0);
                        return (
                          <div key={r.id} className="inboxmag-item">
                            <div className="inboxmag-item-top">
                              <div className="inboxmag-title">
                                <strong>{r.product?.name || 'Produit'}</strong>
                                <span>DEM-{String(r.id || '').slice(-6).toUpperCase()}</span>
                                {pill ? <span className={`inboxmag-pill ${pill.className}`}>{pill.label}</span> : null}
                              </div>
                              <span className="inboxmag-meta">
                                Qt: <strong>{r.quantity_requested}</strong>
                                {insufficient ? <span className="inboxmag-warn" title="Stock insuffisant"><AlertTriangle size={14} /></span> : null}
                              </span>
                            </div>
                            <div className="inboxmag-sub">
                              <span>Demandeur: {r.demandeur}</span>
                              <span>Direction: {r.direction_laboratory}</span>
                              <span>Statut: {r.status === 'received' ? 'cloturee' : r.status}</span>
                            </div>
                            {r.note ? <div className="inboxmag-note">{r.note}</div> : null}
                            <div className="inboxmag-actions">
                              {r.status === 'validated' ? (
                                <button className="inboxmag-btn ok" type="button" onClick={() => prepareRequest(r.id)} disabled={isSubmitting || insufficient}>
                                  <CheckCircle size={15} /> Preparer
                                </button>
                              ) : r.status === 'preparing' ? (
                                <button className="inboxmag-btn primary" type="button" onClick={() => goToSortieStock(r)} disabled={isSubmitting || insufficient}>
                                  <Truck size={15} /> Servir
                                </button>
                              ) : (
                                <span className="inboxmag-muted">-</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="inboxmag-card">
                  <div className="inboxmag-card-head">
                    <h3><Truck size={18} /> Commandes</h3>
                    <small>A receptionner (cree une entree + lot)</small>
                  </div>
                  {!inbox.purchase_orders_to_receive.length ? (
                    <div className="inboxmag-empty">Aucune commande a receptionner.</div>
                  ) : (
                    <div className="inboxmag-list">
                      {inbox.purchase_orders_to_receive.slice(0, 18).map((po) => (
                        <div key={po.id} className="inboxmag-item">
                          <div className="inboxmag-item-top">
                            <div className="inboxmag-title">
                              <strong>{po.supplier_name}</strong>
                              <span>PO-{String(po.id).slice(-6).toUpperCase()}</span>
                            </div>
                            <span className="inboxmag-meta">
                              {po.promised_at ? `Prevu: ${new Date(po.promised_at).toLocaleDateString('fr-FR')}` : 'En cours'}
                            </span>
                          </div>
                          {Array.isArray(po.lines) && po.lines.length ? (
                            <div className="inboxmag-note">
                              {po.lines.slice(0, 3).map((l) => `${l.product_name} (${l.quantity})`).join(' • ')}
                              {po.lines.length > 3 ? ' • ...' : ''}
                            </div>
                          ) : null}
                          <div className="inboxmag-actions">
                            <button className="inboxmag-btn ok" type="button" onClick={() => receivePurchaseOrder(po.id)} disabled={isSubmitting}>
                              <Truck size={15} /> Receptionner
                            </button>
                            <button className="inboxmag-btn" type="button" onClick={() => openIncidentModal(po)} disabled={isSubmitting}>
                              <AlertTriangle size={15} /> Signaler litige
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {incidentModalOpen && (
              <div className="inboxmag-modal-backdrop" role="dialog" aria-modal="true">
                <div className="inboxmag-modal">
                  <div className="inboxmag-modal-title">
                    <strong>Litige / Non-conformite</strong>
                    <span className="inboxmag-muted">
                      {(incidentTarget?.supplier_name || incidentTarget?.supplier_name === '' ? incidentTarget.supplier_name : incidentTarget?.supplierName) || ''}
                      {incidentTarget?.id ? ` • PO-${String(incidentTarget.id).slice(-6).toUpperCase()}` : ''}
                    </span>
                  </div>
                  <div className="inboxmag-modal-grid">
                    <label className="inboxmag-field">
                      <span>Gravite</span>
                      <select value={incidentSeverity} onChange={(e) => setIncidentSeverity(e.target.value)}>
                        <option value="info">Info</option>
                        <option value="warning">Warning</option>
                        <option value="critical">Critique</option>
                      </select>
                    </label>
                    <label className="inboxmag-field" style={{ gridColumn: '1 / -1' }}>
                      <span>Message</span>
                      <textarea
                        rows="4"
                        value={incidentMessage}
                        onChange={(e) => setIncidentMessage(e.target.value)}
                        placeholder="Ex: colis endommage / quantite non conforme / produit manquant..."
                      />
                    </label>
                  </div>
                  <div className="inboxmag-modal-actions">
                    <button className="inboxmag-btn" type="button" onClick={() => setIncidentModalOpen(false)} disabled={isSubmitting}>
                      Annuler
                    </button>
                    <button className="inboxmag-btn primary" type="button" onClick={submitIncident} disabled={isSubmitting}>
                      Envoyer au responsable
                    </button>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </ProtectedPage>
  );
};

export default InboxMag;
