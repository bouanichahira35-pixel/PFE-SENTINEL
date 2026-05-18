import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, RefreshCw, Search, ArrowRight } from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get } from '../../services/api';
import './InventairesAValiderResp.css';

function formatDt(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '-';
  }
}

function formatMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 3 });
}

function perimeterLabel(inv) {
  if (!inv) return '-';
  if (String(inv.type_inventaire) === 'GLOBAL') return 'Tous les articles';
  const zone = inv.zone_id?.name ? `Zone: ${inv.zone_id.name}` : '';
  const fam = inv.famille_id ? `Famille: ${inv.famille_id}` : '';
  const cat = inv.categorie_id?.name ? `Catégorie: ${inv.categorie_id.name}` : '';
  return [zone, fam, cat].filter(Boolean).join(' | ') || '-';
}

const InventairesAValiderResp = ({ userName, onLogout }) => {
  const toast = useToast();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = await get('/inventory/responsable/to-validate');
      setItems(Array.isArray(payload?.items) ? payload.items : []);
    } catch (err) {
      toast.error(err.message || 'Erreur chargement inventaires à valider');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return items;
    return items.filter((x) => {
      const inv = x.inventory || {};
      const ref = String(inv.reference || '').toLowerCase();
      const mag = String(inv.magasin_id?.name || '').toLowerCase();
      const magUser = String(inv.magasinier_id?.username || '').toLowerCase();
      return ref.includes(q) || mag.includes(q) || magUser.includes(q);
    });
  }, [items, query]);

  const totals = useMemo(() => {
    const total = filtered.length;
    const deltas = filtered.reduce((acc, x) => acc + Number(x?.stats?.deltas_count || 0), 0);
    const totalAbsValue = filtered.reduce((acc, x) => acc + Number(x?.stats?.total_value_abs || 0), 0);
    return { total, deltas, totalAbsValue };
  }, [filtered]);

  return (
    <ProtectedPage userName={userName}>
      <div className="app-layout">
        <div className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`} onClick={() => setSidebarCollapsed(true)} />
        <SidebarResp collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} onLogout={onLogout} userName={userName} />

        <div className="main-container">
          <HeaderPage userName={userName} title="Inventaires à valider" showSearch={false} onMenuClick={() => setSidebarCollapsed((p) => !p)} />
          <main className="main-content">
            {isLoading && <LoadingSpinner overlay text="Chargement..." />}

            <section className="inv-validate-card">
              <div className="inv-validate-head">
                <h3><ClipboardCheck size={18} /> Inventaires (A_VALIDER)</h3>
                <div className="inv-validate-actions">
                  <div className="inv-validate-search">
                    <Search size={16} />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher (réf, magasin, magasinier)..." />
                  </div>
                  <button className="inv-btn" type="button" onClick={load} disabled={isLoading}>
                    <RefreshCw size={16} /> Actualiser
                  </button>
                </div>
              </div>

              <div className="inv-validate-summary">
                <span>À traiter: <strong>{totals.total}</strong></span>
                <span>Écarts: <strong>{totals.deltas}</strong></span>
                <span>Valeur totale écarts (abs): <strong>{formatMoney(totals.totalAbsValue)}</strong></span>
              </div>

              <div className="inv-table-wrap">
                <table className="inv-table">
                  <thead>
                    <tr>
                      <th>Référence</th>
                      <th>Type</th>
                      <th>Magasin</th>
                      <th>Zone/Famille/Catégorie</th>
                      <th>Magasinier</th>
                      <th>Date soumission</th>
                      <th>Articles</th>
                      <th>Écarts</th>
                      <th>Valeur écarts</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((x) => {
                      const inv = x.inventory || {};
                      const stats = x.stats || {};
                      return (
                        <tr key={inv._id}>
                          <td><strong>{inv.reference}</strong></td>
                          <td>{inv.type_inventaire}</td>
                          <td>{inv.magasin_id?.name || '-'}</td>
                          <td>{perimeterLabel(inv)}</td>
                          <td>{inv.magasinier_id?.username || '-'}</td>
                          <td>{formatDt(inv.submitted_at)}</td>
                          <td>{Number(stats.total_articles || 0)}</td>
                          <td>{Number(stats.deltas_count || 0)}</td>
                          <td>{formatMoney(stats.total_value_abs)}</td>
                          <td>
                            <button className="inv-btn primary" type="button" onClick={() => navigate(`/responsable/inventaires/analyse/${inv._id}`)}>
                              <ArrowRight size={16} /> Analyser
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {!filtered.length && (
                      <tr>
                        <td colSpan={10}>
                          <div className="inv-empty">Aucun inventaire à valider.</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        </div>
      </div>
    </ProtectedPage>
  );
};

export default InventairesAValiderResp;

