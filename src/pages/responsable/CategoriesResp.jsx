import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Archive, ArrowRight, BarChart3, CheckCircle2,
  ChevronDown, ChevronUp, Clock, FolderOpen, Grid3X3, History,
  LayoutList, List, Merge, MoreVertical, Pencil, Plus, RefreshCw,
  Search, ShieldAlert, SlidersHorizontal, Sparkles, Tags, Trash2,
  TrendingUp, X, Zap,
} from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import ProtectedPage from '../../components/shared/ProtectedPage';
import { useToast } from '../../components/shared/Toast';
import { del, get, patch, post } from '../../services/api';
import './CategoriesResp.css';

// ─── Constants ────────────────────────────────────────────────
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
  name: '', description: '', parent_family: '',
  audiences: [], tags: [],
  visible_metiers: [], visible_sites: [], visible_services: [],
  is_sensitive: false, requires_special_validation: false,
  requires_fds: false, requires_lot_tracking: false, requires_expiry_date: false,
};
const SORT_OPTIONS = [
  { value: 'name_asc',      label: 'Nom A→Z' },
  { value: 'name_desc',     label: 'Nom Z→A' },
  { value: 'score_desc',    label: 'Score ↓' },
  { value: 'score_asc',     label: 'Score ↑' },
  { value: 'products_desc', label: 'Produits ↓' },
  { value: 'rupture_desc',  label: 'Ruptures ↓' },
];

// ─── Helpers ─────────────────────────────────────────────────
function normalizeName(v) {
  return String(v || '').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
function similarityRatio(a, b) {
  const s1 = normalizeName(a), s2 = normalizeName(b);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.92;
  const set1 = new Set(s1.split(' ').filter(Boolean));
  const set2 = new Set(s2.split(' ').filter(Boolean));
  const inter = [...set1].filter(x => set2.has(x)).length;
  const union = new Set([...set1, ...set2]).size;
  return union ? inter / union : 0;
}
function computeCategoryScore({ category, productStats, allNames }) {
  let score = 100;
  const hasDescription = Boolean(String(category?.description || '').trim());
  const hasFamily      = Boolean(String(category?.parent_family || '').trim());
  const hasAudience    = Array.isArray(category?.audiences) && category.audiences.length > 0;
  const hasTags        = Array.isArray(category?.tags) && category.tags.length > 0;
  const products       = Number(productStats?.products || 0);
  const normalized     = normalizeName(category?.name || '');
  const probableDuplicate = normalized
    ? allNames.some(n => n !== normalized && similarityRatio(n, normalized) >= 0.85)
    : false;
  if (!hasDescription)   score -= 15;
  if (!hasFamily)        score -= 15;
  if (!hasAudience)      score -= 10;
  if (!hasTags)          score -= 10;
  if (products <= 0)     score -= 20;
  if (probableDuplicate) score -= 20;
  return { score: Math.max(0, Math.min(100, score)), flags: { hasDescription, hasFamily, hasAudience, hasTags, products, probableDuplicate } };
}
function formatDate(val) {
  if (!val) return '—';
  try {
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(val));
  } catch { return '—'; }
}

// ─── Score Ring ───────────────────────────────────────────────
function ScoreRing({ score }) {
  const r = 17, circ = 2 * Math.PI * r, fill = (score / 100) * circ;
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
  const cls   = score >= 80 ? 'good'    : score >= 60 ? 'mid'     : 'bad';
  return (
    <div className="score-ring-wrap" title={`Score qualité : ${score}%`}>
      <svg viewBox="0 0 42 42">
        <circle className="score-ring-bg" cx="21" cy="21" r={r} />
        <circle className={`score-ring-fill ${cls}`} cx="21" cy="21" r={r}
          stroke={color} strokeDasharray={`${fill} ${circ - fill}`} />
        <text x="21" y="25" textAnchor="middle" className="score-ring-text">{score}</text>
      </svg>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────
function StatusBadge({ type, label, icon: Icon, size = 'md' }) {
  const configs = {
    archived:   { cls: 'sbadge-archived',   defaultLabel: 'Archivée',            IconComp: Archive      },
    sensitive:  { cls: 'sbadge-sensitive',  defaultLabel: 'Sensible',            IconComp: ShieldAlert  },
    validation: { cls: 'sbadge-validation', defaultLabel: 'Validation spéciale', IconComp: Zap          },
    rupture:    { cls: 'sbadge-rupture',    defaultLabel: 'Rupture',             IconComp: AlertTriangle },
    active:     { cls: 'sbadge-active',     defaultLabel: 'Active',              IconComp: CheckCircle2 },
    warning:    { cls: 'sbadge-warning',    defaultLabel: 'Attention',           IconComp: AlertTriangle },
    merge:      { cls: 'sbadge-merge',      defaultLabel: 'Fusionner',           IconComp: Merge        },
    complete:   { cls: 'sbadge-complete',   defaultLabel: 'Compléter',           IconComp: Pencil       },
    archive:    { cls: 'sbadge-archive-s',  defaultLabel: 'Archiver',            IconComp: Archive      },
  };
  const cfg  = configs[type] || configs.active;
  const Comp = Icon || cfg.IconComp;
  const txt  = label || cfg.defaultLabel;
  const iconSize = size === 'sm' ? 9 : size === 'lg' ? 13 : 11;
  return (
    <span className={`sbadge sbadge-${size} ${cfg.cls}`}>
      <Comp size={iconSize} />{txt}
    </span>
  );
}

// ─── Custom Confirm Dialog ────────────────────────────────────
function ConfirmDialog({ open, config, onConfirm, onCancel }) {
  if (!open) return null;
  const { title, message, confirmLabel = 'Confirmer', confirmVariant = 'danger', icon: Icon = AlertTriangle } = config;
  return (
    <div className="cdialog-overlay" onClick={onCancel}>
      <div className="cdialog" onClick={e => e.stopPropagation()}>
        <div className={`cdialog-icon-wrap cdialog-icon-${confirmVariant}`}><Icon size={26} /></div>
        <h4 className="cdialog-title">{title}</h4>
        {message && <p className="cdialog-message">{message}</p>}
        <div className="cdialog-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Annuler</button>
          <button type="button"
            className={`btn btn-sm ${confirmVariant === 'danger' ? 'btn-danger' : confirmVariant === 'success' ? 'btn-success' : confirmVariant === 'warning' ? 'btn-warning' : 'btn-primary'}`}
            onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Custom Prompt Dialog ─────────────────────────────────────
function PromptDialog({ open, config, onConfirm, onCancel }) {
  const [value, setValue] = useState('');
  useEffect(() => { if (open) setValue(''); }, [open]);
  if (!open) return null;
  const { title, message, placeholder = '', label = '', required = false,
    confirmLabel = 'Valider', confirmVariant = 'primary', icon: Icon = Pencil } = config;
  const handleSubmit = e => {
    e.preventDefault();
    if (required && !value.trim()) return;
    onConfirm(value.trim());
  };
  return (
    <div className="cdialog-overlay" onClick={onCancel}>
      <div className="cdialog cdialog-prompt" onClick={e => e.stopPropagation()}>
        <div className={`cdialog-icon-wrap cdialog-icon-${confirmVariant}`}><Icon size={24} /></div>
        <h4 className="cdialog-title">{title}</h4>
        {message && <p className="cdialog-message">{message}</p>}
        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          {label && <label className="cdialog-label">{label}{required && <span style={{ color:'var(--red)', marginLeft:3 }}>*</span>}</label>}
          <textarea className="cdialog-textarea" placeholder={placeholder} value={value}
            onChange={e => setValue(e.target.value)} rows={3} autoFocus />
          <div className="cdialog-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Annuler</button>
            <button type="submit"
              className={`btn btn-sm ${confirmVariant === 'danger' ? 'btn-danger' : confirmVariant === 'success' ? 'btn-success' : confirmVariant === 'warning' ? 'btn-warning' : 'btn-primary'}`}
              disabled={required && !value.trim()}>{confirmLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Archive Section Component ────────────────────────────────
function ArchivedSection({ archivedEnriched, onRestore, onDelete, onViewProducts }) {
  const [open, setOpen]           = useState(false);
  const [archSearch, setArchSearch] = useState('');
  const [archFamily, setArchFamily] = useState('');

  const filtered = useMemo(() => {
    const needle = archSearch.toLowerCase().trim();
    return archivedEnriched
      .filter(({ category }) =>
        (!needle || String(category?.name || '').toLowerCase().includes(needle)) &&
        (!archFamily || category?.parent_family === archFamily)
      )
      .sort((a, b) => String(a.category.name).localeCompare(String(b.category.name)));
  }, [archivedEnriched, archSearch, archFamily]);

  if (archivedEnriched.length === 0) return null;

  return (
    <section className="arch-section" aria-label="Catégories archivées">
      {/* ── Collapsible Header ─────────────────────────── */}
      <button type="button" className="arch-toggle" onClick={() => setOpen(p => !p)} aria-expanded={open}>
        <div className="arch-toggle-left">
          <div className="arch-toggle-icon">
            <Archive size={18} />
          </div>
          <div className="arch-toggle-text">
            <span className="arch-toggle-title">Archives — Traçabilité réglementaire</span>
            <span className="arch-toggle-sub">
              Catégories hors catalogue actif · consultables pour audits HSE / ISO · non supprimables si produits associés
            </span>
          </div>
        </div>
        <div className="arch-toggle-right">
          <span className="arch-count-badge">{archivedEnriched.length}</span>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {/* ── Expanded Content ──────────────────────────── */}
      {open && (
        <div className="arch-body">
          {/* Info banner */}
          <div className="arch-info-banner">
            <Archive size={14} />
            <span>
              Ces catégories sont <strong>masquées du catalogue actif</strong> mais conservées pour la traçabilité.
              Elles peuvent être <strong>restaurées</strong> à tout moment ou <strong>supprimées définitivement</strong> si aucun produit n'y est associé.
            </span>
          </div>

          {/* Mini filter bar */}
          <div className="arch-filterbar">
            <div className="categories-search" style={{ minWidth: 220 }}>
              <Search size={14} />
              <input
                type="text"
                placeholder="Rechercher dans les archives…"
                value={archSearch}
                onChange={e => setArchSearch(e.target.value)}
                className="search-input"
              />
              {archSearch && (
                <button type="button" onClick={() => setArchSearch('')}
                  style={{ background:'none', border:'none', cursor:'pointer', color:'var(--mist)', display:'flex' }}>
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="ref-filter">
              <select value={archFamily} onChange={e => setArchFamily(e.target.value)} className="ref-select" style={{ fontSize:12 }}>
                <option value="">Toutes familles</option>
                {Object.entries(FAMILY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <ChevronDown size={13} className="chev-icon" />
            </div>
            <span className="results-count" style={{ marginLeft:'auto' }}>
              <strong>{filtered.length}</strong> / {archivedEnriched.length} archivées
            </span>
          </div>

          {/* Archive rows table */}
          {filtered.length === 0 ? (
            <div className="arch-empty">
              <Search size={20} />
              <span>Aucune catégorie archivée ne correspond à votre recherche.</span>
            </div>
          ) : (
            <div className="arch-table">
              {/* Table header */}
              <div className="arch-table-head">
                <span>Catégorie</span>
                <span>Famille</span>
                <span>Produits liés</span>
                <span>Archivée le</span>
                <span>Raison</span>
                <span>Actions</span>
              </div>
              {/* Table rows */}
              {filtered.map(({ category, stats }) => {
                const categoryId = String(category?._id || '');
                const totalProds = Number(stats.total_products || 0);
                const canDelete  = totalProds === 0;
                const archivedAt = category?.archived_at || category?.updatedAt || null;
                const reason     = String(category?.archive_reason || '').trim();
                return (
                  <div key={categoryId} className="arch-row">
                    {/* Name + badges */}
                    <div className="arch-row-name">
                      <span className="arch-row-title">{category.name}</span>
                      <div className="arch-row-badges">
                        {category.is_sensitive && <StatusBadge type="sensitive" size="sm" />}
                        {category.requires_special_validation && <StatusBadge type="validation" size="sm" />}
                      </div>
                    </div>

                    {/* Family */}
                    <span className="arch-row-family">
                      {FAMILY_LABEL[category.parent_family] || <em style={{ color:'var(--mist)' }}>—</em>}
                    </span>

                    {/* Products count */}
                    <div className="arch-row-products">
                      {totalProds > 0 ? (
                        <button type="button" className="arch-prod-link" onClick={() => onViewProducts(categoryId)}>
                          <List size={12} /> {totalProds} produit{totalProds > 1 ? 's' : ''}
                        </button>
                      ) : (
                        <span className="arch-prod-none">Aucun</span>
                      )}
                    </div>

                    {/* Date */}
                    <div className="arch-row-date">
                      <Clock size={12} />
                      <span>{formatDate(archivedAt)}</span>
                    </div>

                    {/* Reason */}
                    <div className="arch-row-reason">
                      {reason
                        ? <span className="arch-reason-text" title={reason}>{reason.length > 32 ? reason.slice(0, 32) + '…' : reason}</span>
                        : <span className="arch-prod-none">Non renseignée</span>
                      }
                    </div>

                    {/* Actions */}
                    <div className="arch-row-actions">
                      <button
                        type="button"
                        className="btn btn-success btn-xs"
                        title="Restaurer dans le catalogue actif"
                        onClick={() => onRestore(categoryId)}
                      >
                        <RefreshCw size={12} /> Restaurer
                      </button>
                      <button
                        type="button"
                        className={`btn btn-xs ${canDelete ? 'btn-danger' : 'btn-ghost'}`}
                        title={canDelete ? 'Supprimer définitivement' : 'Suppression impossible — des produits sont associés'}
                        disabled={!canDelete}
                        onClick={() => canDelete && onDelete({ categoryId, hasProducts: !canDelete })}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Main Component ───────────────────────────────────────────
export default function CategoriesResp({ userName, onLogout }) {
  const toast    = useToast();
  const navigate = useNavigate();

  // Layout
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  );
  const [viewMode, setViewMode] = useState('grid');

  // Data
  const [allCategories, setAllCategories] = useState([]);
  const [products,      setProducts]      = useState([]);
  const [isLoading,     setIsLoading]     = useState(false);
  const [pageError,     setPageError]     = useState('');
  const [formError,     setFormError]     = useState('');

  // Filters (active categories only)
  const [searchTerm,      setSearchTerm]      = useState('');
  const [familyFilter,    setFamilyFilter]    = useState('');
  const [sensitiveFilter, setSensitiveFilter] = useState(false);
  const [minScore,        setMinScore]        = useState(0);
  const [sortBy,          setSortBy]          = useState('name_asc');
  const [showAdvFilters,  setShowAdvFilters]  = useState(false);

  // Form
  const [showForm,               setShowForm]               = useState(false);
  const [editingId,              setEditingId]              = useState(null);
  const [formData,               setFormData]               = useState(EMPTY_FORM);
  const [advancedVisibilityOpen, setAdvancedVisibilityOpen] = useState(false);

  // Menu
  const [openMenuForId, setOpenMenuForId] = useState(null);
  const menuRef = useRef(null);

  // Custom dialogs
  const [confirmDialog, setConfirmDialog] = useState({ open: false, config: {}, onConfirm: null });
  const [promptDialog,  setPromptDialog]  = useState({ open: false, config: {}, onConfirm: null });

  const showConfirm = useCallback((config) => new Promise(resolve => {
    setConfirmDialog({
      open: true, config,
      onConfirm: () => { setConfirmDialog(d => ({ ...d, open: false })); resolve(true); },
    });
  }), []);
  const showPrompt = useCallback((config) => new Promise(resolve => {
    setPromptDialog({
      open: true, config,
      onConfirm: (val) => { setPromptDialog(d => ({ ...d, open: false })); resolve(val); },
    });
  }), []);
  const closeConfirm = useCallback(() => setConfirmDialog(d => ({ ...d, open: false })), []);
  const closePrompt  = useCallback(() => setPromptDialog(d => ({ ...d, open: false })), []);

  // ── Load — always fetch all (active + archived) ───────────────
  const loadAll = useCallback(async () => {
    setIsLoading(true); setPageError('');
    try {
      const [cats, prods] = await Promise.all([
        get('/categories?include_archived=1'),
        get('/products?include_archived=1').catch(() => get('/products?include_archived=0')),
      ]);
      setAllCategories(Array.isArray(cats)  ? cats  : []);
      setProducts      (Array.isArray(prods) ? prods : []);
    } catch (err) {
      setAllCategories([]); setProducts([]);
      setPageError(err?.message || 'Erreur chargement référentiel');
    } finally { setIsLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    const onClick = e => {
      if (!openMenuForId) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpenMenuForId(null);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [openMenuForId]);

  // ── Split active / archived ───────────────────────────────────
  const activeCategories   = useMemo(() => (allCategories || []).filter(c => String(c?.lifecycle_status || 'active') !== 'archived'), [allCategories]);
  const archivedCategories = useMemo(() => (allCategories || []).filter(c => String(c?.lifecycle_status || 'active') === 'archived'), [allCategories]);

  // ── Stats ─────────────────────────────────────────────────────
  const productStatsByCategoryId = useMemo(() => {
    const stats = new Map();
    for (const p of products || []) {
      const catId = p?.category?._id ? String(p.category._id) : '';
      if (!catId) continue;
      if (!stats.has(catId)) stats.set(catId, { products: 0, total_products: 0, archived_products: 0, rupture: 0, sous_seuil: 0, sensibles: 0 });
      const item = stats.get(catId);
      item.total_products += 1;
      if (String(p?.lifecycle_status || 'active') === 'archived') { item.archived_products += 1; continue; }
      item.products += 1;
      const st = String(p?.status || '').toLowerCase();
      if (st === 'rupture')    item.rupture    += 1;
      if (st === 'sous_seuil') item.sous_seuil += 1;
      if (String(p?.family || '') === 'produit_chimique' || Boolean(p?.chemical_class)) item.sensibles += 1;
    }
    return stats;
  }, [products]);

  const unclassifiedProductCount = useMemo(
    () => (products || []).filter(p => !p?.category?._id).length, [products]
  );
  const normalizedNames = useMemo(
    () => (allCategories || []).map(c => normalizeName(c?.name || '')).filter(Boolean), [allCategories]
  );

  // Enrich active
  const enrichedActive = useMemo(() => activeCategories.map(category => {
    const id    = String(category?._id || '');
    const stats = productStatsByCategoryId.get(id) || { products: 0, rupture: 0, sous_seuil: 0, sensibles: 0, total_products: 0 };
    const { score, flags } = computeCategoryScore({ category, productStats: stats, allNames: normalizedNames });
    return { category, stats, score, flags };
  }), [activeCategories, normalizedNames, productStatsByCategoryId]);

  // Enrich archived
  const enrichedArchived = useMemo(() => archivedCategories.map(category => {
    const id    = String(category?._id || '');
    const stats = productStatsByCategoryId.get(id) || { products: 0, rupture: 0, sous_seuil: 0, sensibles: 0, total_products: 0 };
    const { score } = computeCategoryScore({ category, productStats: stats, allNames: normalizedNames });
    return { category, stats, score };
  }), [archivedCategories, normalizedNames, productStatsByCategoryId]);

  // ── Filter + sort active categories ──────────────────────────
  const filtered = useMemo(() => {
    const needle = String(searchTerm || '').toLowerCase().trim();
    let result = enrichedActive;
    if (needle)          result = result.filter(({ category }) =>
      String(category?.name || '').toLowerCase().includes(needle) ||
      String(category?.description || '').toLowerCase().includes(needle));
    if (familyFilter)    result = result.filter(({ category }) => category?.parent_family === familyFilter);
    if (sensitiveFilter) result = result.filter(({ category }) => Boolean(category?.is_sensitive));
    if (minScore > 0)    result = result.filter(({ score }) => score >= minScore);
    return [...result].sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':      return String(a.category.name).localeCompare(String(b.category.name));
        case 'name_desc':     return String(b.category.name).localeCompare(String(a.category.name));
        case 'score_desc':    return b.score - a.score;
        case 'score_asc':     return a.score - b.score;
        case 'products_desc': return b.stats.products - a.stats.products;
        case 'rupture_desc':  return b.stats.rupture - a.stats.rupture;
        default: return 0;
      }
    });
  }, [searchTerm, familyFilter, sensitiveFilter, minScore, sortBy, enrichedActive]);

  // ── KPIs ──────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const sensitiveCount = enrichedActive.filter(({ category }) => Boolean(category?.is_sensitive)).length;
    const toComplete     = enrichedActive.filter(({ score }) => score < 70).length;
    const globalQuality  = enrichedActive.length
      ? Math.round(enrichedActive.reduce((acc, x) => acc + Number(x.score || 0), 0) / enrichedActive.length) : 0;
    return { activeCount: activeCategories.length, archivedCount: archivedCategories.length,
      sensitiveCount, unclassifiedProductCount, toComplete, globalQuality };
  }, [enrichedActive, activeCategories, archivedCategories, unclassifiedProductCount]);

  // ── IA Suggestions ────────────────────────────────────────────
  const cleanupSuggestions = useMemo(() => {
    const suggestions = [];
    enrichedActive.filter(({ stats }) => Number(stats.products || 0) === 0).slice(0, 3).forEach(item => {
      const total = Number(item?.stats?.total_products || 0);
      suggestions.push({
        id: `no-products-${item.category._id}`, type: 'archive',
        title: total > 0 ? `${item.category.name} — aucun produit actif` : `${item.category.name} — aucun produit`,
        hint: total > 0 ? 'Tous les produits sont inactifs. Archivage recommandé.' : 'Catégorie vide. Archivage recommandé.',
        categoryIds: [String(item.category._id)],
      });
    });
    enrichedActive.filter(({ category }) => !String(category?.description || '').trim()).slice(0, 2).forEach(item => {
      suggestions.push({
        id: `no-desc-${item.category._id}`, type: 'complete',
        title: `${item.category.name} — description manquante`,
        hint: 'Complétez pour améliorer le score qualité BI.',
        categoryIds: [String(item.category._id)],
      });
    });
    const pairs = [];
    for (let i = 0; i < allCategories.length; i++)
      for (let j = i + 1; j < allCategories.length; j++) {
        const ratio = similarityRatio(allCategories[i]?.name || '', allCategories[j]?.name || '');
        if (ratio >= 0.85) pairs.push({ a: allCategories[i], b: allCategories[j], ratio });
      }
    if (pairs.length) {
      const top = pairs.sort((x, y) => y.ratio - x.ratio)[0];
      suggestions.push({
        id: `similar-${top.a._id}-${top.b._id}`, type: 'merge',
        title: `${top.a.name}  ≈  ${top.b.name}`,
        hint: 'Noms similaires. Vérifiez si une fusion est pertinente.',
        categoryIds: [String(top.a._id), String(top.b._id)],
      });
    }
    enrichedActive
      .filter(({ category }) => Boolean(category?.is_sensitive) && !Boolean(category?.requires_special_validation))
      .slice(0, 2).forEach(item => {
        suggestions.push({
          id: `sens-no-val-${item.category._id}`, type: 'complete',
          title: `${item.category.name} — sensible sans validation spéciale`,
          hint: 'Activez "Validation spéciale obligatoire" pour sécuriser.',
          categoryIds: [String(item.category._id)],
        });
      });
    return suggestions.slice(0, 6);
  }, [allCategories, enrichedActive]);

  // ── CRUD ──────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingId(null); setFormData(EMPTY_FORM);
    setAdvancedVisibilityOpen(false); setFormError(''); setShowForm(true);
  };
  const openEdit = (category) => {
    setEditingId(String(category?._id || ''));
    setFormData({
      name: category?.name || '', description: category?.description || '',
      parent_family: category?.parent_family || '',
      audiences: Array.isArray(category?.audiences) ? category.audiences : [],
      tags:      Array.isArray(category?.tags)      ? category.tags      : [],
      visible_metiers:  Array.isArray(category?.visible_metiers)  ? category.visible_metiers  : [],
      visible_sites:    Array.isArray(category?.visible_sites)    ? category.visible_sites    : [],
      visible_services: Array.isArray(category?.visible_services) ? category.visible_services : [],
      is_sensitive: Boolean(category?.is_sensitive),
      requires_special_validation: Boolean(category?.requires_special_validation),
      requires_fds:          Boolean(category?.requires_fds),
      requires_lot_tracking: Boolean(category?.requires_lot_tracking),
      requires_expiry_date:  Boolean(category?.requires_expiry_date),
    });
    setAdvancedVisibilityOpen(
      (Array.isArray(category?.visible_metiers)  && category.visible_metiers.length  > 0) ||
      (Array.isArray(category?.visible_sites)    && category.visible_sites.length    > 0) ||
      (Array.isArray(category?.visible_services) && category.visible_services.length > 0)
    );
    setFormError(''); setShowForm(true);
  };

  const handleFormChange = e => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };
  const handleFormArrayToggle = (value, field) => {
    setFormData(prev => {
      const arr = Array.isArray(prev[field]) ? prev[field] : [];
      return { ...prev, [field]: arr.includes(value) ? arr.filter(x => x !== value) : [...arr, value] };
    });
  };
  const toCsv   = arr   => Array.isArray(arr) ? arr.filter(Boolean).join(', ') : '';
  const fromCsv = value => String(value || '').split(',').map(v => String(v || '').trim()).filter(Boolean).slice(0, 12);
  const updateCsvField = (field, value) => setFormData(prev => ({ ...prev, [field]: fromCsv(value) }));

  const impactPreview = useMemo(() => {
    const lines = ['Alimente le catalogue, les dashboards stock et les alertes BI.'];
    if (formData.is_sensitive)               lines.push('Catégorie sensible : contrôles renforcés activés.');
    if (formData.requires_special_validation) lines.push('Validation spéciale : blocage sans décision responsable.');
    if (formData.requires_fds)               lines.push('FDS/Fiche technique obligatoire sur chaque produit.');
    if (formData.requires_lot_tracking)      lines.push('Suivi par lot : traçabilité complète activée.');
    if (formData.requires_expiry_date)       lines.push('Date de péremption obligatoire : contrôle FEFO.');
    return lines;
  }, [formData]);

  const saveCategory = async e => {
    e.preventDefault(); setFormError('');
    const payload = {
      name: String(formData.name || '').trim(),
      description: String(formData.description || ''),
      parent_family: String(formData.parent_family || ''),
      audiences: formData.audiences || [], tags: formData.tags || [],
      visible_metiers: formData.visible_metiers || [],
      visible_sites:   formData.visible_sites   || [],
      visible_services: formData.visible_services || [],
      is_sensitive: Boolean(formData.is_sensitive),
      requires_special_validation: Boolean(formData.requires_special_validation),
      requires_fds:          Boolean(formData.requires_fds),
      requires_lot_tracking: Boolean(formData.requires_lot_tracking),
      requires_expiry_date:  Boolean(formData.requires_expiry_date),
    };
    if (!payload.name)          { setFormError('Nom de catégorie obligatoire.');  return; }
    if (!payload.parent_family) { setFormError('Famille parente obligatoire.');   return; }
    setIsLoading(true);
    try {
      if (editingId) { await patch(`/categories/${editingId}`, payload); toast.success('Catégorie mise à jour.'); }
      else           { await post('/categories', payload);               toast.success('Catégorie créée.'); }
      setShowForm(false); setEditingId(null); await loadAll();
    } catch (err) { setFormError(err?.message || 'Erreur lors de la sauvegarde.'); }
    finally { setIsLoading(false); }
  };

  // Archive
  const archiveCategory = async categoryId => {
    const reason = await showPrompt({
      title: 'Archiver la catégorie',
      message: 'La catégorie sera masquée du catalogue actif mais conservée pour la traçabilité réglementaire (audits HSE/ISO).',
      label: 'Raison d\'archivage',
      placeholder: 'Ex : obsolète, remplacée par une autre catégorie, norme révisée…',
      confirmLabel: 'Archiver', confirmVariant: 'warning', icon: Archive,
    });
    if (reason === undefined) return;
    setIsLoading(true);
    try {
      await post(`/categories/${categoryId}/archive`, { reason: reason || '' });
      toast.success('Catégorie archivée.'); await loadAll();
    } catch (err) { toast.error(err?.message || 'Erreur archivage'); }
    finally { setIsLoading(false); }
  };

  // Restore
  const unarchiveCategory = async categoryId => {
    const ok = await showConfirm({
      title: 'Restaurer la catégorie ?',
      message: 'La catégorie redeviendra visible dans le catalogue actif et les filtres.',
      confirmLabel: 'Restaurer', confirmVariant: 'success', icon: RefreshCw,
    });
    if (!ok) return;
    setIsLoading(true);
    try {
      await post(`/categories/${categoryId}/unarchive`, {});
      toast.success('Catégorie restaurée.'); await loadAll();
    } catch (err) { toast.error(err?.message || 'Erreur restauration'); }
    finally { setIsLoading(false); }
  };

  // Delete
  const deleteCategory = async ({ categoryId, hasProducts }) => {
    if (hasProducts) { toast.error('Suppression interdite : des produits y sont associés. Utilisez Archiver.'); return; }
    const ok = await showConfirm({
      title: 'Suppression définitive',
      message: 'Cette action est irréversible. La catégorie sera définitivement supprimée du système SENTINEL.',
      confirmLabel: 'Supprimer définitivement', confirmVariant: 'danger', icon: Trash2,
    });
    if (!ok) return;
    setIsLoading(true);
    try {
      await del(`/categories/${categoryId}`);
      toast.success('Catégorie supprimée.'); await loadAll();
    } catch (err) { toast.error(err?.message || 'Erreur suppression'); }
    finally { setIsLoading(false); }
  };

  // Merge
  const mergeCategories = async (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    const ok = await showConfirm({
      title: 'Fusionner ces catégories ?',
      message: 'Les produits seront déplacés vers la catégorie cible. La source sera archivée automatiquement.',
      confirmLabel: 'Fusionner', confirmVariant: 'primary', icon: Merge,
    });
    if (!ok) return;
    setIsLoading(true);
    try {
      await post('/categories/merge', { from_id: fromId, to_id: toId });
      toast.success('Fusion effectuée.'); await loadAll();
    } catch (err) { toast.error(err?.message || 'Erreur fusion'); }
    finally { setIsLoading(false); }
  };

  const openProducts = (categoryId, { archivedOnly = false } = {}) => {
    const base = `/responsable/produits?include_archived=1&category=${encodeURIComponent(categoryId)}&mode=assign`;
    navigate(archivedOnly ? `${base}&archived_only=1` : base);
  };

  // Active filter chips
  const activeFilterChips = useMemo(() => {
    const chips = [];
    if (familyFilter)    chips.push({ key:'family',    label:`Famille : ${FAMILY_LABEL[familyFilter]}`, clear: () => setFamilyFilter('') });
    if (sensitiveFilter) chips.push({ key:'sensitive', label:'Sensibles uniquement',                    clear: () => setSensitiveFilter(false) });
    if (minScore > 0)    chips.push({ key:'score',     label:`Score ≥ ${minScore}%`,                    clear: () => setMinScore(0) });
    return chips;
  }, [familyFilter, sensitiveFilter, minScore]);

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <ProtectedPage userName={userName}>
      <div className="app-layout">
        <div className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`} onClick={() => setSidebarCollapsed(true)} />
        <SidebarResp collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(p => !p)} onLogout={onLogout} userName={userName} />

        <div className="main-container">
          <HeaderPage userName={userName} title="Référentiel Produit — Catégories" showSearch={false}
            onRefresh={loadAll} onMenuClick={() => setSidebarCollapsed(p => !p)} />

          <main className="main-content">
            {isLoading && <LoadingSpinner overlay text="Chargement du référentiel…" />}

            <div className="categories-resp-container">

              {/* ── Page Header ─────────────────────────────── */}
              <header className="ref-header">
                <div className="ref-title">
                  <h2><FolderOpen size={26} />Référentiel Catégories</h2>
                  <p className="subtitle">Structurez les familles, catégories et règles de classement — système SENTINEL</p>
                </div>
                <div style={{ display:'flex', gap:10 }}>
                  <button onClick={loadAll} className="btn btn-ghost btn-sm" type="button"><RefreshCw size={14} /> Actualiser</button>
                  <button onClick={openCreate} className="btn btn-primary" type="button"><Plus size={16} /> Créer une catégorie</button>
                </div>
              </header>

              {pageError && <div className="alert alert-error"><AlertTriangle size={16} /> {pageError}</div>}

              {/* ── KPI Strip — 5 cards now ─────────────────── */}
              <section className="ref-kpis ref-kpis-5" aria-label="Indicateurs référentiel">
                <article className="ref-kpi success">
                  <div className="kpi-icon"><FolderOpen size={18} /></div>
                  <span className="kpi-label">Catégories actives</span>
                  <strong className="kpi-value">{kpis.activeCount}</strong>
                  <span className="kpi-sub">dans le catalogue</span>
                </article>
                <article className="ref-kpi" style={{ '--kpi-color':'#64748b' }}>
                  <div className="kpi-icon" style={{ background:'rgba(100,116,139,0.1)', color:'#64748b' }}><Archive size={18} /></div>
                  <span className="kpi-label">Catégories archivées</span>
                  <strong className="kpi-value" style={{ color:'#475569' }}>{kpis.archivedCount}</strong>
                  <span className="kpi-sub">traçabilité HSE/ISO</span>
                </article>
                <article className="ref-kpi danger">
                  <div className="kpi-icon"><ShieldAlert size={18} /></div>
                  <span className="kpi-label">Sensibles</span>
                  <strong className="kpi-value">{kpis.sensitiveCount}</strong>
                  <span className="kpi-sub">contrôles renforcés</span>
                </article>
                <article className="ref-kpi warning">
                  <div className="kpi-icon"><AlertTriangle size={18} /></div>
                  <span className="kpi-label">Produits non classés</span>
                  <strong className="kpi-value">{kpis.unclassifiedProductCount}</strong>
                  <span className="kpi-sub">à associer</span>
                </article>
                <article className="ref-kpi info">
                  <div className="kpi-icon"><TrendingUp size={18} /></div>
                  <span className="kpi-label">À compléter</span>
                  <strong className="kpi-value">{kpis.toComplete}</strong>
                  <span className="kpi-sub">score &lt; 70 %</span>
                </article>
              </section>

              {/* ── Global Quality Bar ─────────────────────── */}
              <section className="ref-quality" aria-label="Qualité globale">
                <div className="ref-quality-row">
                  <div className="ref-quality-left">
                    <strong><BarChart3 size={14} style={{ display:'inline', marginRight:6, color:'var(--teal)' }} />
                      Qualité globale : {kpis.globalQuality} %
                    </strong>
                    <span>Score moyen de complétude — alimente les dashboards décisionnels SENTINEL.</span>
                  </div>
                  <span className={`quality-badge ${kpis.globalQuality >= 80 ? 'good' : kpis.globalQuality >= 60 ? 'mid' : 'bad'}`}>
                    {kpis.globalQuality >= 80 ? '✓ Excellent' : kpis.globalQuality >= 60 ? '⚠ À améliorer' : '✗ Critique'}
                  </span>
                </div>
                <div className="ref-quality-bar" role="progressbar" aria-valuenow={kpis.globalQuality} aria-valuemin={0} aria-valuemax={100}>
                  <div className="ref-quality-bar-fill" style={{ width:`${kpis.globalQuality}%` }} />
                </div>
              </section>

              {/* ── IA Suggestions ─────────────────────────── */}
              {cleanupSuggestions.length > 0 && (
                <section className="ref-suggestions" aria-label="Suggestions IA">
                  <div className="ref-section-head">
                    <h3><Sparkles size={16} style={{ color:'var(--amber)' }} />Suggestions d'optimisation</h3>
                    <span className="count-badge">{cleanupSuggestions.length} actions</span>
                  </div>
                  <div className="suggest-list">
                    {cleanupSuggestions.map(s => (
                      <div key={s.id} className={`suggest-item type-${s.type}`}>
                        <div className="suggest-main">
                          <StatusBadge type={s.type === 'archive' ? 'archive' : s.type === 'merge' ? 'merge' : 'complete'} size="sm" />
                          <strong>{s.title}</strong>
                          <span>{s.hint}</span>
                        </div>
                        <div className="suggest-actions">
                          {s.type === 'complete' && (
                            <button type="button" className="btn btn-outline-teal btn-xs" onClick={() => {
                              const c = allCategories.find(x => String(x._id) === s.categoryIds[0]);
                              if (c) openEdit(c);
                            }}><Pencil size={12} /> Compléter</button>
                          )}
                          {s.type === 'archive' && (
                            <button type="button" className="btn btn-ghost btn-xs" onClick={() => archiveCategory(s.categoryIds[0])}>
                              <Archive size={12} /> Archiver
                            </button>
                          )}
                          {s.type === 'merge' && s.categoryIds.length === 2 && (
                            <button type="button" className="btn btn-ghost btn-xs" onClick={() => mergeCategories(s.categoryIds[0], s.categoryIds[1])}>
                              <Merge size={12} /> Fusionner
                            </button>
                          )}
                          <button type="button" className="btn btn-ghost btn-xs" onClick={() => {
                            if (s.categoryIds?.length === 1) openProducts(s.categoryIds[0]);
                          }}><ArrowRight size={12} /> Voir produits</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Filter Bar ─────────────────────────────── */}
              <div className="ref-filterbar">
                <div className="ref-filterbar-left">
                  <div className="categories-search">
                    <Search size={16} />
                    <input type="text" placeholder="Rechercher nom, description…" value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)} className="search-input" />
                    {searchTerm && (
                      <button type="button" onClick={() => setSearchTerm('')}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'var(--mist)', display:'flex' }}>
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <div className="ref-filter">
                    <select value={familyFilter} onChange={e => setFamilyFilter(e.target.value)} className="ref-select">
                      <option value="">Toutes familles</option>
                      {Object.entries(FAMILY_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <ChevronDown size={14} className="chev-icon" />
                  </div>
                  <div className="ref-filter">
                    <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="ref-select">
                      {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <ChevronDown size={14} className="chev-icon" />
                  </div>
                  <button type="button" className={`sort-btn ${showAdvFilters ? 'active' : ''}`}
                    onClick={() => setShowAdvFilters(p => !p)}>
                    <SlidersHorizontal size={14} /> Filtres avancés
                    {activeFilterChips.length > 0 && (
                      <span style={{ background:'var(--teal)', color:'#fff', borderRadius:'999px', fontSize:10, padding:'1px 6px', fontWeight:700 }}>
                        {activeFilterChips.length}
                      </span>
                    )}
                  </button>
                </div>
                <div className="ref-filterbar-right">
                  <span className="results-count"><strong>{filtered.length}</strong> / {enrichedActive.length}</span>
                  <div className="view-toggle">
                    <button type="button" className={`view-btn ${viewMode==='grid'?'active':''}`} onClick={() => setViewMode('grid')}><Grid3X3 size={15} /></button>
                    <button type="button" className={`view-btn ${viewMode==='list'?'active':''}`} onClick={() => setViewMode('list')}><LayoutList size={15} /></button>
                  </div>
                </div>
              </div>

              {showAdvFilters && (
                <div className="adv-filter-bar" style={{ background:'var(--snow)', border:'1.5px solid var(--cloud)', borderRadius:'var(--radius-md)', padding:'12px 16px', marginBottom:16, display:'flex', flexWrap:'wrap', gap:14, alignItems:'center' }}>
                  <span className="adv-filter-label">Filtres avancés</span>
                  <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, fontWeight:600, color:'var(--navy)' }}>
                    <input type="checkbox" checked={sensitiveFilter} onChange={e => setSensitiveFilter(e.target.checked)}
                      style={{ accentColor:'var(--teal)', width:15, height:15 }} />
                    Sensibles uniquement
                  </label>
                  <div className="score-filter-wrap">
                    <span>Score min</span>
                    <input type="range" min={0} max={100} step={5} value={minScore}
                      onChange={e => setMinScore(Number(e.target.value))} className="score-slider" />
                    <span className="score-badge-mini">{minScore}%</span>
                  </div>
                  {(sensitiveFilter || minScore > 0 || familyFilter) && (
                    <button type="button" className="btn btn-ghost btn-xs"
                      onClick={() => { setSensitiveFilter(false); setMinScore(0); setFamilyFilter(''); }}>
                      <X size={12} /> Tout effacer
                    </button>
                  )}
                </div>
              )}

              {activeFilterChips.length > 0 && (
                <div className="adv-filter-bar" style={{ marginBottom:12 }}>
                  {activeFilterChips.map(chip => (
                    <div key={chip.key} className="adv-chip">
                      {chip.label}
                      <button type="button" className="adv-chip-remove" onClick={chip.clear}><X size={10} /></button>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Active Categories Grid / List ────────────── */}
              <section aria-label="Catégories actives" className="ref-section">
                <div className="ref-section-title">
                  <h3><FolderOpen size={16} style={{ color:'var(--teal)' }} /> Catégories actives</h3>
                </div>

                {filtered.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon"><FolderOpen size={28} /></div>
                    <h4>Aucune catégorie trouvée</h4>
                    <p>Modifiez vos filtres ou créez une nouvelle catégorie.</p>
                  </div>
                ) : viewMode === 'grid' ? (
                  <div className="categories-grid ref-grid-cards">
                    {filtered.map(({ category, stats, score }) => {
                      const categoryId  = String(category?._id || '');
                      const activeProds = Number(stats.products || 0);
                      const totalProds  = Number(stats.total_products || 0);
                      const hasProducts = totalProds > 0;
                      const canArchive  = activeProds === 0;
                      return (
                        <article key={categoryId} className="ref-card">
                          <ScoreRing score={score} />
                          <header className="ref-card-head">
                            <div className="ref-card-title">
                              <h4>{category.name}</h4>
                              <div className="ref-badges">
                                {category.is_sensitive && <StatusBadge type="sensitive" size="sm" />}
                                {category.requires_special_validation && <StatusBadge type="validation" size="sm" />}
                                {stats.rupture > 0 && <StatusBadge type="rupture" label={`${stats.rupture} rupture${stats.rupture>1?'s':''}`} size="sm" />}
                              </div>
                            </div>
                            <div className="ref-card-menu" ref={openMenuForId === categoryId ? menuRef : null}>
                              <button type="button" className="icon-btn" aria-label="Menu"
                                onClick={e => { e.stopPropagation(); setOpenMenuForId(p => p === categoryId ? null : categoryId); }}>
                                <MoreVertical size={16} />
                              </button>
                              {openMenuForId === categoryId && (
                                <div className="menu-popover" role="menu">
                                  <button type="button" role="menuitem" onClick={() => { openEdit(category); setOpenMenuForId(null); }}>
                                    <Pencil size={14} /> Modifier
                                  </button>
                                  <button type="button" role="menuitem" onClick={() => { openProducts(categoryId); setOpenMenuForId(null); }}>
                                    <List size={14} /> Voir les produits
                                  </button>
                                  <button type="button" role="menuitem" onClick={() => { navigate(`/responsable/produits?category=${categoryId}&mode=history`); setOpenMenuForId(null); }}>
                                    <History size={14} /> Historique
                                  </button>
                                  <div className="menu-divider" />
                                  <button type="button" role="menuitem"
                                    className={canArchive ? '' : 'disabled'}
                                    title={canArchive ? 'Archiver' : 'Archivage autorisé seulement si tous les produits sont inactifs'}
                                    onClick={() => { if (!canArchive) return; archiveCategory(categoryId); setOpenMenuForId(null); }}>
                                    <Archive size={14} /> Archiver
                                  </button>
                                  <button type="button" role="menuitem"
                                    className={hasProducts ? 'disabled' : 'danger'}
                                    onClick={() => { deleteCategory({ categoryId, hasProducts }); setOpenMenuForId(null); }}>
                                    <Trash2 size={14} /> Supprimer définitivement
                                  </button>
                                </div>
                              )}
                            </div>
                          </header>

                          <p className="ref-card-desc">
                            {String(category.description || '').trim() || <em style={{ color:'var(--mist)' }}>Aucune description.</em>}
                          </p>

                          <div className="ref-card-metrics">
                            <div className="metric"><span>Famille</span><strong style={{ fontSize:13 }}>{FAMILY_LABEL[category.parent_family] || '—'}</strong></div>
                            <div className="metric"><span>Produits</span><strong>{totalProds}</strong></div>
                            <div className="metric"><span>Ruptures</span><strong className={stats.rupture > 0 ? 'bad' : ''}>{stats.rupture}</strong></div>
                            <div className="metric"><span>Sous seuil</span><strong className={stats.sous_seuil > 0 ? 'mid' : ''}>{stats.sous_seuil}</strong></div>
                            <div className="metric"><span>Sensibles</span><strong>{stats.sensibles}</strong></div>
                            <div className="metric"><span>Actifs</span><strong className={activeProds > 0 ? 'good' : 'mid'}>{activeProds}</strong></div>
                          </div>

                          {(category.tags || []).length > 0 && (
                            <div className="ref-card-tags">
                              <div className="tag-row">
                                <span className="tag-label"><Tags size={12} /> Tags</span>
                                <div className="tags-list">
                                  {(category.tags || []).slice(0, 5).map(t => <span key={t} className="tag-badge tag-technical">{t}</span>)}
                                </div>
                              </div>
                            </div>
                          )}

                          <footer className="ref-card-actions">
                            <button type="button" className="btn btn-primary btn-sm" style={{ flex:1, justifyContent:'center' }}
                              onClick={() => openProducts(categoryId, { archivedOnly: activeProds === 0 && totalProds > 0 })}>
                              <List size={13} /> Produits
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(category)}>
                              <Pencil size={13} /> Modifier
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm"
                              onClick={() => navigate(`/responsable/produits?category=${categoryId}&mode=history`)}>
                              <History size={13} />
                            </button>
                          </footer>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="ref-list-view">
                    {filtered.map(({ category, stats, score }) => {
                      const categoryId  = String(category?._id || '');
                      const totalProds  = Number(stats.total_products || 0);
                      const scoreCls    = score >= 80 ? 'good' : score >= 60 ? 'mid' : 'bad';
                      return (
                        <div key={categoryId} className="ref-list-card">
                          <div className="ref-list-name">
                            <h4>{category.name}</h4>
                            <div className="ref-badges" style={{ marginTop:4 }}>
                              {category.is_sensitive && <StatusBadge type="sensitive" size="sm" />}
                              <span className="badge" style={{ background:'var(--ice)', color:'var(--slate)', border:'1px solid var(--cloud)' }}>
                                {FAMILY_LABEL[category.parent_family] || '—'}
                              </span>
                            </div>
                          </div>
                          <div className="ref-list-meta">
                            <div className="ref-list-stat"><span className="stat-val">{totalProds}</span><span className="stat-lbl">Produits</span></div>
                            <div className="ref-list-stat"><span className={`stat-val ${stats.rupture > 0 ? 'bad' : ''}`}>{stats.rupture}</span><span className="stat-lbl">Ruptures</span></div>
                            <div className="ref-list-stat"><span className={`stat-val ${scoreCls}`}>{score}%</span><span className="stat-lbl">Score</span></div>
                          </div>
                          <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => openProducts(categoryId)}><List size={13} /> Produits</button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(category)}><Pencil size={13} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* ══════════════════════════════════════════════
                  SECTION ARCHIVES — Traçabilité réglementaire
                  Toujours visible, collapsible, dédiée
                  ══════════════════════════════════════════════ */}
              <ArchivedSection
                archivedEnriched={enrichedArchived}
                onRestore={unarchiveCategory}
                onDelete={deleteCategory}
                onViewProducts={categoryId => openProducts(categoryId, { archivedOnly: true })}
              />

              {/* Footer */}
              <div className="ref-controls-footer">
                <span className="ref-help-line">
                  Ce référentiel alimente le catalogue SENTINEL, les règles métier et l'analyse décisionnelle (Sprint 5).
                </span>
                <button type="button" className="ref-catalog-link" onClick={() => navigate('/responsable/produits')}>
                  Voir le catalogue produit <ArrowRight size={14} />
                </button>
              </div>

            </div>
          </main>
        </div>

        {/* Modal Form */}
        {showForm && (
          <div className="modal-overlay" onClick={() => setShowForm(false)}>
            <div className="modal-content modal-wide" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3>{editingId ? 'Modifier une catégorie' : 'Créer une catégorie'}</h3>
                  <div className="modal-subtitle">{editingId ? 'Modification — référentiel produit SENTINEL' : 'Nouvelle catégorie — référentiel produit SENTINEL'}</div>
                </div>
                <button className="btn-close" onClick={() => setShowForm(false)} type="button"><X size={18} /></button>
              </div>
              {formError && <div className="alert alert-error" style={{ margin:'16px 20px 0' }}><AlertTriangle size={14} /> {formError}</div>}
              <form onSubmit={saveCategory} className="ref-form">
                <div className="ref-form-grid">
                  <section className="form-section">
                    <h4><FolderOpen size={13} /> Informations générales</h4>
                    <div className="form-group">
                      <label htmlFor="name">Nom *</label>
                      <input id="name" type="text" name="name" value={formData.name} onChange={handleFormChange} maxLength={60} required placeholder="Ex : Courroies, Réactifs chimiques…" />
                    </div>
                    <div className="form-group">
                      <label htmlFor="description">Description métier</label>
                      <textarea id="description" name="description" value={formData.description} onChange={handleFormChange} rows={5} maxLength={400} placeholder="Contexte métier, règles de classement…" />
                      <p className="field-hint">{400 - (formData.description || '').length} car. restants</p>
                    </div>
                  </section>
                  <section className="form-section">
                    <h4><Tags size={13} /> Classification métier</h4>
                    <div className="form-group">
                      <label htmlFor="parent_family">Famille parente *</label>
                      <select id="parent_family" name="parent_family" value={formData.parent_family} onChange={handleFormChange} required>
                        <option value="">Sélectionner une famille</option>
                        {Object.entries(FAMILY_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Audiences</label>
                      <div className="check-grid">
                        {Object.entries(AUDIENCE_LABEL).map(([k,v]) => (
                          <label key={k} className="check-item">
                            <input type="checkbox" checked={formData.audiences.includes(k)} onChange={() => handleFormArrayToggle(k, 'audiences')} /><span>{v}</span>
                          </label>
                        ))}
                      </div>
                      <p className="field-hint">Laisser vide = visible pour tous.</p>
                    </div>
                    <div className="form-group">
                      <label>Tags techniques</label>
                      <div className="check-grid">
                        {['chimique','epi','entretien','bureautique','petrole'].map(t => (
                          <label key={t} className="check-item">
                            <input type="checkbox" checked={formData.tags.includes(t)} onChange={() => handleFormArrayToggle(t, 'tags')} /><span>{t}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <button type="button" className="advanced-toggle" onClick={() => setAdvancedVisibilityOpen(p => !p)}>
                      <ChevronDown size={13} style={{ transform: advancedVisibilityOpen ? 'rotate(180deg)' : 'none', transition:'0.2s' }} />
                      Visibilité avancée (optionnel)
                    </button>
                    {advancedVisibilityOpen && (
                      <div className="advanced-visibility">
                        {[
                          { field:'visible_metiers',  label:'Métiers autorisés',  ph:'chimiste, mécanicien…' },
                          { field:'visible_sites',    label:'Sites autorisés',    ph:'labo1, depot2…' },
                          { field:'visible_services', label:'Services autorisés', ph:'hse, maintenance…' },
                        ].map(({ field, label, ph }) => (
                          <div className="form-group" key={field}>
                            <label>{label}</label>
                            <input type="text" value={toCsv(formData[field])} onChange={e => updateCsvField(field, e.target.value)} placeholder={ph} />
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                  <section className="form-section">
                    <h4><ShieldAlert size={13} /> Règles de contrôle</h4>
                    {[
                      { name:'is_sensitive',                label:'Catégorie sensible' },
                      { name:'requires_special_validation', label:'Validation spéciale obligatoire' },
                      { name:'requires_fds',                label:'Fiche technique / FDS obligatoire' },
                      { name:'requires_lot_tracking',       label:'Suivi par lot obligatoire' },
                      { name:'requires_expiry_date',        label:'Date de péremption obligatoire' },
                    ].map(({ name, label }) => (
                      <label key={name} className="checkbox-label large">
                        <input type="checkbox" name={name} checked={formData[name]} onChange={handleFormChange} />{label}
                      </label>
                    ))}
                  </section>
                  <section className="form-section impact">
                    <h4><Zap size={13} /> Aperçu de l'impact</h4>
                    <div className="impact-box">
                      {impactPreview.map(line => (
                        <div className="impact-line" key={line}><AlertTriangle size={13} /><span>{line}</span></div>
                      ))}
                    </div>
                  </section>
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-success">
                    <CheckCircle2 size={15} /> {editingId ? 'Enregistrer les modifications' : 'Créer la catégorie'}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Annuler</button>
                </div>
              </form>
            </div>
          </div>
        )}

        <ConfirmDialog open={confirmDialog.open} config={confirmDialog.config} onConfirm={confirmDialog.onConfirm} onCancel={closeConfirm} />
        <PromptDialog  open={promptDialog.open}  config={promptDialog.config}  onConfirm={promptDialog.onConfirm}  onCancel={closePrompt}  />
      </div>
    </ProtectedPage>
  );
}