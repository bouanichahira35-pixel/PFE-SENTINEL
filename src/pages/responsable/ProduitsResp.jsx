import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Archive,
  CheckCircle2,
  Clock,
  Layers,
  Mail,
  Package,
  PanelRightOpen,
  Pencil,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  Truck,
  X,
} from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { get, post, put } from '../../services/api';
import { recommendFournisseurs } from '../../services/fournisseurRecommendationService';
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

const OPEN_ORDER_STATUSES = new Set(['draft', 'ordered']);

function computeProductStockStatus(quantity, seuil) {
  const q = Number(quantity || 0);
  const s = Number(seuil || 0);
  if (q <= 0) return 'rupture';
  if (q <= s) return 'sous_seuil';
  return 'ok';
}

function getRecommendedOrderQty(product) {
  const stock = Number(product?.quantity_current || 0);
  const seuil = Number(product?.seuil_minimum || 0);
  const buffer = Math.max(5, Math.ceil(seuil * 1.5));
  return Math.max(1, Math.ceil((seuil + buffer) - stock));
}

function normalizeSupplierRecommendation(raw) {
  if (!raw) return null;
  return {
    id: String(raw?.supplier_id || raw?._id || raw?.id || '').trim(),
    name: raw?.supplier_name || raw?.name || raw?.nom || 'Fournisseur',
    score: Number(raw?.score || 0),
    leadTimeDays: Number(raw?.lead_time_days ?? raw?.default_lead_time_days ?? 7),
    email: raw?.email || raw?.supplier_email || '',
    phone: raw?.phone || raw?.supplier_phone || '',
  };
}

function getProductId(value) {
  return String(value?._id || value?.id || '').trim();
}

function getOrderProductId(line) {
  return String(line?.product?._id || line?.product || line?.product_id || '').trim();
}

function formatDateFr(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('fr-FR');
}

function getProductOpenOrder(product, orders) {
  const productId = getProductId(product);
  if (!productId) return null;
  return (Array.isArray(orders) ? orders : []).find((order) => {
    const status = String(order?.status || '').toLowerCase();
    if (!OPEN_ORDER_STATUSES.has(status)) return false;
    return (Array.isArray(order?.lines) ? order.lines : []).some((line) => getOrderProductId(line) === productId);
  }) || null;
}

function getOrderEta(order) {
  return order?.supplier_ack?.eta_date || order?.promised_at || order?.delivered_at || null;
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
  const [products, setProducts] = useState([]);
  const [inactiveReasonFilter, setInactiveReasonFilter] = useState('all'); // all | rupture | no_demand
  const [inactiveDays, setInactiveDays] = useState(60);
  const [categories, setCategories] = useState([]);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editDraft, setEditDraft] = useState(null);
  const [openOrders, setOpenOrders] = useState([]);
  const [quickOrderProduct, setQuickOrderProduct] = useState(null);
  const [quickOrderQty, setQuickOrderQty] = useState(1);
  const [quickSupplier, setQuickSupplier] = useState(null);
  const [quickSupplierLoading, setQuickSupplierLoading] = useState(false);
  const [detailProduct, setDetailProduct] = useState(null);
  const [detailSupplier, setDetailSupplier] = useState(null);
  const [bulkPanelOpen, setBulkPanelOpen] = useState(false);
  const [bulkGroups, setBulkGroups] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  const categoryFilterId = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    return String(params.get('category') || '').trim();
  }, [location.search]);

  const assignMode = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    return String(params.get('mode') || '').trim().toLowerCase() === 'assign';
  }, [location.search]);

  const [showOnlyCategory, setShowOnlyCategory] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

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
        const productParams = new URLSearchParams({
          include_archived: includeArchived || archivedOnly ? '1' : '0',
        });
        if (archivedOnly) productParams.set('archived_only', '1');
        const data = await get(`/products?${productParams.toString()}`);
        setProducts(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      toast.error(err?.message || 'Erreur chargement produits');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [archivedOnly, includeArchived, inactiveDays, inactiveOnly, toast]);

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

  const loadOpenOrders = useCallback(async () => {
    try {
      const payload = await get('/purchase-orders?limit=160');
      const items = Array.isArray(payload?.purchase_orders) ? payload.purchase_orders : [];
      setOpenOrders(items.filter((order) => OPEN_ORDER_STATUSES.has(String(order?.status || '').toLowerCase())));
    } catch {
      setOpenOrders([]);
    }
  }, []);

  const refreshPage = useCallback(async () => {
    await Promise.all([load(), loadOpenOrders()]);
  }, [load, loadOpenOrders]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    loadOpenOrders();
  }, [loadOpenOrders]);

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

      if (inactiveOnly) {
        const reason = String(p?.inactive_reason || '').trim();
        if (inactiveReasonFilter !== 'all' && reason !== inactiveReasonFilter) return false;
      }

      if (categoryFilterId) {
        const productCategoryId = p?.category?._id ? String(p.category._id) : '';
        const shouldFilterByCategory = !assignMode || showOnlyCategory;
        if (shouldFilterByCategory && productCategoryId !== categoryFilterId) return false;
      }

      return true;
    });
  }, [
    archivedOnly,
    categoryFilterId,
    criticalOnly,
    assignMode,
    inactiveOnly,
    inactiveReasonFilter,
    products,
    search,
    showOnlyCategory,
    statusFilter,
  ]);

  const productById = useMemo(() => {
    const map = new Map();
    for (const p of products || []) {
      const id = getProductId(p);
      if (id) map.set(id, p);
    }
    return map;
  }, [products]);

  const pageStats = useMemo(() => {
    const base = products || [];
    return base.reduce((acc, p) => {
      const status = computeProductStockStatus(p?.quantity_current, p?.seuil_minimum);
      acc.total += 1;
      if (status === 'rupture') acc.rupture += 1;
      if (status === 'sous_seuil') acc.sousSeuil += 1;
      if (String(p?.lifecycle_status || 'active') === 'archived') acc.archived += 1;
      return acc;
    }, { total: 0, rupture: 0, sousSeuil: 0, archived: 0 });
  }, [products]);

  const selectedProducts = useMemo(
    () => (selectedIds || []).map((id) => productById.get(String(id))).filter(Boolean),
    [productById, selectedIds]
  );

  const selectedCriticalProducts = useMemo(
    () => selectedProducts.filter((p) => {
      const status = computeProductStockStatus(p?.quantity_current, p?.seuil_minimum);
      return status === 'rupture' || status === 'sous_seuil';
    }),
    [selectedProducts]
  );

  const attentionCategory = useMemo(() => {
    const currentId = String(categoryFilterId || '');
    const counts = new Map();
    for (const p of products || []) {
      const status = computeProductStockStatus(p?.quantity_current, p?.seuil_minimum);
      if (status !== 'rupture' && status !== 'sous_seuil') continue;
      const id = p?.category?._id ? String(p.category._id) : '';
      if (!id || id === currentId) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    const best = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    if (!best) return null;
    const category = (categories || []).find((c) => String(c?._id || '') === best[0]);
    return category ? { ...category, criticalCount: best[1] } : null;
  }, [categories, categoryFilterId, products]);

  const detailAlternatives = useMemo(() => {
    if (!detailProduct) return [];
    const categoryId = detailProduct?.category?._id ? String(detailProduct.category._id) : '';
    const family = String(detailProduct?.family || '');
    return (products || [])
      .filter((p) => getProductId(p) !== getProductId(detailProduct))
      .filter((p) => {
        if (computeProductStockStatus(p?.quantity_current, p?.seuil_minimum) !== 'ok') return false;
        const sameCategory = categoryId && p?.category?._id && String(p.category._id) === categoryId;
        const sameFamily = family && String(p?.family || '') === family;
        return sameCategory || sameFamily;
      })
      .slice(0, 4);
  }, [detailProduct, products]);

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

  const openQuickOrder = useCallback((product) => {
    if (!product?._id) return;
    const qty = getRecommendedOrderQty(product);
    setQuickOrderProduct(product);
    setQuickOrderQty(qty);
    setQuickSupplier(null);
    setQuickSupplierLoading(true);
    recommendFournisseurs({ productId: String(product._id), quantity: qty })
      .then((payload) => setQuickSupplier(normalizeSupplierRecommendation(payload?.recommended)))
      .catch(() => setQuickSupplier(null))
      .finally(() => setQuickSupplierLoading(false));
  }, []);

  const closeQuickOrder = useCallback(() => {
    setQuickOrderProduct(null);
    setQuickSupplier(null);
    setQuickSupplierLoading(false);
  }, []);

  const createQuickOrder = useCallback(async () => {
    if (!quickOrderProduct?._id) return;
    const qty = Number(quickOrderQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error('Quantite invalide.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await post('/purchase-orders/quick', {
        product_id: String(quickOrderProduct._id),
        quantity: qty,
        supplier_id: quickSupplier?.id || undefined,
        note: `Commande rapide depuis Produits Responsable. Stock=${Number(quickOrderProduct?.quantity_current || 0)}, seuil=${Number(quickOrderProduct?.seuil_minimum || 0)}.`,
        decision_id: `PROD-SMART-${Date.now()}`,
        decision_title: 'Smart Action produit critique',
        decision_kind: 'product_smart_action',
        decision_level: 'warning',
      });
      toast.success('Commande fournisseur creee.');
      closeQuickOrder();
      await Promise.all([load(), loadOpenOrders()]);
      const poId = String(created?._id || created?.purchase_order_id || '').trim();
      if (poId) navigate(`/responsable/commandes/${poId}`);
    } catch (err) {
      toast.error(err?.message || 'Creation commande echouee');
    } finally {
      setSubmitting(false);
    }
  }, [closeQuickOrder, load, loadOpenOrders, navigate, quickOrderProduct, quickOrderQty, quickSupplier?.id, toast]);

  const openDetailPanel = useCallback((product) => {
    if (!product?._id) return;
    setDetailProduct(product);
    setDetailSupplier(null);
    const qty = getRecommendedOrderQty(product);
    recommendFournisseurs({ productId: String(product._id), quantity: qty })
      .then((payload) => setDetailSupplier(normalizeSupplierRecommendation(payload?.recommended)))
      .catch(() => setDetailSupplier(null));
  }, []);

  const closeDetailPanel = useCallback(() => {
    setDetailProduct(null);
    setDetailSupplier(null);
  }, []);

  const targetCategory = useMemo(() => {
    if (!categoryFilterId) return null;
    return (categories || []).find((c) => String(c?._id || '') === String(categoryFilterId)) || null;
  }, [categories, categoryFilterId]);

  const toggleSelected = useCallback((productId, checked) => {
    const id = String(productId || '').trim();
    if (!id) return;
    setSelectedIds((prev) => {
      const set = new Set((Array.isArray(prev) ? prev : []).map((x) => String(x)));
      if (checked) set.add(id);
      else set.delete(id);
      return Array.from(set);
    });
  }, []);

  const selectAllFiltered = useCallback(() => {
    setSelectedIds((prev) => {
      const set = new Set((Array.isArray(prev) ? prev : []).map((x) => String(x)));
      for (const p of filtered || []) {
        if (p?._id) set.add(String(p._id));
      }
      return Array.from(set);
    });
  }, [filtered]);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const prepareBulkSelection = useCallback(async () => {
    if (!selectedCriticalProducts.length) {
      toast.warning('Selectionnez au moins un produit critique ou en rupture.');
      return;
    }

    setBulkPanelOpen(true);
    setBulkLoading(true);
    try {
      const enriched = await Promise.all(selectedCriticalProducts.map(async (product) => {
        const qty = getRecommendedOrderQty(product);
        try {
          const payload = await recommendFournisseurs({ productId: getProductId(product), quantity: qty });
          return { product, qty, supplier: normalizeSupplierRecommendation(payload?.recommended) };
        } catch {
          return { product, qty, supplier: null };
        }
      }));

      const groups = new Map();
      for (const item of enriched) {
        const supplierId = item.supplier?.id || '';
        const fallbackKey = `pending:${String(item.product?.category?.name || item.product?.family || 'A confirmer')}`;
        const key = supplierId ? `supplier:${supplierId}` : fallbackKey;
        if (!groups.has(key)) {
          groups.set(key, {
            key,
            supplier: item.supplier,
            label: item.supplier?.name || String(item.product?.category?.name || item.product?.family || 'Fournisseur a confirmer'),
            items: [],
          });
        }
        groups.get(key).items.push(item);
      }

      setBulkGroups(Array.from(groups.values()));
    } finally {
      setBulkLoading(false);
    }
  }, [selectedCriticalProducts, toast]);

  const createBulkOrders = useCallback(async () => {
    const readyGroups = (bulkGroups || []).filter((group) => group?.supplier?.id && Array.isArray(group.items) && group.items.length);
    if (!readyGroups.length) {
      toast.warning('Aucun groupe avec fournisseur recommande exploitable.');
      return;
    }

    setSubmitting(true);
    try {
      for (const group of readyGroups) {
        const lead = Number(group?.supplier?.leadTimeDays || 7);
        const promisedAt = new Date();
        promisedAt.setDate(promisedAt.getDate() + Math.max(1, Math.floor(lead)));
        await post('/purchase-orders', {
          supplier_id: group.supplier.id,
          promised_at: promisedAt.toISOString().slice(0, 10),
          status: 'ordered',
          note: `Commande groupee depuis Produits Responsable (${group.items.length} ligne(s)).`,
          decision_id: `PROD-BULK-${Date.now()}-${String(group.supplier.id).slice(-6)}`,
          lines: group.items.map((item) => ({
            product_id: getProductId(item.product),
            quantity: Number(item.qty || 1),
            unit_price: 0,
          })),
        });
      }
      toast.success(`${readyGroups.length} commande(s) fournisseur creee(s).`);
      setBulkPanelOpen(false);
      setBulkGroups([]);
      clearSelection();
      await Promise.all([load(), loadOpenOrders()]);
    } catch (err) {
      toast.error(err?.message || 'Creation des commandes groupees echouee');
    } finally {
      setSubmitting(false);
    }
  }, [bulkGroups, clearSelection, load, loadOpenOrders, toast]);

  useEffect(() => {
    if (!assignMode) {
      setSelectedIds([]);
      setShowOnlyCategory(false);
      return;
    }

    const ids = new Set((products || []).map((p) => String(p?._id || '')).filter(Boolean));
    setSelectedIds((prev) => (Array.isArray(prev) ? prev.filter((id) => ids.has(String(id))) : []));
  }, [assignMode, products]);

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

  const bulkUpdateCategory = useCallback(async (action) => {
    const act = String(action || '').trim().toLowerCase();
    if (!['set', 'clear'].includes(act)) return;

    const ids = (Array.isArray(selectedIds) ? selectedIds : []).map((x) => String(x)).filter(Boolean);
    if (!ids.length) {
      toast.warning('Sélectionnez au moins un produit.');
      return;
    }

    if (act === 'set' && !categoryFilterId) {
      toast.warning('Choisissez une catégorie cible.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = act === 'clear'
        ? { action: 'clear', product_ids: ids }
        : { action: 'set', product_ids: ids, category_id: categoryFilterId };

      await post('/products/bulk/category', payload);

      toast.success(
        act === 'clear'
          ? `${ids.length} produit(s) déclassé(s).`
          : `${ids.length} produit(s) affecté(s) à la catégorie.`
      );
      clearSelection();
      await load();
    } catch (err) {
      toast.error(err?.message || 'Échec mise à jour catégories');
    } finally {
      setSubmitting(false);
    }
  }, [categoryFilterId, clearSelection, load, selectedIds, toast]);

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

  const title = inactiveOnly ? 'Produits inactifs' : 'Référentiel produits';
  const subtitle = inactiveOnly
    ? `Rupture ou manque de demandes sur ${inactiveDays} jours`
    : 'Catalogue, seuils, ruptures et actions d approvisionnement';
  const selectionEnabled = assignMode || !inactiveOnly;

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
            onRefresh={refreshPage}
            onMenuClick={() => setSidebarCollapsed((p) => !p)}
          />

          {(loading || submitting) && <LoadingSpinner overlay text="Chargement..." />}

          <div className="resp-products-page">
            <section className="resp-products-crisis-head" aria-label="Synthese produits">
              <div className="resp-products-crisis-title">
                <Sparkles size={18} />
                <div>
                  <strong>Priorisation intelligente</strong>
                  <span>Ruptures, seuils critiques et commandes ouvertes au même endroit.</span>
                </div>
              </div>
              <div className="resp-products-kpis">
                <div className="resp-products-kpi danger"><span>Ruptures</span><strong>{pageStats.rupture}</strong></div>
                <div className="resp-products-kpi warning"><span>Sous seuil</span><strong>{pageStats.sousSeuil}</strong></div>
                <div className="resp-products-kpi info"><span>Commandes ouvertes</span><strong>{openOrders.length}</strong></div>
                <div className="resp-products-kpi neutral"><span>Total catalogue</span><strong>{pageStats.total}</strong></div>
              </div>
            </section>

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
                {!inactiveOnly && (
                  <label className="resp-products-filter">
                    <span>Catégorie</span>
                    <select
                      value={categoryFilterId}
                      onChange={(e) => {
                        const params = new URLSearchParams(location.search || '');
                        const next = String(e.target.value || '').trim();
                        if (next) params.set('category', next);
                        else params.delete('category');
                        const nextSearch = params.toString();
                        navigate({ pathname: '/responsable/produits', search: nextSearch ? `?${nextSearch}` : '' });
                      }}
                      disabled={loading || submitting}
                    >
                      <option value="">Toutes</option>
                      {categories.map((c) => (
                        <option key={String(c._id)} value={String(c._id)}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                {inactiveOnly && (
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
                  <button className="btn" type="button" onClick={() => navigate('/responsable/demandes-a-traiter')}>
                    <RefreshCw size={16} />
                    Voir demandes
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

            {!assignMode && !inactiveOnly && (
              <div className={`resp-products-bulkbar ${selectedCriticalProducts.length ? 'active' : ''}`}>
                <div className="resp-products-bulk-left">
                  <ShoppingCart size={18} />
                  <div>
                    <strong>Mode commande groupée</strong>
                    <span>{selectedCriticalProducts.length} produit(s) critique(s) sélectionné(s)</span>
                  </div>
                </div>
                <div className="resp-products-bulk-actions">
                  <button className="btn" type="button" onClick={selectAllFiltered} disabled={loading || submitting || !filtered.length}>
                    Tout cocher
                  </button>
                  <button className="btn" type="button" onClick={clearSelection} disabled={loading || submitting || !selectedIds.length}>
                    Vider
                  </button>
                  <button
                    className="btn primary"
                    type="button"
                    onClick={prepareBulkSelection}
                    disabled={loading || submitting || !selectedCriticalProducts.length}
                  >
                    <ShoppingCart size={16} />
                    Traiter la sélection
                  </button>
                </div>
              </div>
            )}

            {assignMode && (
              <div className="resp-products-assign" role="region" aria-label="Affectation catégorie">
                <div className="resp-products-assign-left">
                  <strong>Mode association catégorie</strong>
                  <div className="muted">
                    Catégorie cible:{' '}
                    {targetCategory?.name || (categoryFilterId ? 'Catégorie introuvable' : 'Non sélectionnée')}
                    {' '}— Sélection: {Number(selectedIds?.length || 0)}
                  </div>
                </div>
                <div className="resp-products-assign-actions">
                  <label className="resp-products-assign-toggle">
                    <input
                      type="checkbox"
                      checked={showOnlyCategory}
                      onChange={(e) => setShowOnlyCategory(e.target.checked)}
                      disabled={!categoryFilterId}
                    />
                    <span>Voir seulement déjà associés</span>
                  </label>
                  <button className="btn" type="button" onClick={selectAllFiltered} disabled={loading || submitting}>
                    Tout cocher (filtré)
                  </button>
                  <button className="btn" type="button" onClick={clearSelection} disabled={loading || submitting}>
                    Vider sélection
                  </button>
                  <button
                    className="btn primary"
                    type="button"
                    onClick={() => bulkUpdateCategory('set')}
                    disabled={loading || submitting || !categoryFilterId}
                    title={!categoryFilterId ? 'Choisissez une catégorie cible' : ''}
                  >
                    Associer
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => bulkUpdateCategory('clear')}
                    disabled={loading || submitting}
                  >
                    Déclasser
                  </button>
                </div>
              </div>
            )}

            <div className="resp-products-card">
              <table className="resp-products-table">
                <thead>
                  <tr>
                    {selectionEnabled ? <th style={{ width: 42 }}></th> : null}
                    <th>Code</th>
                    <th>Produit</th>
                    <th>Catégorie</th>
                    <th>Famille</th>
                    <th>Stock</th>
                    <th>Seuil</th>
                    <th>Statut</th>
                    {!inactiveOnly ? <th>Action IA</th> : null}
                    {inactiveOnly ? (
                      <>
                        <th>Raison</th>
                        <th>Dernière demande</th>
                        <th>Actions</th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 120).map((p) => {
                    const stock = Number(p?.quantity_current || 0);
                    const seuil = Number(p?.seuil_minimum || 0);
                    const stockStatus = computeProductStockStatus(stock, seuil);
                    const familyLabel = FAMILY_LABEL[String(p?.family || '')] || (p?.family || '-');
                    const inactiveReason = String(p?.inactive_reason || '');
                    const lastReq = p?.last_request_at ? new Date(p.last_request_at).toLocaleString('fr-FR') : '-';
                    const rowId = String(p?._id || '');
                    const isSelected = rowId ? selectedIds.includes(rowId) : false;
                    const inTargetCategory = Boolean(categoryFilterId && p?.category?._id && String(p.category._id) === String(categoryFilterId));
                    const openOrder = getProductOpenOrder(p, openOrders);
                    const orderEta = getOrderEta(openOrder);
                    return (
                      <tr key={String(p?._id)}>
                        {selectionEnabled ? (
                          <td>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => toggleSelected(rowId, e.target.checked)}
                              disabled={!rowId || loading || submitting}
                              aria-label="Sélectionner le produit"
                            />
                          </td>
                        ) : null}
                        <td className="muted">{p?.code_product || '-'}</td>
                        <td>
                          <button className="prod-name prod-name-btn" type="button" onClick={() => openDetailPanel(p)}>
                            <span>{p?.name || 'Produit'}</span>
                            <PanelRightOpen size={15} />
                          </button>
                        </td>
                        <td className="muted">
                          {p?.category?.name || '-'}
                          {assignMode && inTargetCategory ? <span className="pill ok" style={{ marginLeft: 8 }}>OK</span> : null}
                        </td>
                        <td className="muted">{familyLabel}</td>
                        <td className={stockStatus !== 'ok' ? 'overdue' : 'muted'}>{stock}</td>
                        <td className="muted">{seuil}</td>
                        <td>
                          <span className={`pill ${stockStatus}`}>
                            {stockStatus === 'ok' ? 'OK' : stockStatus === 'sous_seuil' ? 'Sous seuil' : 'Rupture'}
                          </span>
                        </td>
                        {!inactiveOnly ? (
                          <td>
                            {openOrder && stockStatus !== 'ok' ? (
                              <button
                                className="smart-action follow"
                                type="button"
                                title={`Arrivee prevue le ${formatDateFr(orderEta)}${openOrder?.supplier?.name ? ` par ${openOrder.supplier.name}` : ''}`}
                                onClick={() => navigate(`/responsable/commandes/${String(openOrder._id)}`)}
                              >
                                <Clock size={15} />
                                Suivre livraison
                              </button>
                            ) : stockStatus === 'rupture' || stockStatus === 'sous_seuil' ? (
                              <button className="smart-action order" type="button" onClick={() => openQuickOrder(p)} disabled={submitting}>
                                <Package size={15} />
                                Commander
                              </button>
                            ) : (
                              <button className="smart-action inspect" type="button" onClick={() => openDetailPanel(p)}>
                                <PanelRightOpen size={15} />
                                Analyser
                              </button>
                            )}
                          </td>
                        ) : null}
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
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {!loading && filtered.length === 0 && (
                <div className="resp-products-empty crisis">
                  <CheckCircle2 size={34} />
                  <div>
                    <strong>
                      {statusFilter === 'rupture' || statusFilter === 'sous_seuil' || criticalOnly
                        ? 'Bravo, aucun produit critique dans ce périmètre.'
                        : 'Aucun produit ne correspond aux filtres.'}
                    </strong>
                    <span>
                      {attentionCategory
                        ? `${attentionCategory.name} demande encore de l attention (${attentionCategory.criticalCount} alerte(s)).`
                        : 'Le catalogue visible est propre pour ce filtre.'}
                    </span>
                  </div>
                  {attentionCategory ? (
                    <button
                      className="btn primary"
                      type="button"
                      onClick={() => navigate(`/responsable/produits?category=${encodeURIComponent(String(attentionCategory._id))}&filter=critiques`)}
                    >
                      Voir {attentionCategory.name}
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {quickOrderProduct && (
        <div className="prod-modal-backdrop" role="dialog" aria-modal="true" onClick={closeQuickOrder}>
          <div className="prod-modal smart-order-modal" onClick={(e) => e.stopPropagation()}>
            <div className="prod-modal-head">
              <div>
                <strong>Commande rapide</strong>
                <div className="muted">{quickOrderProduct.code_product || getProductId(quickOrderProduct)}</div>
              </div>
              <button className="btn" type="button" onClick={closeQuickOrder} disabled={submitting}>Fermer</button>
            </div>
            <div className="prod-modal-body">
              <div className="smart-order-product">
                <Package size={22} />
                <div>
                  <strong>{quickOrderProduct.name || 'Produit'}</strong>
                  <span>Stock actuel {Number(quickOrderProduct.quantity_current || 0)} / seuil {Number(quickOrderProduct.seuil_minimum || 0)}</span>
                </div>
              </div>
              <div className="prod-form-grid">
                <label className="prod-field">
                  <span>Quantité recommandée</span>
                  <input
                    type="number"
                    min="1"
                    value={quickOrderQty}
                    onChange={(e) => setQuickOrderQty(e.target.value)}
                    disabled={submitting}
                  />
                </label>
                <div className="prod-field">
                  <span>Fournisseur recommandé</span>
                  <div className="supplier-reco-box">
                    {quickSupplierLoading ? (
                      'Recherche du meilleur fournisseur...'
                    ) : quickSupplier ? (
                      <>
                        <strong>{quickSupplier.name}</strong>
                        <span>Score {quickSupplier.score ? quickSupplier.score.toFixed(1) : '-'} / 100 • délai {quickSupplier.leadTimeDays || 7}j</span>
                      </>
                    ) : (
                      'Aucun fournisseur recommandé. Le backend choisira un fournisseur actif si possible.'
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="prod-modal-footer">
              <button className="btn" type="button" onClick={() => navigate(`/responsable/commandes/nouvelle?produitId=${encodeURIComponent(getProductId(quickOrderProduct))}&quantite=${encodeURIComponent(String(quickOrderQty || 1))}&source=produits-smart-action`)} disabled={submitting}>
                Ouvrir formulaire complet
              </button>
              <button className="btn primary" type="button" onClick={createQuickOrder} disabled={submitting || quickSupplierLoading}>
                <ShoppingCart size={16} />
                Créer commande
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkPanelOpen && (
        <div className="prod-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setBulkPanelOpen(false)}>
          <div className="prod-modal bulk-order-modal" onClick={(e) => e.stopPropagation()}>
            <div className="prod-modal-head">
              <div>
                <strong>Traitement groupé</strong>
                <div className="muted">{selectedCriticalProducts.length} produit(s) critique(s) à approvisionner</div>
              </div>
              <button className="btn" type="button" onClick={() => setBulkPanelOpen(false)} disabled={submitting}>Fermer</button>
            </div>
            <div className="prod-modal-body">
              {bulkLoading ? (
                <div className="resp-products-empty">Regroupement par fournisseur recommandé...</div>
              ) : (
                <div className="bulk-groups">
                  {bulkGroups.map((group) => (
                    <div className="bulk-group" key={group.key}>
                      <div className="bulk-group-head">
                        <div>
                          <strong>{group.label}</strong>
                          <span>{group.items.length} ligne(s) • {group.supplier?.id ? 'commande automatique possible' : 'fournisseur à confirmer'}</span>
                        </div>
                        {group.supplier?.leadTimeDays ? <span className="pill pending">Délai {group.supplier.leadTimeDays}j</span> : null}
                      </div>
                      <div className="bulk-lines">
                        {group.items.map((item) => (
                          <div className="bulk-line" key={getProductId(item.product)}>
                            <span>{item.product?.name || 'Produit'}</span>
                            <strong>Qté {item.qty}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {!bulkGroups.length ? <div className="resp-products-empty">Aucun groupe exploitable.</div> : null}
                </div>
              )}
            </div>
            <div className="prod-modal-footer">
              <button className="btn" type="button" onClick={() => navigate('/responsable/commandes/nouvelle?source=produits-selection')} disabled={submitting}>
                Préparer manuellement
              </button>
              <button className="btn primary" type="button" onClick={createBulkOrders} disabled={submitting || bulkLoading || !bulkGroups.some((g) => g?.supplier?.id)}>
                <Layers size={16} />
                Générer les commandes
              </button>
            </div>
          </div>
        </div>
      )}

      {detailProduct && (
        <div className="prod-slide-overlay" onClick={closeDetailPanel}>
          <aside className="prod-slide-panel" aria-label="Analyse produit" onClick={(e) => e.stopPropagation()}>
            <div className="prod-slide-head">
              <div>
                <span className="pill pending">{detailProduct.code_product || 'Produit'}</span>
                <h2>{detailProduct.name || 'Produit'}</h2>
              </div>
              <button className="header-icon-btn" type="button" onClick={closeDetailPanel} aria-label="Fermer">
                <X size={18} />
              </button>
            </div>

            <div className="prod-slide-section">
              <h3><Truck size={17} />Fournisseur recommandé</h3>
              {detailSupplier ? (
                <div className="supplier-contact">
                  <strong>{detailSupplier.name}</strong>
                  <span>Score {detailSupplier.score ? detailSupplier.score.toFixed(1) : '-'} / 100 • délai {detailSupplier.leadTimeDays || 7}j</span>
                  <div className="supplier-contact-actions">
                    <a className="btn" href={`mailto:${detailSupplier.email || ''}?subject=${encodeURIComponent(`Demande ETA - ${detailProduct.name || 'Produit'}`)}`}>
                      <Mail size={15} />
                      Email type
                    </a>
                    <button className="btn primary" type="button" onClick={() => openQuickOrder(detailProduct)}>
                      <ShoppingCart size={15} />
                      Commander
                    </button>
                  </div>
                </div>
              ) : (
                <div className="resp-products-empty">Aucun fournisseur recommandé disponible.</div>
              )}
            </div>

            <div className="prod-slide-section">
              <h3><Sparkles size={17} />Evolution stock estimée</h3>
              <div className="stock-trend">
                {[90, 60, 30].map((daysBack, idx) => {
                  const stockNow = Number(detailProduct?.quantity_current || 0);
                  const seuilNow = Number(detailProduct?.seuil_minimum || 0);
                  const estimated = Math.max(0, Math.round(stockNow + (2 - idx) * Math.max(1, Math.ceil(seuilNow / 3))));
                  const width = Math.min(100, Math.max(8, seuilNow > 0 ? (estimated / Math.max(seuilNow * 2, 1)) * 100 : 35));
                  return (
                    <div className="trend-row" key={daysBack}>
                      <span>M-{daysBack}</span>
                      <div><i style={{ width: `${width}%` }} /></div>
                      <strong>{estimated}</strong>
                    </div>
                  );
                })}
                <div className="trend-row now">
                  <span>Aujourd hui</span>
                  <div><i style={{ width: `${Math.min(100, Math.max(8, Number(detailProduct?.quantity_current || 0) / Math.max(Number(detailProduct?.seuil_minimum || 1) * 2, 1) * 100))}%` }} /></div>
                  <strong>{Number(detailProduct?.quantity_current || 0)}</strong>
                </div>
              </div>
            </div>

            <div className="prod-slide-section">
              <h3><Package size={17} />Alternatives disponibles</h3>
              {detailAlternatives.length ? (
                <div className="alternative-list">
                  {detailAlternatives.map((alt) => (
                    <button className="alternative-item" type="button" key={getProductId(alt)} onClick={() => openDetailPanel(alt)}>
                      <span>{alt.name || 'Produit'}</span>
                      <strong>Stock {Number(alt.quantity_current || 0)}</strong>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="resp-products-empty">Aucune alternative active avec stock suffisant.</div>
              )}
            </div>
          </aside>
        </div>
      )}

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
