import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Package, ArrowUpFromLine, Save, X, ScanLine, Camera,
  Calendar, User, Hash, AlertTriangle, FileText,
  Building2, QrCode, RefreshCcw, Printer,
} from 'lucide-react';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import InlineQrScanner from '../../components/shared/InlineQrScanner';
import { useToast } from '../../components/shared/Toast';
import { get, patch, post, uploadFile } from '../../services/api';
import { getUiErrorMessage } from '../../services/uiError';
import { asPositiveInt, isSafeText, sanitizeText } from '../../utils/formGuards';
import { loadRecentList, saveRecentValue } from '../../utils/recentInputs';
import './SortieStock.css';

const SortieStock = ({ userName, onLogout }) => {
  const location  = useLocation();
  const navigate  = useNavigate();
  const toast     = useToast();

  /* ── state identique ── */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false)
  );
  const [isSubmitting,      setIsSubmitting]      = useState(false);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  const initialProduct = location.state?.product   || null;
  const demandeInfo    = location.state?.demandeInfo || null;

  const [productInfo,        setProductInfo]        = useState(initialProduct);
  const [errors,             setErrors]             = useState({});
  const [attachmentFile,     setAttachmentFile]     = useState(null);
  const [attachmentLabel,    setAttachmentLabel]    = useState('Bon de prelevement');
  const [scanTarget,         setScanTarget]         = useState('');
  const [nextFifoLot,        setNextFifoLot]        = useState(null);
  const [isLoadingFifoLot,   setIsLoadingFifoLot]   = useState(false);
  const [isResolvingBond,    setIsResolvingBond]    = useState(false);
  const [isGeneratingBond,   setIsGeneratingBond]   = useState(false);
  const [bondResolution,     setBondResolution]     = useState(null);
  const [generatedBond,      setGeneratedBond]      = useState(null);
  const formOpenedAtRef = useRef(Date.now());

  const [recentDirections,       setRecentDirections]       = useState(() => loadRecentList('mag_recent_directions_v1'));
  const [recentBeneficiaries,    setRecentBeneficiaries]    = useState(() => loadRecentList('mag_recent_beneficiaries_v1'));
  const [recentWithdrawalPapers, setRecentWithdrawalPapers] = useState(() => loadRecentList('mag_recent_withdrawal_papers_v1'));
  const [recentProductCodes,     setRecentProductCodes]     = useState(() => loadRecentList('mag_recent_product_codes_v1'));

  const [formData, setFormData] = useState({
    codeBarres:                 initialProduct?.code || '',
    quantite:                   demandeInfo?.quantite?.toString() || '',
    dateSortie:                 new Date().toISOString().split('T')[0],
    directionLaboratoire:       demandeInfo?.direction    || '',
    beneficiaire:               demandeInfo?.beneficiaire || demandeInfo?.demandeur || '',
    numeroBonPrelevementPapier: '',
    lotQrCode:                  '',
    internalBondQr:             '',
    commentaire:                '',
  });

  /* ── helpers identiques ── */
  const mapProductFromLookup = useCallback((p) => ({
    id:       p?._id,
    code:     p?.code_product,
    nom:      p?.name,
    categorie: p?.category?.name || 'Sans categorie',
    quantite: Number(p?.quantity_current || 0),
    seuil:    Number(p?.seuil_minimum    || 0),
    unite:    p?.unite || 'Unite',
  }), []);

  const lookupAndSetProduct = useCallback(async (rawCode, options = {}) => {
    const code = String(rawCode || '').trim();
    if (!code) { setProductInfo(null); setErrors(prev => ({ ...prev, product: 'Produit requis' })); return null; }
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
      if (!options.silent) toast.success(`Produit identifié : ${mapped.nom || mapped.code || ''}`);
      return mapped;
    } catch (err) {
      setProductInfo(null);
      setErrors(prev => ({ ...prev, product: 'Produit introuvable' }));
      if (!options.silent) toast.error(err.message || 'Produit introuvable');
      return null;
    } finally { setIsLoadingProducts(false); }
  }, [mapProductFromLookup, toast]);

  const applyBondPayloadToForm = useCallback(async (payload, tokenValue) => {
    if (!payload || typeof payload !== 'object') return;
    const productCode = String(payload.product_code || '').trim();
    if (productCode) await lookupAndSetProduct(productCode, { silent: true });
    setFormData(prev => ({
      ...prev,
      codeBarres:                 productCode || prev.codeBarres,
      quantite:                   payload.quantity ? String(payload.quantity) : prev.quantite,
      numeroBonPrelevementPapier: prev.numeroBonPrelevementPapier || payload.withdrawal_paper_number || '',
      directionLaboratoire:       prev.directionLaboratoire || payload.direction_laboratory || '',
      beneficiaire:               prev.beneficiaire || payload.beneficiary || '',
      internalBondQr:             tokenValue || prev.internalBondQr,
      commentaire:                prev.commentaire || payload.note || '',
    }));
  }, [lookupAndSetProduct]);

  const resolveInternalBond = useCallback(async (rawQr, options = {}) => {
    const qrValue = String(rawQr || '').trim();
    const silent  = Boolean(options.silent);
    if (!qrValue) {
      setBondResolution(null); setGeneratedBond(null);
      setErrors(prev => ({ ...prev, internalBondQr: undefined }));
      if (!silent) toast.error('QR bon interne requis');
      return null;
    }
    setIsResolvingBond(true);
    try {
      const resolved = await post('/stock/internal-bond/resolve', { qr_value: qrValue });
      setBondResolution(resolved);
      if (resolved?.already_used) {
        setErrors(prev => ({ ...prev, internalBondQr: `Bon déjà utilisé (${resolved?.used_exit?.exit_number || 'sortie existante'})` }));
        if (!silent) toast.error('Ce bon interne a déjà été utilisé');
        return resolved;
      }
      await applyBondPayloadToForm(resolved?.payload, qrValue);
      setErrors(prev => ({ ...prev, internalBondQr: undefined }));
      if (!silent) toast.success(`Bon interne ${resolved?.payload?.bond_id || ''} vérifié`);
      return resolved;
    } catch (err) {
      setBondResolution(null);
      setErrors(prev => ({ ...prev, internalBondQr: 'QR interne invalide ou expiré' }));
      if (!silent) toast.error(getUiErrorMessage(err, 'Vérification QR bon interne impossible'));
      return null;
    } finally { setIsResolvingBond(false); }
  }, [applyBondPayloadToForm, toast]);

  /* ── effets identiques ── */
  useEffect(() => {
    if (initialProduct) return;
    if (!formData.codeBarres) return;
    lookupAndSetProduct(formData.codeBarres, { silent: true });
  }, [formData.codeBarres, initialProduct, lookupAndSetProduct]);

  useEffect(() => {
    let ignore = false;
    const hydrate = async () => {
      if (!demandeInfo?.id) return;
      if (formData.directionLaboratoire && formData.beneficiaire) return;
      try {
        const reqDoc = await get(`/requests/${demandeInfo.id}`);
        if (ignore || !reqDoc) return;
        setFormData(prev => ({
          ...prev,
          directionLaboratoire: prev.directionLaboratoire || reqDoc.direction_laboratory || '',
          beneficiaire:         prev.beneficiaire || reqDoc.beneficiary || reqDoc.demandeur?.username || '',
        }));
      } catch {}
    };
    hydrate();
    return () => { ignore = true; };
  }, [demandeInfo?.id, formData.directionLaboratoire, formData.beneficiaire]);

  useEffect(() => {
    let ignore = false;
    const loadFifo = async () => {
      if (!productInfo?.id) { setNextFifoLot(null); return; }
      setIsLoadingFifoLot(true);
      try {
        const fifo = await get(`/stock/fifo/next-lot/${productInfo.id}`);
        if (ignore) return;
        setNextFifoLot(fifo?.next_fifo_lot || null);
      } catch { if (!ignore) setNextFifoLot(null); }
      finally   { if (!ignore) setIsLoadingFifoLot(false); }
    };
    loadFifo();
    return () => { ignore = true; };
  }, [productInfo?.id]);

  const quantiteSortie    = Number.parseInt(formData.quantite, 10) || 0;
  const isInsufficientStock = useMemo(
    () => Boolean(productInfo && quantiteSortie > productInfo.quantite),
    [productInfo, quantiteSortie]
  );
  const newQuantity = useMemo(
    () => (productInfo ? productInfo.quantite - quantiteSortie : 0),
    [productInfo, quantiteSortie]
  );

  const handleScanBarcode = () => {
    if (!formData.codeBarres.trim()) { toast.error('Saisissez un code produit'); return; }
    lookupAndSetProduct(formData.codeBarres);
  };

  const handleDetectedQr = (value) => {
    const scanned = String(value || '').trim();
    if (!scanned) return;
    if (scanTarget === 'codeBarres') {
      setFormData(prev => ({ ...prev, codeBarres: scanned }));
      lookupAndSetProduct(scanned); return;
    }
    if (scanTarget === 'lotQrCode') {
      setFormData(prev => ({ ...prev, lotQrCode: scanned }));
      setErrors(prev => ({ ...prev, lotQrCode: undefined }));
      toast.success('QR lot détecté'); return;
    }
    if (scanTarget === 'internalBondQr') {
      setFormData(prev => ({ ...prev, internalBondQr: scanned }));
      resolveInternalBond(scanned);
    }
  };

  const handleGenerateInternalBond = async () => {
    if (!productInfo?.id) { toast.error('Sélectionnez d\'abord un produit'); return; }
    const qty = Number.parseInt(formData.quantite, 10);
    if (!qty || qty < 1) { toast.error('Saisissez une quantité valide avant génération'); return; }
    if (qty > Number(productInfo?.quantite || 0)) { toast.error('Stock insuffisant pour générer un bon interne'); return; }
    setIsGeneratingBond(true);
    try {
      const generated = await post('/stock/internal-bond/generate', {
        product:                  productInfo.id,
        quantity:                 qty,
        withdrawal_paper_number:  formData.numeroBonPrelevementPapier || undefined,
        direction_laboratory:     formData.directionLaboratoire || undefined,
        beneficiary:              formData.beneficiaire || undefined,
        request:                  demandeInfo?.id || undefined,
        note:                     formData.commentaire || undefined,
        valid_hours:              24,
      });
      setGeneratedBond(generated);
      setFormData(prev => ({ ...prev, internalBondQr: generated?.qr_value || '' }));
      await resolveInternalBond(generated?.qr_value || '', { silent: true });
      toast.success(`Bon interne ${generated?.bond_id || ''} généré`);
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Génération bon interne impossible'));
    } finally { setIsGeneratingBond(false); }
  };

  const handlePrintInternalBond = async () => {
    const qr = String(formData.internalBondQr || '').trim();
    if (!qr) { toast.error('Aucun QR bon interne à imprimer'); return; }
    try {
      const data = await post('/stock/internal-bond/print-data', { qr_value: qr });
      const html = String(data?.html || '');
      if (!html) { toast.error('Document PDF indisponible'); return; }
      const popup = window.open('', '_blank', 'noopener,noreferrer,width=980,height=1100');
      if (!popup) { toast.error('Popup bloquée. Autorisez les popups.'); return; }
      popup.document.open(); popup.document.write(html); popup.document.close(); popup.focus();
    } catch (err) { toast.error(getUiErrorMessage(err, 'Impression impossible')); }
  };

  const validateForm = () => {
    const newErrors    = {};
    const hasBond      = Boolean(formData.internalBondQr.trim());
    if (!productInfo) newErrors.product = 'Produit requis';
    const qty = asPositiveInt(formData.quantite, { min: 1, max: 1000000000 });
    if (!Number.isFinite(qty)) newErrors.quantite = 'Quantité valide requise';
    if (!hasBond && !isSafeText(formData.directionLaboratoire, { min: 2, max: 80 }))
      newErrors.directionLaboratoire = 'Direction / laboratoire requis';
    if (!hasBond && !isSafeText(formData.beneficiaire, { min: 2, max: 80 }))
      newErrors.beneficiaire = 'Bénéficiaire requis';
    if (hasBond && bondResolution?.already_used)
      newErrors.internalBondQr = 'Bon interne déjà utilisé';
    if (formData.lotQrCode && nextFifoLot?.qr_code_value &&
        String(formData.lotQrCode).trim() !== String(nextFifoLot.qr_code_value).trim())
      newErrors.lotQrCode = 'Le QR scanné ne correspond pas au premier lot FIFO';
    if (formData.commentaire && !isSafeText(formData.commentaire, { min: 0, max: 600 }))
      newErrors.commentaire = 'Commentaire trop long (max 600)';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) { toast.error('Veuillez corriger les erreurs'); return; }
    if (isInsufficientStock) { toast.error('Stock insuffisant pour cette opération'); return; }
    setIsSubmitting(true);
    try {
      const internalBondQr = String(formData.internalBondQr || '').trim();
      if (internalBondQr) {
        const resolved = await resolveInternalBond(internalBondQr, { silent: true });
        if (!resolved)          { toast.error('QR bon interne invalide'); return; }
        if (resolved.already_used) { toast.error('Ce bon interne est déjà utilisé'); return; }
      }
      const attachments = [];
      if (attachmentFile) {
        const uploaded = await uploadFile('/files/upload', attachmentFile);
        attachments.push({ label: attachmentLabel || 'Document', file_name: uploaded.file_name, file_url: uploaded.file_url });
      }
      const createdExit = await post('/stock/exits', {
        product:                  productInfo.id,
        quantity:                 Number(asPositiveInt(formData.quantite, { min: 1, max: 1000000000 })),
        submission_duration_ms:   Math.max(0, Date.now() - formOpenedAtRef.current),
        date_exit:                formData.dateSortie,
        withdrawal_paper_number:  sanitizeText(formData.numeroBonPrelevementPapier, { maxLen: 60 }) || undefined,
        direction_laboratory:     sanitizeText(formData.directionLaboratoire,       { maxLen: 80 }) || undefined,
        beneficiary:              sanitizeText(formData.beneficiaire,               { maxLen: 80 }) || undefined,
        scanned_lot_qr:           sanitizeText(formData.lotQrCode,                  { maxLen: 220 }) || undefined,
        internal_bond_token:      internalBondQr || undefined,
        exit_mode:                internalBondQr ? 'internal_bond' : (formData.lotQrCode ? 'fifo_qr' : 'manual'),
        demandeur:                demandeInfo?.demandeurId || undefined,
        request:                  demandeInfo?.id || undefined,
        note:                     sanitizeText(formData.commentaire, { maxLen: 600 }) || undefined,
        attachments,
      });
      if (demandeInfo?.id) {
        try {
          await patch(`/requests/${demandeInfo.id}/serve`, {
            stock_exit_id: createdExit?._id,
            note: sanitizeText(formData.commentaire, { maxLen: 600 }) || undefined,
          });
        } catch { toast.warning("Sortie créée, mais la demande n'a pas été clôturée automatiquement"); }
      }
      saveRecentValue('mag_recent_directions_v1',        formData.directionLaboratoire);
      saveRecentValue('mag_recent_beneficiaries_v1',     formData.beneficiaire);
      saveRecentValue('mag_recent_withdrawal_papers_v1', formData.numeroBonPrelevementPapier);
      setRecentDirections(loadRecentList('mag_recent_directions_v1'));
      setRecentBeneficiaries(loadRecentList('mag_recent_beneficiaries_v1'));
      setRecentWithdrawalPapers(loadRecentList('mag_recent_withdrawal_papers_v1'));
      toast.success(createdExit?.exit_number
        ? `Bon de prélèvement ${createdExit.exit_number} enregistré avec succès`
        : 'Sortie de stock enregistrée avec succès');
      navigate('/magasinier/historique');
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Échec enregistrement sortie'));
    } finally { setIsSubmitting(false); }
  };

  /* ════════════════════════════════════════════════════════════
     RENDU — layout 2 colonnes, une seule vue sans scroll
  ════════════════════════════════════════════════════════════ */
  return (
    <div className="app-layout">
      <div className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`} onClick={() => setSidebarCollapsed(true)} />
      <SidebarMag collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} onLogout={onLogout} userName={userName} />

      <div className="main-container">
        <HeaderPage userName={userName} title="Sortie de Stock" showSearch={false} onMenuClick={() => setSidebarCollapsed(prev => !prev)} />

        <main className="main-content ss-main">
          {(isSubmitting || isLoadingProducts || isGeneratingBond || isResolvingBond || isLoadingFifoLot) && (
            <LoadingSpinner overlay text="Chargement..." />
          )}

          <div className="ss-page">
            <div className="ss-card">

              {/* ── En-tête ── */}
              <div className="ss-header">
                <ArrowUpFromLine size={20} />
                <div>
                  <h2>Nouvelle sortie de stock</h2>
                  {demandeInfo && <p>Demande {demandeInfo.reference || demandeInfo.id}</p>}
                </div>

                {/* Stock actuel affiché dans le header si produit identifié */}
                {productInfo && (
                  <div className="ss-header-stock">
                    <span className="ss-header-stock-label">Stock disponible</span>
                    <span className={`ss-header-stock-val ${productInfo.quantite <= productInfo.seuil ? 'low' : ''}`}>
                      {productInfo.quantite} <small>{productInfo.unite}</small>
                    </span>
                  </div>
                )}
              </div>

              {/* ── Corps 2 colonnes ── */}
              <form onSubmit={handleSubmit} className="ss-form" noValidate>
                <div className="ss-body">

                  {/* ══ COLONNE GAUCHE ══ */}
                  <div className="ss-col-left">

                    {/* 1. Identification produit */}
                    <div className="ss-section">
                      <div className="ss-section-title"><ScanLine size={13} /> Identification du produit</div>

                      <div className="ss-field">
                        <label className="ss-label" htmlFor="codeBarres">
                          <ScanLine size={13} /> Code-barres / Code produit <span className="ss-req">*</span>
                        </label>
                        <div className="ss-input-row">
                          <input
                            id="codeBarres" type="text" maxLength={80}
                            list="recentProductCodes"
                            className={`ss-input ${errors.product ? 'error' : ''}`}
                            value={formData.codeBarres}
                            onChange={e => setFormData({ ...formData, codeBarres: e.target.value })}
                            placeholder="Scanner ou saisir le code"
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleScanBarcode(); } }}
                          />
                          <datalist id="recentProductCodes">
                            {recentProductCodes.map(v => <option key={v} value={v} />)}
                          </datalist>
                          <button type="button" className="ss-scan-btn" onClick={handleScanBarcode}>
                            <ScanLine size={14} /> Chercher
                          </button>
                          <button type="button" className="ss-scan-btn" onClick={() => setScanTarget('codeBarres')}>
                            <Camera size={14} /> Caméra
                          </button>
                        </div>
                        {errors.product && <span className="ss-error"><AlertTriangle size={12} />{errors.product}</span>}
                      </div>

                      {/* Produit identifié — inline compact */}
                      {productInfo && (
                        <div className="ss-product-chip">
                          <Package size={15} />
                          <div className="ss-product-chip-info">
                            <strong>{productInfo.nom}</strong>
                            <span>{productInfo.code} · {productInfo.categorie}</span>
                          </div>
                          <button type="button" className="ss-chip-clear"
                            onClick={() => { setProductInfo(null); setFormData(prev => ({ ...prev, codeBarres: '' })); }}
                            aria-label="Changer de produit">
                            <X size={13} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* 2. Consommation */}
                    <div className="ss-section">
                      <div className="ss-section-title"><Hash size={13} /> Consommation</div>

                      <div className="ss-row-2">
                        {/* Quantité */}
                        <div className="ss-field">
                          <label className="ss-label" htmlFor="quantite">
                            <Hash size={13} /> Quantité <span className="ss-req">*</span>
                          </label>
                          <div className="ss-input-row">
                            <input
                              id="quantite" type="number" min="1"
                              max={productInfo?.quantite || 9999} step="1"
                              className={`ss-input ${errors.quantite || isInsufficientStock ? 'error' : ''}`}
                              value={formData.quantite}
                              onChange={e => setFormData({ ...formData, quantite: e.target.value })}
                              placeholder="Ex : 2"
                            />
                            <span className="ss-unit-pill">{productInfo?.unite || 'Unité'}</span>
                          </div>
                          {errors.quantite && <span className="ss-error"><AlertTriangle size={12} />{errors.quantite}</span>}
                          {isInsufficientStock && <span className="ss-error"><AlertTriangle size={12} />Stock insuffisant</span>}

                          {/* Résumé stock inline */}
                          {productInfo && formData.quantite && !isInsufficientStock && (
                            <div className="ss-stock-mini">
                              <span>{productInfo.quantite} → <strong className="after">{newQuantity}</strong></span>
                              <span className="ss-stock-mini-label">après sortie</span>
                            </div>
                          )}
                        </div>

                        {/* Direction */}
                        <div className="ss-field">
                          <label className="ss-label" htmlFor="directionLaboratoire">
                            <Building2 size={13} /> Direction / Laboratoire <span className="ss-req">*</span>
                          </label>
                          <input
                            id="directionLaboratoire" type="text" maxLength={80}
                            list="recentDirections"
                            className={`ss-input ${errors.directionLaboratoire ? 'error' : ''}`}
                            value={formData.directionLaboratoire}
                            onChange={e => setFormData({ ...formData, directionLaboratoire: e.target.value })}
                            placeholder="Ex : DSP"
                            readOnly={Boolean(demandeInfo?.id)}
                          />
                          <datalist id="recentDirections">
                            {recentDirections.map(v => <option key={v} value={v} />)}
                          </datalist>
                          {errors.directionLaboratoire && <span className="ss-error"><AlertTriangle size={12} />{errors.directionLaboratoire}</span>}
                        </div>
                      </div>

                      {/* Bénéficiaire */}
                      <div className="ss-field">
                        <label className="ss-label" htmlFor="beneficiaire">
                          <User size={13} /> Bénéficiaire / Demandeur <span className="ss-req">*</span>
                        </label>
                        <input
                          id="beneficiaire" type="text" maxLength={80}
                          list="recentBeneficiaries"
                          className={`ss-input ${errors.beneficiaire ? 'error' : ''}`}
                          value={formData.beneficiaire}
                          onChange={e => setFormData({ ...formData, beneficiaire: e.target.value })}
                          placeholder="Nom de la personne"
                          readOnly={Boolean(demandeInfo?.id)}
                        />
                        <datalist id="recentBeneficiaries">
                          {recentBeneficiaries.map(v => <option key={v} value={v} />)}
                        </datalist>
                        {errors.beneficiaire && <span className="ss-error"><AlertTriangle size={12} />{errors.beneficiaire}</span>}
                      </div>
                    </div>

                    {/* 3. Bon de prélèvement */}
                    <div className="ss-section">
                      <div className="ss-section-title"><FileText size={13} /> Bon de prélèvement</div>

                      <div className="ss-row-2">
                        {/* Numéro bon papier */}
                        <div className="ss-field">
                          <label className="ss-label" htmlFor="numeroBonPrelevementPapier">
                            <FileText size={13} /> N° Bon papier
                          </label>
                          <input
                            id="numeroBonPrelevementPapier" type="text" maxLength={80}
                            list="recentWithdrawalPapers"
                            className="ss-input"
                            value={formData.numeroBonPrelevementPapier}
                            onChange={e => setFormData({ ...formData, numeroBonPrelevementPapier: e.target.value })}
                            placeholder="Ex : BP-CHIM-2026-001"
                          />
                          <datalist id="recentWithdrawalPapers">
                            {recentWithdrawalPapers.map(v => <option key={v} value={v} />)}
                          </datalist>
                        </div>

                        {/* Date de sortie */}
                        <div className="ss-field">
                          <label className="ss-label" htmlFor="dateSortie">
                            <Calendar size={13} /> Date de sortie
                          </label>
                          <input
                            id="dateSortie" type="date"
                            className="ss-input"
                            value={formData.dateSortie}
                            onChange={e => setFormData({ ...formData, dateSortie: e.target.value })}
                          />
                        </div>
                      </div>

                      {/* QR lot FIFO */}
                      <div className="ss-field">
                        <label className="ss-label" htmlFor="lotQrCode">
                          <ScanLine size={13} /> QR lot FIFO
                          <span className="ss-opt">(scan)</span>
                        </label>
                        <div className="ss-input-row">
                          <input
                            id="lotQrCode" type="text" maxLength={180}
                            className={`ss-input ${errors.lotQrCode ? 'error' : ''}`}
                            value={formData.lotQrCode}
                            onChange={e => setFormData({ ...formData, lotQrCode: e.target.value })}
                            placeholder="Scanner le QR du premier lot"
                          />
                          <button type="button" className="ss-scan-btn" onClick={() => setScanTarget('lotQrCode')}>
                            <ScanLine size={14} /> Caméra
                          </button>
                          <button type="button" className="ss-scan-btn danger"
                            onClick={() => setFormData(prev => ({ ...prev, lotQrCode: '' }))}
                            disabled={!String(formData.lotQrCode || '').trim()}>
                            <X size={14} /> Effacer
                          </button>
                        </div>
                        {errors.lotQrCode && <span className="ss-error"><AlertTriangle size={12} />{errors.lotQrCode}</span>}
                        {nextFifoLot?.qr_code_value && (
                          <span className="ss-hint">FIFO attendu : lot {nextFifoLot.lot_number || '-'} | QR {nextFifoLot.qr_code_value}</span>
                        )}
                        {!nextFifoLot?.qr_code_value && productInfo && (
                          <span className="ss-hint">Aucun QR lot ouvert — FIFO appliqué sur les lots disponibles.</span>
                        )}
                      </div>
                    </div>

                  </div>{/* /ss-col-left */}

                  {/* ══ COLONNE DROITE ══ */}
                  <div className="ss-col-right">

                    {/* Bon interne QR */}
                    <div className="ss-section">
                      <div className="ss-section-title"><QrCode size={13} /> Bon interne QR <span className="ss-opt">(optionnel)</span></div>

                      <div className="ss-field">
                        <label className="ss-label" htmlFor="internalBondQr">
                          <QrCode size={13} /> QR bon interne
                        </label>
                        <div className="ss-input-row">
                          <input
                            id="internalBondQr" type="text" maxLength={4000}
                            className={`ss-input ${errors.internalBondQr ? 'error' : ''}`}
                            value={formData.internalBondQr}
                            onChange={e => {
                              const value = e.target.value;
                              setFormData(prev => ({ ...prev, internalBondQr: value }));
                              if (!String(value || '').trim()) { setBondResolution(null); setGeneratedBond(null); setErrors(prev => ({ ...prev, internalBondQr: undefined })); }
                            }}
                            placeholder="Scanner ou coller le QR signé"
                          />
                          <button type="button" className="ss-scan-btn" onClick={() => setScanTarget('internalBondQr')}>
                            <ScanLine size={14} /> Caméra
                          </button>
                          <button type="button" className="ss-scan-btn"
                            onClick={() => { setFormData(prev => ({ ...prev, internalBondQr: '' })); setBondResolution(null); setGeneratedBond(null); }}
                            disabled={!formData.internalBondQr.trim() || isResolvingBond}>
                            <X size={14} />
                          </button>
                          <button type="button" className="ss-scan-btn"
                            onClick={() => resolveInternalBond(formData.internalBondQr)}
                            disabled={!formData.internalBondQr.trim() || isResolvingBond}>
                            <RefreshCcw size={14} /> Vérifier
                          </button>
                        </div>
                        {errors.internalBondQr && <span className="ss-error"><AlertTriangle size={12} />{errors.internalBondQr}</span>}
                      </div>

                      {/* Générer bon interne */}
                      <div className="ss-field">
                        <label className="ss-label">Générer bon interne depuis ce formulaire</label>
                        <button type="button" className="ss-generate-btn"
                          onClick={handleGenerateInternalBond}
                          disabled={!productInfo || !formData.quantite || isGeneratingBond}>
                          <QrCode size={14} /> Générer QR
                        </button>
                        <span className="ss-hint">Le bon contient produit + quantité + bénéficiaire, avec signature backend.</span>
                      </div>

                      {/* Résultat bon interne */}
                      {(bondResolution?.payload || generatedBond?.bond_id) && (
                        <div className={`ss-bond-card ${bondResolution?.already_used ? 'danger' : 'success'}`}>
                          <strong>Bon {bondResolution?.payload?.bond_id || generatedBond?.bond_id || '-'}</strong>
                          <div>{productInfo?.nom || '-'} · {bondResolution?.payload?.quantity || formData.quantite || 0} {productInfo?.unite || ''}</div>
                          {generatedBond?.expires_at && <div className="ss-hint">Expire : {new Date(generatedBond.expires_at).toLocaleString('fr-FR')}</div>}
                          {bondResolution?.already_used && <div>Déjà consommé par : {bondResolution?.used_exit?.exit_number || '-'}</div>}
                          {!bondResolution?.already_used && (
                            <button type="button" className="ss-scan-btn" style={{ marginTop:'6px' }} onClick={handlePrintInternalBond}>
                              <Printer size={13} /> Imprimer PDF
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Commentaire + pièce jointe */}
                    <div className="ss-section">
                      <div className="ss-section-title">Commentaire &amp; pièce jointe</div>

                      <div className="ss-field">
                        <label className="ss-label" htmlFor="commentaire">
                          Commentaire <span className="ss-opt">(optionnel)</span>
                        </label>
                        <textarea
                          id="commentaire" maxLength={600} rows={2}
                          className="ss-input ss-textarea"
                          value={formData.commentaire}
                          onChange={e => setFormData({ ...formData, commentaire: e.target.value })}
                          placeholder="Informations supplémentaires…"
                        />
                      </div>

                      <div className="ss-row-2">
                        <div className="ss-field">
                          <label className="ss-label" htmlFor="attachmentLabel">Type de pièce</label>
                          <input id="attachmentLabel" type="text" className="ss-input"
                            value={attachmentLabel}
                            onChange={e => setAttachmentLabel(e.target.value)}
                            placeholder="Ex : Bon de prélèvement signé" />
                        </div>
                        <div className="ss-field">
                          <label className="ss-label" htmlFor="pieceJointe">
                            Fichier joint <span className="ss-opt">(optionnel)</span>
                          </label>
                          <input id="pieceJointe" type="file"
                            className="ss-input ss-file"
                            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.docx,.xlsx"
                            onChange={e => setAttachmentFile(e.target.files?.[0] || null)} />
                        </div>
                      </div>
                    </div>

                    {/* Notice FIFO */}
                    <div className="ss-fifo-notice" role="note">
                      <AlertTriangle size={14} />
                      <span>FIFO appliqué automatiquement. Avec QR lot, le système vérifie le premier lot autorisé.</span>
                    </div>

                  </div>{/* /ss-col-right */}

                </div>{/* /ss-body */}

                {/* Scanner inline */}
                {scanTarget && (
                  <div style={{ padding: '0 20px 12px' }}>
                    <InlineQrScanner
                      mode={scanTarget === 'codeBarres' ? 'any' : 'qr'}
                      onDetected={handleDetectedQr}
                      onClose={() => setScanTarget('')}
                    />
                  </div>
                )}

                {/* ── Barre d'actions ── */}
                <div className="ss-actions">
                  <button type="button" className="ss-btn-cancel"
                    onClick={() => navigate('/magasinier')} disabled={isSubmitting}>
                    <X size={15} /> Annuler
                  </button>
                  <button type="submit" className="ss-btn-submit"
                    disabled={!productInfo || !formData.quantite || isInsufficientStock || isSubmitting}>
                    <Save size={15} /> Confirmer la sortie
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
