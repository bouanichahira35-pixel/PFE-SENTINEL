import { useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Package, ArrowUpFromLine, Save, X, ScanLine, Calendar, User, Hash, AlertTriangle } from 'lucide-react';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import './EntreeStock.css';

const SortieStock = ({ userName, onLogout }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const product = location.state?.product;
  const demandeInfo = location.state?.demandeInfo;

  const [formData, setFormData] = useState({
    codeBarres: product?.code || '',
    quantite: demandeInfo?.quantite?.toString() || '',
    destination: demandeInfo?.demandeur || '',
    dateSortie: new Date().toISOString().split('T')[0],
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
    if (!formData.destination.trim()) {
      newErrors.destination = 'Destination requise';
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

    if (isInsufficientStock) {
      toast.error('Stock insuffisant pour cette operation');
      return;
    }

    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('Sortie stock:', { ...formData, product: productInfo, demandeId: demandeInfo?.id });
    toast.success('Sortie de stock enregistree avec succes');
    setIsSubmitting(false);
    navigate('/magasinier');
  }, [formData, productInfo, validateForm, navigate, toast, demandeInfo]);

  const quantiteSortie = parseInt(formData.quantite) || 0;
  const newQuantity = productInfo ? productInfo.quantite - quantiteSortie : 0;
  const isInsufficientStock = productInfo && quantiteSortie > productInfo.quantite;

  return (
    <div className="app-layout">
      <SidebarMag 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onLogout={onLogout}
      />
      
      <div className="main-container">
        <HeaderPage 
          userName={userName}
          title="Sortie de Stock"
          showSearch={false}
        />
        
        <main className="main-content">
          {isSubmitting && <LoadingSpinner overlay text="Enregistrement..." />}
          
          <div className="stock-operation-page">
            <div className="operation-card">
              <div className="operation-header exit">
                <ArrowUpFromLine size={24} />
                <h2>Nouvelle sortie de stock</h2>
                {demandeInfo && (
                  <span className="operation-badge">Demande {demandeInfo.id}</span>
                )}
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
                        />
                        <button type="button" className="scan-btn" onClick={handleScanBarcode}>
                          <ScanLine size={18} />
                          Scanner
                        </button>
                      </div>
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
                        <span className="info-label">Stock disponible</span>
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
                  <h3>Quantite a sortir</h3>
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
                        max={productInfo?.quantite || 9999}
                        value={formData.quantite}
                        onChange={(e) => setFormData({ ...formData, quantite: e.target.value })}
                        placeholder="0"
                        className={errors.quantite || isInsufficientStock ? 'error' : ''}
                        aria-invalid={errors.quantite || isInsufficientStock ? 'true' : 'false'}
                      />
                      {errors.quantite && (
                        <span className="error-text" role="alert">{errors.quantite}</span>
                      )}
                      {isInsufficientStock && (
                        <span className="input-error" role="alert">
                          <AlertTriangle size={14} />
                          Stock insuffisant
                        </span>
                      )}
                    </div>
                    <div className="form-group">
                      <label htmlFor="dateSortie">
                        <Calendar size={16} />
                        Date de sortie
                      </label>
                      <input
                        id="dateSortie"
                        type="date"
                        value={formData.dateSortie}
                        onChange={(e) => setFormData({ ...formData, dateSortie: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h3>Destination</h3>
                  <div className="form-group">
                    <label htmlFor="destination">
                      <User size={16} />
                      Beneficiaire / Destination
                    </label>
                    <input
                      id="destination"
                      type="text"
                      value={formData.destination}
                      onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                      placeholder="Nom du beneficiaire ou service"
                      className={errors.destination ? 'error' : ''}
                      aria-invalid={errors.destination ? 'true' : 'false'}
                    />
                    {errors.destination && (
                      <span className="error-text" role="alert">{errors.destination}</span>
                    )}
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

                <div className="fifo-notice" role="note">
                  <AlertTriangle size={16} />
                  <span>Le systeme applique automatiquement la regle FIFO (Premier Entre, Premier Sorti)</span>
                </div>

                {productInfo && formData.quantite && !isInsufficientStock && (
                  <div className="operation-summary exit">
                    <h3>Resume de l'operation</h3>
                    <div className="summary-grid">
                      <div className="summary-item">
                        <span className="summary-label">Stock avant</span>
                        <span className="summary-value">{productInfo.quantite}</span>
                      </div>
                      <div className="summary-item highlight">
                        <span className="summary-label">Quantite sortie</span>
                        <span className="summary-value">-{formData.quantite}</span>
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
                    className="btn-submit exit" 
                    disabled={!productInfo || !formData.quantite || isInsufficientStock || isSubmitting}
                  >
                    <Save size={18} />
                    Confirmer la sortie
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

export default SortieStock;
