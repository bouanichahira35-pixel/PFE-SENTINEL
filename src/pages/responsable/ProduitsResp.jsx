import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Archive, Package, Pencil, RefreshCw } from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { get, post, put } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import './ProduitsResp.css';

const FAMILY_LABEL = {
  economat: 'Économat',
  produit_chimique: 'Produit chimique',
  gaz: 'Gaz',
  consommable_laboratoire: 'Consommable laboratoire',
  consommable_informatique: 'Consommable informatique',
};

const INACTIVE_REASON_LABEL = {
  rupture: 'Rupture',
  no_demand: 'Manque de demandes',
};

function computeProductStockStatus(quantity, seuil) {
  const q = Number(quantity || 0);
  const s = Number(seuil || 0);
  if (q <= 0) return 'rupture';
  if (q <= s) return 'sous_seuil';
  return 'ok';
}

const ProduitsResp = ({ userName, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const lastUrlQRef = useRef('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | ok | sous_seuil | rupture
  const [validationFilter, setValidationFilter] = useState('all'); // all | approved | pending | rejected
  const [products, setProducts] = useState([]);
  const [inactiveReasonFilter, setInactiveReasonFilter] = useState('all'); // all | rupture | no_demand
  const [inactiveDays, setInactiveDays] = useState(60);
  const [categories, setCategories] = useState([]);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editDraft, setEditDraft] = useState(null);

  const categoryFilterId = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    return String(params.get('category') || '').trim();
  }, [location.search]);

  const urlQuery = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    return String(params.get('q') || '').trim();
  }, [location.search]);

  useEffect(() => {
    const prev = lastUrlQRef.current;
    if (urlQuery === prev) return;
    lastUrlQRef.current = urlQuery;

    const current = String(search || '').trim();
    if (urlQuery && (!current || current === prev)) setSearch(urlQuery);
    if (!urlQuery && current === prev) setSearch('');
  }, [search, urlQuery]);

  const includeArchived = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    return String(params.get('include_archived') || '').trim() === '1';
  }, [location.search]);

  const archivedOnly = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    return String(params.get('archived_only') || '').trim() === '1';
  }, [location.search]);

  const inactiveOnly = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    return String(params.get('inactive_only') || '').trim() === '1';
  }, [location.search]);

  const quickFilter = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    return String(params.get('filter') || '').trim().toLowerCase();
  }, [location.search]);

  const criticalOnly = quickFilter === 'critiques';
  const lotsOnly = quickFilter === 'lots';

  const clearQuickFilter = useCallback(() => {
    const params = new URLSearchParams(location.search || '');
    params.delete('filter');
    const nextSearch = params.toString();
    navigate({ pathname: '/responsable/produits', search: nextSearch ? `?${nextSearch}` : '' });
  }, [location.search, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (inactiveOnly) {
        const payload = await get(`/products/inactive?days=${Math.max(1, Math.min(365, Number(inactiveDays || 60)))}`);
        setProducts(Array.isArray(payload?.items) ? payload.items : []);
      } else {
        const data = await get(`/products?include_archived=${includeArchived ? '1' : '0'}`);
        setProducts(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      toast.error(err?.message || 'Erreur chargement produits');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [includeArchived, inactiveDays, inactiveOnly, toast]);

  const loadCategories = useCallback(async () => {
    try {
      const data = await get('/categories?include_archived=0').catch(() => get('/categories'));
      const items = Array.isArray(data) ? data : [];
      const active = items.filter((c) => String(c?.lifecycle_status || 'active') !== 'archived');
      setCategories(active);
    } catch {
      setCategories([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (inactiveOnly) loadCategories();
  }, [inactiveOnly, loadCategories]);

  const filtered = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    return (products || []).filter((p) => {
      const lifecycle = String(p?.lifecycle_status || 'active');
      if (archivedOnly && lifecycle !== 'archived') return false;
      if (inactiveOnly && lifecycle !== 'active') return false;

      const name = String(p?.name || '').toLowerCase();
      const code = String(p?.code_product || '').toLowerCase();
      const category = String(p?.category?.name || '').toLowerCase();
      const family = String(p?.family || '').toLowerCase();

      const matchesSearch = !q || name.includes(q) || code.includes(q) || category.includes(q) || family.includes(q);
      if (!matchesSearch) return false;

      const stockStatus = computeProductStockStatus(p?.quantity_current, p?.seuil_minimum);
      const matchesStatus = criticalOnly
        ? (stockStatus === 'rupture' || stockStatus === 'sous_seuil')
        : (statusFilter === 'all' || stockStatus === statusFilter);
      if (!matchesStatus) return false;

      if (!inactiveOnly) {
        const v = String(p?.validation_status || 'pending');
        const matchesValidation = validationFilter === 'all' || v === validationFilter;
        if (!matchesValidation) return false;
      } else {
        const reason = String(p?.inactive_reason || '').trim();
        if (inactiveReasonFilter !== 'all' && reason !== inactiveReasonFilter) return false;
      }

      if (categoryFilterId) {
        const productCategoryId = p?.category?._id ? String(p.category._id) : '';
        if (productCategoryId !== categoryFilterId) return false;
      }

      return true;
    });
  }, [
    archivedOnly,
    categoryFilterId,
    criticalOnly,
    inactiveOnly,
    inactiveReasonFilter,
    products,
    search,
    statusFilter,
    validationFilter,
  ]);

  const openEdit = useCallback((p) => {
    if (!p?._id) return;
    setEditDraft({
      id: String(p._id),
      name: String(p?.name || ''),
      category: p?.category?._id ? String(p.category._id) : '',
      family: String(p?.family || ''),
      unite: String(p?.unite || ''),
      emplacement: String(p?.emplacement || ''),
      seuil_minimum: String(p?.seuil_minimum ?? ''),
      quantity_current: String(p?.quantity_current ?? ''),
      description: String(p?.description || ''),
    });
    setEditModalOpen(true);
  }, []);

  const closeEdit = useCallback(() => {
    setEditModalOpen(false);
    setEditDraft(null);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editDraft?.id) return;

    const name = String(editDraft.name || '').trim();
    if (name.length < 2) {
      toast.error('Nom produit invalide (min 2 caractères).');
      return;
    }

    const seuil = Number(editDraft.seuil_minimum);
    const qty = Number(editDraft.quantity_current);
    if (!Number.isFinite(seuil) || seuil < 0 || !Number.isFinite(qty) || qty < 0) {
      toast.error('Stock / seuil invalides (>= 0).');
      return;
    }

    setSubmitting(true);
    try {
      await put(`/products/${editDraft.id}`, {
        name,
        description: String(editDraft.description || ''),
        category: editDraft.category || undefined,
        family: editDraft.family || undefined,
        unite: String(editDraft.unite || ''),
        emplacement: String(editDraft.emplacement || ''),
        seuil_minimum: seuil,
        quantity_current: qty,
      });
      toast.success('Produit mis à jour.');
      closeEdit();
      await load();
    } catch (err) {
      toast.error(err?.message || 'Échec modification produit');
    } finally {
      setSubmitting(false);
    }
  }, [closeEdit, editDraft, load, toast]);

  const archiveProduct = useCallback(async (p) => {
    if (!p?._id) return;

    const code = p?.code_product || '';
    const name = p?.name || 'Produit';
    const reasonLabel = INACTIVE_REASON_LABEL[String(p?.inactive_reason || '')] || 'Inactivité';

    const confirmed = window.confirm(`Archiver le produit ${code ? `${code} — ` : ''}${name} ?`);
    if (!confirmed) return;

    const suggested = `${reasonLabel} (depuis ${inactiveDays}j)`;
    const reason = window.prompt("Raison de l'archivage (optionnel) :", suggested) ?? '';

    setSubmitting(true);
    try {
      await post(`/products/${String(p._id)}/archive`, { reason });
      toast.success('Produit archivé.');
      await load();
    } catch (err) {
      toast.error(err?.message || "Échec archivage produit");
    } finally {
      setSubmitting(false);
    }
  }, [inactiveDays, load, toast]);

  const title = inactiveOnly ? 'Produits inactifs' : 'Référentiel Produits';
  const subtitle = inactiveOnly
    ? `Rupture ou manque de demandes (fenêtre ${inactiveDays} jours)`
    : 'Catalogue produits — stock & validation';

  return (
    <ProtectedPage userName={userName}>
      <div className="resp-products">
        <div className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`} onClick={() => setSidebarCollapsed(true)} />
        <SidebarResp
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((p) => !p)}
          onLogout={onLogout}
          userName={userName}
        />

        <div className="resp-products-main">
          <HeaderPage
            userName={userName}
            title={title}
            subtitle={subtitle}
            icon={<Package size={24} />}
            searchValue={search}
            onSearchChange={setSearch}
            onRefresh={load}
            onMenuClick={() => setSidebarCollapsed((p) => !p)}
          />

          {(loading || submitting) && <LoadingSpinner overlay text="Chargement..." />}

          <div className="resp-products-page">
            <div className="resp-products-toolbar">
              <div className="resp-products-filters">
                {inactiveOnly && (
                  <label className="resp-products-filter">
                    <span>Fenêtre</span>
                    <select value={inactiveDays} onChange={(e) => setInactiveDays(Number(e.target.value || 60))} disabled={loading || submitting}>
                      <option value={30}>30 jours</option>
                      <option value={60}>60 jours</option>
                      <option value={90}>90 jours</option>
                      <option value={180}>180 jours</option>
                    </select>
                  </label>
                )}
                <label className="resp-products-filter">
                  <span>Stock</span>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} disabled={loading}>
                    <option value="all">Tous</option>
                    <option value="ok">OK</option>
                    <option value="sous_seuil">Sous seuil</option>
                    <option value="rupture">Rupture</option>
                  </select>
                </label>
                {!inactiveOnly ? (
                  <label className="resp-products-filter">
                    <span>Validation</span>
                    <select value={validationFilter} onChange={(e) => setValidationFilter(e.target.value)} disabled={loading}>
                      <option value="all">Tous</option>
                      <option value="approved">Validés</option>
                      <option value="pending">En attente</option>
                      <option value="rejected">Rejetés</option>
                    </select>
                  </label>
                ) : (
                  <label className="resp-products-filter">
                    <span>Raison</span>
                    <select value={inactiveReasonFilter} onChange={(e) => setInactiveReasonFilter(e.target.value)} disabled={loading || submitting}>
                      <option value="all">Toutes</option>
                      <option value="rupture">Rupture</option>
                      <option value="no_demand">Manque de demandes</option>
                    </select>
                  </label>
                )}
              </div>
              <div className="resp-products-actions">
                {!inactiveOnly && (
                  <button className="btn" type="button" onClick={() => navigate('/responsable/pilotage?tab=validations')}>
                    <RefreshCw size={16} />
                    Validations
                  </button>
                )}
              </div>
            </div>

            {(criticalOnly || lotsOnly) && (
              <div className="resp-products-quickfilter" role="status" aria-label="Filtre rapide">
                <span className="resp-products-quickfilter-chip">
                  Filtre rapide : {criticalOnly ? 'Produits critiques' : 'Lots à surveiller'}
                </span>
                <button className="resp-products-quickfilter-clear" type="button" onClick={clearQuickFilter} disabled={loading || submitting}>
                  Effacer
                </button>
              </div>
            )}

            <div className="resp-products-card">
              <table className="resp-products-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Produit</th>
                    <th>Catégorie</th>
                    <th>Famille</th>
                    <th>Stock</th>
                    <th>Seuil</th>
                    <th>Statut</th>
                    {inactiveOnly ? (
                      <>
                        <th>Raison</th>
                        <th>Dernière demande</th>
                        <th>Actions</th>
                      </>
                    ) : (
                      <th>Validation</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 120).map((p) => {
                    const stock = Number(p?.quantity_current || 0);
                    const seuil = Number(p?.seuil_minimum || 0);
                    const stockStatus = computeProductStockStatus(stock, seuil);
                    const validation = String(p?.validation_status || 'pending');
                    const familyLabel = FAMILY_LABEL[String(p?.family || '')] || (p?.family || '-');
                    const inactiveReason = String(p?.inactive_reason || '');
                    const lastReq = p?.last_request_at ? new Date(p.last_request_at).toLocaleString('fr-FR') : '-';
                    return (
                      <tr key={String(p?._id)}>
                        <td className="muted">{p?.code_product || '-'}</td>
                        <td className="prod-name">{p?.name || 'Produit'}</td>
                        <td className="muted">{p?.category?.name || '-'}</td>
                        <td className="muted">{familyLabel}</td>
                        <td className={stockStatus !== 'ok' ? 'overdue' : 'muted'}>{stock}</td>
                        <td className="muted">{seuil}</td>
                        <td>
                          <span className={`pill ${stockStatus}`}>
                            {stockStatus === 'ok' ? 'OK' : stockStatus === 'sous_seuil' ? 'Sous seuil' : 'Rupture'}
                          </span>
                        </td>
                        {inactiveOnly ? (
                          <>
                            <td>
                              <span className={`pill ${inactiveReason}`}>
                                {INACTIVE_REASON_LABEL[inactiveReason] || '-'}
                              </span>
                            </td>
                            <td className="muted">{lastReq}</td>
                            <td>
                              <div className="resp-products-row-actions">
                                <button className="btn" type="button" onClick={() => openEdit(p)} disabled={submitting}>
                                  <Pencil size={16} /> Modifier
                                </button>
                                <button className="btn" type="button" onClick={() => archiveProduct(p)} disabled={submitting}>
                                  <Archive size={16} /> Archiver
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <td>
                            <span className={`pill ${validation}`}>
                              {validation === 'approved' ? 'Validé' : validation === 'rejected' ? 'Rejeté' : 'En attente'}
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {!loading && filtered.length === 0 && (
                <div className="resp-products-empty">
                  Aucun produit ne correspond aux filtres.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {editModalOpen && editDraft && (
        <div className="prod-modal-backdrop" role="dialog" aria-modal="true" onClick={closeEdit}>
          <div className="prod-modal" onClick={(e) => e.stopPropagation()}>
            <div className="prod-modal-head">
              <div>
                <strong>Modifier produit</strong>
                <div className="muted">{editDraft.id}</div>
              </div>
              <button className="btn" type="button" onClick={closeEdit} disabled={submitting}>Fermer</button>
            </div>

            <div className="prod-modal-body">
              <div className="prod-form-grid">
                <label className="prod-field prod-field-wide">
                  <span>Nom *</span>
                  <input value={editDraft.name} onChange={(e) => setEditDraft((p) => ({ ...p, name: e.target.value }))} maxLength={140} />
                </label>

                <label className="prod-field">
                  <span>Catégorie</span>
                  <select value={editDraft.category} onChange={(e) => setEditDraft((p) => ({ ...p, category: e.target.value }))}>
                    <option value="">-- Aucune --</option>
                    {categories.map((c) => (
                      <option key={String(c._id)} value={String(c._id)}>{c.name}</option>
                    ))}
                  </select>
                </label>

                <label className="prod-field">
                  <span>Famille</span>
                  <select value={editDraft.family} onChange={(e) => setEditDraft((p) => ({ ...p, family: e.target.value }))}>
                    <option value="">--</option>
                    {Object.keys(FAMILY_LABEL).map((k) => (
                      <option key={k} value={k}>{FAMILY_LABEL[k]}</option>
                    ))}
                  </select>
                </label>

                <label className="prod-field">
                  <span>Unité</span>
                  <input value={editDraft.unite} onChange={(e) => setEditDraft((p) => ({ ...p, unite: e.target.value }))} maxLength={40} />
                </label>

                <label className="prod-field">
                  <span>Emplacement</span>
                  <input value={editDraft.emplacement} onChange={(e) => setEditDraft((p) => ({ ...p, emplacement: e.target.value }))} maxLength={120} />
                </label>

                <label className="prod-field">
                  <span>Stock</span>
                  <input type="number" min="0" value={editDraft.quantity_current} onChange={(e) => setEditDraft((p) => ({ ...p, quantity_current: e.target.value }))} />
                </label>

                <label className="prod-field">
                  <span>Seuil minimum</span>
                  <input type="number" min="0" value={editDraft.seuil_minimum} onChange={(e) => setEditDraft((p) => ({ ...p, seuil_minimum: e.target.value }))} />
                </label>

                <label className="prod-field prod-field-wide">
                  <span>Description</span>
                  <textarea value={editDraft.description} onChange={(e) => setEditDraft((p) => ({ ...p, description: e.target.value }))} rows={3} maxLength={600} />
                </label>
              </div>
              <div className="prod-hint">
                Les produits archivés ne sont plus utilisables (demandes / mouvements / sorties bloqués).
              </div>
            </div>

            <div className="prod-modal-footer">
              <button className="btn" type="button" onClick={closeEdit} disabled={submitting}>Annuler</button>
              <button className="btn primary" type="button" onClick={saveEdit} disabled={submitting}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </ProtectedPage>
  );
};

export default ProduitsResp;
