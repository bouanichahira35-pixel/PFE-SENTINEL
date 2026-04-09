import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { get, post } from '../../services/api';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import './SupplierPortal.css';

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

function formatDate(date) {
  if (!date) return '-';
  try {
    return new Date(date).toLocaleDateString('fr-FR');
  } catch {
    return '-';
  }
}

const SupplierPortal = () => {
  const toast = useToast();
  const query = useQuery();
  const token = String(query.get('token') || '').trim();

  const [loading, setLoading] = useState(false);
  const [supplierName, setSupplierName] = useState('');
  const [orders, setOrders] = useState([]);
  const [ackDrafts, setAckDrafts] = useState({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) return;
      setLoading(true);
      try {
        const res = await get(`/supplier-portal/orders?token=${encodeURIComponent(token)}`);
        if (cancelled) return;
        setSupplierName(res?.supplier?.name || 'Fournisseur');
        setOrders(Array.isArray(res?.purchase_orders) ? res.purchase_orders : []);
      } catch (err) {
        if (!cancelled) toast.error(err.message || 'Acces portail fournisseur impossible');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token, toast]);

  const now = Date.now();

  return (
    <div className="supplier-portal">
      {loading && <LoadingSpinner overlay text="Chargement..." />}
      <div className="supplier-portal-card">
        <div className="supplier-portal-header">
          <div>
            <div className="supplier-portal-title">Portail Fournisseur (lecture seule)</div>
            <div className="supplier-portal-sub">{supplierName ? `Fournisseur: ${supplierName}` : 'Lien securise'}</div>
          </div>
          <div className="supplier-portal-sub">SENTINEL</div>
        </div>
        <div className="supplier-portal-body">
          {!token && (
            <div className="supplier-portal-empty">
              Lien invalide: token manquant.
            </div>
          )}
          {token && orders.length === 0 && !loading && (
            <div className="supplier-portal-empty">
              Aucune commande a afficher.
            </div>
          )}
          {token && orders.map((po) => {
            const promisedAt = po?.promised_at ? new Date(po.promised_at).getTime() : null;
            const isOverdue = typeof promisedAt === 'number' && promisedAt < now && po?.status === 'ordered';
            const statusLabel = po?.status === 'delivered' ? 'Livree' : po?.status === 'ordered' ? 'En cours' : po?.status || 'Commande';
            const draft = ackDrafts?.[po.id] || { eta_date: '', note: '' };
            const canAck = po?.status === 'ordered';
            return (
              <div className="supplier-po" key={po.id}>
                <div className="supplier-po-top">
                  <div className="supplier-po-ref">Commande: {String(po.id).slice(-8).toUpperCase()}</div>
                  <div className="supplier-po-badges">
                    <span className={`badge ${po.status === 'delivered' ? 'ok' : 'warn'}`}>{statusLabel}</span>
                    {isOverdue && <span className="badge warn">Retard</span>}
                  </div>
                </div>
                <div className="supplier-po-meta">
                  <div><strong>Commande</strong>: {formatDate(po.ordered_at)}</div>
                  <div><strong>Prevue</strong>: {formatDate(po.promised_at)}</div>
                  <div><strong>Livraison</strong>: {formatDate(po.delivered_at || po.received_at)}</div>
                </div>
                <div className="supplier-po-lines">
                  <strong>Lignes</strong>
                  <ul>
                    {(po.lines || []).slice(0, 20).map((l, idx) => (
                      <li key={`${po.id}_${idx}`}>
                        {l.product_name}{l.product_code ? ` (${l.product_code})` : ''} — Qté: {l.quantity}
                      </li>
                    ))}
                  </ul>
                </div>

                {canAck && (
                  <div className="supplier-po-lines">
                    <strong>Accuse de reception (ACK)</strong>
                    <div className="supplier-po-meta" style={{ marginTop: 10 }}>
                      <div>
                        <div className="muted"><strong>ETA (optionnel)</strong></div>
                        <input
                          type="date"
                          value={draft.eta_date || ''}
                          onChange={(e) => setAckDrafts((p) => ({ ...p, [po.id]: { ...draft, eta_date: e.target.value } }))}
                          style={{ width: '100%', padding: 8, borderRadius: 10, border: '1px solid rgba(2,6,23,0.12)' }}
                        />
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <div className="muted"><strong>Note</strong></div>
                        <input
                          value={draft.note || ''}
                          onChange={(e) => setAckDrafts((p) => ({ ...p, [po.id]: { ...draft, note: e.target.value } }))}
                          placeholder="Ex: livraison prevue / retard logistique..."
                          style={{ width: '100%', padding: 8, borderRadius: 10, border: '1px solid rgba(2,6,23,0.12)' }}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                      <button
                        type="button"
                        className="badge ok"
                        onClick={async () => {
                          try {
                            await post(`/supplier-portal/orders/${po.id}/ack?token=${encodeURIComponent(token)}`, {
                              status: 'confirmed',
                              eta_date: draft.eta_date || undefined,
                              note: draft.note || undefined,
                            });
                            toast.success('ACK envoye (ETA confirme).');
                          } catch (err) {
                            toast.error(err.message || 'ACK echoue');
                          }
                        }}
                      >
                        Confirmer ETA
                      </button>
                      <button
                        type="button"
                        className="badge warn"
                        onClick={async () => {
                          try {
                            await post(`/supplier-portal/orders/${po.id}/ack?token=${encodeURIComponent(token)}`, {
                              status: 'delayed',
                              eta_date: draft.eta_date || undefined,
                              note: draft.note || undefined,
                            });
                            toast.success('ACK envoye (retard signale).');
                          } catch (err) {
                            toast.error(err.message || 'ACK echoue');
                          }
                        }}
                      >
                        Signaler retard
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SupplierPortal;
