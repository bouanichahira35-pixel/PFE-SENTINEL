import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ClipboardCheck, ClipboardList, Info, RefreshCw, Rocket, RotateCcw, Search, XCircle } from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get, post } from '../../services/api';
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
  const product = inv.product_id?.name
    ? `Produit: ${inv.product_id.code_product || ''} ${inv.product_id.name}`.trim()
    : '';
  const fam = inv.famille_id ? `Famille: ${inv.famille_id}` : '';
  const cat = inv.categorie_id?.name ? `Catégorie: ${inv.categorie_id.name}` : '';
  return [product, fam, cat].filter(Boolean).join(' | ') || '-';
}

function assignedMagasiniersLabel(inv) {
  const names = [];
  const seen = new Set();
  const pushName = (u) => {
    const name = String(u?.username || '').trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    names.push(name);
  };

  if (Array.isArray(inv?.magasinier_ids)) inv.magasinier_ids.forEach(pushName);
  pushName(inv?.magasinier_id);
  return names.length ? names.join(', ') : '-';
}

const InventairesAValiderResp = ({ userName, onLogout }) => {
  const toast = useToast();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);
  const [actionBusyId, setActionBusyId] = useState('');
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');

  const [showRecountModal, setShowRecountModal] = useState(false);
  const [recountTarget, setRecountTarget] = useState(null);
  const [recountMotif, setRecountMotif] = useState('');
  const [recountScope, setRecountScope] = useState('all_deltas'); // all_deltas | critical_deltas

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
      const product = `${inv.product_id?.code_product || ''} ${inv.product_id?.name || ''}`.toLowerCase();
      const magUser = assignedMagasiniersLabel(inv).toLowerCase();
      return ref.includes(q) || mag.includes(q) || product.includes(q) || magUser.includes(q);
    });
  }, [items, query]);

  const totals = useMemo(() => {
    const total = filtered.length;
    const deltas = filtered.reduce((acc, x) => acc + Number(x?.stats?.deltas_count || 0), 0);
    const totalAbsValue = filtered.reduce((acc, x) => acc + Number(x?.stats?.total_value_abs || 0), 0);
    const totalArticles = filtered.reduce((acc, x) => acc + Number(x?.stats?.total_articles || 0), 0);
    return { total, deltas, totalAbsValue, totalArticles };
  }, [filtered]);

  const validateInventory = async (invId, reference) => {
    const ok = window.confirm(`Valider l’inventaire ${reference || ''} ? Cette action ajuste définitivement le stock.`);
    if (!ok) return;
    setActionBusyId(String(invId));
    try {
      await post(`/inventory/responsable/inventories/${invId}/validate`, {});
      toast.success('Inventaire validé et stock ajusté');
      await load();
    } catch (err) {
      toast.error(err.message || 'Erreur validation');
    } finally {
      setActionBusyId('');
    }
  };

  const openRecount = (inv) => {
    setRecountTarget(inv || null);
    setRecountMotif('');
    setRecountScope('all_deltas');
    setShowRecountModal(true);
  };

  const requestRecount = async () => {
    const invId = recountTarget?._id;
    const motif = String(recountMotif || '').trim();
    if (!invId) return;
    if (motif.length < 5) {
      toast.error('Motif obligatoire (min 5 caractères)');
      return;
    }
    setActionBusyId(String(invId));
    try {
      const r = await post(`/inventory/responsable/inventories/${invId}/recount-request`, {
        motif,
        scope: recountScope,
        line_ids: [],
      });
      toast.success(`Recomptage demandé (${r?.targets_count || 0} ligne(s))`);
      setShowRecountModal(false);
      setRecountTarget(null);
      await load();
    } catch (err) {
      toast.error(err.message || 'Erreur recomptage');
    } finally {
      setActionBusyId('');
    }
  };

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
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher (réf, produit, magasin, magasiniers)..." />
                  </div>
                  <button className="inv-btn primary" type="button" onClick={() => navigate('/responsable/inventaires/lancer')} disabled={isLoading}>
                    <Rocket size={16} /> Lancer un inventaire
                  </button>
                  <button className="inv-btn" type="button" onClick={() => navigate('/responsable/inventaires')} disabled={isLoading}>
                    <ClipboardList size={16} /> Tous les inventaires
                  </button>
                  <button className="inv-btn" type="button" onClick={load} disabled={isLoading}>
                    <RefreshCw size={16} /> Actualiser
                  </button>
                </div>
              </div>

              <div className="inv-validate-kpis">
                <div className="kpi">
                  <div className="k">À traiter</div>
                  <div className="v">{totals.total}</div>
                </div>
                <div className="kpi warn">
                  <div className="k">Écarts</div>
                  <div className="v">{totals.deltas}</div>
                </div>
                <div className="kpi money">
                  <div className="k">Valeur écarts (abs)</div>
                  <div className="v">{formatMoney(totals.totalAbsValue)}</div>
                </div>
                <div className="kpi info">
                  <div className="k">Articles</div>
                  <div className="v">{totals.totalArticles}</div>
                </div>
              </div>

              {filtered.length ? (
                <div className="inv-validate-list">
                  {filtered.map((x) => {
                    const inv = x.inventory || {};
                    const stats = x.stats || {};
                    const busy = String(actionBusyId) === String(inv._id);
                    return (
                      <div key={inv._id} className="inv-validate-item">
                        <div className="inv-validate-main">
                          <div className="inv-validate-ref">
                            <strong>{inv.reference}</strong>
                            <span className="inv-validate-status">A_VALIDER</span>
                          </div>
                          <div className="inv-validate-meta">
                            <span>Type: <strong>{String(inv.type_inventaire) === 'GLOBAL' ? 'Général' : 'Tournant'}</strong></span>
                            <span>Magasin: <strong>{inv.magasin_id?.name || '-'}</strong></span>
                            <span>Périmètre: <strong>{perimeterLabel(inv)}</strong></span>
                            <span>Magasiniers: <strong>{assignedMagasiniersLabel(inv)}</strong></span>
                            <span>Soumis: <strong>{formatDt(inv.submitted_at)}</strong></span>
                          </div>
                          <div className="inv-validate-stats">
                            <span>Articles: <strong>{Number(stats.total_articles || 0)}</strong></span>
                            <span>Écarts: <strong>{Number(stats.deltas_count || 0)}</strong></span>
                            <span>Valeur: <strong>{formatMoney(stats.total_value_abs)}</strong></span>
                          </div>
                        </div>
                        <div className="inv-validate-buttons">
                          <button className="inv-btn" type="button" onClick={() => navigate(`/responsable/inventaires/analyse/${inv._id}`)} disabled={busy}>
                            <ArrowRight size={16} /> Voir détails
                          </button>
                          <button className="inv-btn primary" type="button" onClick={() => validateInventory(inv._id, inv.reference)} disabled={busy}>
                            <CheckCircle2 size={16} /> Valider
                          </button>
                          <button className="inv-btn warning" type="button" onClick={() => openRecount(inv)} disabled={busy}>
                            <RotateCcw size={16} /> Recomptage
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="inv-empty">
                  Aucun inventaire à valider.
                </div>
              )}
            </section>

            {showRecountModal ? (
              <div className="inv-modal-backdrop" onClick={() => setShowRecountModal(false)}>
                <div className="inv-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="inv-modal-head">
                    <strong>Demander recomptage</strong>
                    <button className="inv-btn" type="button" onClick={() => setShowRecountModal(false)}>
                      <XCircle size={16} /> Fermer
                    </button>
                  </div>
                  <div className="inv-modal-body">
                    <div className="inv-modal-hint">
                      <Info size={16} /> Inventaire: <strong>{recountTarget?.reference || '-'}</strong>
                    </div>

                    <label>Motif (obligatoire)</label>
                    <textarea value={recountMotif} onChange={(e) => setRecountMotif(e.target.value)} rows={3} placeholder="Ex: écarts importants sur articles critiques…" />

                    <label>Portée</label>
                    <div className="inv-radio-row">
                      <label><input type="radio" name="scope" checked={recountScope === 'all_deltas'} onChange={() => setRecountScope('all_deltas')} /> Toutes les lignes en écart</label>
                      <label><input type="radio" name="scope" checked={recountScope === 'critical_deltas'} onChange={() => setRecountScope('critical_deltas')} /> Lignes critiques en écart</label>
                    </div>

                    <div className="inv-modal-actions">
                      <button className="inv-btn warning" type="button" onClick={requestRecount} disabled={String(actionBusyId) === String(recountTarget?._id)}>
                        <RotateCcw size={16} /> Envoyer la demande
                      </button>
                      <button className="inv-btn" type="button" onClick={() => setShowRecountModal(false)}>
                        Annuler
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </ProtectedPage>
  );
};

export default InventairesAValiderResp;