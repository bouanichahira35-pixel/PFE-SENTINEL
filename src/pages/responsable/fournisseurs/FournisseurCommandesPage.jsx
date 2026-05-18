import { useEffect, useState } from 'react';
import { ShoppingCart, Truck } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import SidebarResp from '../../../components/responsable/SidebarResp';
import HeaderPage from '../../../components/shared/HeaderPage';
import LoadingSpinner from '../../../components/shared/LoadingSpinner';
import { useToast } from '../../../components/shared/Toast';
import FournisseurDetailsHeader from '../../../components/fournisseurs/FournisseurDetailsHeader';
import FournisseurTabs from '../../../components/fournisseurs/FournisseurTabs';

import { getFournisseur, getFournisseurMetrics, listPurchaseOrders, updateFournisseurStatus } from '../../../services/fournisseurService';

import '../FournisseursResp.css';

function formatDate(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleDateString('fr-FR');
  } catch {
    return '-';
  }
}

const FournisseurCommandesPage = ({ userName, onLogout }) => {
  const toast = useToast();
  const { id } = useParams();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [loading, setLoading] = useState(false);
  const [supplier, setSupplier] = useState(null);
  const [score, setScore] = useState(null);
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const sid = String(id || '').trim();
    if (!sid) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [detail, metrics, pos] = await Promise.all([
          getFournisseur(sid),
          getFournisseurMetrics(sid).catch(() => ({ score: null })),
          listPurchaseOrders({ supplierId: sid, limit: 120 }).catch(() => ({ purchase_orders: [] })),
        ]);
        if (!alive) return;
        setSupplier(detail?.supplier || null);
        setScore(typeof metrics?.score === 'number' ? metrics.score : null);
        setOrders(Array.isArray(pos?.purchase_orders) ? pos.purchase_orders : []);
      } catch (e) {
        toast.error(e.message || 'Chargement commandes échoué');
        navigate('/responsable/fournisseurs');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, navigate, toast]);

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

  const sid = String(supplier?._id || id || '').trim();

  return (
    <div className="resp-suppliers">
      <SidebarResp collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((p) => !p)} onLogout={onLogout} userName={userName} />
      <div className={`resp-suppliers-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <HeaderPage
          userName={userName}
          title="Commandes fournisseur"
          subtitle="Historique des commandes"
          icon={<ShoppingCart size={22} />}
          showSearch={false}
          onMenuClick={() => setSidebarCollapsed((p) => !p)}
        />
        <div className="resp-suppliers-page">
          {loading && <LoadingSpinner overlay text="Chargement commandes..." />}
          <FournisseurDetailsHeader
            fournisseur={supplier}
            score={score}
            onEdit={() => navigate(`/responsable/fournisseurs/${sid}/modifier`)}
            onCreateOrder={() => navigate(`/responsable/commandes/nouvelle?fournisseurId=${encodeURIComponent(sid)}`)}
            onNotify={() => navigate(`/responsable/fournisseurs/${sid}`)}
            onToggleStatus={toggleStatus}
          />
          <FournisseurTabs supplierId={sid} />

          <div className="resp-card" style={{ marginTop: 14 }}>
            <h3 style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><Truck size={18} />Commandes</h3>
            {!orders.length ? (
              <div className="resp-empty">Aucune commande trouvée.</div>
            ) : (
              <table className="f360-table" style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>Commande</th>
                    <th>Statut</th>
                    <th>Commandée</th>
                    <th>Promise</th>
                    <th>Livrée</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 120).map((po) => (
                    <tr key={String(po?._id)}>
                      <td>PO {String(po?._id || '').slice(-6).toUpperCase()}</td>
                      <td>{po?.status || '-'}</td>
                      <td>{formatDate(po?.ordered_at)}</td>
                      <td>{formatDate(po?.promised_at)}</td>
                      <td>{formatDate(po?.delivered_at)}</td>
                      <td>
                        <button className="f360-btn" type="button" onClick={() => navigate(`/responsable/commandes/${po._id}`)}>
                          Détails
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FournisseurCommandesPage;

