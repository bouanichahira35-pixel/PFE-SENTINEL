import { useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Package, ArrowDownToLine, Save, X, ScanLine, Calendar, Truck, Hash } from 'lucide-react';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import './EntreeStock.css';

const EntreeStock = ({ userName, onLogout }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const product = location.state?.product;

  const [formData, setFormData] = useState({
    codeBarres: product?.code || '',
    quantite: '',
    provenance: '',
    numeroLot: '',
    dateEntree: new Date().toISOString().split('T')[0],
    commentaire: ''
  });

  const [productInfo, setProductInfo] = useState(product || null);
  const [errors, setErrors] = useState({});

  const handleScanBarcode = useCallback(() => {
    if (!productInfo && formData.codeBarres) {
      setProductInfo({
        code: formData.codeBarres,
        nom: 'Produit scanne',
        categorie: 'Informatique',
        quantite: 50,
        seuil: 10,
        unite: 'Unite'
      });
      toast.info('Produit identifie');
    }
  }, [productInfo, formData.codeBarres, toast]);

  const validateForm = useCallback(() => {
    const newErrors = {};
    if (!productInfo) newErrors.product = 'Produit requis';
    if (!formData.quantite || parseInt(formData.quantite) < 1) {
      newErrors.quantite = 'Quantite valide requise';
    }
    if (!formData.provenance.trim()) {
      newErrors.provenance = 'Provenance requise';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [productInfo, formData]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error('Veuillez corriger les erreurs');
      return;
    }

    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('Entree stock:', { ...formData, product: productInfo });
    toast.success('Entree de stock enregistree avec succes');
    setIsSubmitting(false);
    navigate('/magasinier');
  }, [formData, productInfo, validateForm, navigate, toast]);

  const newQuantity = productInfo ? productInfo.quantite + (parseInt(formData.quantite) || 0) : 0;

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
          title="Entree de Stock"
          showSearch={false}
        />
        
        <main className="main-content">
          {isSubmitting && <LoadingSpinner overlay text="Enregistrement..." />}
          
          <div className="stock-operation-page">
            <div className="operation-card">
              <div className="operation-header entry">
                <ArrowDownToLine size={24} />
                <h2>Nouvelle entree de stock</h2>
              </div>

              <form onSubmit={handleSubmit} className="operation-form" noValidate>
                <div className="form-section">
                  <h3>Identification du produit</h3>
                  <div className="barcode-input-group">
                    <div className="form-group flex-1">
                      <label htmlFor="codeBarres">
                        <ScanLine size={16} />
                        Code-barres / Code produit
                      </label>
                      <div className="input-with-btn">
                        <input
                          id="codeBarres"
                          type="text"
                          value={formData.codeBarres}
                          onChange={(e) => setFormData({ ...formData, codeBarres: e.target.value })}
                          placeholder="Scanner ou saisir le code"
                          aria-describedby={errors.product ? 'product-error' : undefined}
                        />
                        <button type="button" className="scan-btn" onClick={handleScanBarcode}>
                          <ScanLine size={18} />
                          Scanner
                        </button>
                      </div>
                      {errors.product && (
                        <span id="product-error" className="error-text" role="alert">
                          {errors.product}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {productInfo && (
                  <div className="product-info-card">
                    <div className="product-info-header">
                      <Package size={20} />
                      <span>Produit identifie</span>
                    </div>
                    <div className="product-info-details">
                      <div className="info-item">
                        <span className="info-label">Nom</span>
                        <span className="info-value">{productInfo.nom}</span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Code</span>
                        <span className="info-value code">{productInfo.code}</span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Stock actuel</span>
                        <span className="info-value">{productInfo.quantite} {productInfo.unite}</span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Categorie</span>
                        <span className="info-value">{productInfo.categorie}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="form-section">
                  <h3>Quantite a entrer</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="quantite">
                        <Hash size={16} />
                        Quantite
                      </label>
                      <input
                        id="quantite"
                        type="number"
                        min="1"
                        value={formData.quantite}
                        onChange={(e) => setFormData({ ...formData, quantite: e.target.value })}
                        placeholder="0"
                        className={errors.quantite ? 'error' : ''}
                        aria-invalid={errors.quantite ? 'true' : 'false'}
                      />
                      {errors.quantite && (
                        <span className="error-text" role="alert">{errors.quantite}</span>
                      )}
                    </div>
                    <div className="form-group">
                      <label htmlFor="numeroLot">
                        <Hash size={16} />
                        Numero de lot
                      </label>
                      <input
                        id="numeroLot"
                        type="text"
                        value={formData.numeroLot}
                        onChange={(e) => setFormData({ ...formData, numeroLot: e.target.value })}
                        placeholder="LOT-2026-001"
                      />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h3>Informations supplementaires</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="provenance">
                        <Truck size={16} />
                        Provenance
                      </label>
                      <input
                        id="provenance"
                        type="text"
                        value={formData.provenance}
                        onChange={(e) => setFormData({ ...formData, provenance: e.target.value })}
                        placeholder="Fournisseur ou source"
                        className={errors.provenance ? 'error' : ''}
                        aria-invalid={errors.provenance ? 'true' : 'false'}
                      />
                      {errors.provenance && (
                        <span className="error-text" role="alert">{errors.provenance}</span>
                      )}
                    </div>
                    <div className="form-group">
                      <label htmlFor="dateEntree">
                        <Calendar size={16} />
                        Date d'entree
                      </label>
                      <input
                        id="dateEntree"
                        type="date"
                        value={formData.dateEntree}
                        onChange={(e) => setFormData({ ...formData, dateEntree: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="commentaire">Commentaire (optionnel)</label>
                    <textarea
                      id="commentaire"
                      value={formData.commentaire}
                      onChange={(e) => setFormData({ ...formData, commentaire: e.target.value })}
                      placeholder="Informations supplementaires..."
                      rows={3}
                    />
                  </div>
                </div>

                {productInfo && formData.quantite && (
                  <div className="operation-summary entry">
                    <h3>Resume de l'operation</h3>
                    <div className="summary-grid">
                      <div className="summary-item">
                        <span className="summary-label">Stock avant</span>
                        <span className="summary-value">{productInfo.quantite}</span>
                      </div>
                      <div className="summary-item highlight">
                        <span className="summary-label">Quantite entree</span>
                        <span className="summary-value">+{formData.quantite}</span>
                      </div>
                      <div className="summary-item result">
                        <span className="summary-label">Stock apres</span>
                        <span className="summary-value">{newQuantity}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="form-actions">
                  <button 
                    type="button" 
                    className="btn-cancel" 
                    onClick={() => navigate('/magasinier')}
                    disabled={isSubmitting}
                  >
                    <X size={18} />
                    Annuler
                  </button>
                  <button 
                    type="submit" 
                    className="btn-submit entry" 
                    disabled={!productInfo || !formData.quantite || isSubmitting}
                  >
                    <Save size={18} />
                    Confirmer l'entree
                  </button>
                </div>
              </form>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default EntreeStock;

