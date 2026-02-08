import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Save, X, ScanLine, Tag, Hash, Layers, AlertCircle, CheckCircle, Lightbulb } from 'lucide-react';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import './AjouterProduit.css';

const categories = ['Informatique', 'Fournitures', 'Mobilier', 'Electronique', 'Outillage', 'Autre'];
const unites = ['Unite', 'Ramette', 'Boite', 'Carton', 'Kg', 'Litre', 'Metre'];

const categorySuggestions = {
  'cable': 'Informatique',
  'hdmi': 'Informatique',
  'usb': 'Informatique',
  'souris': 'Informatique',
  'clavier': 'Informatique',
  'ecran': 'Informatique',
  'papier': 'Fournitures',
  'stylo': 'Fournitures',
  'cartouche': 'Fournitures',
  'encre': 'Fournitures',
  'chaise': 'Mobilier',
  'bureau': 'Mobilier',
  'lampe': 'Electronique',
  'tournevis': 'Outillage',
  'marteau': 'Outillage'
};

const AjouterProduit = ({ userName, onLogout }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showDoublonWarning, setShowDoublonWarning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [suggestedCategory, setSuggestedCategory] = useState('');
  
  const [formData, setFormData] = useState({
    codeBarres: '',
    nom: '',
    categorie: '',
    unite: 'Unite',
    seuilMinimum: '',
    description: ''
  });

  const [errors, setErrors] = useState({});

  const generateCode = () => {
    const prefix = 'PRD';
    const number = Math.floor(Math.random() * 900) + 100;
    return `${prefix}-${number}`;
  };

  const handleScanBarcode = useCallback(() => {
    const scannedCode = 'BC-' + Math.floor(Math.random() * 10000000);
    setFormData(prev => ({ ...prev, codeBarres: scannedCode }));
    toast.info('Code-barres scanne avec succes');
    
    if (Math.random() > 0.7) {
      setShowDoublonWarning(true);
      toast.warning('Un produit similaire a ete detecte');
    }
  }, [toast]);

  const handleNomChange = useCallback((value) => {
    setFormData(prev => ({ ...prev, nom: value }));
    
    const lowerValue = value.toLowerCase();
    for (const [keyword, category] of Object.entries(categorySuggestions)) {
      if (lowerValue.includes(keyword)) {
        setSuggestedCategory(category);
        return;
      }
    }
    setSuggestedCategory('');
  }, []);

  const applySuggestedCategory = useCallback(() => {
    if (suggestedCategory) {
      setFormData(prev => ({ ...prev, categorie: suggestedCategory }));
      setSuggestedCategory('');
      toast.success('Categorie appliquee');
    }
  }, [suggestedCategory, toast]);

  const validateForm = useCallback(() => {
    const newErrors = {};
    if (!formData.codeBarres.trim()) newErrors.codeBarres = 'Code-barres requis';
    if (!formData.nom.trim()) newErrors.nom = 'Nom requis';
    if (formData.nom.length < 3) newErrors.nom = 'Le nom doit contenir au moins 3 caracteres';
    if (!formData.categorie) newErrors.categorie = 'Categorie requise';
    if (!formData.seuilMinimum || parseInt(formData.seuilMinimum) < 0) {
      newErrors.seuilMinimum = 'Seuil minimum valide requis';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error('Veuillez corriger les erreurs du formulaire');
      return;
    }

    setIsSubmitting(true);
    
    // Simulation de l'envoi
    await new Promise(resolve => setTimeout(resolve, 1200));
    
    const productCode = generateCode();
    console.log('Nouveau produit (en attente de validation):', { 
      code: productCode,
      ...formData,
      statut: 'en_attente_validation'
    });
    
    toast.success('Produit soumis pour validation avec succes');
    setIsSubmitting(false);
    navigate('/magasinier');
  }, [formData, validateForm, navigate, toast]);

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
          title="Ajouter un Produit"
          showSearch={false}
        />
        
        <main className="main-content">
          {isSubmitting && <LoadingSpinner overlay text="Envoi en cours..." />}
          
          <div className="ajouter-produit-page">
            <div className="ajouter-card">
              <div className="ajouter-header">
                <Package size={24} />
                <h2>Nouveau produit</h2>
              </div>

              <div className="validation-notice" role="alert">
                <AlertCircle size={18} />
                <p>Ce produit sera soumis a validation par le responsable avant d'etre ajoute au stock officiel.</p>
              </div>

              {showDoublonWarning && (
                <div className="doublon-warning" role="alert">
                  <AlertCircle size={18} />
                  <div>
                    <strong>Produit similaire detecte</strong>
                    <p>Un produit avec un code-barres similaire existe deja. Verifiez avant de continuer.</p>
                  </div>
                  <button 
                    onClick={() => setShowDoublonWarning(false)}
                    aria-label="Fermer l'alerte"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              <form onSubmit={handleSubmit} className="ajouter-form" noValidate>
                <div className="form-section">
                  <h3>Identification</h3>
                  <div className="form-group">
                    <label htmlFor="codeBarres">
                      <ScanLine size={16} />
                      Code-barres
                    </label>
                    <div className="input-with-btn">
                      <input
                        id="codeBarres"
                        type="text"
                        value={formData.codeBarres}
                        onChange={(e) => setFormData({ ...formData, codeBarres: e.target.value })}
                        placeholder="Scanner ou saisir le code-barres"
                        className={errors.codeBarres ? 'error' : ''}
                        aria-invalid={errors.codeBarres ? 'true' : 'false'}
                        aria-describedby={errors.codeBarres ? 'codeBarres-error' : undefined}
                      />
                      <button type="button" className="scan-btn" onClick={handleScanBarcode}>
                        <ScanLine size={18} />
                        Scanner
                      </button>
                    </div>
                    {errors.codeBarres && (
                      <span id="codeBarres-error" className="error-text" role="alert">
                        {errors.codeBarres}
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <label htmlFor="nom">
                      <Tag size={16} />
                      Nom du produit
                    </label>
                    <input
                      id="nom"
                      type="text"
                      value={formData.nom}
                      onChange={(e) => handleNomChange(e.target.value)}
                      placeholder="Ex: Cable HDMI 2m"
                      className={errors.nom ? 'error' : ''}
                      aria-invalid={errors.nom ? 'true' : 'false'}
                      aria-describedby={errors.nom ? 'nom-error' : undefined}
                    />
                    {errors.nom && (
                      <span id="nom-error" className="error-text" role="alert">{errors.nom}</span>
                    )}
                    {suggestedCategory && (
                      <div className="category-suggestion">
                        <Lightbulb size={14} />
                        <span>Categorie suggeree: <strong>{suggestedCategory}</strong></span>
                        <button type="button" onClick={applySuggestedCategory}>
                          Appliquer
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="form-section">
                  <h3>Classification</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="categorie">
                        <Layers size={16} />
                        Categorie
                      </label>
                      <select
                        id="categorie"
                        value={formData.categorie}
                        onChange={(e) => setFormData({ ...formData, categorie: e.target.value })}
                        className={errors.categorie ? 'error' : ''}
                        aria-invalid={errors.categorie ? 'true' : 'false'}
                        aria-describedby={errors.categorie ? 'categorie-error' : undefined}
                      >
                        <option value="">Selectionner...</option>
                        {categories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                      {errors.categorie && (
                        <span id="categorie-error" className="error-text" role="alert">
                          {errors.categorie}
                        </span>
                      )}
                    </div>
                    <div className="form-group">
                      <label htmlFor="unite">
                        <Package size={16} />
                        Unite
                      </label>
                      <select
                        id="unite"
                        value={formData.unite}
                        onChange={(e) => setFormData({ ...formData, unite: e.target.value })}
                      >
                        {unites.map(unit => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h3>Parametres de stock</h3>
                  <div className="form-group">
                    <label htmlFor="seuilMinimum">
                      <Hash size={16} />
                      Seuil minimum d'alerte
                    </label>
                    <input
                      id="seuilMinimum"
                      type="number"
                      min="0"
                      value={formData.seuilMinimum}
                      onChange={(e) => setFormData({ ...formData, seuilMinimum: e.target.value })}
                      placeholder="Ex: 10"
                      className={errors.seuilMinimum ? 'error' : ''}
                      aria-invalid={errors.seuilMinimum ? 'true' : 'false'}
                      aria-describedby="seuilMinimum-hint"
                    />
                    {errors.seuilMinimum && (
                      <span className="error-text" role="alert">{errors.seuilMinimum}</span>
                    )}
                    <span id="seuilMinimum-hint" className="input-hint">
                      Alerte declenchee quand le stock passe sous ce seuil
                    </span>
                  </div>
                </div>

                <div className="form-section">
                  <h3>Informations complementaires</h3>
                  <div className="form-group">
                    <label htmlFor="description">Description (optionnel)</label>
                    <textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Description du produit, specifications..."
                      rows={3}
                    />
                  </div>
                </div>

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
                    className="btn-submit"
                    disabled={isSubmitting}
                  >
                    <CheckCircle size={18} />
                    Soumettre pour validation
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

export default AjouterProduit;
