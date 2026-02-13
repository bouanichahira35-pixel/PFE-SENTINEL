import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Plus, Eye, ArrowDownToLine, ArrowUpFromLine, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get } from '../../services/api';
import './ProduitsMag.css';
const ITEMS_PER_PAGE = 8;

const ProduitsMag = ({ userName, onLogout }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [products, setProducts] = useState([]);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await get('/products');
      const mapped = data.map((p) => ({
        id: p._id,
        code: p.code_product,
        nom: p.name,
        categorie: p.category?.name || '-',
        quantite: Number(p.quantity_current || 0),
        seuilMin: Number(p.seuil_minimum || 0),
        unite: p.unite || 'Unite',
      }));
      setProducts(mapped);
    } catch (err) {
      toast.error(err.message || 'Erreur chargement produits');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const getProductStatus = useCallback((quantite, seuilMin) => {
    if (quantite === 0) return 'rupture';
    if (quantite <= seuilMin) return 'sous-seuil';
    return 'disponible';
  }, []);

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesSearch = 
        product.nom.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.code.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = categoryFilter === 'all' || product.categorie === categoryFilter;
      
      const status = getProductStatus(product.quantite, product.seuilMin);
      const matchesStatus = statusFilter === 'all' || status === statusFilter;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [searchQuery, categoryFilter, statusFilter, getProductStatus]);

  const statusCounts = useMemo(() => ({
    all: products.length,
    disponible: products.filter(p => getProductStatus(p.quantite, p.seuilMin) === 'disponible').length,
    'sous-seuil': products.filter(p => getProductStatus(p.quantite, p.seuilMin) === 'sous-seuil').length,
    rupture: products.filter(p => getProductStatus(p.quantite, p.seuilMin) === 'rupture').length,
  }), [products, getProductStatus]);

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.categorie).filter(Boolean))),
    [products]
  );

  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  const handleRefresh = useCallback(async () => {
    await loadProducts();
    toast.success('Liste des produits actualisee');
  }, [loadProducts, toast]);

  const handleEntreeStock = useCallback((product) => {
    navigate('/magasinier/entree-stock', { state: { product } });
  }, [navigate]);

  const handleSortieStock = useCallback((product) => {
    if (product.quantite === 0) {
      toast.error('Stock insuffisant pour ce produit');
      return;
    }
    navigate('/magasinier/sortie-stock', { state: { product } });
  }, [navigate, toast]);

  const handleVoirDetails = useCallback((product) => {
    navigate('/magasinier/voir-details', { state: { product } });
  }, [navigate]);

  return (
    <div className="app-layout">
      <SidebarMag 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onLogout={onLogout}
        userName={userName}
      />
      
      <div className="main-container">
        <HeaderPage 
          userName={userName}
          title="Gestion des Produits"
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          onRefresh={handleRefresh}
        />
        
        <main className="main-content">
          {isLoading && <LoadingSpinner overlay text="Chargement..." />}
          
          <div className="produits-page">
            <div className="produits-controls">
              <div className="status-filters">
                <button 
                  className={`status-btn ${statusFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('all')}
                  aria-pressed={statusFilter === 'all'}
                >
                  Tous ({statusCounts.all})
                </button>
                <button 
                  className={`status-btn disponible ${statusFilter === 'disponible' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('disponible')}
                  aria-pressed={statusFilter === 'disponible'}
                >
                  Disponible ({statusCounts.disponible})
                </button>
                <button 
                  className={`status-btn sous-seuil ${statusFilter === 'sous-seuil' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('sous-seuil')}
                  aria-pressed={statusFilter === 'sous-seuil'}
                >
                  Sous seuil ({statusCounts['sous-seuil']})
                </button>
                <button 
                  className={`status-btn rupture ${statusFilter === 'rupture' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('rupture')}
                  aria-pressed={statusFilter === 'rupture'}
                >
                  Rupture ({statusCounts.rupture})
                </button>
              </div>

              <div className="controls-right">
                <select 
                  className="category-filter"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  aria-label="Filtrer par categorie"
                >
                  <option value="all">Toutes les categories</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>

                <button 
                  className="btn-add-product"
                  onClick={() => navigate('/magasinier/ajouter-produit')}
                  aria-label="Ajouter un nouveau produit"
                >
                  <Plus size={18} />
                  <span>Ajouter produit</span>
                </button>
              </div>
            </div>

            <div className="produits-table-container">
              <table className="produits-table" role="table">
                <thead>
                  <tr>
                    <th scope="col">Code</th>
                    <th scope="col">Produit</th>
                    <th scope="col">Categorie</th>
                    <th scope="col">Quantite</th>
                    <th scope="col">Seuil Min.</th>
                    <th scope="col">Etat</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedProducts.map((product, index) => {
                    const status = getProductStatus(product.quantite, product.seuilMin);
                    return (
                      <tr key={product.id} style={{ animationDelay: `${index * 30}ms` }}>
                        <td className="code-cell">{product.code}</td>
                        <td className="product-cell">
                          <Package size={16} className="product-icon" />
                          {product.nom}
                        </td>
                        <td>
                          <span className="category-badge">{product.categorie}</span>
                        </td>
                        <td className="quantity-cell">{product.quantite}</td>
                        <td className="seuil-cell">{product.seuilMin}</td>
                        <td>
                          <span className={`status-badge ${status}`}>
                            {status === 'disponible' ? 'Disponible' : 
                             status === 'sous-seuil' ? 'Sous seuil' : 'Rupture'}
                          </span>
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button 
                              className="action-btn view"
                              onClick={() => handleVoirDetails(product)}
                              title="Voir details"
                              aria-label={`Voir details de ${product.nom}`}
                            >
                              <Eye size={16} />
                            </button>
                            <button 
                              className="action-btn entry"
                              onClick={() => handleEntreeStock(product)}
                              title="Entree de stock"
                              aria-label={`Entree de stock pour ${product.nom}`}
                            >
                              <ArrowDownToLine size={16} />
                            </button>
                            <button 
                              className="action-btn exit"
                              onClick={() => handleSortieStock(product)}
                              disabled={product.quantite === 0}
                              title={product.quantite === 0 ? 'Stock epuise' : 'Sortie de stock'}
                              aria-label={`Sortie de stock pour ${product.nom}`}
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

              {filteredProducts.length === 0 && (
                <div className="empty-state">
                  <Package size={48} />
                  <p>Aucun produit trouve</p>
                </div>
              )}
            </div>

            {totalPages > 1 && (
              <div className="pagination">
                <span className="pagination-info">
                  {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredProducts.length)} sur {filteredProducts.length}
                </span>
                <div className="pagination-buttons">
                  <button 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    aria-label="Page precedente"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      className={page === currentPage ? 'active' : ''}
                      onClick={() => setCurrentPage(page)}
                      aria-label={`Page ${page}`}
                      aria-current={page === currentPage ? 'page' : undefined}
                    >
                      {page}
                    </button>
                  ))}
                  <button 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    aria-label="Page suivante"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default ProduitsMag;

