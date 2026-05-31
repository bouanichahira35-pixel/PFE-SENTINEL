import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package, X, QrCode, Tag, Hash, Layers, AlertCircle,
  CheckCircle, Lightbulb, Camera, StopCircle, Keyboard,
  FlaskConical, Gauge, Info, ImagePlus,
} from 'lucide-react';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import InlineQrScanner from '../../components/shared/InlineQrScanner';
import { useToast } from '../../components/shared/Toast';
import { get, post, uploadFile } from '../../services/api';
import { asNonNegativeInt, isSafeText, sanitizeText } from '../../utils/formGuards';
import './AjouterProduit.css';

const unites = ['Unite', 'Ramette', 'Boite', 'Carton', 'Kg', 'Litre', 'Metre'];

const FAMILY_LABELS = {
  economat: 'Économat',
  produit_chimique: 'Produit chimique',
  gaz: 'Gaz',
  consommable_informatique: 'Consommable informatique',
  consommable_laboratoire: 'Consommable laboratoire',
};

const FAMILY_COLORS = {
  economat: 'fam-blue',
  produit_chimique: 'fam-red',
  gaz: 'fam-green',
  consommable_informatique: 'fam-purple',
  consommable_laboratoire: 'fam-amber',
};

const categorySuggestions = {
  'cable':'Informatique','hdmi':'Informatique','usb':'Informatique',
  'souris':'Informatique','clavier':'Informatique','ecran':'Informatique',
  'pc':'Informatique','ordinateur':'Informatique','imprimante':'Informatique',
  'papier':'Fournitures','stylo':'Fournitures','cartouche':'Fournitures',
  'encre':'Fournitures','classeur':'Fournitures','enveloppe':'Fournitures',
  'chaise':'Mobilier','bureau':'Mobilier','armoire':'Mobilier','etagere':'Mobilier',
  'acide':'Produit chimique','solvant':'Produit chimique','reactif':'Produit chimique',
  'azote':'Gaz','argon':'Gaz','helium':'Gaz',
  'lampe':'Electronique','ventilateur':'Electronique','projecteur':'Electronique',
  'tournevis':'Outillage','marteau':'Outillage','pince':'Outillage',
};

/* ── Barre de progression compacte ── */
const FormProgress = ({ qrCode, nom, categorie, famille, seuilMinimum }) => {
  const steps = [
    { key:'code',  label:'Code',      done: String(qrCode||'').trim().length >= 3 },
    { key:'nom',   label:'Nom',       done: String(nom||'').trim().length >= 3 },
    { key:'cat',   label:'Catégorie', done: Boolean(categorie) && Boolean(famille) },
    { key:'seuil', label:'Seuil',     done: String(seuilMinimum||'').trim() !== '' },
  ];
  const firstPending = steps.findIndex(s => !s.done);
  return (
    <div className="form-progress" role="progressbar" aria-label="Progression">
      {steps.map((s, i) => {
        const state = s.done ? 'done' : (i === firstPending ? 'active' : '');
        return (
          <div key={s.key} className={`progress-step ${state}`}>
            <span className="progress-dot">{s.done ? '✓' : i + 1}</span>
            <span className="progress-label">{s.label}</span>
            {i < steps.length - 1 && <span className="progress-line" />}
          </div>
        );
      })}
    </div>
  );
};

/* ════════════════════════════════════════════════════════════ */
const AjouterProduit = ({ userName, onLogout }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const qrInputRef = useRef(null);
  const nameInputRef = useRef(null);
  const categorieRef = useRef(null);
  const seuilRef = useRef(null);
  const keyboardBufferRef = useRef('');
  const keyboardTimeoutRef = useRef(null);
  const nameCheckTimeoutRef = useRef(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false)
  );
  const [showDoublonWarning, setShowDoublonWarning] = useState(false);
  const [duplicateProduct, setDuplicateProduct] = useState(null);
  const [showNameDoublonWarning, setShowNameDoublonWarning] = useState(false);
  const [duplicateNameProduct, setDuplicateNameProduct] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [suggestedCategory, setSuggestedCategory] = useState('');
  const [scanTarget, setScanTarget] = useState('');
  const [keyboardScanMode, setKeyboardScanMode] = useState(false);
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const [categoriesList, setCategoriesList] = useState([]);
  const [imagePreview, setImagePreview] = useState(null);

  const [formData, setFormData] = useState({
    qrCode:'', nom:'', categorie:'', famille:'',
    unite:'Unite', seuilMinimum:'', stockInitial:'0',
    emplacement:'', chemicalClass:'', physicalState:'',
    gasPressure:'', gasPurity:'', description:'',
  });

  const [errors, setErrors] = useState({});
  const [fdsFile, setFdsFile] = useState(null);
  const [productImageFile, setProductImageFile] = useState(null);

  /* ── Unicité QR ── */
  const verifyQrCodeUniqueness = useCallback(async (value) => {
    const qr = String(value||'').trim();
    if (!qr) { setShowDoublonWarning(false); setDuplicateProduct(null); return; }
    try {
      const result = await get(`/products/qr-check?value=${encodeURIComponent(qr)}`);
      const exists = Boolean(result?.exists);
      setShowDoublonWarning(exists);
      setDuplicateProduct(result?.product || null);
      if (exists) toast.warning('Code déjà utilisé par un autre produit');
    } catch (err) { toast.error(err.message || 'Échec de vérification du code'); }
  }, [toast]);

  /* ── Unicité nom ── */
  const verifyNameUniqueness = useCallback(async (value) => {
    const raw = String(value||'').replace(/\s+/g,' ').trim();
    if (!raw || raw.length < 3) { setShowNameDoublonWarning(false); setDuplicateNameProduct(null); return; }
    try {
      const result = await get(`/products/name-check?value=${encodeURIComponent(raw)}`);
      setShowNameDoublonWarning(Boolean(result?.exists));
      setDuplicateNameProduct(result?.product || null);
    } catch { /* best-effort */ }
  }, []);

  /* ── Douchette USB ── */
  const stopKeyboardScanMode = useCallback(() => {
    setKeyboardScanMode(false);
    keyboardBufferRef.current = '';
    if (keyboardTimeoutRef.current) { clearTimeout(keyboardTimeoutRef.current); keyboardTimeoutRef.current = null; }
    if (nameCheckTimeoutRef.current) { clearTimeout(nameCheckTimeoutRef.current); nameCheckTimeoutRef.current = null; }
  }, []);

  const handleDetectedQrCode = useCallback(async (value) => {
    const scanned = String(value||'').trim();
    if (!scanned) return;
    setFormData(prev => ({ ...prev, qrCode: scanned }));
    toast.success('Code détecté avec succès');
    await verifyQrCodeUniqueness(scanned);
    if (nameInputRef.current) nameInputRef.current.focus();
    setScanTarget('');
    stopKeyboardScanMode();
  }, [stopKeyboardScanMode, toast, verifyQrCodeUniqueness]);

  useEffect(() => () => { stopKeyboardScanMode(); }, [stopKeyboardScanMode]);

  /* ── Famille auto ── */
  useEffect(() => {
    const cat = categoriesList.find(c => String(c.id) === String(formData.categorie));
    const family = String(cat?.parent_family || '');
    if (family && family !== formData.famille) setFormData(prev => ({ ...prev, famille: family }));
    if (!family && formData.famille) setFormData(prev => ({ ...prev, famille: '' }));
  }, [categoriesList, formData.categorie, formData.famille]);

  /* ── Chargement catégories ── */
  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const data = await get('/categories');
        if (ignore) return;
        const items = Array.isArray(data) ? data : [];
        setCategoriesList(items.map(c => ({
          id: c._id, name: c.name,
          parent_family: c.parent_family || '',
          requires_fds: Boolean(c.requires_fds),
        })));
      } catch { if (!ignore) setCategoriesList([]); }
    };
    load();
    return () => { ignore = true; };
  }, []);

  /* ── Reset chimique/gaz ── */
  useEffect(() => {
    if (formData.famille !== 'produit_chimique') {
      setFormData(prev => ({ ...prev, chemicalClass:'', physicalState:'' }));
      setFdsFile(null);
    }
    if (formData.famille !== 'gaz') {
      setFormData(prev => ({ ...prev, gasPressure:'', gasPurity:'' }));
    }
  }, [formData.famille]);

  /* ── Mode douchette clavier ── */
  useEffect(() => {
    if (!keyboardScanMode) return undefined;
    const onKeyDown = async (event) => {
      if (!keyboardScanMode) return;
      if (event.key === 'Enter') {
        const scanned = keyboardBufferRef.current.trim();
        keyboardBufferRef.current = '';
        if (keyboardTimeoutRef.current) { clearTimeout(keyboardTimeoutRef.current); keyboardTimeoutRef.current = null; }
        if (scanned.length >= 3) await handleDetectedQrCode(scanned);
        return;
      }
      if (event.key.length === 1) {
        keyboardBufferRef.current += event.key;
        if (keyboardTimeoutRef.current) clearTimeout(keyboardTimeoutRef.current);
        keyboardTimeoutRef.current = setTimeout(() => {
          keyboardBufferRef.current = ''; keyboardTimeoutRef.current = null;
        }, 250);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleDetectedQrCode, keyboardScanMode]);

  /* ── Nom + suggestion ── */
  const handleNomChange = useCallback((value) => {
    setFormData(prev => ({ ...prev, nom: value }));
    if (showNameDoublonWarning) { setShowNameDoublonWarning(false); setDuplicateNameProduct(null); }
    if (nameCheckTimeoutRef.current) { clearTimeout(nameCheckTimeoutRef.current); nameCheckTimeoutRef.current = null; }
    nameCheckTimeoutRef.current = setTimeout(() => { verifyNameUniqueness(value); }, 550);
    const lower = value.toLowerCase();
    for (const [kw, cat] of Object.entries(categorySuggestions)) {
      if (lower.includes(kw)) { setSuggestedCategory(cat); return; }
    }
    setSuggestedCategory('');
  }, [showNameDoublonWarning, verifyNameUniqueness]);

  const applySuggestedCategory = useCallback(() => {
    if (suggestedCategory) {
      const match = categoriesList.find(c => String(c.name) === String(suggestedCategory));
      if (match?.id) setFormData(prev => ({ ...prev, categorie: match.id }));
      setSuggestedCategory('');
      toast.success('Catégorie appliquée');
    }
  }, [categoriesList, suggestedCategory, toast]);

  /* ── Photo preview ── */
  const handleImageChange = useCallback((file) => {
    if (!file) { setProductImageFile(null); setImagePreview(null); return; }
    setProductImageFile(file);
    const reader = new FileReader();
    reader.onload = e => setImagePreview(e.target.result);
    reader.readAsDataURL(file);
  }, []);

  /* ── Validation ── */
  const validateForm = useCallback(() => {
    const newErrors = {};
    if (!String(formData.qrCode||'').trim()) newErrors.qrCode = 'Code-barres / QR requis';
    if (!isSafeText(formData.qrCode, { min:3, max:220 })) newErrors.qrCode = 'Code invalide (3-220 car.)';
    if (!isSafeText(formData.nom, { min:3, max:80 })) newErrors.nom = 'Nom requis (3-80 car.)';
    if (!formData.categorie) newErrors.categorie = 'Catégorie requise';
    if (!formData.famille) newErrors.categorie = 'Catégorie invalide';
    const seuilMin = asNonNegativeInt(formData.seuilMinimum, { min:0, max:1000000 });
    if (!Number.isFinite(seuilMin)) newErrors.seuilMinimum = 'Seuil requis (0–1 000 000)';
    if (formData.emplacement && !isSafeText(formData.emplacement, { min:0, max:80 })) newErrors.emplacement = 'Max 80 car.';
    if (formData.description && !isSafeText(formData.description, { min:0, max:600 })) newErrors.description = 'Max 600 car.';
    setErrors(newErrors);
    const firstKey = Object.keys(newErrors)[0] || '';
    const focusMap = { qrCode:qrInputRef, nom:nameInputRef, categorie:categorieRef, seuilMinimum:seuilRef };
    const ref = focusMap[firstKey];
    if (ref?.current) { try { ref.current.scrollIntoView({ block:'center', behavior:'smooth' }); } catch {} ref.current.focus?.(); }
    return { ok: Object.keys(newErrors).length === 0 };
  }, [formData]);

  /* ── Soumission ── */
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    const validation = validateForm();
    if (!validation?.ok) { toast.error('Veuillez corriger les erreurs du formulaire'); return; }
    if (duplicateProduct) { toast.error('Ce code existe déjà. Utilisez un code unique.'); return; }
    if (formData.famille === 'produit_chimique' && !fdsFile) toast.warning("Produit chimique sans FDS — recommandé.");
    setIsSubmitting(true);
    try {
      let fdsAttachment;
      if (formData.famille === 'produit_chimique' && fdsFile) {
        const uploadedFds = await uploadFile('/files/upload', fdsFile);
        fdsAttachment = { file_name: uploadedFds.file_name, file_url: uploadedFds.file_url };
      }
      let productImageUrl = '';
      if (productImageFile) {
        const uploadedImage = await uploadFile('/files/upload', productImageFile);
        productImageUrl = String(uploadedImage?.file_url || '');
      }
      const payload = {
        name: sanitizeText(formData.nom, { maxLen:80 }),
        category: formData.categorie || undefined,
        family: formData.famille,
        unite: formData.unite || 'Unite',
        description: sanitizeText(formData.description, { maxLen:600 }) || undefined,
        seuil_minimum: Number(asNonNegativeInt(formData.seuilMinimum, { min:0, max:1000000 })),
        stock_initial_year: Number(asNonNegativeInt(formData.stockInitial||0, { min:0, max:1000000000 })),
        quantity_current: Number(asNonNegativeInt(formData.stockInitial||0, { min:0, max:1000000000 })),
        qr_code_value: sanitizeText(formData.qrCode, { maxLen:220 }),
        emplacement: sanitizeText(formData.emplacement, { maxLen:80 }) || undefined,
        chemical_class: sanitizeText(formData.chemicalClass, { maxLen:40 }) || undefined,
        physical_state: sanitizeText(formData.physicalState, { maxLen:40 }) || undefined,
        gas_pressure: sanitizeText(formData.gasPressure, { maxLen:40 }) || undefined,
        gas_purity: sanitizeText(formData.gasPurity, { maxLen:40 }) || undefined,
        fds_attachment: fdsAttachment,
        image_product: productImageUrl || undefined,
      };
      await post('/products', payload);
      toast.success('Produit ajouté au catalogue avec succès');
      setFormData({ qrCode:'', nom:'', categorie:'', famille:'', unite:'Unite', seuilMinimum:'', stockInitial:'0', emplacement:'', chemicalClass:'', physicalState:'', gasPressure:'', gasPurity:'', description:'' });
      setFdsFile(null); setProductImageFile(null); setImagePreview(null);
      setScanTarget(''); setShowDoublonWarning(false); setDuplicateProduct(null);
      setShowNameDoublonWarning(false); setDuplicateNameProduct(null); setShowAdvancedFields(false);
      navigate('/magasinier');
    } catch (err) {
      toast.error(err.message || 'Échec de création du produit');
    } finally { setIsSubmitting(false); }
  }, [duplicateProduct, fdsFile, formData, navigate, productImageFile, toast, validateForm]);

  const openDuplicateProduct = useCallback((p) => {
    if (!p?._id) return;
    navigate('/magasinier/voir-details', {
      state: { product: { id:p._id, _id:p._id, code:p.code_product, nom:p.name, categorie:'', quantite:0, seuil:0, unite:'Unite', description:'' } },
    });
  }, [navigate]);

  const seuilMinValue = asNonNegativeInt(formData.seuilMinimum, { min:0, max:1000000 });
  const canSubmit =
    !isSubmitting && !duplicateProduct
    && isSafeText(formData.qrCode, { min:3, max:220 })
    && isSafeText(formData.nom, { min:3, max:80 })
    && Boolean(formData.categorie) && Boolean(formData.famille)
    && Number.isFinite(seuilMinValue);

  const currentCatName = categoriesList.find(c => String(c.id) === String(formData.categorie))?.name || '—';

  /* ════════════════════════════════════════════════════════════
     RENDU — layout 2 colonnes, une seule vue
  ════════════════════════════════════════════════════════════ */
  return (
    <div className="app-layout">
      <div className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`} onClick={() => setSidebarCollapsed(true)} />
      <SidebarMag collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} onLogout={onLogout} userName={userName} />

      <div className="main-container">
        <HeaderPage userName={userName} title="Ajouter un Produit" showSearch={false} onMenuClick={() => setSidebarCollapsed(prev => !prev)} />

        <main className="main-content ap-main">
          {isSubmitting && <LoadingSpinner overlay text="Envoi en cours..." />}

          <div className="ap-page">

            {/* ══ CARTE PRINCIPALE ══ */}
            <div className="ap-card">

              {/* ── En-tête bleu ── */}
              <div className="ap-header">
                <Package size={22} />
                <div>
                  <h2>Nouveau produit</h2>
                  <p>Catalogue actif · ajout immédiat</p>
                </div>
                <FormProgress
                  qrCode={formData.qrCode} nom={formData.nom}
                  categorie={formData.categorie} famille={formData.famille}
                  seuilMinimum={formData.seuilMinimum}
                />
              </div>

              {/* ── Alertes doublon ── */}
              {showDoublonWarning && (
                <div className="ap-alert ap-alert--error" role="alert">
                  <AlertCircle size={15} />
                  <span>
                    Code déjà utilisé
                    {duplicateProduct ? ` par ${duplicateProduct.code_product} — ` : ' — '}
                    {duplicateProduct?._id && (
                      <button className="ap-alert-link" onClick={() => openDuplicateProduct(duplicateProduct)}>Voir le produit</button>
                    )}
                  </span>
                  <button className="ap-alert-close" onClick={() => setShowDoublonWarning(false)} aria-label="Fermer"><X size={13} /></button>
                </div>
              )}
              {showNameDoublonWarning && (
                <div className="ap-alert ap-alert--warn" role="status">
                  <AlertCircle size={15} />
                  <span>
                    Nom déjà utilisé
                    {duplicateNameProduct ? ` : ${duplicateNameProduct.name} — ` : ' — '}
                    {duplicateNameProduct?._id && (
                      <button className="ap-alert-link" onClick={() => openDuplicateProduct(duplicateNameProduct)}>Voir</button>
                    )}
                  </span>
                  <button className="ap-alert-close" onClick={() => setShowNameDoublonWarning(false)} aria-label="Fermer"><X size={13} /></button>
                </div>
              )}

              {/* ══ CORPS DU FORMULAIRE — 2 colonnes ══ */}
              <form onSubmit={handleSubmit} className="ap-form" noValidate>

                {/* Toggle avancé */}
                <div className="ap-mode-bar">
                  <button type="button" className="ap-toggle-btn" onClick={() => setShowAdvancedFields(prev => !prev)}>
                    {showAdvancedFields ? '− Masquer champs avancés' : '+ Champs avancés'}
                  </button>
                  <span className="ap-mode-hint">
                    {showAdvancedFields ? 'Mode avancé actif' : 'Mode simple · champs obligatoires seulement'}
                  </span>
                </div>

                <div className="ap-body">

                  {/* ── COLONNE GAUCHE : champs obligatoires ── */}
                  <div className="ap-col-left">

                    {/* Code-barres */}
                    <div className="ap-field">
                      <label className="ap-label" htmlFor="qrCode">
                        <QrCode size={14} /> Code-barres / QR <span className="ap-req">*</span>
                      </label>
                      <div className="ap-input-row">
                        <input
                          id="qrCode" ref={qrInputRef} type="text" maxLength={180}
                          className={`ap-input ${errors.qrCode ? 'error' : ''}`}
                          value={formData.qrCode}
                          onChange={e => { setFormData({...formData, qrCode: e.target.value}); setDuplicateProduct(null); setShowDoublonWarning(false); }}
                          onBlur={() => verifyQrCodeUniqueness(formData.qrCode)}
                          placeholder="EAN / UPC / QR"
                          aria-invalid={errors.qrCode ? 'true' : 'false'}
                        />
                        {!scanTarget ? (
                          <button type="button" className="ap-scan-btn" onClick={() => { setScanTarget('product_qr'); toast.info('Caméra activée'); }}>
                            <Camera size={15} /> Scanner
                          </button>
                        ) : (
                          <button type="button" className="ap-scan-btn scanning" onClick={() => setScanTarget('')}>
                            <StopCircle size={15} /> Stop
                          </button>
                        )}
                      </div>
                      {/* Douchette USB */}
                      <button
                        type="button"
                        className={`ap-usb-btn ${keyboardScanMode ? 'active' : ''}`}
                        onClick={() => { if (keyboardScanMode) { stopKeyboardScanMode(); } else { setKeyboardScanMode(true); toast.info('Douchette USB active — scannez puis Entrée'); qrInputRef.current?.focus(); } }}
                      >
                        <Keyboard size={12} />
                        {keyboardScanMode ? 'Arrêter douchette' : 'Mode douchette USB'}
                      </button>
                      {scanTarget === 'product_qr' && (
                        <InlineQrScanner mode="any" onDetected={handleDetectedQrCode} onClose={() => setScanTarget('')} />
                      )}
                      {errors.qrCode && <span className="ap-error"><AlertCircle size={12} />{errors.qrCode}</span>}
                    </div>

                    {/* Nom du produit */}
                    <div className="ap-field">
                      <label className="ap-label" htmlFor="nom">
                        <Tag size={14} /> Nom du produit <span className="ap-req">*</span>
                      </label>
                      <input
                        id="nom" ref={nameInputRef} type="text" maxLength={80}
                        className={`ap-input ${errors.nom ? 'error' : ''}`}
                        value={formData.nom}
                        onChange={e => handleNomChange(e.target.value)}
                        placeholder="Ex : Câble HDMI 2m"
                        aria-invalid={errors.nom ? 'true' : 'false'}
                      />
                      {errors.nom && <span className="ap-error"><AlertCircle size={12} />{errors.nom}</span>}
                      {suggestedCategory && (
                        <div className="ap-suggestion">
                          <Lightbulb size={13} />
                          <span>Suggestion : <strong>{suggestedCategory}</strong></span>
                          <button type="button" onClick={applySuggestedCategory}>Appliquer</button>
                        </div>
                      )}
                    </div>

                    {/* Catégorie + Famille côte à côte */}
                    <div className="ap-row-2">
                      <div className="ap-field">
                        <label className="ap-label" htmlFor="categorie">
                          <Layers size={14} /> Catégorie <span className="ap-req">*</span>
                        </label>
                        <select
                          id="categorie" ref={categorieRef}
                          className={`ap-input ${errors.categorie ? 'error' : ''}`}
                          value={formData.categorie}
                          onChange={e => setFormData({...formData, categorie: e.target.value})}
                          disabled={categoriesList.length === 0}
                          aria-invalid={errors.categorie ? 'true' : 'false'}
                        >
                          <option value="">Sélectionner…</option>
                          {categoriesList.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                          ))}
                        </select>
                        {errors.categorie && <span className="ap-error"><AlertCircle size={12} />{errors.categorie}</span>}
                      </div>

                      <div className="ap-field">
                        <label className="ap-label">
                          <Layers size={14} /> Famille métier
                        </label>
                        <div className={`ap-famille-badge ${formData.famille ? FAMILY_COLORS[formData.famille] || 'fam-blue' : 'fam-none'}`}>
                          {formData.famille
                            ? <><CheckCircle size={12} /> {FAMILY_LABELS[formData.famille] || formData.famille}</>
                            : <><Info size={12} /> Auto selon catégorie</>
                          }
                        </div>
                      </div>
                    </div>

                    {/* Seuil minimum */}
                    <div className="ap-field">
                      <label className="ap-label" htmlFor="seuilMinimum">
                        <Hash size={14} /> Seuil minimum d'alerte <span className="ap-req">*</span>
                      </label>
                      <input
                        id="seuilMinimum" ref={seuilRef} type="number"
                        min="0" max="1000000000" step="1"
                        className={`ap-input ap-input--short ${errors.seuilMinimum ? 'error' : ''}`}
                        value={formData.seuilMinimum}
                        onChange={e => setFormData({...formData, seuilMinimum: e.target.value})}
                        placeholder="Ex : 10"
                        aria-invalid={errors.seuilMinimum ? 'true' : 'false'}
                      />
                      <span className="ap-hint">Alerte déclenchée quand le stock passe sous ce seuil</span>
                      {errors.seuilMinimum && <span className="ap-error"><AlertCircle size={12} />{errors.seuilMinimum}</span>}
                    </div>

                    {/* Champs avancés gauche */}
                    {showAdvancedFields && (
                      <>
                        <div className="ap-row-2">
                          <div className="ap-field">
                            <label className="ap-label" htmlFor="stockInitial">
                              <Hash size={14} /> Stock initial
                            </label>
                            <input id="stockInitial" type="number" min="0" max="1000000000" step="1"
                              className="ap-input" value={formData.stockInitial}
                              onChange={e => setFormData({...formData, stockInitial: e.target.value})} placeholder="0" />
                          </div>
                          <div className="ap-field">
                            <label className="ap-label" htmlFor="unite">Unité</label>
                            <select id="unite" className="ap-input" value={formData.unite}
                              onChange={e => setFormData({...formData, unite: e.target.value})}>
                              {unites.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="ap-field">
                          <label className="ap-label" htmlFor="emplacement">Emplacement magasin</label>
                          <input id="emplacement" type="text" maxLength={120} className="ap-input"
                            value={formData.emplacement}
                            onChange={e => setFormData({...formData, emplacement: e.target.value})}
                            placeholder="Ex : Rayon A — Étagère 3" />
                          {errors.emplacement && <span className="ap-error"><AlertCircle size={12} />{errors.emplacement}</span>}
                        </div>

                        {/* Chimique */}
                        {formData.famille === 'produit_chimique' && (
                          <div className="ap-row-2">
                            <div className="ap-field">
                              <label className="ap-label" htmlFor="chemicalClass">
                                <FlaskConical size={14} /> Classe chimique
                              </label>
                              <input id="chemicalClass" type="text" maxLength={80} className="ap-input"
                                value={formData.chemicalClass}
                                onChange={e => setFormData({...formData, chemicalClass: e.target.value})}
                                placeholder="Ex : Acide" />
                            </div>
                            <div className="ap-field">
                              <label className="ap-label" htmlFor="physicalState">État physique</label>
                              <input id="physicalState" type="text" maxLength={80} className="ap-input"
                                value={formData.physicalState}
                                onChange={e => setFormData({...formData, physicalState: e.target.value})}
                                placeholder="Ex : Liquide" />
                            </div>
                          </div>
                        )}

                        {/* Gaz */}
                        {formData.famille === 'gaz' && (
                          <div className="ap-row-2">
                            <div className="ap-field">
                              <label className="ap-label" htmlFor="gasPressure"><Gauge size={14} /> Pression</label>
                              <input id="gasPressure" type="text" maxLength={80} className="ap-input"
                                value={formData.gasPressure}
                                onChange={e => setFormData({...formData, gasPressure: e.target.value})}
                                placeholder="Ex : 200 bar" />
                            </div>
                            <div className="ap-field">
                              <label className="ap-label" htmlFor="gasPurity">Pureté</label>
                              <input id="gasPurity" type="text" maxLength={80} className="ap-input"
                                value={formData.gasPurity}
                                onChange={e => setFormData({...formData, gasPurity: e.target.value})}
                                placeholder="Ex : 99.99%" />
                            </div>
                          </div>
                        )}

                        <div className="ap-field">
                          <label className="ap-label" htmlFor="description">
                            <Info size={14} /> Description <span className="ap-opt">(optionnel)</span>
                          </label>
                          <textarea id="description" maxLength={600} rows={2} className="ap-input ap-textarea"
                            value={formData.description}
                            onChange={e => setFormData({...formData, description: e.target.value})}
                            placeholder="Spécifications, remarques…" />
                          {errors.description && <span className="ap-error"><AlertCircle size={12} />{errors.description}</span>}
                        </div>
                      </>
                    )}
                  </div>

                  {/* ── COLONNE DROITE : photo compacte ── */}
                  <div className="ap-col-right">
                    <div className="ap-photo-section">
                      <span className="ap-photo-label"><ImagePlus size={14} /> Photo du produit <span className="ap-opt">(optionnel)</span></span>

                      {/* Zone photo — unique, compacte */}
                      <label className="ap-photo-zone" htmlFor="productImageFile">
                        {imagePreview ? (
                          <img src={imagePreview} alt="Aperçu produit" className="ap-photo-preview" />
                        ) : (
                          <div className="ap-photo-placeholder">
                            <ImagePlus size={28} />
                            <span>Cliquez ou glissez une image</span>
                            <span className="ap-hint">PNG, JPG, WebP · max 5 Mo</span>
                          </div>
                        )}
                        <input
                          id="productImageFile" type="file"
                          accept=".png,.jpg,.jpeg,.webp"
                          style={{ display:'none' }}
                          onChange={e => handleImageChange(e.target.files?.[0] || null)}
                        />
                      </label>

                      {/* Actions photo */}
                      {imagePreview && (
                        <button type="button" className="ap-photo-remove" onClick={() => handleImageChange(null)}>
                          <X size={13} /> Supprimer la photo
                        </button>
                      )}

                      {/* FDS si chimique */}
                      {showAdvancedFields && formData.famille === 'produit_chimique' && (
                        <div className="ap-field" style={{ marginTop:'1rem' }}>
                          <label className="ap-label" htmlFor="fdsFile">
                            <FlaskConical size={14} /> Fiche FDS
                          </label>
                          <input id="fdsFile" type="file"
                            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx"
                            className="ap-input ap-file-input"
                            onChange={e => setFdsFile(e.target.files?.[0] || null)} />
                          <span className="ap-hint">Recommandée pour tout produit chimique</span>
                        </div>
                      )}
                    </div>

                    {/* Récapitulatif live */}
                    <div className="ap-recap">
                      <div className="ap-recap-title">Récapitulatif</div>
                      <div className="ap-recap-row">
                        <span>Code</span>
                        <strong>{String(formData.qrCode||'').trim() || '—'}</strong>
                      </div>
                      <div className="ap-recap-row">
                        <span>Nom</span>
                        <strong>{String(formData.nom||'').trim() || '—'}</strong>
                      </div>
                      <div className="ap-recap-row">
                        <span>Catégorie</span>
                        <strong>{currentCatName}</strong>
                      </div>
                      <div className="ap-recap-row">
                        <span>Seuil</span>
                        <strong>{String(formData.seuilMinimum||'').trim() || '—'}</strong>
                      </div>
                    </div>
                  </div>

                </div>{/* /ap-body */}

                {/* ══ BARRE D'ACTIONS ══ */}
                <div className="ap-actions">
                  <button type="button" className="ap-btn-cancel" onClick={() => navigate('/magasinier')} disabled={isSubmitting}>
                    <X size={15} /> Annuler
                  </button>
                  <button type="submit" className="ap-btn-submit" disabled={!canSubmit}>
                    <CheckCircle size={15} /> Ajouter au catalogue
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