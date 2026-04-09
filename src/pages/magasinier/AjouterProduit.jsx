import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, X, QrCode, Tag, Hash, Layers, AlertCircle, CheckCircle, Lightbulb, Camera, StopCircle, Keyboard } from 'lucide-react';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import InlineQrScanner from '../../components/shared/InlineQrScanner';
import { useToast } from '../../components/shared/Toast';
import { get, post, uploadFile } from '../../services/api';
import { asNonNegativeInt, isSafeText, sanitizeText } from '../../utils/formGuards';
import './AjouterProduit.css';

const unites = ['Unite', 'Ramette', 'Boite', 'Carton', 'Kg', 'Litre', 'Metre'];
const categories = ['Informatique', 'Fournitures', 'Mobilier', 'Electronique', 'Outillage', 'Laboratoire', 'Produit chimique', 'Gaz'];

const CATEGORY_TO_FAMILY = {
  Informatique: 'consommable_informatique',
  Fournitures: 'economat',
  Mobilier: 'economat',
  Electronique: 'economat',
  Outillage: 'economat',
  Laboratoire: 'consommable_laboratoire',
  'Produit chimique': 'produit_chimique',
  Gaz: 'gaz',
};

const FAMILY_LABELS = {
  economat: 'Economat',
  produit_chimique: 'Produit chimique',
  gaz: 'Gaz',
  consommable_informatique: 'Consommable informatique',
  consommable_laboratoire: 'Consommable laboratoire',
};

const categorySuggestions = {
  'cable': 'Informatique', 'hdmi': 'Informatique', 'usb': 'Informatique',
  'souris': 'Informatique', 'clavier': 'Informatique', 'ecran': 'Informatique',
  'pc': 'Informatique', 'ordinateur': 'Informatique', 'imprimante': 'Informatique',
  'papier': 'Fournitures', 'stylo': 'Fournitures', 'cartouche': 'Fournitures',
  'encre': 'Fournitures', 'classeur': 'Fournitures', 'enveloppe': 'Fournitures',
  'chaise': 'Mobilier', 'bureau': 'Mobilier', 'armoire': 'Mobilier', 'etagere': 'Mobilier',
  'acide': 'Produit chimique', 'solvant': 'Produit chimique', 'reactif': 'Produit chimique',
  'azote': 'Gaz', 'argon': 'Gaz', 'helium': 'Gaz',
  'lampe': 'Electronique', 'ventilateur': 'Electronique', 'projecteur': 'Electronique',
  'tournevis': 'Outillage', 'marteau': 'Outillage', 'pince': 'Outillage'
};

const AjouterProduit = ({ userName, onLogout }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const qrInputRef = useRef(null);
  const keyboardBufferRef = useRef('');
  const keyboardTimeoutRef = useRef(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [showDoublonWarning, setShowDoublonWarning] = useState(false);
  const [duplicateProduct, setDuplicateProduct] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [suggestedCategory, setSuggestedCategory] = useState('');
  const [scanTarget, setScanTarget] = useState('');
  const [keyboardScanMode, setKeyboardScanMode] = useState(false);
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  
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
  const [fdsFile, setFdsFile] = useState(null);
  const [productImageFile, setProductImageFile] = useState(null);

  const verifyQrCodeUniqueness = useCallback(async (value) => {
    const qr = String(value || '').trim();
    if (!qr) {
      setShowDoublonWarning(false);
      setDuplicateProduct(null);
      return;
    }
    try {
      const result = await get(`/products/qr-check?value=${encodeURIComponent(qr)}`);
      const exists = Boolean(result?.exists);
      setShowDoublonWarning(exists);
      setDuplicateProduct(result?.product || null);
      if (exists) {
        toast.warning('QR code deja utilise par un autre produit');
      }
    } catch (err) {
      toast.error(err.message || 'Echec de verification du QR code');
    }
  }, [toast]);

  const stopKeyboardScanMode = useCallback(() => {
    setKeyboardScanMode(false);
    keyboardBufferRef.current = '';
    if (keyboardTimeoutRef.current) {
      clearTimeout(keyboardTimeoutRef.current);
      keyboardTimeoutRef.current = null;
    }
  }, []);

  const handleDetectedQrCode = useCallback(async (value) => {
    const qrValue = String(value || '').trim();
    if (!qrValue) return;
    setFormData((prev) => ({ ...prev, qrCode: qrValue }));
    toast.success('QR Code detecte avec succes');
    await verifyQrCodeUniqueness(qrValue);
    setScanTarget('');
    stopKeyboardScanMode();
  }, [stopKeyboardScanMode, toast, verifyQrCodeUniqueness]);

  useEffect(() => () => {
    stopKeyboardScanMode();
  }, [stopKeyboardScanMode]);

  useEffect(() => {
    const family = CATEGORY_TO_FAMILY[formData.categorie] || '';
    if (family && family !== formData.famille) {
      setFormData((prev) => ({ ...prev, famille: family }));
    }
    if (!family && formData.famille) {
      setFormData((prev) => ({ ...prev, famille: '' }));
    }
  }, [formData.categorie, formData.famille]);

  useEffect(() => {
    if (formData.famille !== 'produit_chimique') {
      setFormData((prev) => ({
        ...prev,
        chemicalClass: '',
        physicalState: '',
      }));
      setFdsFile(null);
    }
    if (formData.famille !== 'gaz') {
      setFormData((prev) => ({
        ...prev,
        gasPressure: '',
        gasPurity: '',
      }));
    }
  }, [formData.famille]);

  useEffect(() => {
    if (!keyboardScanMode) return undefined;

    const onKeyDown = async (event) => {
      if (!keyboardScanMode) return;

      if (event.key === 'Enter') {
        const scanned = keyboardBufferRef.current.trim();
        keyboardBufferRef.current = '';
        if (keyboardTimeoutRef.current) {
          clearTimeout(keyboardTimeoutRef.current);
          keyboardTimeoutRef.current = null;
        }
        if (scanned.length >= 3) {
          await handleDetectedQrCode(scanned);
        }
        return;
      }

      if (event.key.length === 1) {
        keyboardBufferRef.current += event.key;
        if (keyboardTimeoutRef.current) clearTimeout(keyboardTimeoutRef.current);
        keyboardTimeoutRef.current = setTimeout(() => {
          keyboardBufferRef.current = '';
          keyboardTimeoutRef.current = null;
        }, 250);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleDetectedQrCode, keyboardScanMode]);

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
    if (!String(formData.qrCode || '').trim()) newErrors.qrCode = 'QR Code requis';
    if (!isSafeText(formData.qrCode, { min: 3, max: 220 })) newErrors.qrCode = 'QR Code invalide (3-220, sans < >)';

    if (!isSafeText(formData.nom, { min: 3, max: 80 })) {
      newErrors.nom = 'Nom requis (3-80, sans < >)';
    }
    if (!formData.categorie) newErrors.categorie = 'Categorie requise';
    if (!formData.famille) newErrors.categorie = 'Categorie invalide pour la famille metier';
    const seuilMin = asNonNegativeInt(formData.seuilMinimum, { min: 0, max: 1000000 });
    if (!Number.isFinite(seuilMin)) newErrors.seuilMinimum = 'Seuil minimum valide requis (0-1 000 000)';

    if (formData.emplacement && !isSafeText(formData.emplacement, { min: 0, max: 80 })) {
      newErrors.emplacement = 'Emplacement trop long (max 80, sans < >)';
    }
    if (formData.description && !isSafeText(formData.description, { min: 0, max: 600 })) {
      newErrors.description = 'Description trop longue (max 600, sans < >)';
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
    if (duplicateProduct) {
      toast.error('Ce QR code existe deja. Utilisez un QR code unique.');
      return;
    }

    setIsSubmitting(true);
    try {
      let fdsAttachment;
      if (formData.famille === 'produit_chimique' && fdsFile) {
        const uploadedFds = await uploadFile('/files/upload', fdsFile);
        fdsAttachment = {
          file_name: uploadedFds.file_name,
          file_url: uploadedFds.file_url,
        };
      }

      let productImageUrl = '';
      if (productImageFile) {
        const uploadedImage = await uploadFile('/files/upload', productImageFile);
        productImageUrl = String(uploadedImage?.file_url || '');
      }

      const payload = { 
        name: sanitizeText(formData.nom, { maxLen: 80 }), 
        category_proposal: formData.categorie, 
        family: formData.famille, 
        description: sanitizeText(formData.description, { maxLen: 600 }) || undefined, 
        seuil_minimum: Number(asNonNegativeInt(formData.seuilMinimum, { min: 0, max: 1000000 })), 
        stock_initial_year: Number(asNonNegativeInt(formData.stockInitial || 0, { min: 0, max: 1000000000 })), 
        quantity_current: Number(asNonNegativeInt(formData.stockInitial || 0, { min: 0, max: 1000000000 })), 
        qr_code_value: sanitizeText(formData.qrCode, { maxLen: 220 }),
        emplacement: sanitizeText(formData.emplacement, { maxLen: 80 }) || undefined,
        chemical_class: sanitizeText(formData.chemicalClass, { maxLen: 40 }) || undefined,
        physical_state: sanitizeText(formData.physicalState, { maxLen: 40 }) || undefined,
        gas_pressure: sanitizeText(formData.gasPressure, { maxLen: 40 }) || undefined,
        gas_purity: sanitizeText(formData.gasPurity, { maxLen: 40 }) || undefined,
        fds_attachment: fdsAttachment, 
        image_product: productImageUrl || undefined,
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
      setFdsFile(null);
      setProductImageFile(null);
      setScanTarget('');
      setShowAdvancedFields(false);
      navigate('/magasinier');
    } catch (err) {
      toast.error(err.message || "Echec de creation du produit");
    } finally {
      setIsSubmitting(false);
    }
  }, [duplicateProduct, fdsFile, formData, navigate, productImageFile, toast, validateForm]);

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
          title="Ajouter un Produit"
          showSearch={false}
          onMenuClick={() => setSidebarCollapsed((prev) => !prev)}
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
                    <p>
                      Ce QR code est deja utilise
                      {duplicateProduct ? ` par ${duplicateProduct.code_product} (${duplicateProduct.name}).` : '.'}
                    </p>
                  </div>
                  <button onClick={() => setShowDoublonWarning(false)} aria-label="Fermer l'alerte">
                    <X size={16} />
                  </button>
                </div>
              )}

              <form onSubmit={handleSubmit} className="ajouter-form" noValidate>
                <div className="form-mode-toggle">
                  <button
                    type="button"
                    className="mode-toggle-btn"
                    onClick={() => setShowAdvancedFields((prev) => !prev)}
                  >
                    {showAdvancedFields ? 'Masquer champs avances' : 'Afficher champs avances'}
                  </button>
                  <span className="input-hint">
                    Mode simple actif: seuls les champs obligatoires sont affiches.
                  </span>
                </div>

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
                        ref={qrInputRef}
                        type="text"
                        maxLength={180}
                        value={formData.qrCode}
                        onChange={(e) => {
                          setFormData({ ...formData, qrCode: e.target.value });
                          setDuplicateProduct(null);
                          setShowDoublonWarning(false);
                        }}
                        onBlur={() => verifyQrCodeUniqueness(formData.qrCode)}
                        placeholder="Scanner ou saisir le QR Code"
                        className={errors.qrCode ? 'error' : ''}
                        aria-invalid={errors.qrCode ? 'true' : 'false'}
                      />
                      {!scanTarget ? (
                        <button
                          type="button"
                          className="scan-btn"
                          onClick={() => {
                            setScanTarget('product_qr');
                            toast.info('Camera activee - Presentez le QR Code');
                          }}
                        >
                          <Camera size={18} />
                          Scanner QR
                        </button>
                      ) : (
                        <button type="button" className="scan-btn scanning" onClick={() => setScanTarget('')}>
                          <StopCircle size={18} />
                          Arreter
                        </button>
                      )}
                    </div>
                    <div className="input-hint">
                      {!keyboardScanMode ? (
                        <button type="button" className="scan-btn" onClick={() => {
                          setKeyboardScanMode(true);
                          toast.info('Mode douchette USB actif. Scannez puis appuyez sur Entree.');
                          if (qrInputRef.current) qrInputRef.current.focus();
                        }}>
                          <Keyboard size={16} />
                          Mode douchette USB
                        </button>
                      ) : (
                        <button type="button" className="scan-btn scanning" onClick={stopKeyboardScanMode}>
                          <StopCircle size={16} />
                          Arreter mode douchette
                        </button>
                      )}
                    </div>
                    {keyboardScanMode && (
                      <span className="input-hint">Fallback actif: scanner USB/clavier capture le code QR.</span>
                    )}
                    {errors.qrCode && (
                      <span className="error-text" role="alert">{errors.qrCode}</span>
                    )}
                  </div>

                  {scanTarget === 'product_qr' && (
                    <InlineQrScanner
                      onDetected={handleDetectedQrCode}
                      onClose={() => setScanTarget('')}
                    />
                  )}

                  <div className="form-group">
                    <label htmlFor="nom">
                      <Tag size={16} />
                      Nom du produit
                    </label>
                    <input
                      id="nom"
                      type="text"
                      maxLength={100}
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
                  <h3>Visuel</h3>
                  <div className="form-group">
                    <label htmlFor="productImageFile">Photo du produit (optionnel)</label>
                    <input
                      id="productImageFile"
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp"
                      onChange={(e) => setProductImageFile(e.target.files?.[0] || null)}
                    />
                    <span className="input-hint">
                      Photo reelle pour aider les demandeurs (recommande).
                    </span>
                  </div>
                </div>

                <div className="form-section">
                  <h3>Classification</h3>
                  <div className="form-row">
                    <div className="form-group"> 
                      <label htmlFor="categorie"> 
                        <Layers size={16} /> 
                        Categorie proposee 
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
                      <label htmlFor="famille_auto">
                        <Layers size={16} />
                        Famille metier (automatique)
                      </label>
                      <input id="famille_auto" type="text" readOnly value={FAMILY_LABELS[formData.famille] || ''} placeholder="Auto selon categorie" />
                      <span className="input-hint">La famille est geree automatiquement pour eviter les incoherences.</span>
                    </div>
                    {showAdvancedFields && (
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
                    )}
                  </div>
                </div>

                <div className="form-section">
                  <h3>Parametres de stock</h3>
                  {showAdvancedFields && (
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
                          max="1000000000"
                          step="1"
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
                          maxLength={120}
                          value={formData.emplacement}
                          onChange={(e) => setFormData({ ...formData, emplacement: e.target.value })}
                          placeholder="Ex: Rayon A - Etagere 3"
                        />
                      </div>
                    </div>
                  )}
                  <div className="form-group">
                    <label htmlFor="seuilMinimum">
                      <Hash size={16} />
                      Seuil minimum d'alerte
                    </label>
                    <input
                      id="seuilMinimum"
                      type="number"
                      min="0"
                      max="1000000000"
                      step="1"
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

                {showAdvancedFields && formData.famille === 'produit_chimique' && (
                  <div className="form-section">
                    <h3>Parametres produit chimique</h3>
                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor="chemicalClass">Classe chimique</label>
                        <input
                          id="chemicalClass"
                          type="text"
                          maxLength={80}
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
                          maxLength={80}
                          value={formData.physicalState}
                          onChange={(e) => setFormData({ ...formData, physicalState: e.target.value })}
                          placeholder="Ex: Liquide"
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label htmlFor="fdsFile">FDS (Fiche de donnees de securite)</label>
                      <input
                        id="fdsFile"
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx"
                        onChange={(e) => setFdsFile(e.target.files?.[0] || null)}
                      />
                    </div>
                  </div>
                )}

                {showAdvancedFields && formData.famille === 'gaz' && (
                  <div className="form-section">
                    <h3>Parametres gaz</h3>
                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor="gasPressure">Pression</label>
                        <input
                          id="gasPressure"
                          type="text"
                          maxLength={80}
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
                          maxLength={80}
                          value={formData.gasPurity}
                          onChange={(e) => setFormData({ ...formData, gasPurity: e.target.value })}
                          placeholder="Ex: 99.99%"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {showAdvancedFields && (
                  <div className="form-section">
                    <h3>Informations complementaires</h3>
                    <div className="form-group">
                      <label htmlFor="description">Description (optionnel)</label>
                      <textarea
                        id="description"
                        maxLength={600}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Description du produit, specifications..."
                        rows={3}
                      />
                    </div>
                  </div>
                )}

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

