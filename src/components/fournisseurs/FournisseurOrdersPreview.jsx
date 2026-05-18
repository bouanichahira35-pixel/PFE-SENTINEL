import { useEffect, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { listPurchaseOrders } from '../../services/fournisseurService';
import './fournisseurs.css';

function formatDate(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleDateString('fr-FR');
  } catch {
    return '-';
  }
}

const FournisseurOrdersPreview = ({ supplierId, onOpenCommande }) => {
  const sid = String(supplierId || '').trim();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    if (!sid) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await listPurchaseOrders({ supplierId: sid, limit: 12 });
        if (!alive) return;
        setOrders(Array.isArray(res?.purchase_orders) ? res.purchase_orders : []);
      } catch {
        if (!alive) return;
        setOrders([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [sid]);

  return (
    <div className="resp-card">
      <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <ShoppingCart size={18} />
        Commandes récentes
      </h3>
      {loading ? (
        <div className="resp-empty">Chargement...</div>
      ) : !orders.length ? (
        <div className="resp-empty">Aucune commande.</div>
      ) : (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {orders.slice(0, 8).map((po) => (
            <div key={String(po?._id)} className="risk-item">
              <div>
                <div style={{ fontWeight: 950, color: '#0f172a' }}>
                  PO {String(po?._id || '').slice(-6).toUpperCase()} • {String(po?.status || '').toUpperCase()}
                </div>
                <div className="risk-meta">
                  Commandée: {formatDate(po?.ordered_at)} • Promise: {formatDate(po?.promised_at)} • Livrée: {formatDate(po?.delivered_at)}
                </div>
              </div>
              <button className="f360-btn" type="button" onClick={() => onOpenCommande?.(po)}>Détails</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FournisseurOrdersPreview;

