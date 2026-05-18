import { useEffect, useMemo, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import SidebarResp from '../../../components/responsable/SidebarResp';
import HeaderPage from '../../../components/shared/HeaderPage';
import LoadingSpinner from '../../../components/shared/LoadingSpinner';
import { useToast } from '../../../components/shared/Toast';

import { listPurchaseOrders } from '../../../services/fournisseurService';
import '../../../components/fournisseurs/fournisseurs.css';
import '../FournisseursResp.css';

function formatDateTime(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('fr-FR');
  } catch {
    return '-';
  }
}

const CommandeFournisseurDetailsPage = ({ userName, onLogout }) => {
  const toast = useToast();
  const { id } = useParams();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [loading, setLoading] = useState(false);
  const [purchaseOrders, setPurchaseOrders] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await listPurchaseOrders({ limit: 200 });
        if (!alive) return;
        setPurchaseOrders(Array.isArray(res?.purchase_orders) ? res.purchase_orders : []);
      } catch (e) {
        toast.error(e.message || 'Chargement commande échoué');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [toast]);

  const po = useMemo(() => {
    const pid = String(id || '').trim();
    if (!pid) return null;
    return (purchaseOrders || []).find((x) => String(x?._id || '') === pid) || null;
  }, [id, purchaseOrders]);

  return (
    <div className="resp-suppliers">
      <SidebarResp collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((p) => !p)} onLogout={onLogout} userName={userName} />
      <div className={`resp-suppliers-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <HeaderPage
          userName={userName}
          title="Détail commande fournisseur"
          subtitle={po ? `PO ${String(po._id).slice(-6).toUpperCase()}` : 'Commande'}
          icon={<ShoppingCart size={22} />}
          showSearch={false}
          onMenuClick={() => setSidebarCollapsed((p) => !p)}
        />

        <div className="resp-suppliers-page">
          {loading && <LoadingSpinner overlay text="Chargement commande..." />}

          {!po ? (
            <div className="resp-card">
              <div className="resp-empty">
                Commande introuvable (la liste API est limitée). Essayez depuis la liste des commandes du fournisseur.
              </div>
              <div className="f360-actions" style={{ justifyContent: 'flex-end' }}>
                <button className="f360-btn" type="button" onClick={() => navigate('/responsable/fournisseurs')}>Retour fournisseurs</button>
              </div>
            </div>
          ) : (
            <div className="resp-card">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                <div className="resp-mini">
                  <div className="resp-mini-name">Commande</div>
                  <div className="f360-muted" style={{ marginTop: 6 }}>Statut: {po.status}</div>
                  <div className="f360-muted">Créée: {formatDateTime(po.createdAt)}</div>
                  <div className="f360-muted">Commandée: {formatDateTime(po.ordered_at)}</div>
                  <div className="f360-muted">Promise: {formatDateTime(po.promised_at)}</div>
                  <div className="f360-muted">Livrée: {formatDateTime(po.delivered_at)}</div>
                </div>
                <div className="resp-mini">
                  <div className="resp-mini-name">Fournisseur</div>
                  <div className="f360-muted" style={{ marginTop: 6 }}>{po?.supplier?.name || '—'}</div>
                  {po?.supplier?._id ? (
                    <button className="f360-btn" type="button" onClick={() => navigate(`/responsable/fournisseurs/${po.supplier._id}`)} style={{ marginTop: 10 }}>
                      Ouvrir fiche fournisseur
                    </button>
                  ) : null}
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 1000, color: '#0f172a', marginBottom: 8 }}>Lignes</div>
                <table className="f360-table">
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th>Quantité</th>
                      <th>Reçue</th>
                      <th>Prix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Array.isArray(po.lines) ? po.lines : []).map((l, idx) => (
                      <tr key={`${po._id}-${idx}`}>
                        <td>{l?.product?.name || 'Produit'}</td>
                        <td>{l?.quantity ?? '-'}</td>
                        <td>{l?.quantity_received ?? 0}</td>
                        <td>{l?.unit_price ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {Array.isArray(po?.incidents) && po.incidents.length ? (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontWeight: 1000, color: '#0f172a', marginBottom: 8 }}>Incidents</div>
                  <table className="f360-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Gravité</th>
                        <th>Statut</th>
                        <th>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {po.incidents.map((inc, idx) => (
                        <tr key={`${po._id}-inc-${idx}`}>
                          <td>{formatDateTime(inc?.created_at)}</td>
                          <td>{inc?.kind || '-'}</td>
                          <td>{inc?.severity || '-'}</td>
                          <td>{inc?.status || '-'}</td>
                          <td>{inc?.message || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CommandeFournisseurDetailsPage;

