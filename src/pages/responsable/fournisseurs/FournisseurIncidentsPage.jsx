import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, Truck } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import SidebarResp from '../../../components/responsable/SidebarResp';
import HeaderPage from '../../../components/shared/HeaderPage';
import LoadingSpinner from '../../../components/shared/LoadingSpinner';
import { useToast } from '../../../components/shared/Toast';
import FournisseurDetailsHeader from '../../../components/fournisseurs/FournisseurDetailsHeader';
import FournisseurTabs from '../../../components/fournisseurs/FournisseurTabs';

import { getFournisseur, getFournisseurMetrics, listPurchaseOrders, updateFournisseurStatus } from '../../../services/fournisseurService';
import { ALERT_STATUS, listFournisseurAlerts, updateFournisseurAlertStatus } from '../../../services/fournisseurAlertService';

import '../FournisseursResp.css';

function formatDate(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleDateString('fr-FR');
  } catch {
    return '-';
  }
}

const FournisseurIncidentsPage = ({ userName, onLogout }) => {
  const toast = useToast();
  const { id } = useParams();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [loading, setLoading] = useState(false);
  const [supplier, setSupplier] = useState(null);
  const [score, setScore] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const sid = String(id || '').trim();
    if (!sid) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [detail, metrics, al, pos] = await Promise.all([
          getFournisseur(sid),
          getFournisseurMetrics(sid).catch(() => ({ score: null })),
          listFournisseurAlerts({ status: ALERT_STATUS.NON_TRAITEE, supplierId: sid, limit: 60, page: 1 }).catch(() => ({ items: [] })),
          listPurchaseOrders({ supplierId: sid, limit: 120 }).catch(() => ({ purchase_orders: [] })),
        ]);
        if (!alive) return;
        setSupplier(detail?.supplier || null);
        setScore(typeof metrics?.score === 'number' ? metrics.score : null);
        setAlerts(Array.isArray(al?.items) ? al.items : []);
        setOrders(Array.isArray(pos?.purchase_orders) ? pos.purchase_orders : []);
      } catch (e) {
        toast.error(e.message || 'Chargement incidents échoué');
        navigate('/responsable/fournisseurs');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id, navigate, toast]);

  const incidents = useMemo(() => {
    const rows = [];
    (orders || []).forEach((po) => {
      const poId = String(po?._id || '').trim();
      const list = Array.isArray(po?.incidents) ? po.incidents : [];
      list.forEach((inc, idx) => {
        rows.push({
          id: `${poId}:${idx}`,
          date: inc?.created_at || po?.createdAt || null,
          type: inc?.kind || 'incident_commande',
          severity: inc?.severity || 'warning',
          status: inc?.status || 'open',
          description: inc?.message || '',
          poId,
        });
      });
    });
    return rows.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [orders]);

  const toggleStatus = async () => {
    if (!supplier?._id) return;
    const isSuspended = String(supplier?.status || '').toUpperCase() === 'SUSPENDU';
    const nextStatus = isSuspended ? 'ACTIF' : 'SUSPENDU';
    // eslint-disable-next-line no-alert
    const ok = window.confirm(isSuspended ? 'Réactiver ce fournisseur ?' : 'Suspendre ce fournisseur ?');
    if (!ok) return;
    try {
      await updateFournisseurStatus(supplier._id, nextStatus);
      toast.success('Statut fournisseur mis à jour.');
      const detail = await getFournisseur(supplier._id);
      setSupplier(detail?.supplier || null);
    } catch (e) {
      toast.error(e.message || 'Changement statut échoué');
    }
  };

  const treatAlert = async (alertId) => {
    const aid = String(alertId || '').trim();
    if (!aid) return;
    try {
      await updateFournisseurAlertStatus(aid, ALERT_STATUS.TRAITEE);
      toast.success('Alerte traitée.');
      const al = await listFournisseurAlerts({ status: ALERT_STATUS.NON_TRAITEE, supplierId: String(id || '').trim(), limit: 60, page: 1 });
      setAlerts(Array.isArray(al?.items) ? al.items : []);
    } catch (e) {
      toast.error(e.message || 'Traitement alerte échoué');
    }
  };

  const sid = String(supplier?._id || id || '').trim();

  return (
    <div className="resp-suppliers">
      <SidebarResp collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((p) => !p)} onLogout={onLogout} userName={userName} />
      <div className={`resp-suppliers-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <HeaderPage
          userName={userName}
          title="Incidents & alertes"
          subtitle="Retards, anomalies, litiges et alertes"
          icon={<ShieldAlert size={22} />}
          showSearch={false}
          onMenuClick={() => setSidebarCollapsed((p) => !p)}
        />
        <div className="resp-suppliers-page">
          {loading && <LoadingSpinner overlay text="Chargement incidents..." />}
          <FournisseurDetailsHeader
            fournisseur={supplier}
            score={score}
            onEdit={() => navigate(`/responsable/fournisseurs/${sid}/modifier`)}
            onCreateOrder={() => navigate(`/responsable/commandes/nouvelle?fournisseurId=${encodeURIComponent(sid)}`)}
            onNotify={() => navigate(`/responsable/fournisseurs/${sid}`)}
            onToggleStatus={toggleStatus}
          />
          <FournisseurTabs supplierId={sid} />

          <div className="resp-suppliers-grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 14 }}>
            <div className="resp-card">
              <h3 style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><Truck size={18} />Alertes fournisseur</h3>
              {!alerts.length ? (
                <div className="resp-empty">Aucune alerte ouverte.</div>
              ) : (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {alerts.slice(0, 12).map((a) => (
                    <div key={String(a?._id)} className="risk-item" style={{ alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 950, color: '#0f172a' }}>{a?.type || 'Alerte'}</div>
                        <div className="risk-meta">{a?.message || ''}</div>
                      </div>
                      <button className="f360-btn success" type="button" onClick={() => treatAlert(a._id)}>Traiter</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="resp-card">
              <h3 style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><ShieldAlert size={18} />Incidents commandes</h3>
              {!incidents.length ? (
                <div className="resp-empty">Aucun incident lié aux commandes.</div>
              ) : (
                <table className="f360-table" style={{ marginTop: 10 }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Gravité</th>
                      <th>Statut</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.slice(0, 30).map((i) => (
                      <tr key={i.id}>
                        <td>{formatDate(i.date)}</td>
                        <td>{i.type}</td>
                        <td>{i.severity}</td>
                        <td>{i.status}</td>
                        <td>{i.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FournisseurIncidentsPage;

