import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Dot,
  FolderOpen,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Tags,
  X,
} from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import ProtectedPage from '../../components/shared/ProtectedPage';
import { useToast } from '../../components/shared/Toast';
import { del, get, patch, post } from '../../services/api';
import './CategoriesResp.css';

const FAMILY_LABEL = {
  economat: 'Économat',
  produit_chimique: 'Produit chimique',
  gaz: 'Gaz',
  consommable_laboratoire: 'Consommable laboratoire',
  consommable_informatique: 'Consommable informatique',
};

const AUDIENCE_LABEL = {
  bureautique: 'Bureautique',
  menage: 'Ménage',
  petrole: 'Pétrole / Terrain',
};

const EMPTY_FORM = {
  name: '',
  description: '',
  parent_family: '',
  audiences: [],
  tags: [],
  visible_metiers: [],
  visible_sites: [],
  visible_services: [],
  is_sensitive: false,
  requires_special_validation: false,
  requires_fds: false,
  requires_lot_tracking: false,
  requires_expiry_date: false,
};

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function similarityRatio(a, b) {
  const s1 = normalizeName(a);
  const s2 = normalizeName(b);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.92;
  const set1 = new Set(s1.split(' ').filter(Boolean));
  const set2 = new Set(s2.split(' ').filter(Boolean));
  const inter = [...set1].filter((x) => set2.has(x)).length;
  const union = new Set([...set1, ...set2]).size;
  return union ? inter / union : 0;
}

function computeCategoryScore({ category, productStats, allNames }) {
  let score = 100;
  const hasDescription = Boolean(String(category?.description || '').trim());
  const hasFamily = Boolean(String(category?.parent_family || '').trim());
  const hasAudience = Array.isArray(category?.audiences) && category.audiences.length > 0;
  const hasTags = Array.isArray(category?.tags) && category.tags.length > 0;
  const products = Number(productStats?.products || 0);
  const normalized = normalizeName(category?.name || '');
  const probableDuplicate = normalized
    ? allNames.some((n) => n !== normalized && (n === normalized || similarityRatio(n, normalized) >= 0.85))
    : false;

  if (!hasDescription) score -= 15;
  if (!hasFamily) score -= 15;
  if (!hasAudience) score -= 10;
  if (!hasTags) score -= 10;
  if (products <= 0) score -= 20;
  if (probableDuplicate) score -= 20;

  score = Math.max(0, Math.min(100, score));
  return { score, flags: { hasDescription, hasFamily, hasAudience, hasTags, products, probableDuplicate } };
}

export default function CategoriesResp({ userName, onLogout }) {
  const toast = useToast();
  const navigate = useNavigate();

  const pageTitle = 'Gestion du référentiel produit';

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false,
  );

  const [allCategories, setAllCategories] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [formError, setFormError] = useState('');

  const [statusFilter, setStatusFilter] = useState('active'); // active|archived|all
  const [searchTerm, setSearchTerm] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [advancedVisibilityOpen, setAdvancedVisibilityOpen] = useState(false);

  const [openMenuForId, setOpenMenuForId] = useState(null);
  const menuRef = useRef(null);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setPageError('');
    try {
      const [cats, prods] = await Promise.all([
        get(statusFilter === 'all' ? '/categories?include_archived=1' : `/categories?include_archived=${statusFilter === 'archived' ? '1' : '0'}`),
        get('/products?include_archived=1').catch(() => get('/products?include_archived=0')),
      ]);

      const catItems = Array.isArray(cats) ? cats : [];
      const productItems = Array.isArray(prods) ? prods : [];

      setAllCategories(catItems);

      const visibleCats = statusFilter === 'archived'
        ? catItems.filter((c) => String(c?.lifecycle_status || 'active') === 'archived')
        : statusFilter === 'active'
          ? catItems.filter((c) => String(c?.lifecycle_status || 'active') !== 'archived')
          : catItems;

      setCategories(visibleCats);
      setProducts(productItems);
    } catch (err) {
      setAllCategories([]);
      setCategories([]);
      setProducts([]);
      setPageError(err?.message || 'Erreur chargement référentiel');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!openMenuForId) return;
      const el = menuRef.current;
      if (el && el.contains(e.target)) return;
      setOpenMenuForId(null);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [openMenuForId]);

  const productStatsByCategoryId = useMemo(() => {
    const stats = new Map();
    for (const p of products || []) {
      const catId = p?.category?._id ? String(p.category._id) : '';
      if (!catId) continue;
      if (!stats.has(catId)) {
        stats.set(catId, { products: 0, total_products: 0, archived_products: 0, rupture: 0, sous_seuil: 0, sensibles: 0 });
      }
      const item = stats.get(catId);
      item.total_products += 1;

      const lifecycle = String(p?.lifecycle_status || 'active');
      const isActive = lifecycle !== 'archived';
      if (!isActive) {
        item.archived_products += 1;
        continue;
      }

      item.products += 1;
      const status = String(p?.status || '').toLowerCase();
      if (status === 'rupture') item.rupture += 1;
      if (status === 'sous_seuil') item.sous_seuil += 1;
      if (String(p?.family || '') === 'produit_chimique' || Boolean(p?.chemical_class)) item.sensibles += 1;
    }
    return stats;
  }, [products]);

  const unclassifiedProductCount = useMemo(() => {
    return (products || []).filter((p) => !p?.category?._id).length;
  }, [products]);

  const normalizedNames = useMemo(() => {
    return (allCategories || [])
      .map((c) => normalizeName(c?.name || ''))
      .filter(Boolean);
  }, [allCategories]);

  const enrichedCategories = useMemo(() => {
    return (allCategories || []).map((category) => {
      const id = String(category?._id || '');
      const stats = productStatsByCategoryId.get(id) || { products: 0, rupture: 0, sous_seuil: 0, sensibles: 0 };
      const { score, flags } = computeCategoryScore({ category, productStats: stats, allNames: normalizedNames });
      return { category, stats, score, flags };
    });
  }, [allCategories, normalizedNames, productStatsByCategoryId]);

  const visibleCategoryIdSet = useMemo(() => {
    return new Set((categories || []).map((c) => String(c?._id || '')));
  }, [categories]);

  const visibleEnrichedCategories = useMemo(() => {
    return enrichedCategories.filter((x) => visibleCategoryIdSet.has(String(x?.category?._id || '')));
  }, [enrichedCategories, visibleCategoryIdSet]);

  const filtered = useMemo(() => {
    const needle = String(searchTerm || '').toLowerCase().trim();
    if (!needle) return visibleEnrichedCategories;
    return visibleEnrichedCategories.filter(({ category }) => {
      const name = String(category?.name || '').toLowerCase();
      const desc = String(category?.description || '').toLowerCase();
      return name.includes(needle) || desc.includes(needle);
    });
  }, [searchTerm, visibleEnrichedCategories]);

  const kpis = useMemo(() => {
    const activeCount = enrichedCategories.filter(({ category }) => String(category?.lifecycle_status || 'active') !== 'archived').length;
    const sensitiveCount = enrichedCategories.filter(({ category }) => Boolean(category?.is_sensitive)).length;
    const toComplete = enrichedCategories.filter(({ score }) => score < 70).length;
    const globalQuality = enrichedCategories.length
      ? Math.round(enrichedCategories.reduce((acc, x) => acc + Number(x.score || 0), 0) / enrichedCategories.length)
      : 0;
    return {
      activeCount,
      sensitiveCount,
      unclassifiedProductCount,
      toComplete,
      globalQuality,
    };
  }, [enrichedCategories, unclassifiedProductCount]);

  const cleanupSuggestions = useMemo(() => {
    const suggestions = [];
    const archivable = enrichedCategories
      .filter(({ stats }) => Number(stats.products || 0) === 0)
      .slice(0, 3);
    for (const item of archivable) {
      const total = Number(item?.stats?.total_products || 0);
      suggestions.push({
        id: `no-products-${item.category._id}`,
        type: 'archive',
        title: total > 0
          ? `La catégorie ${item.category.name} ne contient aucun produit actif.`
          : `La catégorie ${item.category.name} ne contient aucun produit.`,
        hint: total > 0
          ? 'Vous pouvez l’archiver (tous les produits sont inactifs).'
          : 'Vous pouvez l’archiver.',
        categoryIds: [String(item.category._id)],
      });
    }

    const withoutDescription = enrichedCategories.filter(({ category }) => !String(category?.description || '').trim()).slice(0, 2);
    for (const item of withoutDescription) {
      suggestions.push({
        id: `no-desc-${item.category._id}`,
        type: 'complete',
        title: `La catégorie ${item.category.name} n’a pas de description.`,
        hint: 'Complétez-la pour améliorer la qualité BI.',
        categoryIds: [String(item.category._id)],
      });
    }

    const similarPairs = [];
    for (let i = 0; i < allCategories.length; i += 1) {
      for (let j = i + 1; j < allCategories.length; j += 1) {
        const a = allCategories[i];
        const b = allCategories[j];
        const ratio = similarityRatio(a?.name || '', b?.name || '');
        if (ratio >= 0.85) {
          similarPairs.push({ a, b, ratio });
        }
      }
    }
    if (similarPairs.length) {
      const top = similarPairs.sort((x, y) => y.ratio - x.ratio)[0];
      suggestions.push({
        id: `similar-${top.a._id}-${top.b._id}`,
        type: 'merge',
        title: `Les catégories ${top.a.name} et ${top.b.name} semblent proches.`,
        hint: 'Vérifiez si une fusion est nécessaire.',
        categoryIds: [String(top.a._id), String(top.b._id)],
      });
    }

    const sensitiveWithoutValidation = enrichedCategories
      .filter(({ category }) => Boolean(category?.is_sensitive) && !Boolean(category?.requires_special_validation))
      .slice(0, 2);
    for (const item of sensitiveWithoutValidation) {
      suggestions.push({
        id: `sens-no-val-${item.category._id}`,
        type: 'complete',
        title: `Catégorie sensible sans validation spéciale : ${item.category.name}.`,
        hint: 'Activez “Validation spéciale obligatoire”.',
        categoryIds: [String(item.category._id)],
      });
    }

    return suggestions.slice(0, 6);
  }, [allCategories, enrichedCategories]);

  const openCreate = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setAdvancedVisibilityOpen(false);
    setShowForm(true);
  };

  const openEdit = (category) => {
    setEditingId(String(category?._id || ''));
    setFormData({
      name: category?.name || '',
      description: category?.description || '',
      parent_family: category?.parent_family || '',
      audiences: Array.isArray(category?.audiences) ? category.audiences : [],
      tags: Array.isArray(category?.tags) ? category.tags : [],
      visible_metiers: Array.isArray(category?.visible_metiers) ? category.visible_metiers : [],
      visible_sites: Array.isArray(category?.visible_sites) ? category.visible_sites : [],
      visible_services: Array.isArray(category?.visible_services) ? category.visible_services : [],
      is_sensitive: Boolean(category?.is_sensitive),
      requires_special_validation: Boolean(category?.requires_special_validation),
      requires_fds: Boolean(category?.requires_fds),
      requires_lot_tracking: Boolean(category?.requires_lot_tracking),
      requires_expiry_date: Boolean(category?.requires_expiry_date),
    });
    setAdvancedVisibilityOpen(
      (Array.isArray(category?.visible_metiers) && category.visible_metiers.length > 0)
      || (Array.isArray(category?.visible_sites) && category.visible_sites.length > 0)
      || (Array.isArray(category?.visible_services) && category.visible_services.length > 0)
    );
    setShowForm(true);
  };

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleFormArrayToggle = (value, field) => {
    setFormData((prev) => {
      const arr = Array.isArray(prev[field]) ? prev[field] : [];
      const exists = arr.includes(value);
      return { ...prev, [field]: exists ? arr.filter((x) => x !== value) : [...arr, value] };
    });
  };

  const toCsv = useCallback((arr) => (Array.isArray(arr) ? arr.filter(Boolean).join(', ') : ''), []);

  const fromCsv = useCallback((value) => (
    String(value || '')
      .split(',')
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .slice(0, 12)
  ), []);

  const updateCsvField = useCallback((field, value) => {
    setFormData((prev) => ({ ...prev, [field]: fromCsv(value) }));
  }, [fromCsv]);

  const impactPreview = useMemo(() => {
    const lines = ['Alimente le catalogue et les dashboards (stock, consommation, alertes).'];
    if (formData.is_sensitive) lines.push('Catégorie sensible : contrôles renforcés.');
    if (formData.requires_special_validation) lines.push('Validation spéciale obligatoire : blocage sans décision responsable.');
    if (formData.requires_fds) lines.push('FDS/Fiche technique obligatoire : document requis.');
    if (formData.requires_lot_tracking) lines.push('Suivi par lot : traçabilité activée.');
    if (formData.requires_expiry_date) lines.push('Date de péremption obligatoire : contrôle FEFO possible.');
    return lines;
  }, [formData.is_sensitive, formData.requires_expiry_date, formData.requires_fds, formData.requires_lot_tracking, formData.requires_special_validation]);

  const saveCategory = async (e) => {
    e.preventDefault();
    setFormError('');
    const payload = {
      name: String(formData.name || '').trim(),
      description: String(formData.description || ''),
      parent_family: String(formData.parent_family || ''),
      audiences: formData.audiences || [],
      tags: formData.tags || [],
      visible_metiers: formData.visible_metiers || [],
      visible_sites: formData.visible_sites || [],
      visible_services: formData.visible_services || [],
      is_sensitive: Boolean(formData.is_sensitive),
      requires_special_validation: Boolean(formData.requires_special_validation),
      requires_fds: Boolean(formData.requires_fds),
      requires_lot_tracking: Boolean(formData.requires_lot_tracking),
      requires_expiry_date: Boolean(formData.requires_expiry_date),
    };

    if (!payload.name) {
      setFormError('Nom de catégorie obligatoire.');
      return;
    }
    if (!payload.parent_family) {
      setFormError('Famille parente obligatoire.');
      return;
    }

    setIsLoading(true);
    try {
      if (editingId) {
        await patch(`/categories/${editingId}`, payload);
        toast.success('Catégorie mise à jour.');
      } else {
        await post('/categories', payload);
        toast.success('Catégorie créée.');
      }
      setShowForm(false);
      setEditingId(null);
      await loadAll();
    } catch (err) {
      setFormError(err?.message || 'Erreur sauvegarde catégorie');
    } finally {
      setIsLoading(false);
    }
  };

  const archiveCategory = async (categoryId) => {
    const reason = window.prompt('Raison (optionnel) :', '');
    setIsLoading(true);
    try {
      await post(`/categories/${categoryId}/archive`, { reason: reason || '' });
      toast.success('Catégorie archivée.');
      await loadAll();
    } catch (err) {
      toast.error(err?.message || 'Erreur archivage');
    } finally {
      setIsLoading(false);
    }
  };

  const unarchiveCategory = async (categoryId) => {
    setIsLoading(true);
    try {
      await post(`/categories/${categoryId}/unarchive`, {});
      toast.success('Catégorie restaurée.');
      await loadAll();
    } catch (err) {
      toast.error(err?.message || 'Erreur restauration');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteCategory = async ({ categoryId, hasProducts }) => {
    if (hasProducts) {
      toast.error('Suppression interdite : utilisez Archiver.');
      return;
    }
    if (!window.confirm('Suppression définitive ? Cette action est irréversible.')) return;
    setIsLoading(true);
    try {
      await del(`/categories/${categoryId}`);
      toast.success('Catégorie supprimée.');
      await loadAll();
    } catch (err) {
      toast.error(err?.message || 'Erreur suppression');
    } finally {
      setIsLoading(false);
    }
  };

  const mergeCategories = async (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    if (!window.confirm('Fusionner ces deux catégories ? Les produits seront déplacés vers la cible et la source archivée.')) return;
    setIsLoading(true);
    try {
      await post('/categories/merge', { from_id: fromId, to_id: toId });
      toast.success('Fusion effectuée.');
      await loadAll();
    } catch (err) {
      toast.error(err?.message || 'Erreur fusion');
    } finally {
      setIsLoading(false);
    }
  };

  const openProducts = (categoryId, { archivedOnly = false } = {}) => {
    const base = `/responsable/produits?include_archived=1&category=${encodeURIComponent(categoryId)}&mode=assign`;
    navigate(archivedOnly ? `${base}&archived_only=1` : base);
  };

  return (
    <ProtectedPage userName={userName}>
      <div className="app-layout">
        <div
          className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`}
          onClick={() => setSidebarCollapsed(true)}
        />
        <SidebarResp
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((prev) => !prev)}
          onLogout={onLogout}
          userName={userName}
        />

        <div className="main-container">
          <HeaderPage
            userName={userName}
            title={pageTitle}
            showSearch={false}
            onRefresh={loadAll}
            onMenuClick={() => setSidebarCollapsed((prev) => !prev)}
          />

          <main className="main-content">
            {isLoading && <LoadingSpinner overlay text="Chargement..." />}

            <div className="categories-resp-container">
              <header className="ref-header">
                <div className="ref-title">
                  <h2>
                    <FolderOpen size={24} /> Gestion du référentiel produit
                  </h2>
                  <p className="subtitle">Structurez les familles, catégories et règles de classement des produits.</p>
                </div>
              </header>

              {pageError && <div className="alert alert-error">{pageError}</div>}

              <section className="ref-kpis" aria-label="Indicateurs référentiel">
                <article className="ref-kpi">
                  <span className="kpi-label">Catégories actives</span>
                  <strong className="kpi-value">{kpis.activeCount}</strong>
                </article>
                <article className="ref-kpi danger">
                  <span className="kpi-label">Catégories sensibles</span>
                  <strong className="kpi-value">{kpis.sensitiveCount}</strong>
                </article>
                <article className="ref-kpi warning">
                  <span className="kpi-label">Produits non classés</span>
                  <strong className="kpi-value">{kpis.unclassifiedProductCount}</strong>
                </article>
                <article className="ref-kpi info">
                  <span className="kpi-label">Catégories à compléter</span>
                  <strong className="kpi-value">{kpis.toComplete}</strong>
                </article>
              </section>

              <section className="ref-quality" aria-label="Qualité du référentiel">
                <div className="ref-quality-row">
                  <div className="ref-quality-left">
                    <strong>Qualité du référentiel : {kpis.globalQuality} %</strong>
                    <span>Plus le score est élevé, plus les dashboards sont fiables.</span>
                  </div>
                  <span className={`quality-badge ${kpis.globalQuality >= 80 ? 'good' : kpis.globalQuality >= 60 ? 'mid' : 'bad'}`}>
                    {kpis.globalQuality >= 80 ? 'OK' : kpis.globalQuality >= 60 ? 'À améliorer' : 'Critique'}
                  </span>
                </div>
                <div className="ref-quality-bar" role="progressbar" aria-valuenow={kpis.globalQuality} aria-valuemin={0} aria-valuemax={100}>
                  <div className="ref-quality-bar-fill" style={{ width: `${kpis.globalQuality}%` }} />
                </div>
              </section>

              <section className="ref-controls" aria-label="Recherche et actions">
                <div className="categories-controls">
                  <div className="categories-search">
                    <Search size={18} />
                    <input
                      type="text"
                      placeholder="Rechercher une catégorie, une description..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="search-input"
                    />
                  </div>

                  <div className="ref-filter">
                    <label className="sr-only" htmlFor="statusFilter">Statut</label>
                    <select
                      id="statusFilter"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="ref-select"
                    >
                      <option value="active">Actives</option>
                      <option value="archived">Archivées</option>
                      <option value="all">Toutes</option>
                    </select>
                    <ChevronDown size={16} />
                  </div>

                  <button onClick={openCreate} className="btn btn-primary" type="button">
                    <Plus size={16} /> Créer une catégorie
                  </button>
                </div>
                <div className="ref-controls-footer">
                  <div className="ref-help-line">
                    <Dot size={20} />
                    <span>Ce référentiel structure le catalogue, les règles métier et l’analyse BI.</span>
                  </div>
                  <button type="button" className="ref-catalog-link" onClick={() => navigate('/responsable/produits')}>
                    Aller au catalogue <ArrowRight size={18} />
                  </button>
                </div>
              </section>

              <section className="ref-suggestions" aria-label="Suggestions de nettoyage">
                <header className="ref-section-head">
                  <h3><ShieldAlert size={18} /> Suggestions de nettoyage</h3>
                  <span>Actions simples basées sur règles</span>
                </header>

                {cleanupSuggestions.length === 0 ? (
                  <div className="ref-empty-suggest">
                    <CheckCircle2 size={18} />
                    <span>Aucune suggestion critique détectée.</span>
                  </div>
                ) : (
                  <div className="suggest-list">
                    {cleanupSuggestions.map((s) => (
                      <div className="suggest-item" key={s.id}>
                        <div className="suggest-main">
                          <strong>{s.title}</strong>
                          <span>{s.hint}</span>
                        </div>
                        <div className="suggest-actions">
                          {s.type === 'complete' && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                const c = allCategories.find((x) => String(x._id) === s.categoryIds[0]);
                                if (c) openEdit(c);
                              }}
                            >
                              Compléter
                            </button>
                          )}
                          {s.type === 'archive' && (
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => archiveCategory(s.categoryIds[0])}>
                              Archiver
                            </button>
                          )}
                          {s.type === 'merge' && s.categoryIds.length === 2 && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => mergeCategories(s.categoryIds[0], s.categoryIds[1])}
                            >
                              Fusionner
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              if (s.categoryIds?.length === 1) {
                                openProducts(s.categoryIds[0]);
                              } else {
                                setSearchTerm('');
                              }
                            }}
                          >
                            Voir produits concernés
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="ref-grid" aria-label="Catégories">
                {filtered.length === 0 ? (
                  <div className="empty-state">
                    <p>Aucune catégorie trouvée.</p>
                  </div>
                ) : (
                  <div className="categories-grid ref-grid-cards">
                    {filtered.map(({ category, stats, score }) => {
                      const categoryId = String(category?._id || '');
                      const activeProducts = Number(stats.products || 0);
                      const totalProducts = Number(stats.total_products || 0);
                      const hasProducts = totalProducts > 0;
                      const isArchived = String(category?.lifecycle_status || 'active') === 'archived';
                      const canArchive = !isArchived && activeProducts === 0;
                      return (
                        <article key={categoryId} className={`ref-card ${isArchived ? 'archived' : ''}`}>
                          <header className="ref-card-head">
                            <div className="ref-card-title">
                              <h4>{category.name}</h4>
                              <div className="ref-badges">
                                {isArchived && <span className="badge badge-archived">Archivée</span>}
                                {category.is_sensitive && <span className="badge badge-sensitive">Sensible</span>}
                                {category.requires_special_validation && <span className="badge badge-validation">Validation spéciale</span>}
                              </div>
                            </div>
                            <div className="ref-card-menu" ref={openMenuForId === categoryId ? menuRef : null}>
                              <button
                                type="button"
                                className="icon-btn"
                                aria-label="Menu"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuForId((prev) => (prev === categoryId ? null : categoryId));
                                }}
                              >
                                <MoreVertical size={18} />
                              </button>
                              {openMenuForId === categoryId && (
                                <div className="menu-popover" role="menu">
                                  {!isArchived ? (
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className={canArchive ? '' : 'disabled'}
                                      onClick={() => {
                                        if (!canArchive) return;
                                        archiveCategory(categoryId);
                                      }}
                                      title={canArchive ? 'Archiver la catégorie' : 'Archivage autorisé seulement si tous les produits sont inactifs.'}
                                    >
                                      Archiver
                                    </button>
                                  ) : (
                                    <button type="button" role="menuitem" onClick={() => unarchiveCategory(categoryId)}>
                                      Restaurer
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className={hasProducts ? 'disabled' : 'danger'}
                                    onClick={() => deleteCategory({ categoryId, hasProducts })}
                                  >
                                    Supprimer définitivement
                                  </button>
                                </div>
                              )}
                            </div>
                          </header>

                          <p className="ref-card-desc">{String(category.description || '').trim() || 'Aucune description.'}</p>

                          <div className="ref-card-metrics">
                            <div className="metric">
                              <span>Famille parente</span>
                              <strong>{FAMILY_LABEL[category.parent_family] || '-'}</strong>
                            </div>
                            <div className="metric">
                              <span>Produits associés</span>
                              <strong>{totalProducts}</strong>
                            </div>
                            <div className="metric">
                              <span>Rupture</span>
                              <strong className={stats.rupture > 0 ? 'bad' : ''}>{stats.rupture}</strong>
                            </div>
                            <div className="metric">
                              <span>Sous seuil</span>
                              <strong className={stats.sous_seuil > 0 ? 'mid' : ''}>{stats.sous_seuil}</strong>
                            </div>
                            <div className="metric">
                              <span>Sensibles</span>
                              <strong>{stats.sensibles}</strong>
                            </div>
                            <div className="metric">
                              <span>Score qualité</span>
                              <strong className={score >= 80 ? 'good' : score >= 60 ? 'mid' : 'bad'}>{score} %</strong>
                            </div>
                          </div>

                          <div className="ref-card-tags">
                            <div className="tag-row">
                              <span className="tag-label"><Tags size={14} /> Tags principaux</span>
                              <div className="tags-list">
                                {(category.tags || []).slice(0, 6).map((t) => (
                                  <span key={t} className="tag-badge tag-technical">{t}</span>
                                ))}
                                {(!category.tags || category.tags.length === 0) && <span className="tag-muted">Aucun</span>}
                              </div>
                            </div>
                          </div>

                          <footer className="ref-card-actions">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => openProducts(categoryId, { archivedOnly: Number(stats.products || 0) === 0 && totalProducts > 0 })}
                            >
                              Voir produits
                            </button>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(category)}>
                              <Pencil size={14} /> Modifier
                            </button>
                          </footer>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                  <div className="modal-content modal-wide" onClick={(e) => e.stopPropagation()}>
                    <div className="modal-header">
                      <h3>{editingId ? 'Modifier une catégorie' : 'Créer une catégorie'}</h3>
                      <button className="btn-close" onClick={() => setShowForm(false)} type="button">
                        <X size={16} />
                      </button>
                    </div>

                    {formError && <div className="alert alert-error">{formError}</div>}

                    <form onSubmit={saveCategory} className="ref-form">
                      <div className="ref-form-grid">
                        <section className="form-section">
                          <h4>Informations générales</h4>
                          <div className="form-group">
                            <label htmlFor="name">Nom de la catégorie *</label>
                            <input id="name" type="text" name="name" value={formData.name} onChange={handleFormChange} maxLength={60} required />
                          </div>
                          <div className="form-group">
                            <label htmlFor="description">Description</label>
                            <textarea
                              id="description"
                              name="description"
                              value={formData.description}
                              onChange={handleFormChange}
                              rows={6}
                              maxLength={400}
                              placeholder="Contexte métier, règles de classement, exemples..."
                            />
                          </div>
                        </section>

                        <section className="form-section">
                          <h4>Classification métier</h4>
                          <div className="form-group">
                            <label htmlFor="parent_family">Famille parente *</label>
                            <select id="parent_family" name="parent_family" value={formData.parent_family} onChange={handleFormChange} required>
                              <option value="">Sélectionner une famille</option>
                              {Object.keys(FAMILY_LABEL).map((k) => (
                                <option key={k} value={k}>{FAMILY_LABEL[k]}</option>
                              ))}
                            </select>
                          </div>
                          <div className="form-group">
                            <label>Audiences</label>
                            <div className="check-grid">
                              {Object.keys(AUDIENCE_LABEL).map((k) => (
                                <label key={k} className="check-item">
                                  <input
                                    type="checkbox"
                                    checked={formData.audiences.includes(k)}
                                    onChange={() => handleFormArrayToggle(k, 'audiences')}
                                  />
                                  <span>{AUDIENCE_LABEL[k]}</span>
                                </label>
                              ))}
                            </div>
                            <p className="field-hint">Si aucune audience n’est cochée : visible pour tous les profils.</p>
                          </div>

                          <div className="form-group">
                            <label>Tags techniques</label>
                            <div className="check-grid tech">
                              {['chimique', 'epi', 'entretien', 'bureautique', 'petrole'].map((t) => (
                                <label key={t} className="check-item">
                                  <input type="checkbox" checked={formData.tags.includes(t)} onChange={() => handleFormArrayToggle(t, 'tags')} />
                                  <span>{t}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          <button
                            type="button"
                            className="advanced-toggle"
                            aria-expanded={advancedVisibilityOpen}
                            onClick={() => setAdvancedVisibilityOpen((p) => !p)}
                          >
                            <span className="chev">{advancedVisibilityOpen ? '▼' : '▶'}</span>
                            Visibilité avancée (optionnel)
                          </button>
                          {advancedVisibilityOpen && (
                            <div className="advanced-visibility">
                              <div className="form-group">
                                <label>Métiers autorisés</label>
                                <input
                                  type="text"
                                  value={toCsv(formData.visible_metiers)}
                                  onChange={(e) => updateCsvField('visible_metiers', e.target.value)}
                                  placeholder="Ex: chimiste, mécanicien (séparés par virgule)"
                                />
                              </div>
                              <div className="form-group">
                                <label>Sites autorisés</label>
                                <input
                                  type="text"
                                  value={toCsv(formData.visible_sites)}
                                  onChange={(e) => updateCsvField('visible_sites', e.target.value)}
                                  placeholder="Ex: labo1, depot2"
                                />
                              </div>
                              <div className="form-group">
                                <label>Services autorisés</label>
                                <input
                                  type="text"
                                  value={toCsv(formData.visible_services)}
                                  onChange={(e) => updateCsvField('visible_services', e.target.value)}
                                  placeholder="Ex: hse, maintenance"
                                />
                              </div>
                            </div>
                          )}
                        </section>

                        <section className="form-section">
                          <h4>Règles de contrôle</h4>
                          <label className="checkbox-label large">
                            <input type="checkbox" name="is_sensitive" checked={formData.is_sensitive} onChange={handleFormChange} />
                            Catégorie sensible
                          </label>
                          <label className="checkbox-label large">
                            <input
                              type="checkbox"
                              name="requires_special_validation"
                              checked={formData.requires_special_validation}
                              onChange={handleFormChange}
                            />
                            Validation spéciale obligatoire
                          </label>
                          <label className="checkbox-label large">
                            <input type="checkbox" name="requires_fds" checked={formData.requires_fds} onChange={handleFormChange} />
                            Fiche technique / FDS obligatoire
                          </label>
                          <label className="checkbox-label large">
                            <input type="checkbox" name="requires_lot_tracking" checked={formData.requires_lot_tracking} onChange={handleFormChange} />
                            Suivi par lot obligatoire
                          </label>
                          <label className="checkbox-label large">
                            <input type="checkbox" name="requires_expiry_date" checked={formData.requires_expiry_date} onChange={handleFormChange} />
                            Date de péremption obligatoire
                          </label>
                        </section>

                        <section className="form-section impact">
                          <h4>Aperçu de l’impact</h4>
                          <div className="impact-box">
                            {impactPreview.map((line) => (
                              <div className="impact-line" key={line}>
                                <AlertTriangle size={16} />
                                <span>{line}</span>
                              </div>
                            ))}
                          </div>
                        </section>
                      </div>

                      <div className="form-actions">
                        <button type="submit" className="btn btn-success">
                          Enregistrer
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                          Annuler
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </ProtectedPage>
  );
}
