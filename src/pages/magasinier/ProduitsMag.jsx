// BLOC 1 - Role du fichier.
// Ce fichier affiche une page de l'espace magasinier pour ProduitsMag.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Plus, Eye, ArrowDownToLine, ArrowUpFromLine, ChevronLeft, ChevronRight } from 'lucide-react';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import ProtectedImage from '../../components/shared/ProtectedImage';
import { useToast } from '../../components/shared/Toast';
import { get } from '../../services/api';
import { useUiLanguage } from '../../utils/uiLanguage';
import useIsMobile from '../../hooks/useIsMobile';
import './ProduitsMag.css';
const ITEMS_PER_PAGE = 8;

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function resolveProductImage(product) {
  if (product?.image) return product.image;
  const categorySlug = slugify(product?.categorie || '');
  if (categorySlug) return `/catalogue/${categorySlug}.svg`;
  return '/catalogue/default.svg';
}

const ProduitsMag = ({ userName, onLogout }) => {
  const lang = useUiLanguage();
  const navigate = useNavigate();
  const toast = useToast();
  const isMobile = useIsMobile(640);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [categoriesList, setCategoriesList] = useState([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [statusCounts, setStatusCounts] = useState({ all: 0, disponible: 0, 'sous-seuil': 0, rupture: 0 });
  const [previewImage, setPreviewImage] = useState(null);
  const i18n = {
    fr: {
      title: 'Gestion des Produits',
      loading: 'Chargement...',
      all: 'Tous',
      available: 'Disponible',
      low: 'Sous seuil',
      out: 'Rupture',
      allCats: 'Toutes les categories',
      add: 'Ajouter produit',
      code: 'Code',
      product: 'Produit',
      category: 'Categorie',
      qty: 'Quantite',
      min: 'Seuil Min.',
      state: 'Etat',
      actions: 'Actions',
      noProducts: 'Aucun produit trouve',
      updated: 'Liste des produits actualisee',
      prev: 'Page precedente',
      next: 'Page suivante',
      page: 'Page',
      details: 'Voir details',
      entry: 'Entree de stock',
      exit: 'Sortie de stock',
      outStock: 'Stock epuise',
      noStock: 'Stock insuffisant pour ce produit',
      filterCat: 'Filtrer par categorie',
    },
    en: {
      title: 'Product Management',
      loading: 'Loading...',
      all: 'All',
      available: 'Available',
      low: 'Low stock',
      out: 'Out of stock',
      allCats: 'All categories',
      add: 'Add product',
      code: 'Code',
      product: 'Product',
      category: 'Category',
      qty: 'Quantity',
      min: 'Min Threshold',
      state: 'Status',
      actions: 'Actions',
      noProducts: 'No product found',
      updated: 'Product list refreshed',
      prev: 'Previous page',
      next: 'Next page',
      page: 'Page',
      details: 'View details',
      entry: 'Stock entry',
      exit: 'Stock exit',
      outStock: 'Out of stock',
      noStock: 'Insufficient stock for this product',
      filterCat: 'Filter by category',
    },
    ar: {
      title: 'إدارة المنتجات',
      loading: 'جار التحميل...',
      all: 'الكل',
      available: 'متوفر',
      low: 'تحت الحد',
      out: 'نفاد',
      allCats: 'كل التصنيفات',
      add: 'إضافة منتج',
      code: 'الرمز',
      product: 'المنتج',
      category: 'التصنيف',
      qty: 'الكمية',
      min: 'الحد الأدنى',
      validation: 'الاعتماد',
      state: 'الحالة',
      actions: 'الإجراءات',
      validated: 'معتمد',
      rejected: 'مرفوض',
      pending: 'قيد الانتظار',
      noProducts: 'لا يوجد منتج',
      updated: 'تم تحديث قائمة المنتجات',
      prev: 'الصفحة السابقة',
      next: 'الصفحة التالية',
      page: 'صفحة',
      details: 'عرض التفاصيل',
      entry: 'دخول مخزون',
      exit: 'خروج مخزون',
      outStock: 'نفاد المخزون',
      noStock: 'مخزون غير كاف لهذا المنتج',
      filterCat: 'تصفية حسب التصنيف',
    },
  }[lang];

  const loadCategories = useCallback(async () => {
    try {
      const data = await get('/categories');
      const items = Array.isArray(data) ? data : [];
      setCategoriesList(items.map((c) => ({ id: c._id, name: c.name })));
    } catch {
      setCategoriesList([]);
    }
  }, []);

  const loadProducts = useCallback(async (options = {}) => {
    setIsLoading(true);
    try {
      const q = typeof options.q === 'string' ? options.q : searchQuery;
      const page = Number.isFinite(Number(options.page)) ? Number(options.page) : currentPage;
      const status = typeof options.status === 'string' ? options.status : statusFilter;
      const category = typeof options.category === 'string' ? options.category : categoryFilter;

      const params = new URLSearchParams();
      if (q && q.trim()) params.set('q', q.trim());
      params.set('page', String(Math.max(1, page || 1)));
      params.set('limit', String(ITEMS_PER_PAGE));
      if (status && status !== 'all') {
        // UI: disponible|sous-seuil|rupture -> API: ok|sous_seuil|rupture
        params.set('status', status === 'disponible' ? 'ok' : (status === 'sous-seuil' ? 'sous_seuil' : status));
      }
      if (category && category !== 'all') params.set('category', category);

      const payload = await get(`/products/catalog?${params.toString()}`);
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setTotalProducts(Number(payload?.total || 0));

      const counts = payload?.counts || {};
      setStatusCounts({
        all: Number(counts.all || 0),
        disponible: Number(counts.ok || 0),
        'sous-seuil': Number(counts.sous_seuil || 0),
        rupture: Number(counts.rupture || 0),
      });

      const mapped = items.map((p) => ({
        id: p._id,
        code: p.code_product,
        nom: p.name,
        categorie: p.category?.name || '-',
        categoryId: p.category?._id || '',
        quantite: Number(p.quantity_current || 0),
        seuilMin: Number(p.seuil_minimum || 0),
        computedStatus: p.computed_status || '',
        image: p.image_product || '',
        unite: p.unite || 'Unite',
      }));
      setProducts(mapped);
    } catch (err) {
      toast.error(err.message || 'Erreur chargement produits');
    } finally {
      setIsLoading(false);
    }
  }, [categoryFilter, currentPage, searchQuery, statusFilter, toast]);

  useEffect(() => {
    loadCategories();
    loadProducts();
  }, [loadCategories, loadProducts]);

  const getProductStatus = useCallback((quantite, seuilMin) => {
    if (quantite === 0) return 'rupture';
    if (quantite <= seuilMin) return 'sous-seuil';
    return 'disponible';
  }, []);

  const totalPages = useMemo(() => Math.max(1, Math.ceil((totalProducts || 0) / ITEMS_PER_PAGE)), [totalProducts]);
  const paginatedProducts = products;

  // Debounced reload on search/filter changes
  useEffect(() => {
    const t = setTimeout(() => {
      setCurrentPage(1);
      loadProducts({ page: 1 });
    }, 250);
    return () => clearTimeout(t);
  }, [categoryFilter, loadProducts, searchQuery, statusFilter]);

  // Load the requested page when pagination changes
  useEffect(() => {
    loadProducts({ page: currentPage });
  }, [currentPage, loadProducts]);

  const handleRefresh = useCallback(async () => {
    await loadProducts();
    toast.success(i18n.updated);
  }, [loadProducts, toast, i18n.updated]);

  const handleEntreeStock = useCallback((product) => {
    navigate('/magasinier/entree-stock', { state: { product } });
  }, [navigate]);

  const handleSortieStock = useCallback((product) => {
    if (product.quantite === 0) {
      toast.error(i18n.noStock);
      return;
    }
    navigate('/magasinier/sortie-stock', { state: { product } });
  }, [navigate, toast, i18n.noStock]);

  const handleVoirDetails = useCallback((product) => {
    navigate('/magasinier/voir-details', { state: { product } });
  }, [navigate]);

  return (
    <div className="app-layout">
      <div
        className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`}
        onClick={() => setSidebarCollapsed(true)}
      />
      <SidebarMag 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onLogout={onLogout}
        userName={userName}
      />
      
      <div className="main-container">
        <HeaderPage 
          userName={userName}
          title={i18n.title}
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          onRefresh={handleRefresh}
          onMenuClick={() => setSidebarCollapsed((prev) => !prev)}
        />
        
        <main className="main-content">
          {isLoading && <LoadingSpinner overlay text={i18n.loading} />}
          
          <div className="produits-page">
            <div className="produits-controls">
              <div className="status-filters">
                <button 
                  className={`status-btn ${statusFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('all')}
                  aria-pressed={statusFilter === 'all'}
                >
                  {i18n.all} ({statusCounts.all})
                </button>
                <button 
                  className={`status-btn disponible ${statusFilter === 'disponible' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('disponible')}
                  aria-pressed={statusFilter === 'disponible'}
                >
                  {i18n.available} ({statusCounts.disponible})
                </button>
                <button 
                  className={`status-btn sous-seuil ${statusFilter === 'sous-seuil' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('sous-seuil')}
                  aria-pressed={statusFilter === 'sous-seuil'}
                >
                  {i18n.low} ({statusCounts['sous-seuil']})
                </button>
                <button 
                  className={`status-btn rupture ${statusFilter === 'rupture' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('rupture')}
                  aria-pressed={statusFilter === 'rupture'}
                >
                  {i18n.out} ({statusCounts.rupture})
                </button>
              </div>

              <div className="controls-right">
                <select 
                  className="category-filter"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  aria-label={i18n.filterCat}
                >
                  <option value="all">{i18n.allCats}</option>
                  {categoriesList.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>

                <button 
                  className="btn-add-product"
                  onClick={() => navigate('/magasinier/ajouter-produit')}
                  aria-label="Ajouter un nouveau produit"
                >
                  <Plus size={18} />
                  <span>{i18n.add}</span>
                </button>
              </div>
            </div>

            {isMobile ? (
              <>
                {paginatedProducts.length === 0 ? (
                  <div className="empty-state">
                    <Package size={48} />
                    <p>{i18n.noProducts}</p>
                  </div>
                ) : (
                  <div className="mobile-card-list">
                    {paginatedProducts.map((product) => {
                      const status = getProductStatus(product.quantite, product.seuilMin);
                      const statusLabel = status === 'disponible' ? i18n.available : status === 'sous-seuil' ? i18n.low : i18n.out;

                      return (
                        <div key={product.id} className="mobile-card">
                          <div className="mobile-card-header">
                            <div className="mobile-card-title-wrap">
                              <button
                                type="button"
                                className="thumb-button"
                                onClick={() => setPreviewImage({ src: resolveProductImage(product), name: product.nom })}
                                aria-label={`Voir image ${product.nom}`}
                              >
                                <ProtectedImage
                                  filePath={resolveProductImage(product)}
                                  alt={product.nom}
                                  className="mobile-product-thumb"
                                  fallbackText=""
                                  style={{ width: 36, height: 36, borderRadius: 12, objectFit: 'cover' }}
                                />
                              </button>
                              <div>
                                <h3 className="mobile-card-title">{product.nom}</h3>
                                <div className="mobile-card-subtitle">{product.code}</div>
                              </div>
                            </div>
                            <span className={`status-badge ${status}`}>{statusLabel}</span>
                          </div>

                          <div className="mobile-card-grid">
                            <div className="mobile-kv">
                              <div className="mobile-kv-label">{i18n.category}</div>
                              <div className="mobile-kv-value">{product.categorie || '-'}</div>
                            </div>
                            <div className="mobile-kv">
                              <div className="mobile-kv-label">{i18n.qty}</div>
                              <div className="mobile-kv-value">{product.quantite}</div>
                            </div>
                            <div className="mobile-kv">
                              <div className="mobile-kv-label">{i18n.min}</div>
                              <div className="mobile-kv-value">{product.seuilMin}</div>
                            </div>
                          </div>

                          <div className="mobile-card-actions three">
                            <button type="button" className="mobile-action-btn info" onClick={() => handleVoirDetails(product)}>
                              <Eye size={16} /> {i18n.details}
                            </button>
                            <button type="button" className="mobile-action-btn success" onClick={() => handleEntreeStock(product)}>
                              <ArrowDownToLine size={16} /> {i18n.entry}
                            </button>
                            <button
                              type="button"
                              className="mobile-action-btn danger"
                              onClick={() => handleSortieStock(product)}
                              disabled={product.quantite === 0}
                              title={product.quantite === 0 ? i18n.outStock : i18n.exit}
                            >
                              <ArrowUpFromLine size={16} /> {i18n.exit}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="produits-table-container">
                <table className="produits-table" role="table">
                  <thead>
                    <tr>
                      <th scope="col">{i18n.code}</th>
                      <th scope="col">{i18n.product}</th>
                      <th scope="col">{i18n.category}</th>
                      <th scope="col">{i18n.qty}</th>
                      <th scope="col">{i18n.min}</th>
                      <th scope="col">{i18n.state}</th>
                      <th scope="col">{i18n.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedProducts.map((product, index) => {
                      const status = getProductStatus(product.quantite, product.seuilMin);
                      return (
                        <tr key={product.id} style={{ animationDelay: `${index * 30}ms` }}>
                          <td className="code-cell">{product.code}</td>
                          <td className="product-cell">
                            <button
                              type="button"
                              className="thumb-button"
                              onClick={() => setPreviewImage({ src: resolveProductImage(product), name: product.nom })}
                              aria-label={`Voir image ${product.nom}`}
                            >
                              <ProtectedImage
                                filePath={resolveProductImage(product)}
                                alt={product.nom}
                                className="product-thumb"
                                fallbackText=""
                                style={{ width: 28, height: 28, borderRadius: 10, objectFit: 'cover' }}
                              />
                            </button>
                            {product.nom}
                          </td>
                          <td>
                            <span className="category-badge">{product.categorie}</span>
                          </td>
                          <td className="quantity-cell">{product.quantite}</td>
                          <td className="seuil-cell">{product.seuilMin}</td>
                          <td>
                            <span className={`status-badge ${status}`}>
                              {status === 'disponible' ? i18n.available :
                               status === 'sous-seuil' ? i18n.low : i18n.out}
                            </span>
                          </td>
                          <td>
                            <div className="action-buttons">
                              <button
                                className="action-btn view"
                                onClick={() => handleVoirDetails(product)}
                                title={i18n.details}
                                aria-label={`${i18n.details} ${product.nom}`}
                              >
                                <Eye size={16} />
                              </button>
                              <button
                                className="action-btn entry"
                                onClick={() => handleEntreeStock(product)}
                                title={i18n.entry}
                                aria-label={`${i18n.entry} ${product.nom}`}
                              >
                                <ArrowDownToLine size={16} />
                              </button>
                              <button
                                className="action-btn exit"
                                onClick={() => handleSortieStock(product)}
                                disabled={product.quantite === 0}
                                title={product.quantite === 0 ? i18n.outStock : i18n.exit}
                                aria-label={`${i18n.exit} ${product.nom}`}
                              >
                                <ArrowUpFromLine size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {paginatedProducts.length === 0 && (
                  <div className="empty-state">
                    <Package size={48} />
                    <p>{i18n.noProducts}</p>
                  </div>
                )}
              </div>
            )}

            {totalPages > 1 && (
              <div className="pagination">
                <span className="pagination-info">
                  {totalProducts > 0 ? (((currentPage - 1) * ITEMS_PER_PAGE) + 1) : 0} - {Math.min(currentPage * ITEMS_PER_PAGE, totalProducts)} sur {totalProducts}
                </span>
                <div className="pagination-buttons">
                  <button 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    aria-label={i18n.prev}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      className={page === currentPage ? 'active' : ''}
                      onClick={() => setCurrentPage(page)}
                      aria-label={`${i18n.page} ${page}`}
                      aria-current={page === currentPage ? 'page' : undefined}
                    >
                      {page}
                    </button>
                  ))}
                  <button 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    aria-label={i18n.next}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
      {previewImage && (
        <div
          className="img-modal-backdrop"
          onClick={() => setPreviewImage(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="img-modal" onClick={(e) => e.stopPropagation()}>
            <div className="img-modal-title">{previewImage.name || 'Produit'}</div>
            <ProtectedImage
              filePath={previewImage.src}
              alt={previewImage.name || 'Produit'}
              className="img-modal-image"
              fallbackText={previewImage.name || ''}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
            <button type="button" className="img-modal-close" onClick={() => setPreviewImage(null)}>
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProduitsMag;

