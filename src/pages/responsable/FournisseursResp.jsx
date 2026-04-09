import { useCallback, useEffect, useMemo, useState } from 'react';
import { Truck, RefreshCw, MailWarning, Mail } from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { get, post, patch } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import './FournisseursResp.css';

function formatDate(date) {
  if (!date) return '-';
  try {
    return new Date(date).toLocaleDateString('fr-FR');
  } catch {
    return '-';
  }
}

function daysLate(promisedAt) {
  if (!promisedAt) return null;
  const t = new Date(promisedAt).getTime();
  if (!Number.isFinite(t)) return null;
  const diff = Date.now() - t;
  if (diff <= 0) return 0;
  return Math.round((diff / (24 * 60 * 60 * 1000)) * 10) / 10;
}

function formatDateTime(date) {
  if (!date) return '-';
  try {
    return new Date(date).toLocaleString('fr-FR');
  } catch {
    return '-';
  }
}

function getLastSupplierNotification(po) {
  const list = Array.isArray(po?.supplier_notifications) ? po.supplier_notifications : [];
  const last = list
    .filter((x) => x && x.sent_at)
    .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())[0];
  return last || null;
}

const FournisseursResp = ({ userName, onLogout }) => {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [loading, setLoading] = useState(false);
  const [ranking, setRanking] = useState([]);
  const [orders, setOrders] = useState([]);
  const [mailingPoId, setMailingPoId] = useState('');
  const [incidentModalOpen, setIncidentModalOpen] = useState(false);
  const [incidentTarget, setIncidentTarget] = useState(null);
  const [resolutionNote, setResolutionNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [insights, pos] = await Promise.all([
        get('/suppliers/insights?max=8&window_days=180'),
        get('/purchase-orders?status=ordered&limit=60'),
      ]);

      const items = Array.isArray(insights?.risk_suppliers)
        ? insights.risk_suppliers
        : (Array.isArray(insights?.ranking) ? insights.ranking : (Array.isArray(insights?.items) ? insights.items : []));
      setRanking(items.slice(0, 8));

      const purchaseOrders = Array.isArray(pos?.purchase_orders) ? pos.purchase_orders : [];
      purchaseOrders.sort((a, b) => {
        const pa = a?.promised_at ? new Date(a.promised_at).getTime() : Infinity;
        const pb = b?.promised_at ? new Date(b.promised_at).getTime() : Infinity;
        return pa - pb;
      });
      setOrders(purchaseOrders);
    } catch (err) {
      toast.error(err.message || 'Chargement fournisseurs/commandes echoue');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const overdueOrders = useMemo(() => orders.filter((po) => {
    const dl = daysLate(po?.promised_at);
    return typeof dl === 'number' && dl > 0;
  }), [orders]);

  const relaunchSupplier = useCallback(async (poId) => {
    try {
      await post(`/purchase-orders/${poId}/notify-supplier`, { force: false });
      toast.success('Email fournisseur envoye.');
    } catch (err) {
      toast.error(err.message || 'Relance echouee');
    }
  }, [toast]);

  const sendManualSupplierMessage = useCallback(async (po) => {
    const poId = String(po?._id || po?.id || '').trim();
    const supplierId = String(po?.supplier?._id || '').trim();
    const supplierName = String(po?.supplier?.name || 'Fournisseur').trim();
    if (!poId || !supplierId) return;

    setMailingPoId(poId);
    try {
      await post(`/suppliers/${encodeURIComponent(supplierId)}/notify-email`, {
        kind: 'po_followup',
        subject: `[SENTINEL] Suivi commande PO-${poId.slice(-6).toUpperCase()} - ${supplierName}`,
        message: [
          `Bonjour,`,
          ``,
          `Nous souhaitons confirmer l'avancement de la commande suivante :`,
          `- Reference: PO-${poId.slice(-6).toUpperCase()}`,
          `- Date prevue (interne): ${formatDate(po?.promised_at)}`,
          ``,
          `Merci de nous confirmer:`,
          `1) l'ETA de livraison (date)`, 
          `2) toute contrainte ou retard eventuel.`,
          ``,
          `Cordialement,`,
          `SENTINEL (ETAP)`,
        ].join('\n'),
      });
      toast.success('Message email en file d\'envoi.');
    } catch (err) {
      toast.error(err?.message || 'Envoi email echoue');
    } finally {
      setMailingPoId('');
    }
  }, [toast]);

  const openIncidentsModal = useCallback((po) => {
    if (!po?._id && !po?.id) return;
    setIncidentTarget(po);
    setResolutionNote('');
    setIncidentModalOpen(true);
  }, []);

  const resolveIncident = useCallback(async (poId, incidentId) => {
    try {
      await patch(`/purchase-orders/${encodeURIComponent(poId)}/incidents/${encodeURIComponent(incidentId)}/resolve`, {
        resolution_note: resolutionNote,
      });
      toast.success('Litige resolu.');
      await load();
      setIncidentModalOpen(false);
      setIncidentTarget(null);
    } catch (err) {
      toast.error(err.message || 'Resolution echouee');
    }
  }, [load, resolutionNote, toast]);

  return (
    <div className="resp-suppliers">
      <SidebarResp
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((p) => !p)}
        onLogout={onLogout}
        userName={userName}
      />
      <div className={`resp-suppliers-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <HeaderPage
          title="Fournisseurs"
          subtitle="Suivi commandes & relances"
          icon={<Truck size={24} />}
        />
        {loading && <LoadingSpinner overlay text="Chargement..." />}
        <div className="resp-suppliers-page">
          <div className="resp-suppliers-grid">
            <div className="resp-card">
              <h3><MailWarning size={18} /> Top fournisseurs a risque</h3>
              <div className="muted">Classement base sur commandes ouvertes, retards et historique.</div>
              {ranking.length === 0 && <div className="muted" style={{ marginTop: 10 }}>Aucune donnee.</div>}
              {ranking.map((r) => (
                <div className="risk-item" key={String(r.supplier_id || r.id || r.supplier_name)}>
                  <div>
                    <div className="risk-name">{r.supplier_name || r.name || 'Fournisseur'}</div>
                    <div className="risk-meta">
                      Score fiabilite: <strong>{Number(r.score_fiability || r.score || 0)}</strong> / 100
                      {typeof r.late_open_orders_count === 'number' ? ` • Retards: ${r.late_open_orders_count}` : ''}
                    </div>
                  </div>
                  <span className={`pill ${r.risk_level || 'moyen'}`}>{String(r.risk_level || 'moyen')}</span>
                </div>
              ))}
            </div>

            <div className="resp-card">
              <div className="orders-toolbar">
                <h3 style={{ margin: 0 }}><Truck size={18} /> Commandes ouvertes</h3>
                <button className="btn" type="button" onClick={load} disabled={loading}>
                  <RefreshCw size={16} />
                  Actualiser
                </button>
              </div>
              <div className="muted" style={{ marginBottom: 8 }}>
                {overdueOrders.length > 0 ? (
                  <span className="overdue">{overdueOrders.length} commande(s) en retard</span>
                ) : (
                  <span>Aucun retard detecte.</span>
                )}
              </div>
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Fournisseur</th>
                    <th>Commande</th>
                    <th>Prevue</th>
                    <th>ACK</th>
                    <th>ETA</th>
                    <th>Litiges</th>
                    <th>Emails</th>
                    <th>Retard</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 60).map((po) => {
                    const supplierName = po?.supplier?.name || 'Fournisseur';
                    const late = daysLate(po?.promised_at);
                    const lateLabel = typeof late === 'number' && late > 0 ? `${late}j` : '-';
                    const ackStatus = String(po?.supplier_ack?.status || 'none');
                    const ackLabel = ackStatus === 'confirmed' ? 'Confirme' : ackStatus === 'delayed' ? 'Retard' : '-';
                    const ackEta = po?.supplier_ack?.eta_date ? formatDate(po.supplier_ack.eta_date) : '-';
                    const incidents = Array.isArray(po?.incidents) ? po.incidents : [];
                    const openIncidents = incidents.filter((x) => (x?.status || 'open') === 'open');
                    const litigeLabel = openIncidents.length ? String(openIncidents.length) : '-';
                    const lastMail = getLastSupplierNotification(po);
                    const mailCount = Array.isArray(po?.supplier_notifications) ? po.supplier_notifications.length : 0;
                    return (
                      <tr key={String(po._id || po.id)}>
                        <td>{supplierName}</td>
                        <td className="muted">{String(po._id || po.id).slice(-8).toUpperCase()}</td>
                        <td>{formatDate(po?.promised_at)}</td>
                        <td className={ackStatus === 'delayed' ? 'overdue' : 'muted'}>{ackLabel}</td>
                        <td className="muted">{ackEta}</td>
                        <td className={openIncidents.length ? 'overdue clickable' : 'muted clickable'} onClick={() => openIncidentsModal(po)} title="Voir details">
                          {litigeLabel}
                        </td>
                        <td className="muted" title={lastMail ? `${lastMail.kind || 'email'} • ${formatDateTime(lastMail.sent_at)}` : 'Aucun email envoye'}>
                          {mailCount ? `${mailCount} • ${lastMail?.kind || 'email'}` : '-'}
                        </td>
                        <td className={typeof late === 'number' && late > 0 ? 'overdue' : 'muted'}>{lateLabel}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                            <button className="btn" type="button" onClick={() => sendManualSupplierMessage(po)} disabled={mailingPoId === String(po._id || po.id)} title="Envoyer un message au fournisseur (email)">
                              <Mail size={16} />
                              Message
                            </button>
                            <button className="btn primary" type="button" onClick={() => relaunchSupplier(po._id || po.id)}>
                              <MailWarning size={16} />
                              Relancer
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {orders.length === 0 && !loading && <div className="muted" style={{ marginTop: 10 }}>Aucune commande ouverte.</div>}
            </div>
          </div>

          {incidentModalOpen && (
            <div className="resp-modal-backdrop" role="dialog" aria-modal="true">
              <div className="resp-modal">
                <div className="resp-modal-title">
                  <strong>Litiges / Non-conformites</strong>
                  <span className="muted">
                    {(incidentTarget?.supplier?.name || 'Fournisseur')}{incidentTarget?._id ? ` • PO-${String(incidentTarget._id).slice(-6).toUpperCase()}` : ''}
                  </span>
                </div>
                <div className="resp-modal-body">
                  {(() => {
                    const list = Array.isArray(incidentTarget?.incidents) ? incidentTarget.incidents : [];
                    const open = list.filter((x) => (x?.status || 'open') === 'open');
                    if (!open.length) return <div className="muted">Aucun litige ouvert.</div>;
                    return (
                      <div className="incident-list">
                        {open.slice(0, 12).map((inc) => (
                          <div className="incident-item" key={String(inc._id || inc.created_at || Math.random())}>
                            <div className="incident-top">
                              <span className={`pill ${inc.severity === 'critical' ? 'critique' : inc.severity === 'warning' ? 'moyen' : 'faible'}`}>
                                {String(inc.severity || 'warning')}
                              </span>
                              <span className="muted">
                                {inc.created_at ? new Date(inc.created_at).toLocaleString('fr-FR') : ''}
                              </span>
                            </div>
                            <div className="incident-msg">{inc.message || '-'}</div>
                            <div className="incident-actions">
                              <input
                                value={resolutionNote}
                                onChange={(e) => setResolutionNote(e.target.value)}
                                placeholder="Note de resolution (optionnel)"
                                maxLength={240}
                              />
                              <button
                                type="button"
                                className="btn primary"
                                onClick={() => resolveIncident(incidentTarget._id || incidentTarget.id, inc._id)}
                              >
                                Marquer resolu
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                <div className="resp-modal-footer">
                  <button className="btn" type="button" onClick={() => setIncidentModalOpen(false)}>Fermer</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FournisseursResp;
