import { useCallback, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowDownToLine, Calendar, Hash, Info, Package, Save, ScanLine, Truck, X } from 'lucide-react';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import InlineQrScanner from '../../components/shared/InlineQrScanner';
import { useToast } from '../../components/shared/Toast';
import { get, post, uploadFile } from '../../services/api';
import { asPositiveInt, isSafeText, sanitizeText } from '../../utils/formGuards';
import { loadRecentList, saveRecentValue } from '../../utils/recentInputs';
import './EntreeStock.css';

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

const EntreeStock = ({ userName, onLogout }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  const initialProduct = location.state?.product || null;
  const [productInfo, setProductInfo] = useState(() => (initialProduct ? initialProduct : null));
  const [scanTarget, setScanTarget] = useState('');
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [errors, setErrors] = useState({});
  const formOpenedAtRef = useRef(Date.now());

  const [recentSuppliers, setRecentSuppliers] = useState(() => loadRecentList('mag_recent_suppliers_v1'));
  const [recentDeliveryNotes, setRecentDeliveryNotes] = useState(() => loadRecentList('mag_recent_delivery_notes_v1'));

  const [formData, setFormData] = useState(() => ({
    codeBarres: initialProduct?.code || '',
    quantite: '',
    dateEntree: todayIso(),
    numeroBonLivraison: '',
    provenance: '',
    serviceDemandeur: '',
    commentaire: '',

    // Champs sensibles (affichés seulement si produit chimique/gaz)
    datePeremption: '',
    statutChimique: 'Utilisable',
    attestationProduitDangereux: '',
    numeroContratGaz: '',
  }));

  const mapProductFromLookup = useCallback((p) => ({
    id: p?._id,
    code: p?.code_product,
    nom: p?.name,
    categorie: p?.category?.name || '-',
    quantite: Number(p?.quantity_current || 0),
    unite: p?.unite || 'Unite',
    family: p?.family || '',
  }), []);

  const isChemicalProduct = useMemo(() => String(productInfo?.family || '').toLowerCase() === 'produit_chimique', [productInfo?.family]);
  const isGasProduct = useMemo(() => String(productInfo?.family || '').toLowerCase() === 'gaz', [productInfo?.family]);

  const lookupAndSetProduct = useCallback(async (rawCode, options = {}) => {
    const code = String(rawCode || '').trim();
    if (!code) {
      setProductInfo(null);
      setErrors((prev) => ({ ...prev, product: 'Code produit requis' }));
      return null;
    }

    setIsLoadingProducts(true);
    try {
      const payload = await get(`/products/lookup?code=${encodeURIComponent(code)}`);
      const p = payload?.product;
      if (!p?._id) {
        setProductInfo(null);
        setErrors((prev) => ({ ...prev, product: 'Produit introuvable' }));
        if (!options.silent) toast.error('Produit introuvable');
        return null;
      }
      const mapped = mapProductFromLookup(p);
      setProductInfo(mapped);
      setErrors((prev) => ({ ...prev, product: undefined }));
      if (!options.silent) toast.success('Produit identifié');
      return mapped;
    } catch (err) {
      setProductInfo(null);
      setErrors((prev) => ({ ...prev, product: 'Produit introuvable' }));
      if (!options.silent) toast.error(err.message || 'Produit introuvable');
      return null;
    } finally {
      setIsLoadingProducts(false);
    }
  }, [mapProductFromLookup, toast]);

  const handleScanBarcode = useCallback(() => {
    lookupAndSetProduct(formData.codeBarres);
  }, [formData.codeBarres, lookupAndSetProduct]);

  const handleDetectedQr = useCallback((value) => {
    if (!value) return;
    if (scanTarget !== 'codeBarres') return;

    setFormData((prev) => ({ ...prev, codeBarres: value }));
    lookupAndSetProduct(value);
  }, [lookupAndSetProduct, scanTarget]);

  const validateForm = useCallback(() => {
    const next = {};

    if (!productInfo?.id) next.product = 'Produit introuvable';

    const qty = asPositiveInt(formData.quantite, { min: 1, max: 1000000000 });
    if (!Number.isFinite(qty)) next.quantite = 'Quantité invalide';

    if (!formData.dateEntree || Number.isNaN(new Date(formData.dateEntree).getTime())) next.dateEntree = "Date d'entrée invalide";

    if (!isSafeText(formData.numeroBonLivraison, { min: 1, max: 60 })) next.numeroBonLivraison = 'Le bon de livraison est obligatoire';
    if (!isSafeText(formData.provenance, { min: 1, max: 80 })) next.provenance = 'Le nom du livreur ou la provenance est obligatoire';

    if (formData.serviceDemandeur && !isSafeText(formData.serviceDemandeur, { min: 0, max: 80 })) next.serviceDemandeur = 'Service demandeur invalide';
    if (formData.commentaire && !isSafeText(formData.commentaire, { min: 0, max: 600 })) next.commentaire = 'Commentaire trop long (max 600)';

    if (isChemicalProduct) {
      if (formData.attestationProduitDangereux && !isSafeText(formData.attestationProduitDangereux, { min: 0, max: 120 })) {
        next.attestationProduitDangereux = 'Attestation invalide';
      }
    }

    if (isGasProduct) {
      if (formData.numeroContratGaz && !isSafeText(formData.numeroContratGaz, { min: 0, max: 60 })) {
        next.numeroContratGaz = 'Numéro de contrat invalide';
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }, [formData, isChemicalProduct, isGasProduct, productInfo?.id]);

  const canSubmit = useMemo(() => {
    const qty = asPositiveInt(formData.quantite, { min: 1, max: 1000000000 });
    return Boolean(
      productInfo?.id
      && Number.isFinite(qty)
      && String(formData.numeroBonLivraison || '').trim()
      && String(formData.provenance || '').trim()
      && formData.dateEntree
      && !Number.isNaN(new Date(formData.dateEntree).getTime())
      && !isSubmitting
    );
  }, [formData, isSubmitting, productInfo?.id]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error('Veuillez corriger les erreurs');
      return;
    }

    setIsSubmitting(true);
    try {
      const attachments = [];
      if (attachmentFile) {
        const uploaded = await uploadFile('/files/upload', attachmentFile);
        attachments.push({
          label: 'Bon de livraison',
          file_name: uploaded.file_name,
          file_url: uploaded.file_url,
        });
      }

      const created = await post('/stock/entries', {
        product: productInfo.id,
        quantity: Number(asPositiveInt(formData.quantite, { min: 1, max: 1000000000 })),
        date_entry: formData.dateEntree,
        delivery_note_number: sanitizeText(formData.numeroBonLivraison, { maxLen: 60 }),
        supplier: sanitizeText(formData.provenance, { maxLen: 80 }),
        entry_mode: 'supplier_number',
        service_requester: sanitizeText(formData.serviceDemandeur, { maxLen: 80 }) || undefined,
        observation: sanitizeText(formData.commentaire, { maxLen: 600 }) || undefined,
        expiry_date: isChemicalProduct ? (formData.datePeremption || undefined) : undefined,
        chemical_status: isChemicalProduct ? (sanitizeText(formData.statutChimique, { maxLen: 40 }) || undefined) : undefined,
        dangerous_product_attestation: isChemicalProduct ? (sanitizeText(formData.attestationProduitDangereux, { maxLen: 120 }) || undefined) : undefined,
        contract_number: isGasProduct ? (sanitizeText(formData.numeroContratGaz, { maxLen: 60 }) || undefined) : undefined,
        attachments,
        submission_duration_ms: Math.max(0, Date.now() - formOpenedAtRef.current),
      });

      saveRecentValue('mag_recent_suppliers_v1', formData.provenance);
      saveRecentValue('mag_recent_delivery_notes_v1', formData.numeroBonLivraison);
      setRecentSuppliers(loadRecentList('mag_recent_suppliers_v1'));
      setRecentDeliveryNotes(loadRecentList('mag_recent_delivery_notes_v1'));

      const lotNumber = created?.lot_number || created?.lotNumber || '';
      toast.success(
        lotNumber
          ? `Entrée enregistrée avec succès. Numéro de lot généré : ${lotNumber}`
          : 'Entrée de stock enregistrée avec succès.'
      );
      navigate('/magasinier');
    } catch (err) {
      toast.error(err.message || "Échec de l'enregistrement");
    } finally {
      setIsSubmitting(false);
    }
  }, [attachmentFile, formData, isChemicalProduct, isGasProduct, navigate, productInfo?.id, toast, validateForm]);

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
          title="Entrée de stock"
          showSearch={false}
          onMenuClick={() => setSidebarCollapsed((prev) => !prev)}
        />

        <main className="main-content">
          {(isSubmitting || isLoadingProducts) && <LoadingSpinner overlay text="Chargement..." />}

          <div className="stock-operation-page">
            <div className="operation-card">
              <div className="operation-header entry">
                <ArrowDownToLine size={24} />
                <div className="operation-header-text">
                  <h2>Nouvelle entrée de stock</h2>
                  <p className="operation-subtitle">Enregistrer une réception de produit</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="operation-form" noValidate>
                <div className="form-section">
                  <h3>Identification du produit</h3>
                  <div className="form-group">
                    <label htmlFor="codeBarres">
                      <ScanLine size={16} />
                      Code-barres / Code produit
                    </label>
                    <div className="input-with-btn">
                      <input
                        id="codeBarres"
                        type="text"
                        maxLength={80}
                        value={formData.codeBarres}
                        onChange={(e) => setFormData((prev) => ({ ...prev, codeBarres: e.target.value }))}
                        placeholder="Scanner ou saisir le code"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleScanBarcode();
                          }
                        }}
                      />
                      <button type="button" className="scan-btn" onClick={handleScanBarcode}>
                        <ScanLine size={18} />
                        Scanner
                      </button>
                      <button type="button" className="scan-btn" onClick={() => setScanTarget('codeBarres')}>
                        <ScanLine size={18} />
                        Caméra
                      </button>
                    </div>
                    {errors.product && <span className="error-text" role="alert">{errors.product}</span>}
                  </div>
                </div>

                {productInfo && (
                  <div className="product-info-card">
                    <div className="product-info-header">
                      <Package size={20} />
                      <span>Produit identifié</span>
                    </div>
                    <div className="product-info-details">
                      <div className="info-item"><span className="info-label">Nom</span><span className="info-value">{productInfo.nom}</span></div>
                      <div className="info-item"><span className="info-label">Code</span><span className="info-value code">{productInfo.code}</span></div>
                      <div className="info-item"><span className="info-label">Catégorie</span><span className="info-value">{productInfo.categorie}</span></div>
                      <div className="info-item"><span className="info-label">Stock actuel</span><span className="info-value">{productInfo.quantite} {productInfo.unite}</span></div>
                    </div>
                  </div>
                )}

                {scanTarget && (
                  <InlineQrScanner
                    onDetected={handleDetectedQr}
                    onClose={() => setScanTarget('')}
                  />
                )}

                <div className="form-section">
                  <h3>Informations de l'entrée</h3>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="quantite"><Hash size={16} />Quantité entrée</label>
                      <div className="input-with-unit">
                        <input
                          id="quantite"
                          type="number"
                          min="1"
                          max="1000000000"
                          step="1"
                          value={formData.quantite}
                          onChange={(e) => setFormData((prev) => ({ ...prev, quantite: e.target.value }))}
                          placeholder="Ex : 10"
                          className={errors.quantite ? 'error' : ''}
                          inputMode="numeric"
                        />
                        <span className="unit-pill" aria-label="Unité">
                          {productInfo?.unite || 'Unité'}
                        </span>
                      </div>
                      {errors.quantite && <span className="error-text" role="alert">{errors.quantite}</span>}
                    </div>

                    <div className="form-group">
                      <label htmlFor="dateEntree"><Calendar size={16} />Date d'entrée</label>
                      <input
                        id="dateEntree"
                        type="date"
                        value={formData.dateEntree}
                        onChange={(e) => setFormData((prev) => ({ ...prev, dateEntree: e.target.value }))}
                        className={errors.dateEntree ? 'error' : ''}
                      />
                      {errors.dateEntree && <span className="error-text" role="alert">{errors.dateEntree}</span>}
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="numeroBonLivraison">Bon de livraison</label>
                      <input
                        id="numeroBonLivraison"
                        type="text"
                        maxLength={60}
                        list="recentDeliveryNotes"
                        value={formData.numeroBonLivraison}
                        onChange={(e) => setFormData((prev) => ({ ...prev, numeroBonLivraison: e.target.value }))}
                        placeholder="Ex : BL-2026-001"
                        className={errors.numeroBonLivraison ? 'error' : ''}
                      />
                      <datalist id="recentDeliveryNotes">
                        {recentDeliveryNotes.map((v) => <option key={v} value={v} />)}
                      </datalist>
                      {errors.numeroBonLivraison && <span className="error-text" role="alert">{errors.numeroBonLivraison}</span>}
                    </div>

                    <div className="form-group">
                      <label htmlFor="provenance"><Truck size={16} />Livré par / Provenance</label>
                      <input
                        id="provenance"
                        type="text"
                        maxLength={80}
                        list="recentSuppliers"
                        value={formData.provenance}
                        onChange={(e) => setFormData((prev) => ({ ...prev, provenance: e.target.value }))}
                        placeholder="Nom du livreur ou provenance"
                        className={errors.provenance ? 'error' : ''}
                      />
                      <datalist id="recentSuppliers">
                        {recentSuppliers.map((v) => <option key={v} value={v} />)}
                      </datalist>
                      {errors.provenance && <span className="error-text" role="alert">{errors.provenance}</span>}
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="serviceDemandeur">Service demandeur</label>
                      <input
                        id="serviceDemandeur"
                        type="text"
                        maxLength={80}
                        value={formData.serviceDemandeur}
                        onChange={(e) => setFormData((prev) => ({ ...prev, serviceDemandeur: e.target.value }))}
                        placeholder="Optionnel"
                        className={errors.serviceDemandeur ? 'error' : ''}
                      />
                      {errors.serviceDemandeur && <span className="error-text" role="alert">{errors.serviceDemandeur}</span>}
                    </div>

                    <div className="form-group">
                      <label htmlFor="pieceJointe">Fichier bon de livraison (optionnel)</label>
                      <input
                        id="pieceJointe"
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp"
                        onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                      />
                      <span className="field-hint">Formats : PDF, PNG, JPG</span>
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="commentaire">Commentaire</label>
                    <textarea
                      id="commentaire"
                      maxLength={600}
                      value={formData.commentaire}
                      onChange={(e) => setFormData((prev) => ({ ...prev, commentaire: e.target.value }))}
                      rows={3}
                      placeholder="Optionnel"
                      className={errors.commentaire ? 'error' : ''}
                    />
                    {errors.commentaire && <span className="error-text" role="alert">{errors.commentaire}</span>}
                  </div>

                  <div className="lot-info-line" role="note" aria-label="Lot">
                    <Info size={16} />
                    <span>Le numéro de lot sera généré automatiquement après validation.</span>
                  </div>

                  {(isChemicalProduct || isGasProduct) && (
                    <div className="sensitive-block">
                      <div className="sensitive-title">Champs spécifiques (si nécessaire)</div>

                      {isChemicalProduct && (
                        <div className="form-row">
                          <div className="form-group">
                            <label htmlFor="datePeremption">Date de péremption</label>
                            <input
                              id="datePeremption"
                              type="date"
                              value={formData.datePeremption}
                              onChange={(e) => setFormData((prev) => ({ ...prev, datePeremption: e.target.value }))}
                            />
                          </div>
                          <div className="form-group">
                            <label htmlFor="statutChimique">Statut chimique</label>
                            <select
                              id="statutChimique"
                              value={formData.statutChimique}
                              onChange={(e) => setFormData((prev) => ({ ...prev, statutChimique: e.target.value }))}
                            >
                              <option value="Utilisable">Utilisable</option>
                              <option value="Perime">Perime</option>
                            </select>
                          </div>
                          <div className="form-group">
                            <label htmlFor="attestationProduitDangereux">Réf. attestation produit dangereux</label>
                            <input
                              id="attestationProduitDangereux"
                              type="text"
                              maxLength={120}
                              value={formData.attestationProduitDangereux}
                              onChange={(e) => setFormData((prev) => ({ ...prev, attestationProduitDangereux: e.target.value }))}
                              placeholder="Optionnel"
                              className={errors.attestationProduitDangereux ? 'error' : ''}
                            />
                            {errors.attestationProduitDangereux && <span className="error-text" role="alert">{errors.attestationProduitDangereux}</span>}
                          </div>
                        </div>
                      )}

                      {isGasProduct && (
                        <div className="form-row">
                          <div className="form-group">
                            <label htmlFor="numeroContratGaz">Numéro de contrat (gaz)</label>
                            <input
                              id="numeroContratGaz"
                              type="text"
                              maxLength={60}
                              value={formData.numeroContratGaz}
                              onChange={(e) => setFormData((prev) => ({ ...prev, numeroContratGaz: e.target.value }))}
                              placeholder="Optionnel"
                              className={errors.numeroContratGaz ? 'error' : ''}
                            />
                            {errors.numeroContratGaz && <span className="error-text" role="alert">{errors.numeroContratGaz}</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="form-actions">
                  <button type="button" className="btn-cancel" onClick={() => navigate('/magasinier')} disabled={isSubmitting}>
                    <X size={18} />
                    Annuler
                  </button>
                  <button type="submit" className="btn-submit entry" disabled={!canSubmit}>
                    <Save size={18} />
                    Confirmer l'entrée
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
