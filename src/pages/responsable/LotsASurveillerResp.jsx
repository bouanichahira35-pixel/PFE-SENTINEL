import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, RefreshCw, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get } from '../../services/api';
import './LotsASurveillerResp.css';

function asDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function formatExpiryLabel(expiryDateRaw) {
  const d = asDate(expiryDateRaw);
  if (!d) return '-';
  return d.toLocaleDateString('fr-FR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function daysUntil(expiryDateRaw) {
  const d = asDate(expiryDateRaw);
  if (!d) return null;
  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((d.getTime() - now.getTime()) / msPerDay);
}

const LotsASurveillerResp = ({ userName, onLogout }) => {
  const toast = useToast();
  const navigate = useNavigate();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  ));

  const [isLoading, setIsLoading] = useState(false);
  const [lotsCount, setLotsCount] = useState(0);
  const [lotsItems, setLotsItems] = useState([]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = await get('/stock/lots/expiring?days=30');
      const count = Math.max(0, Math.floor(Number(payload?.count || 0)));
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setLotsCount(count);
      setLotsItems(items);
    } catch (err) {
      toast.error(err?.message || 'Impossible de charger les lots à surveiller.');
      setLotsCount(0);
      setLotsItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const openProduct = useCallback((lot) => {
    const code = lot?.product?.code_product ? String(lot.product.code_product) : '';
    const name = lot?.product?.name ? String(lot.product.name) : '';
    const q = code || name;
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    const search = params.toString();
    navigate(`/responsable/produits${search ? `?${search}` : ''}`);
  }, [navigate]);

  const rows = useMemo(() => (lotsItems || []).map((lot) => {
    const days = daysUntil(lot?.expiry_date);
    return {
      id: String(lot?._id || `${lot?.product?.code_product || ''}_${lot?.lot_number || ''}_${lot?.expiry_date || ''}`),
      productName: String(lot?.product?.name || 'Produit'),
      productCode: String(lot?.product?.code_product || ''),
      lotNumber: String(lot?.lot_number || '-'),
      expiryLabel: formatExpiryLabel(lot?.expiry_date),
      daysLeft: days,
      qty: Number(lot?.quantity_available || 0),
      unitPrice: lot?.unit_price,
      raw: lot,
    };
  }), [lotsItems]);

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
            title="Lots à surveiller"
            subtitle="Péremption ≤ 30 jours"
            showSearch={false}
            onRefresh={load}
            onMenuClick={() => setSidebarCollapsed((prev) => !prev)}
          />
          <main className="main-content">
            {isLoading && <LoadingSpinner overlay text="Chargement..." />}

            <div className="lots-page">
              <div className="lots-top">
                <div className="lots-kpis" aria-label="Synthèse lots">
                  <div className="lots-kpi">
                    <span>Lots à risque</span>
                    <strong>{lotsCount}</strong>
                  </div>
                  <div className="lots-kpi subtle">
                    <span>Affichage</span>
                    <strong>{rows.length}/12</strong>
                  </div>
                </div>

                <button type="button" className="lots-refresh" onClick={load} disabled={isLoading} title="Actualiser">
                  <RefreshCw size={16} />
                  <span>Actualiser</span>
                </button>
              </div>

              <section className="lots-card" aria-label="Table lots">
                <div className="lots-card-head">
                  <h3><Clock size={18} /> Péremptions imminentes</h3>
                  <small>Lots ouverts avec quantité disponible &gt; 0, triés par date de péremption.</small>
                </div>

                <div className="lots-table-wrap">
                  <table className="lots-table">
                    <thead>
                      <tr>
                        <th>Lot</th>
                        <th>Produit</th>
                        <th>Péremption</th>
                        <th>Jours</th>
                        <th>Qté</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td className="mono">{r.lotNumber}</td>
                          <td>
                            <div className="lots-product-cell">
                              <strong>{r.productName}</strong>
                              {r.productCode ? <span className="muted mono">{r.productCode}</span> : null}
                            </div>
                          </td>
                          <td>{r.expiryLabel}</td>
                          <td>
                            <span className={`lots-pill ${r.daysLeft != null && r.daysLeft <= 7 ? 'danger' : r.daysLeft != null && r.daysLeft <= 14 ? 'warn' : 'ok'}`}>
                              {r.daysLeft == null ? '-' : `${r.daysLeft} j`}
                            </span>
                          </td>
                          <td className="mono">{Number.isFinite(r.qty) ? r.qty : '-'}</td>
                          <td className="actions">
                            <button type="button" className="lots-action" onClick={() => openProduct(r.raw)} disabled={isLoading} title="Ouvrir dans le référentiel produits">
                              <Search size={14} />
                              <span>Ouvrir produit</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!rows.length && (
                        <tr>
                          <td colSpan={6} className="empty">
                            Aucun lot à surveiller sur les 30 prochains jours.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </main>
        </div>
      </div>
    </ProtectedPage>
  );
};

export default LotsASurveillerResp;
