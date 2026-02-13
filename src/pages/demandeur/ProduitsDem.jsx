import { useState, useMemo, useCallback } from 'react';
import { Package, Send, X } from 'lucide-react';
import SidebarDem from '../../components/demandeur/SidebarDem';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import './ProduitsDem.css';

const mockProducts = [
  { id: 1, code: 'PRD-001', nom: 'Cable HDMI 2m' },
  { id: 2, code: 'PRD-002', nom: 'Souris sans fil' },
  { id: 3, code: 'PRD-003', nom: 'Clavier mecanique' },
  { id: 4, code: 'PRD-004', nom: 'Ecran 24 pouces' },
  { id: 5, code: 'PRD-005', nom: 'Papier A4 500 feuilles' },
  { id: 6, code: 'PRD-006', nom: 'Stylo bleu' },
  { id: 7, code: 'PRD-007', nom: 'Cartouche encre noire' },
  { id: 8, code: 'PRD-008', nom: 'Chaise de bureau' },
];

const ProduitsDem = ({ userName, onLogout }) => {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    quantite: '',
    motif: '',
    urgence: 'normale',
    commentaire: ''
  });
  const [errors, setErrors] = useState({});

  const filteredProducts = useMemo(() => {
    return mockProducts.filter(product =>
      product.nom.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.code.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  const handleDemander = useCallback((product) => {
    setSelectedProduct(product);
    setShowModal(true);
    setErrors({});
  }, []);

  const validateForm = useCallback(() => {
    const newErrors = {};
    if (!formData.quantite || parseInt(formData.quantite) < 1) {
      newErrors.quantite = 'Quantite valide requise';
    }
    if (!formData.motif.trim()) {
      newErrors.motif = 'Motif requis';
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

    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('Demande envoyee:', { product: selectedProduct, ...formData });
    toast.success('Demande envoyee avec succes');
    
    setIsSubmitting(false);
    setShowModal(false);
    setSelectedProduct(null);
    setFormData({ quantite: '', motif: '', urgence: 'normale', commentaire: '' });
  }, [formData, selectedProduct, validateForm, toast]);

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
    setSelectedProduct(null);
    setFormData({ quantite: '', motif: '', urgence: 'normale', commentaire: '' });
    setErrors({});
  }, []);

  return (
    <div className="app-layout">
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
        />
        
        <main className="main-content">
          <div className="products-dem-page">
            <div className="products-dem-table-container">
              <table className="products-dem-table" role="table">
                <thead>
                  <tr>
                    <th scope="col">Code</th>
                    <th scope="col">Nom du produit</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product, index) => (
                    <tr key={product.id} style={{ animationDelay: `${index * 50}ms` }}>
                      <td className="code-cell">{product.code}</td>
                      <td className="name-cell">
                        <Package size={16} className="product-icon" aria-hidden="true" />
                        {product.nom}
                      </td>
                      <td>
                        <button 
                          className="demander-btn"
                          onClick={() => handleDemander(product)}
                          aria-label={`Demander ${product.nom}`}
                        >
                          <Send size={16} />
                          <span>Demander</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

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
              <Package size={20} aria-hidden="true" />
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
                <label htmlFor="commentaire">Commentaire (optionnel)</label>
                <textarea
                  id="commentaire"
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

