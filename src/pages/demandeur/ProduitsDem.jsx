import { useState, useMemo, useCallback, useEffect } from 'react';
import { Package, Send, X, Monitor, Wrench, FlaskConical, FileText } from 'lucide-react';
import SidebarDem from '../../components/demandeur/SidebarDem';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import ProtectedImage from '../../components/shared/ProtectedImage';
import { useToast } from '../../components/shared/Toast';
import { get, post } from '../../services/api';
import { asPositiveInt, isSafeText, sanitizeText } from '../../utils/formGuards';
import './ProduitsDem.css';

function computeStockBadge(quantity, seuil) {
  const q = Number(quantity || 0);
  const s = Number(seuil || 0);
  if (q <= 0) return { label: 'Rupture', className: 'rupture' };
  if (q <= s) return { label: 'Faible', className: 'low' };
  return { label: 'Disponible', className: 'ok' };
}

function categoryIconNode(categoryName) {
  const name = String(categoryName || '').toLowerCase();
  const commonStyle = { width: 18, height: 18, color: '#334155' };
  if (name.includes('info')) return <Monitor {...commonStyle} />;
  if (name.includes('outil')) return <Wrench {...commonStyle} />;
  if (name.includes('chim') || name.includes('gaz') || name.includes('labo')) return <FlaskConical {...commonStyle} />;
  if (name.includes('fourn')) return <FileText {...commonStyle} />;
  return <Package {...commonStyle} />;
}

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

const PROFILE_LABELS = {
  bureautique: 'Bureautique (RH / Admin)',
  menage: 'Ménage / Entretien',
  petrole: 'Site pétrole (Externe / Terrain)',
};

const ProduitsDem = ({ userName, onLogout }) => {
  const toast = useToast();
  const demandeurName = sessionStorage.getItem('userName') || localStorage.getItem('userName') || userName || '';
  const demandeurProfile = sessionStorage.getItem('demandeurProfile') || 'bureautique';
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    quantite: '',
    motif: '',
    urgence: 'normale',
    commentaire: '',
    directionLaboratoire: '',
    beneficiaire: demandeurName,
  });
  const [errors, setErrors] = useState({});

  const loadCategories = useCallback(async () => {
    setIsLoadingCategories(true);
    try {
      const items = await get('/categories');
      const mapped = (items || []).map((c) => ({ id: c._id, name: c.name || 'Categorie' }));
      setCategories(mapped);
    } catch (err) {
      setCategories([]);
    } finally {
      setIsLoadingCategories(false);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    try {
      const categoryQuery = selectedCategory && selectedCategory !== 'all' ? `?category=${encodeURIComponent(selectedCategory)}` : '';
      const items = await get(`/products${categoryQuery}`);
      const mapped = (items || [])
        .map((p) => ({
          id: p._id,
          code: p.code_product || '-',
          nom: p.name || 'Produit',
          categorie: p?.category?.name || '-',
          categoryId: p?.category?._id || '',
          image: p?.image_product || '',
          quantite: Number(p?.quantity_current || 0),
          seuilMin: Number(p?.seuil_minimum || 0),
        }));
      setProducts(mapped);
    } catch (err) {
      toast.error(err.message || 'Impossible de charger les produits');
    } finally {
      setIsLoadingProducts(false);
    }
  }, [toast, selectedCategory]);

  useEffect(() => {
    loadCategories();
    loadProducts();
  }, [loadProducts, loadCategories]);

  const filteredProducts = useMemo(() => {
    return products.filter(product =>
      product.nom.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(product.categorie || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [products, searchQuery]);

  const handleDemander = useCallback((product) => {
    setSelectedProduct(product);
    setShowModal(true);
    setErrors({});
  }, []);

  const validateForm = useCallback(() => {
    const newErrors = {};
    const qty = asPositiveInt(formData.quantite, { min: 1, max: 100000 });
    if (!Number.isFinite(qty)) {
      newErrors.quantite = 'Quantite valide requise';
    }
    if (!isSafeText(formData.motif, { min: 2, max: 120 })) {
      newErrors.motif = 'Motif obligatoire (2-120, sans < >)';
    }
    if (!isSafeText(formData.directionLaboratoire, { min: 2, max: 80 })) {
      newErrors.directionLaboratoire = 'Direction / laboratoire obligatoire (2-80, sans < >)';
    }
    if (formData.commentaire && !isSafeText(formData.commentaire, { min: 0, max: 300 })) {
      newErrors.commentaire = 'Commentaire trop long (max 300)';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error('Veuillez corriger les erreurs');
      return;
    }
    if (!selectedProduct?.id) {
      toast.error('Produit invalide');
      return;
    }

    setIsSubmitting(true);
    try {
      const noteParts = [
        `Motif: ${sanitizeText(formData.motif, { maxLen: 120 })}`,
        `Urgence: ${sanitizeText(formData.urgence, { maxLen: 30 })}`,
        formData.commentaire.trim() ? `Commentaire: ${sanitizeText(formData.commentaire, { maxLen: 300 })}` : '',
      ].filter(Boolean);

      const payload = {
        product: selectedProduct.id,
        quantity_requested: Number(asPositiveInt(formData.quantite, { min: 1, max: 100000 })),
        direction_laboratory: sanitizeText(formData.directionLaboratoire, { maxLen: 80 }),
        beneficiary: demandeurName,
        note: sanitizeText(noteParts.join(' | '), { maxLen: 600 }),
        priority: formData.urgence === 'tres_urgente'
          ? 'critical'
          : formData.urgence === 'urgente'
            ? 'urgent'
            : 'normal',
      };

      try {
        await post('/requests', payload);
      } catch (err) {
        const msg = String(err?.message || '');
        if (!msg.toLowerCase().includes('champs non autorises')) throw err;
        const legacyNote = sanitizeText([payload.note, `Direction: ${payload.direction_laboratory}`].filter(Boolean).join(' | '), { maxLen: 600 });
        await post('/requests', {
          product: payload.product,
          quantity_requested: payload.quantity_requested,
          note: legacyNote,
        });
      }

      toast.success('Demande envoyee avec succes');
      setShowModal(false);
      setSelectedProduct(null);
      setFormData({ quantite: '', motif: '', urgence: 'normale', commentaire: '', directionLaboratoire: '', beneficiaire: demandeurName });
    } catch (err) {
      toast.error(err.message || "Echec d'envoi de la demande");
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, selectedProduct, validateForm, toast, demandeurName]);

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
    setSelectedProduct(null);
    setFormData({ quantite: '', motif: '', urgence: 'normale', commentaire: '', directionLaboratoire: '', beneficiaire: demandeurName });
    setErrors({});
  }, [demandeurName]);

  useEffect(() => {
    setFormData((prev) => ({ ...prev, beneficiaire: demandeurName }));
  }, [demandeurName]);

  return (
    <div className="app-layout">
      <div
        className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`}
        onClick={() => setSidebarCollapsed(true)}
      />
      <SidebarDem 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onLogout={onLogout}
        userName={userName}
      />
      
      <div className="main-container">
        <HeaderPage 
          userName={userName}
          title="Catalogue Produits"
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          onMenuClick={() => setSidebarCollapsed((prev) => !prev)}
        />
        
        <main className="main-content"> 
          {isLoadingProducts && <LoadingSpinner overlay text="Chargement des produits..." />} 
          <div className="products-dem-page"> 
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: '#64748b' }}>Categorie:</div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                disabled={isLoadingCategories || isLoadingProducts}
                style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #e2e8f0', fontWeight: 900, minWidth: 220 }}
              >
                <option value="all">Toutes</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {isLoadingCategories && <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b' }}>Chargement categories...</div>}
              <div style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 900, color: '#0f172a', background: '#eef2ff', padding: '6px 10px', borderRadius: 999 }}>
                Profil catalogue: {PROFILE_LABELS[demandeurProfile] || 'Bureautique'}
              </div>
            </div>
            <div className="products-dem-grid">
              {filteredProducts.map((product, index) => {
                const badge = computeStockBadge(product.quantite, product.seuilMin);
                return (
                  <article className="product-card" key={product.id} style={{ animationDelay: `${index * 40}ms` }}>
                    <div className="product-card-media">
                      <ProtectedImage
                        filePath={resolveProductImage(product)}
                        alt={product.nom}
                        className="product-card-img"
                        fallbackText=""
                        fallbackNode={
                          <div className="product-card-fallback">
                            {categoryIconNode(product.categorie)}
                          </div>
                        }
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <span className={`stock-pill ${badge.className}`}>{badge.label}</span>
                    </div>

                    <div className="product-card-body">
                      <div className="product-card-name">{product.nom}</div>
                      <div className="product-card-code">{product.code}</div>
                      <div className="product-card-meta">
                        <span className="product-card-cat">{product.categorie}</span>
                        <span className="product-card-seuil">Seuil: {product.seuilMin}</span>
                      </div>
                    </div>

                    <div className="product-card-actions">
                      <button
                        className="demander-btn"
                        onClick={() => handleDemander(product)}
                        aria-label={`Demander ${product.nom}`}
                      >
                        <Send size={16} />
                        <span>Demander</span>
                      </button>
                    </div>
                  </article>
                );
              })}

              {filteredProducts.length === 0 && (
                <div className="empty-state">
                  <Package size={48} />
                  <p>Aucun produit trouve</p>
                </div>
              )}
            </div>

            <div className="products-dem-footer">
              <p>{filteredProducts.length} produit{filteredProducts.length > 1 ? 's' : ''} disponible{filteredProducts.length > 1 ? 's' : ''}</p>
            </div>
          </div>
        </main>
      </div>

      {showModal && (
        <div 
          className="modal-overlay" 
          onClick={handleCloseModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            {isSubmitting && <LoadingSpinner overlay text="Envoi en cours..." />}
            
            <div className="modal-header">
              <h2 id="modal-title">Demande de produit</h2>
              <button 
                className="modal-close" 
                onClick={handleCloseModal}
                aria-label="Fermer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-product-info">
              <ProtectedImage
                filePath={resolveProductImage(selectedProduct)}
                alt={selectedProduct?.nom || 'Produit'}
                className="modal-product-photo"
                fallbackText={selectedProduct?.code || ''}
                fallbackNode={
                  selectedProduct?.categorie
                    ? <div style={{ display: 'grid', placeItems: 'center' }}>{categoryIconNode(selectedProduct.categorie)}</div>
                    : null
                }
                style={{ width: 46, height: 46, borderRadius: 12, objectFit: 'cover' }}
              />
              <div>
                <span className="modal-product-name">{selectedProduct?.nom}</span>
                <span className="modal-product-code">{selectedProduct?.code}</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="modal-form" noValidate>
              <div className="form-group">
                <label htmlFor="quantite">Quantite demandee</label>
                <input
                  id="quantite"
                  type="number"
                  min="1"
                  max="1000000000"
                  step="1"
                  value={formData.quantite}
                  onChange={(e) => setFormData({ ...formData, quantite: e.target.value })}
                  placeholder="Entrez la quantite"
                  className={errors.quantite ? 'error' : ''}
                  aria-invalid={errors.quantite ? 'true' : 'false'}
                />
                {errors.quantite && (
                  <span className="error-text" role="alert">{errors.quantite}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="motif">Motif de la demande</label>
                <input
                  id="motif"
                  type="text"
                  maxLength={120}
                  value={formData.motif}
                  onChange={(e) => setFormData({ ...formData, motif: e.target.value })}
                  placeholder="Ex: Remplacement materiel defectueux"
                  className={errors.motif ? 'error' : ''}
                  aria-invalid={errors.motif ? 'true' : 'false'}
                />
                {errors.motif && (
                  <span className="error-text" role="alert">{errors.motif}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="urgence">Urgence</label>
                <select
                  id="urgence"
                  value={formData.urgence}
                  onChange={(e) => setFormData({ ...formData, urgence: e.target.value })}
                >
                  <option value="normale">Normale</option>
                  <option value="urgente">Urgente</option>
                  <option value="tres_urgente">Tres urgente</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="directionLaboratoire">Direction / Laboratoire</label>
                <input
                  id="directionLaboratoire"
                  type="text"
                  maxLength={80}
                  value={formData.directionLaboratoire}
                  onChange={(e) => setFormData({ ...formData, directionLaboratoire: e.target.value })}
                  placeholder="Ex: DSP"
                  className={errors.directionLaboratoire ? 'error' : ''}
                  aria-invalid={errors.directionLaboratoire ? 'true' : 'false'}
                />
                {errors.directionLaboratoire && (
                  <span className="error-text" role="alert">{errors.directionLaboratoire}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="beneficiaire">Beneficiaire</label>
                <input
                  id="beneficiaire"
                  type="text"
                  value={formData.beneficiaire}
                  readOnly
                  disabled
                  placeholder="Nom de la personne concernee"
                  className="locked-input"
                  aria-readonly="true"
                />
                <span className="helper-text">Rempli automatiquement par votre nom de compte.</span>
              </div>

              <div className="form-group">
                <label htmlFor="commentaire">Commentaire (optionnel)</label>
                <textarea
                  id="commentaire"
                  maxLength={600}
                  value={formData.commentaire}
                  onChange={(e) => setFormData({ ...formData, commentaire: e.target.value })}
                  placeholder="Informations supplementaires..."
                  rows={3}
                />
              </div>

              <div className="modal-actions">
                <button 
                  type="button" 
                  className="btn-cancel" 
                  onClick={handleCloseModal}
                  disabled={isSubmitting}
                >
                  Annuler
                </button>
                <button 
                  type="submit" 
                  className="btn-submit"
                  disabled={isSubmitting}
                >
                  <Send size={16} />
                  Envoyer la demande
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProduitsDem;

