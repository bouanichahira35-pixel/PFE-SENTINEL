// BLOC 1 - Role du fichier.
// Ce fichier affiche une page de l'espace magasinier pour EntreeStock.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { useCallback, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowDownToLine, Calendar, Camera, Hash, Info,
  Package, Save, ScanLine, Truck, X, AlertTriangle,
  FlaskConical, Gauge,
} from 'lucide-react';
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

  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false)
  );
  const [isSubmitting,      setIsSubmitting]      = useState(false);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  const initialProduct = location.state?.product || null;
  const [productInfo,    setProductInfo]    = useState(() => initialProduct || null);
  const [scanTarget,     setScanTarget]     = useState('');
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [errors,         setErrors]         = useState({});
  const formOpenedAtRef  = useRef(Date.now());
  const quantiteInputRef = useRef(null);

  const [recentProductCodes,  setRecentProductCodes]  = useState(() => loadRecentList('mag_recent_product_codes_v1'));
  const [recentSuppliers,     setRecentSuppliers]     = useState(() => loadRecentList('mag_recent_suppliers_v1'));
  const [recentDeliveryNotes, setRecentDeliveryNotes] = useState(() => loadRecentList('mag_recent_delivery_notes_v1'));

  const [formData, setFormData] = useState(() => ({
    codeBarres:                     initialProduct?.code || '',
    quantite:                       '',
    dateEntree:                     todayIso(),
    numeroBonLivraison:             '',
    provenance:                     '',
    serviceDemandeur:               '',
    commentaire:                    '',
    datePeremption:                 '',
    statutChimique:                 'Utilisable',
    attestationProduitDangereux:    '',
    numeroContratGaz:               '',
  }));

  const mapProductFromLookup = useCallback((p) => ({
    id:       p?._id,
    code:     p?.code_product,
    nom:      p?.name,
    categorie: p?.category?.name || '-',
    quantite: Number(p?.quantity_current || 0),
    unite:    p?.unite || 'Unite',
    family:   p?.family || '',
  }), []);

  const isChemicalProduct = useMemo(
    () => String(productInfo?.family || '').toLowerCase() === 'produit_chimique',
    [productInfo?.family]
  );
  const isGasProduct = useMemo(
    () => String(productInfo?.family || '').toLowerCase() === 'gaz',
    [productInfo?.family]
  );

  /* ── Lookup produit (inchangé) ── */
  const lookupAndSetProduct = useCallback(async (rawCode, options = {}) => {
    const code = String(rawCode || '').trim();
    if (!code) {
      setProductInfo(null);
      setErrors(prev => ({ ...prev, product: 'Code produit requis' }));
      return null;
    }
    setIsLoadingProducts(true);
    try {
      const payload = await get(`/products/lookup?code=${encodeURIComponent(code)}`);
      const p = payload?.product;
      if (!p?._id) {
        setProductInfo(null);
        setErrors(prev => ({ ...prev, product: 'Produit introuvable' }));
        if (!options.silent) toast.error('Produit introuvable');
        return null;
      }
      const mapped = mapProductFromLookup(p);
      setProductInfo(mapped);
      setErrors(prev => ({ ...prev, product: undefined }));
      saveRecentValue('mag_recent_product_codes_v1', code);
      setRecentProductCodes(loadRecentList('mag_recent_product_codes_v1'));
      if (options.focusNext) requestAnimationFrame(() => quantiteInputRef.current?.focus?.());
      if (!options.silent) toast.success('Produit identifié');
      return mapped;
    } catch (err) {
      setProductInfo(null);
      setErrors(prev => ({ ...prev, product: 'Produit introuvable' }));
      if (!options.silent) toast.error(err.message || 'Produit introuvable');
      return null;
    } finally { setIsLoadingProducts(false); }
  }, [mapProductFromLookup, toast]);

  const handleScanBarcode = useCallback(() => {
    lookupAndSetProduct(formData.codeBarres, { focusNext: true });
  }, [formData.codeBarres, lookupAndSetProduct]);

  const handleDetectedQr = useCallback((value) => {
    const scanned = String(value || '').trim();
    if (!scanned || scanTarget !== 'codeBarres') return;
    setFormData(prev => ({ ...prev, codeBarres: scanned }));
    lookupAndSetProduct(scanned, { focusNext: true });
  }, [lookupAndSetProduct, scanTarget]);

  /* ── Validation (inchangée) ── */
  const validateForm = useCallback(() => {
    const next = {};
    if (!productInfo?.id) next.product = 'Produit introuvable';
    const qty = asPositiveInt(formData.quantite, { min: 1, max: 1000000000 });
    if (!Number.isFinite(qty)) next.quantite = 'Quantité invalide';
    if (!formData.dateEntree || Number.isNaN(new Date(formData.dateEntree).getTime()))
      next.dateEntree = "Date d'entrée invalide";
    if (!isSafeText(formData.numeroBonLivraison, { min: 1, max: 60 }))
      next.numeroBonLivraison = 'Bon de livraison obligatoire';
    if (!isSafeText(formData.provenance, { min: 1, max: 80 }))
      next.provenance = 'Livré par / Provenance obligatoire';
    if (formData.serviceDemandeur && !isSafeText(formData.serviceDemandeur, { min: 0, max: 80 }))
      next.serviceDemandeur = 'Service demandeur invalide';
    if (formData.commentaire && !isSafeText(formData.commentaire, { min: 0, max: 600 }))
      next.commentaire = 'Commentaire trop long (max 600)';
    if (isChemicalProduct && formData.attestationProduitDangereux &&
        !isSafeText(formData.attestationProduitDangereux, { min: 0, max: 120 }))
      next.attestationProduitDangereux = 'Attestation invalide';
    if (isGasProduct && formData.numeroContratGaz &&
        !isSafeText(formData.numeroContratGaz, { min: 0, max: 60 }))
      next.numeroContratGaz = 'Numéro de contrat invalide';
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [formData, isChemicalProduct, isGasProduct, productInfo?.id]);

  const canSubmit = useMemo(() => {
    const qty = asPositiveInt(formData.quantite, { min: 1, max: 1000000000 });
    return Boolean(
      productInfo?.id && Number.isFinite(qty)
      && String(formData.numeroBonLivraison || '').trim()
      && String(formData.provenance || '').trim()
      && formData.dateEntree
      && !Number.isNaN(new Date(formData.dateEntree).getTime())
      && !isSubmitting
    );
  }, [formData, isSubmitting, productInfo?.id]);

  /* ── Soumission (inchangée) ── */
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!validateForm()) { toast.error('Veuillez corriger les erreurs'); return; }
    setIsSubmitting(true);
    try {
      const attachments = [];
      if (attachmentFile) {
        const uploaded = await uploadFile('/files/upload', attachmentFile);
        attachments.push({ label: 'Bon de livraison', file_name: uploaded.file_name, file_url: uploaded.file_url });
      }
      const created = await post('/stock/entries', {
        product:                          productInfo.id,
        quantity:                         Number(asPositiveInt(formData.quantite, { min: 1, max: 1000000000 })),
        date_entry:                       formData.dateEntree,
        delivery_note_number:             sanitizeText(formData.numeroBonLivraison, { maxLen: 60 }),
        supplier:                         sanitizeText(formData.provenance, { maxLen: 80 }),
        entry_mode:                       'supplier_number',
        service_requester:                sanitizeText(formData.serviceDemandeur, { maxLen: 80 }) || undefined,
        observation:                      sanitizeText(formData.commentaire, { maxLen: 600 }) || undefined,
        expiry_date:                      isChemicalProduct ? (formData.datePeremption || undefined) : undefined,
        chemical_status:                  isChemicalProduct ? (sanitizeText(formData.statutChimique, { maxLen: 40 }) || undefined) : undefined,
        dangerous_product_attestation:    isChemicalProduct ? (sanitizeText(formData.attestationProduitDangereux, { maxLen: 120 }) || undefined) : undefined,
        contract_number:                  isGasProduct ? (sanitizeText(formData.numeroContratGaz, { maxLen: 60 }) || undefined) : undefined,
        attachments,
        submission_duration_ms: Math.max(0, Date.now() - formOpenedAtRef.current),
      });
      saveRecentValue('mag_recent_suppliers_v1',     formData.provenance);
      saveRecentValue('mag_recent_delivery_notes_v1', formData.numeroBonLivraison);
      setRecentSuppliers(loadRecentList('mag_recent_suppliers_v1'));
      setRecentDeliveryNotes(loadRecentList('mag_recent_delivery_notes_v1'));
      const lotNumber = created?.lot_number || created?.lotNumber || '';
      toast.success(lotNumber
        ? `Entrée enregistrée. Lot généré : ${lotNumber}`
        : 'Entrée de stock enregistrée avec succès.');
      navigate('/magasinier');
    } catch (err) {
      toast.error(err.message || "Échec de l'enregistrement");
    } finally { setIsSubmitting(false); }
  }, [attachmentFile, formData, isChemicalProduct, isGasProduct, navigate, productInfo?.id, toast, validateForm]);

  /* ════════════════════════════════════════════════════════════
     RENDU — 2 colonnes, une seule vue sans scroll
  ════════════════════════════════════════════════════════════ */
  return (
    <div className="app-layout">
      <div className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`} onClick={() => setSidebarCollapsed(true)} />
      <SidebarMag collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} onLogout={onLogout} userName={userName} />

      <div className="main-container">
        <HeaderPage userName={userName} title="Entrée de stock" showSearch={false} onMenuClick={() => setSidebarCollapsed(prev => !prev)} />

        <main className="main-content es-main">
          {(isSubmitting || isLoadingProducts) && <LoadingSpinner overlay text="Chargement..." />}

          <div className="es-page">
            <div className="es-card">

              {/* ── En-tête vert ── */}
              <div className="es-header">
                <ArrowDownToLine size={20} />
                <div>
                  <h2>Nouvelle entrée de stock</h2>
                  <p>Enregistrer une réception de produit</p>
                </div>
                {/* Stock actuel affiché si produit identifié */}
                {productInfo && (
                  <div className="es-header-stock">
                    <span className="es-header-stock-label">Stock actuel</span>
                    <span className="es-header-stock-val">
                      {productInfo.quantite} <small>{productInfo.unite}</small>
                    </span>
                  </div>
                )}
              </div>

              {/* ══ FORMULAIRE 2 colonnes ══ */}
              <form onSubmit={handleSubmit} className="es-form" noValidate>
                <div className="es-body">

                  {/* ══ COLONNE GAUCHE ══ */}
                  <div className="es-col-left">

                    {/* 1. Identification produit */}
                    <div className="es-section">
                      <div className="es-section-title"><ScanLine size={13} /> Identification du produit</div>

                      <div className="es-field">
                        <label className="es-label" htmlFor="codeBarres">
                          <ScanLine size={13} /> Code-barres / Code produit <span className="es-req">*</span>
                        </label>
                        <div className="es-input-row">
                          <input
                            id="codeBarres" type="text" maxLength={80}
                            list="recentProductCodes"
                            className={`es-input ${errors.product ? 'error' : ''}`}
                            value={formData.codeBarres}
                            onChange={e => setFormData(prev => ({ ...prev, codeBarres: e.target.value }))}
                            placeholder="Scanner ou saisir le code"
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleScanBarcode(); } }}
                          />
                          <datalist id="recentProductCodes">
                            {recentProductCodes.map(v => <option key={v} value={v} />)}
                          </datalist>
                          <button type="button" className="es-scan-btn" onClick={handleScanBarcode}>
                            <ScanLine size={14} /> Chercher
                          </button>
                          <button type="button" className="es-scan-btn" onClick={() => setScanTarget('codeBarres')}>
                            <Camera size={14} /> Caméra
                          </button>
                        </div>
                        {errors.product && <span className="es-error"><AlertTriangle size={12} />{errors.product}</span>}
                      </div>

                      {/* Chip produit identifié */}
                      {productInfo && (
                        <div className="es-product-chip">
                          <Package size={15} />
                          <div className="es-product-chip-info">
                            <strong>{productInfo.nom}</strong>
                            <span>{productInfo.code} · {productInfo.categorie}
                              {(isChemicalProduct || isGasProduct) && (
                                <span className="es-family-badge">
                                  {isChemicalProduct ? <><FlaskConical size={10} /> Chimique</> : <><Gauge size={10} /> Gaz</>}
                                </span>
                              )}
                            </span>
                          </div>
                          <button type="button" className="es-chip-clear"
                            onClick={() => { setProductInfo(null); setFormData(prev => ({ ...prev, codeBarres: '' })); }}
                            aria-label="Changer de produit"><X size={13} /></button>
                        </div>
                      )}

                      {/* Scanner inline */}
                      {scanTarget === 'codeBarres' && (
                        <InlineQrScanner mode="any" onDetected={handleDetectedQr} onClose={() => setScanTarget('')} />
                      )}
                    </div>

                    {/* 2. Quantité + Date */}
                    <div className="es-section">
                      <div className="es-section-title"><Hash size={13} /> Réception</div>

                      <div className="es-row-2">
                        <div className="es-field">
                          <label className="es-label" htmlFor="quantite">
                            <Hash size={13} /> Quantité reçue <span className="es-req">*</span>
                          </label>
                          <div className="es-input-row">
                            <input
                              id="quantite" ref={quantiteInputRef}
                              type="number" min="1" max="1000000000" step="1" inputMode="numeric"
                              className={`es-input ${errors.quantite ? 'error' : ''}`}
                              value={formData.quantite}
                              onChange={e => setFormData(prev => ({ ...prev, quantite: e.target.value }))}
                              placeholder="Ex : 10"
                            />
                            <span className="es-unit-pill">{productInfo?.unite || 'Unité'}</span>
                          </div>
                          {errors.quantite && <span className="es-error"><AlertTriangle size={12} />{errors.quantite}</span>}

                          {/* Mini résumé stock après entrée */}
                          {productInfo && formData.quantite && Number(formData.quantite) > 0 && (
                            <div className="es-stock-mini">
                              <span>{productInfo.quantite} → <strong className="after">{productInfo.quantite + (Number(formData.quantite) || 0)}</strong></span>
                              <span className="es-stock-mini-label">après entrée</span>
                            </div>
                          )}
                        </div>

                        <div className="es-field">
                          <label className="es-label" htmlFor="dateEntree">
                            <Calendar size={13} /> Date d'entrée <span className="es-req">*</span>
                          </label>
                          <input
                            id="dateEntree" type="date"
                            className={`es-input ${errors.dateEntree ? 'error' : ''}`}
                            value={formData.dateEntree}
                            onChange={e => setFormData(prev => ({ ...prev, dateEntree: e.target.value }))}
                          />
                          {errors.dateEntree && <span className="es-error"><AlertTriangle size={12} />{errors.dateEntree}</span>}
                        </div>
                      </div>
                    </div>

                    {/* 3. Bon de livraison + provenance */}
                    <div className="es-section">
                      <div className="es-section-title"><Truck size={13} /> Livraison</div>

                      <div className="es-row-2">
                        <div className="es-field">
                          <label className="es-label" htmlFor="numeroBonLivraison">
                            Bon de livraison <span className="es-req">*</span>
                          </label>
                          <input
                            id="numeroBonLivraison" type="text" maxLength={60}
                            list="recentDeliveryNotes"
                            className={`es-input ${errors.numeroBonLivraison ? 'error' : ''}`}
                            value={formData.numeroBonLivraison}
                            onChange={e => setFormData(prev => ({ ...prev, numeroBonLivraison: e.target.value }))}
                            placeholder="Ex : BL-2026-001"
                          />
                          <datalist id="recentDeliveryNotes">
                            {recentDeliveryNotes.map(v => <option key={v} value={v} />)}
                          </datalist>
                          {errors.numeroBonLivraison && <span className="es-error"><AlertTriangle size={12} />{errors.numeroBonLivraison}</span>}
                        </div>

                        <div className="es-field">
                          <label className="es-label" htmlFor="provenance">
                            <Truck size={13} /> Livré par / Provenance <span className="es-req">*</span>
                          </label>
                          <input
                            id="provenance" type="text" maxLength={80}
                            list="recentSuppliers"
                            className={`es-input ${errors.provenance ? 'error' : ''}`}
                            value={formData.provenance}
                            onChange={e => setFormData(prev => ({ ...prev, provenance: e.target.value }))}
                            placeholder="Nom du livreur ou provenance"
                          />
                          <datalist id="recentSuppliers">
                            {recentSuppliers.map(v => <option key={v} value={v} />)}
                          </datalist>
                          {errors.provenance && <span className="es-error"><AlertTriangle size={12} />{errors.provenance}</span>}
                        </div>
                      </div>
                    </div>

                  </div>{/* /es-col-left */}

                  {/* ══ COLONNE DROITE ══ */}
                  <div className="es-col-right">

                    {/* Service demandeur + fichier */}
                    <div className="es-section">
                      <div className="es-section-title">Informations complémentaires</div>

                      <div className="es-field">
                        <label className="es-label" htmlFor="serviceDemandeur">
                          Service demandeur <span className="es-opt">(optionnel)</span>
                        </label>
                        <input
                          id="serviceDemandeur" type="text" maxLength={80}
                          className={`es-input ${errors.serviceDemandeur ? 'error' : ''}`}
                          value={formData.serviceDemandeur}
                          onChange={e => setFormData(prev => ({ ...prev, serviceDemandeur: e.target.value }))}
                          placeholder="Nom du service"
                        />
                        {errors.serviceDemandeur && <span className="es-error"><AlertTriangle size={12} />{errors.serviceDemandeur}</span>}
                      </div>

                      <div className="es-field">
                        <label className="es-label" htmlFor="commentaire">
                          Commentaire <span className="es-opt">(optionnel)</span>
                        </label>
                        <textarea
                          id="commentaire" maxLength={600} rows={2}
                          className={`es-input es-textarea ${errors.commentaire ? 'error' : ''}`}
                          value={formData.commentaire}
                          onChange={e => setFormData(prev => ({ ...prev, commentaire: e.target.value }))}
                          placeholder="Remarques, observations…"
                        />
                        {errors.commentaire && <span className="es-error"><AlertTriangle size={12} />{errors.commentaire}</span>}
                      </div>

                      <div className="es-field">
                        <label className="es-label" htmlFor="pieceJointe">
                          Bon de livraison (fichier) <span className="es-opt">(optionnel)</span>
                        </label>
                        <input
                          id="pieceJointe" type="file"
                          accept=".pdf,.png,.jpg,.jpeg,.webp"
                          className="es-input es-file"
                          onChange={e => setAttachmentFile(e.target.files?.[0] || null)}
                        />
                        <span className="es-hint">PDF, PNG, JPG acceptés</span>
                      </div>
                    </div>

                    {/* Champs sensibles chimique/gaz */}
                    {(isChemicalProduct || isGasProduct) && (
                      <div className="es-section es-sensitive">
                        <div className="es-section-title">
                          {isChemicalProduct
                            ? <><FlaskConical size={13} /> Produit chimique</>
                            : <><Gauge size={13} /> Gaz</>
                          }
                        </div>

                        {isChemicalProduct && (
                          <>
                            <div className="es-row-2">
                              <div className="es-field">
                                <label className="es-label" htmlFor="datePeremption">Date de péremption</label>
                                <input id="datePeremption" type="date" className="es-input"
                                  value={formData.datePeremption}
                                  onChange={e => setFormData(prev => ({ ...prev, datePeremption: e.target.value }))} />
                              </div>
                              <div className="es-field">
                                <label className="es-label" htmlFor="statutChimique">Statut chimique</label>
                                <select id="statutChimique" className="es-input"
                                  value={formData.statutChimique}
                                  onChange={e => setFormData(prev => ({ ...prev, statutChimique: e.target.value }))}>
                                  <option value="Utilisable">Utilisable</option>
                                  <option value="Perime">Périmé</option>
                                </select>
                              </div>
                            </div>
                            <div className="es-field">
                              <label className="es-label" htmlFor="attestationProduitDangereux">
                                Réf. attestation produit dangereux
                              </label>
                              <input id="attestationProduitDangereux" type="text" maxLength={120}
                                className={`es-input ${errors.attestationProduitDangereux ? 'error' : ''}`}
                                value={formData.attestationProduitDangereux}
                                onChange={e => setFormData(prev => ({ ...prev, attestationProduitDangereux: e.target.value }))}
                                placeholder="Optionnel" />
                              {errors.attestationProduitDangereux && <span className="es-error"><AlertTriangle size={12} />{errors.attestationProduitDangereux}</span>}
                            </div>
                          </>
                        )}

                        {isGasProduct && (
                          <div className="es-field">
                            <label className="es-label" htmlFor="numeroContratGaz">Numéro de contrat (gaz)</label>
                            <input id="numeroContratGaz" type="text" maxLength={60}
                              className={`es-input ${errors.numeroContratGaz ? 'error' : ''}`}
                              value={formData.numeroContratGaz}
                              onChange={e => setFormData(prev => ({ ...prev, numeroContratGaz: e.target.value }))}
                              placeholder="Optionnel" />
                            {errors.numeroContratGaz && <span className="es-error"><AlertTriangle size={12} />{errors.numeroContratGaz}</span>}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Notice lot automatique */}
                    <div className="es-lot-notice" role="note">
                      <Info size={14} />
                      <span>Le numéro de lot sera généré automatiquement après validation.</span>
                    </div>

                  </div>{/* /es-col-right */}

                </div>{/* /es-body */}

                {/* ── Barre d'actions ── */}
                <div className="es-actions">
                  <button type="button" className="es-btn-cancel"
                    onClick={() => navigate('/magasinier')} disabled={isSubmitting}>
                    <X size={15} /> Annuler
                  </button>
                  <button type="submit" className="es-btn-submit" disabled={!canSubmit}>
                    <Save size={15} /> Confirmer l'entrée
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