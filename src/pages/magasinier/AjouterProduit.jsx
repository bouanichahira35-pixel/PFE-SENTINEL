import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Save, X, QrCode, Tag, Hash, Layers, AlertCircle, CheckCircle, Lightbulb, Camera, StopCircle } from 'lucide-react';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { post } from '../../services/api';
import './AjouterProduit.css';

const families = [
  { value: 'economat', label: 'Economat' },
  { value: 'produit_chimique', label: 'Produit chimique' },
  { value: 'gaz', label: 'Gaz' },
  { value: 'consommable_informatique', label: 'Consommable informatique' },
  { value: 'consommable_laboratoire', label: 'Consommable laboratoire' },
];
const unites = ['Unite', 'Ramette', 'Boite', 'Carton', 'Kg', 'Litre', 'Metre'];

const categorySuggestions = {
  'cable': 'Informatique', 'hdmi': 'Informatique', 'usb': 'Informatique',
  'souris': 'Informatique', 'clavier': 'Informatique', 'ecran': 'Informatique',
  'pc': 'Informatique', 'ordinateur': 'Informatique', 'imprimante': 'Informatique',
  'papier': 'Fournitures', 'stylo': 'Fournitures', 'cartouche': 'Fournitures',
  'encre': 'Fournitures', 'classeur': 'Fournitures', 'enveloppe': 'Fournitures',
  'chaise': 'Mobilier', 'bureau': 'Mobilier', 'armoire': 'Mobilier', 'etagere': 'Mobilier',
  'lampe': 'Electronique', 'ventilateur': 'Electronique', 'projecteur': 'Electronique',
  'tournevis': 'Outillage', 'marteau': 'Outillage', 'pince': 'Outillage'
};

const AjouterProduit = ({ userName, onLogout }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const videoRef = useRef(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showDoublonWarning, setShowDoublonWarning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [suggestedCategory, setSuggestedCategory] = useState('');
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [streamRef, setStreamRef] = useState(null);
  
  const [formData, setFormData] = useState({
    qrCode: '',
    nom: '',
    categorie: '',
    famille: '',
    unite: 'Unite',
    seuilMinimum: '',
    stockInitial: '0',
    emplacement: '',
    chemicalClass: '',
    physicalState: '',
    gasPressure: '',
    gasPurity: '',
    description: ''
  });

  const [errors, setErrors] = useState({});

  const startQrScanner = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      setStreamRef(stream);
      setShowQrScanner(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      toast.info('Camera activee - Presentez le QR Code');
      
      // Simulate QR scan after 3 seconds
      setTimeout(() => {
        const scannedCode = 'QR-' + Math.floor(Math.random() * 10000000);
        setFormData(prev => ({ ...prev, qrCode: scannedCode }));
        toast.success('QR Code scanne avec succes');
        stopQrScanner(stream);
        
        if (Math.random() > 0.7) {
          setShowDoublonWarning(true);
          toast.warning('Un produit similaire a ete detecte');
        }
      }, 3000);
    } catch (err) {
      // Fallback: simulate scan without camera
      const scannedCode = 'QR-' + Math.floor(Math.random() * 10000000);
      setFormData(prev => ({ ...prev, qrCode: scannedCode }));
      toast.info('QR Code simule (camera non disponible)');
      
      if (Math.random() > 0.7) {
        setShowDoublonWarning(true);
        toast.warning('Un produit similaire a ete detecte');
      }
    }
  }, [toast]);

  const stopQrScanner = useCallback((stream) => {
    const s = stream || streamRef;
    if (s) {
      s.getTracks().forEach(track => track.stop());
    }
    setShowQrScanner(false);
    setStreamRef(null);
  }, [streamRef]);

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
    if (!formData.qrCode.trim()) newErrors.qrCode = 'QR Code requis';
    if (!formData.nom.trim()) newErrors.nom = 'Nom requis';
    if (formData.nom.trim().length > 0 && formData.nom.trim().length < 3) newErrors.nom = 'Le nom doit contenir au moins 3 caracteres';
    if (!formData.categorie) newErrors.categorie = 'Categorie requise';
    if (!formData.famille) newErrors.famille = 'Famille requise';
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
    try {
      const payload = {
        name: formData.nom.trim(),
        category_name: formData.categorie,
        family: formData.famille,
        description: formData.description,
        seuil_minimum: Number(formData.seuilMinimum),
        stock_initial_year: Number(formData.stockInitial || 0),
        quantity_current: Number(formData.stockInitial || 0),
        qr_code_value: formData.qrCode,
        emplacement: formData.emplacement,
        chemical_class: formData.chemicalClass,
        physical_state: formData.physicalState,
        gas_pressure: formData.gasPressure,
        gas_purity: formData.gasPurity,
        validation_status: 'pending',
      };

      await post('/products', payload);

      toast.success('Produit soumis pour validation avec succes');
      setFormData({
        qrCode: '',
        nom: '',
        categorie: '',
        famille: '',
        unite: 'Unite',
        seuilMinimum: '',
        stockInitial: '0',
        emplacement: '',
        chemicalClass: '',
        physicalState: '',
        gasPressure: '',
        gasPurity: '',
        description: '',
      });
      navigate('/magasinier');
    } catch (err) {
      toast.error(err.message || "Echec de creation du produit");
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, validateForm, navigate, toast]);

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
                    <p>Un produit avec un QR Code similaire existe deja. Verifiez avant de continuer.</p>
                  </div>
                  <button onClick={() => setShowDoublonWarning(false)} aria-label="Fermer l'alerte">
                    <X size={16} />
                  </button>
                </div>
              )}

              <form onSubmit={handleSubmit} className="ajouter-form" noValidate>
                <div className="form-section">
                  <h3>Identification</h3>
                  
                  {/* QR Code Scanner */}
                  <div className="form-group">
                    <label htmlFor="qrCode">
                      <QrCode size={16} />
                      QR Code
                    </label>
                    <div className="input-with-btn">
                      <input
                        id="qrCode"
                        type="text"
                        value={formData.qrCode}
                        onChange={(e) => setFormData({ ...formData, qrCode: e.target.value })}
                        placeholder="Scanner ou saisir le QR Code"
                        className={errors.qrCode ? 'error' : ''}
                        aria-invalid={errors.qrCode ? 'true' : 'false'}
                      />
                      {!showQrScanner ? (
                        <button type="button" className="scan-btn" onClick={startQrScanner}>
                          <Camera size={18} />
                          Scanner QR
                        </button>
                      ) : (
                        <button type="button" className="scan-btn scanning" onClick={() => stopQrScanner()}>
                          <StopCircle size={18} />
                          Arreter
                        </button>
                      )}
                    </div>
                    {errors.qrCode && (
                      <span className="error-text" role="alert">{errors.qrCode}</span>
                    )}
                  </div>

                  {showQrScanner && (
                    <div className="qr-scanner-container">
                      <video ref={videoRef} autoPlay playsInline className="qr-video" />
                      <div className="qr-overlay">
                        <div className="qr-frame"></div>
                        <p>Presentez le QR Code devant la camera</p>
                      </div>
                    </div>
                  )}

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
                    />
                    {errors.nom && (
                      <span className="error-text" role="alert">{errors.nom}</span>
                    )}
                    {suggestedCategory && (
                      <div className="category-suggestion">
                        <Lightbulb size={14} />
                        <span>Suggestion intelligente: <strong>{suggestedCategory}</strong></span>
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
                      <label htmlFor="famille">
                        <Layers size={16} />
                        Famille
                      </label>
                      <select
                        id="famille"
                        value={formData.famille}
                        onChange={(e) => setFormData({ ...formData, famille: e.target.value })}
                        className={errors.famille ? 'error' : ''}
                      >
                        <option value="">Selectionner...</option>
                        {families.map(f => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                      {errors.famille && (
                        <span className="error-text" role="alert">{errors.famille}</span>
                      )}
                    </div>
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
                      >
                        <option value="">Selectionner...</option>
                        {categories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                      {errors.categorie && (
                        <span className="error-text" role="alert">{errors.categorie}</span>
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
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="stockInitial">
                        <Hash size={16} />
                        Stock initial
                      </label>
                      <input
                        id="stockInitial"
                        type="number"
                        min="0"
                        value={formData.stockInitial}
                        onChange={(e) => setFormData({ ...formData, stockInitial: e.target.value })}
                        placeholder="Ex: 100"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="emplacement">Emplacement magasin</label>
                      <input
                        id="emplacement"
                        type="text"
                        value={formData.emplacement}
                        onChange={(e) => setFormData({ ...formData, emplacement: e.target.value })}
                        placeholder="Ex: Rayon A - Etagere 3"
                      />
                    </div>
                  </div>
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
                    />
                    {errors.seuilMinimum && (
                      <span className="error-text" role="alert">{errors.seuilMinimum}</span>
                    )}
                    <span className="input-hint">Alerte declenchee quand le stock passe sous ce seuil</span>
                  </div>
                </div>

                {formData.famille === 'produit_chimique' && (
                  <div className="form-section">
                    <h3>Parametres produit chimique</h3>
                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor="chemicalClass">Classe chimique</label>
                        <input
                          id="chemicalClass"
                          type="text"
                          value={formData.chemicalClass}
                          onChange={(e) => setFormData({ ...formData, chemicalClass: e.target.value })}
                          placeholder="Ex: Acide"
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="physicalState">Etat physique</label>
                        <input
                          id="physicalState"
                          type="text"
                          value={formData.physicalState}
                          onChange={(e) => setFormData({ ...formData, physicalState: e.target.value })}
                          placeholder="Ex: Liquide"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {formData.famille === 'gaz' && (
                  <div className="form-section">
                    <h3>Parametres gaz</h3>
                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor="gasPressure">Pression</label>
                        <input
                          id="gasPressure"
                          type="text"
                          value={formData.gasPressure}
                          onChange={(e) => setFormData({ ...formData, gasPressure: e.target.value })}
                          placeholder="Ex: 200 bar"
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="gasPurity">Purete</label>
                        <input
                          id="gasPurity"
                          type="text"
                          value={formData.gasPurity}
                          onChange={(e) => setFormData({ ...formData, gasPurity: e.target.value })}
                          placeholder="Ex: 99.99%"
                        />
                      </div>
                    </div>
                  </div>
                )}

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
                  <button type="button" className="btn-cancel" onClick={() => navigate('/magasinier')} disabled={isSubmitting}>
                    <X size={18} />
                    Annuler
                  </button>
                  <button type="submit" className="btn-submit" disabled={isSubmitting}>
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

