import { useEffect, useState } from 'react';
import { Tag, Truck } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import SidebarResp from '../../../components/responsable/SidebarResp';
import HeaderPage from '../../../components/shared/HeaderPage';
import LoadingSpinner from '../../../components/shared/LoadingSpinner';
import { useToast } from '../../../components/shared/Toast';
import FournisseurDetailsHeader from '../../../components/fournisseurs/FournisseurDetailsHeader';
import FournisseurTabs from '../../../components/fournisseurs/FournisseurTabs';

import { getFournisseur, getFournisseurMetrics, getFournisseurProducts, updateFournisseurStatus } from '../../../services/fournisseurService';

import '../FournisseursResp.css';

const FournisseurProduitsPage = ({ userName, onLogout }) => {
  const toast = useToast();
  const { id } = useParams();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [loading, setLoading] = useState(false);
  const [supplier, setSupplier] = useState(null);
  const [score, setScore] = useState(null);
  const [links, setLinks] = useState([]);

  useEffect(() => {
    const sid = String(id || '').trim();
    if (!sid) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [detail, metrics, prod] = await Promise.all([
          getFournisseur(sid),
          getFournisseurMetrics(sid).catch(() => ({ score: null })),
          getFournisseurProducts(sid).catch(() => ({ links: [] })),
        ]);
        if (!alive) return;
        setSupplier(detail?.supplier || null);
        setScore(typeof metrics?.score === 'number' ? metrics.score : null);
        setLinks(Array.isArray(prod?.links) ? prod.links : []);
      } catch (e) {
        toast.error(e.message || 'Chargement produits échoué');
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
          title="Produits fournisseur"
          subtitle="Produits associés"
          icon={<Tag size={22} />}
          showSearch={false}
          onMenuClick={() => setSidebarCollapsed((p) => !p)}
        />
        <div className="resp-suppliers-page">
          {loading && <LoadingSpinner overlay text="Chargement produits..." />}
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
            <h3 style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><Truck size={18} />Produits</h3>
            {!links.length ? (
              <div className="resp-empty">Aucun produit associé.</div>
            ) : (
              <table className="f360-table" style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Produit</th>
                    <th>Seuil</th>
                    <th>Délai (j)</th>
                    <th>Prix</th>
                    <th>Disponibilité</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((l) => {
                    const product = l?.product || {};
                    const pid = String(product?._id || '');
                    return (
                      <tr key={String(l?._id || pid)}>
                        <td>{product?.code_product || '-'}</td>
                        <td>{product?.name || '-'}</td>
                        <td>{product?.seuil_minimum ?? '-'}</td>
                        <td>{l?.lead_time_days ?? '-'}</td>
                        <td>{l?.unit_price ?? '-'}</td>
                        <td>{l?.availability_status || 'unknown'}</td>
                        <td>
                          <button
                            className="f360-btn"
                            type="button"
                            onClick={() => navigate(`/responsable/commandes/nouvelle?fournisseurId=${encodeURIComponent(sid)}&produitId=${encodeURIComponent(pid)}`)}
                            disabled={!pid}
                          >
                            Créer commande
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FournisseurProduitsPage;

