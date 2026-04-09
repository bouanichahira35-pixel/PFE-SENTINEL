import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Package,
  ArrowUpFromLine,
  Save,
  X,
  ScanLine,
  Calendar,
  User,
  Hash,
  AlertTriangle,
  FileText,
  Building2,
  QrCode,
  RefreshCcw,
  Printer,
} from 'lucide-react';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import InlineQrScanner from '../../components/shared/InlineQrScanner';
import { useToast } from '../../components/shared/Toast';
import { get, patch, post, uploadFile } from '../../services/api';
import { asPositiveInt, isSafeText, sanitizeText } from '../../utils/formGuards';
import './EntreeStock.css';

const SortieStock = ({ userName, onLogout }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  const initialProduct = location.state?.product || null;
  const demandeInfo = location.state?.demandeInfo || null;

  const [productsIndex, setProductsIndex] = useState([]);
  const [productInfo, setProductInfo] = useState(initialProduct);
  const [errors, setErrors] = useState({});
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [attachmentLabel, setAttachmentLabel] = useState('Bon de prelevement');
  const [scanTarget, setScanTarget] = useState('');
  const [nextFifoLot, setNextFifoLot] = useState(null);
  const [isLoadingFifoLot, setIsLoadingFifoLot] = useState(false);
  const [isResolvingBond, setIsResolvingBond] = useState(false);
  const [isGeneratingBond, setIsGeneratingBond] = useState(false);
  const [bondResolution, setBondResolution] = useState(null);
  const [generatedBond, setGeneratedBond] = useState(null);
  const formOpenedAtRef = useRef(Date.now());

  const [formData, setFormData] = useState({
    codeBarres: initialProduct?.code || '',
    quantite: demandeInfo?.quantite?.toString() || '',
    dateSortie: new Date().toISOString().split('T')[0],
    directionLaboratoire: demandeInfo?.direction || '',
    beneficiaire: demandeInfo?.beneficiaire || demandeInfo?.demandeur || '',
    numeroBonPrelevementPapier: '',
    lotQrCode: '',
    internalBondQr: '',
    commentaire: '',
  });

  const findProductByCode = useCallback(
    (rawCode) => {
      const normalized = String(rawCode || '').trim().toUpperCase();
      if (!normalized) return null;
      return productsIndex.find((p) => String(p.code || '').trim().toUpperCase() === normalized) || null;
    },
    [productsIndex]
  );

  const applyBondPayloadToForm = useCallback(
    (payload, tokenValue) => {
      if (!payload || typeof payload !== 'object') return;

      const mappedProduct = productsIndex.find(
        (p) => String(p.id) === String(payload.product_id || '')
          || String(p.code || '').trim().toUpperCase() === String(payload.product_code || '').trim().toUpperCase()
      );

      if (mappedProduct) {
        setProductInfo(mappedProduct);
      }

      setFormData((prev) => ({
        ...prev,
        codeBarres: mappedProduct?.code || payload.product_code || prev.codeBarres,
        quantite: payload.quantity ? String(payload.quantity) : prev.quantite,
        numeroBonPrelevementPapier:
          prev.numeroBonPrelevementPapier || payload.withdrawal_paper_number || '',
        directionLaboratoire:
          prev.directionLaboratoire || payload.direction_laboratory || '',
        beneficiaire:
          prev.beneficiaire || payload.beneficiary || '',
        internalBondQr: tokenValue || prev.internalBondQr,
        commentaire: prev.commentaire || payload.note || '',
      }));
    },
    [productsIndex]
  );

  const resolveInternalBond = useCallback(
    async (rawQr, options = {}) => {
      const qrValue = String(rawQr || '').trim();
      const silent = Boolean(options.silent);

      if (!qrValue) {
        setBondResolution(null);
        setGeneratedBond(null);
        setErrors((prev) => ({ ...prev, internalBondQr: undefined }));
        if (!silent) toast.error('QR bon interne requis');
        return null;
      }

      setIsResolvingBond(true);
      try {
        const resolved = await post('/stock/internal-bond/resolve', { qr_value: qrValue });
        setBondResolution(resolved);

        if (resolved?.already_used) {
          setErrors((prev) => ({
            ...prev,
            internalBondQr: `Bon deja utilise (${resolved?.used_exit?.exit_number || 'sortie existante'})`,
          }));
          if (!silent) toast.error("Ce bon interne a deja ete utilise");
          return resolved;
        }

        applyBondPayloadToForm(resolved?.payload, qrValue);
        setErrors((prev) => ({ ...prev, internalBondQr: undefined }));
        if (!silent) {
          toast.success(`Bon interne ${resolved?.payload?.bond_id || ''} verifie`);
        }
        return resolved;
      } catch (err) {
        setBondResolution(null);
        setErrors((prev) => ({ ...prev, internalBondQr: 'QR interne invalide ou expire' }));
        if (!silent) toast.error(err.message || 'Verification QR bon interne impossible');
        return null;
      } finally {
        setIsResolvingBond(false);
      }
    },
    [applyBondPayloadToForm, toast]
  );

  useEffect(() => {
    let ignore = false;

    const loadProducts = async () => {
      setIsLoadingProducts(true);
      try {
        const items = await get('/products');
        if (ignore) return;

        const mapped = items.map((p) => ({
          id: p._id,
          code: p.code_product,
          nom: p.name,
          categorie: p.category?.name || 'Sans categorie',
          quantite: Number(p.quantity_current || 0),
          seuil: Number(p.seuil_minimum || 0),
          unite: 'Unite',
        }));

        setProductsIndex(mapped);

        if (!initialProduct && formData.codeBarres) {
          const found = mapped.find((x) => String(x.code || '').trim().toUpperCase() === formData.codeBarres.trim().toUpperCase());
          if (found) setProductInfo(found);
        }
      } catch (err) {
        toast.error(err.message || 'Impossible de charger les produits');
      } finally {
        if (!ignore) setIsLoadingProducts(false);
      }
    };

    loadProducts();
    return () => {
      ignore = true;
    };
  }, [initialProduct, formData.codeBarres, toast]);

  useEffect(() => {
    let ignore = false;

    const hydrateFromRequest = async () => {
      if (!demandeInfo?.id) return;
      if (formData.directionLaboratoire && formData.beneficiaire) return;

      try {
        const reqDoc = await get(`/requests/${demandeInfo.id}`);
        if (ignore || !reqDoc) return;

        setFormData((prev) => ({
          ...prev,
          directionLaboratoire: prev.directionLaboratoire || reqDoc.direction_laboratory || '',
          beneficiaire: prev.beneficiaire || reqDoc.beneficiary || reqDoc.demandeur?.username || '',
        }));
      } catch {
        // Keep form usable even if request hydration fails.
      }
    };

    hydrateFromRequest();
    return () => {
      ignore = true;
    };
  }, [demandeInfo?.id, formData.directionLaboratoire, formData.beneficiaire]);

  useEffect(() => {
    let ignore = false;

    const loadNextFifoLot = async () => {
      if (!productInfo?.id) {
        setNextFifoLot(null);
        return;
      }

      setIsLoadingFifoLot(true);
      try {
        const fifo = await get(`/stock/fifo/next-lot/${productInfo.id}`);
        if (ignore) return;
        setNextFifoLot(fifo?.next_fifo_lot || null);
      } catch {
        if (!ignore) setNextFifoLot(null);
      } finally {
        if (!ignore) setIsLoadingFifoLot(false);
      }
    };

    loadNextFifoLot();
    return () => {
      ignore = true;
    };
  }, [productInfo?.id]);

  const quantiteSortie = Number.parseInt(formData.quantite, 10) || 0;
  const isInsufficientStock = useMemo(
    () => Boolean(productInfo && quantiteSortie > productInfo.quantite),
    [productInfo, quantiteSortie]
  );
  const newQuantity = useMemo(
    () => (productInfo ? productInfo.quantite - quantiteSortie : 0),
    [productInfo, quantiteSortie]
  );

  const handleScanBarcode = () => {
    if (!formData.codeBarres.trim()) {
      toast.error('Saisissez un code produit');
      return;
    }

    const found = findProductByCode(formData.codeBarres);
    if (!found) {
      setProductInfo(null);
      toast.error('Produit introuvable pour ce code');
      return;
    }

    setProductInfo(found);
    setErrors((prev) => ({ ...prev, product: undefined }));
    toast.success(`Produit identifie: ${found.nom}`);
  };

  const handleDetectedQr = (value) => {
    const scanned = String(value || '').trim();
    if (!scanned) return;
    if (scanTarget === 'codeBarres') {
      setFormData((prev) => ({ ...prev, codeBarres: scanned }));
      const found = findProductByCode(scanned);
      if (found) {
        setProductInfo(found);
        setErrors((prev) => ({ ...prev, product: undefined }));
        toast.success(`Produit identifie: ${found.nom}`);
      }
      return;
    }
    if (scanTarget === 'lotQrCode') {
      setFormData((prev) => ({ ...prev, lotQrCode: scanned }));
      setErrors((prev) => ({ ...prev, lotQrCode: undefined }));
      toast.success('QR lot detecte');
      return;
    }
    if (scanTarget === 'internalBondQr') {
      setFormData((prev) => ({ ...prev, internalBondQr: scanned }));
      resolveInternalBond(scanned);
    }
  };

  const handleGenerateInternalBond = async () => {
    if (!productInfo?.id) {
      toast.error('Selectionnez d abord un produit');
      return;
    }
    const qty = Number.parseInt(formData.quantite, 10);
    if (!qty || qty < 1) {
      toast.error('Saisissez une quantite valide avant generation');
      return;
    }
    if (qty > Number(productInfo?.quantite || 0)) {
      toast.error('Stock insuffisant pour generer un bon interne sur cette quantite');
      return;
    }

    setIsGeneratingBond(true);
    try {
      const generated = await post('/stock/internal-bond/generate', {
        product: productInfo.id,
        quantity: qty,
        withdrawal_paper_number: formData.numeroBonPrelevementPapier || undefined,
        direction_laboratory: formData.directionLaboratoire || undefined,
        beneficiary: formData.beneficiaire || undefined,
        request: demandeInfo?.id || undefined,
        note: formData.commentaire || undefined,
        valid_hours: 24,
      });
      setGeneratedBond(generated);
      setFormData((prev) => ({ ...prev, internalBondQr: generated?.qr_value || '' }));
      await resolveInternalBond(generated?.qr_value || '', { silent: true });
      toast.success(`Bon interne ${generated?.bond_id || ''} genere`);
    } catch (err) {
      toast.error(err.message || 'Generation bon interne impossible');
    } finally {
      setIsGeneratingBond(false);
    }
  };

  const handlePrintInternalBond = async () => {
    const internalBondQr = String(formData.internalBondQr || '').trim();
    if (!internalBondQr) {
      toast.error('Aucun QR bon interne a imprimer');
      return;
    }
    try {
      const data = await post('/stock/internal-bond/print-data', { qr_value: internalBondQr });
      const html = String(data?.html || '');
      if (!html) {
        toast.error('Document PDF indisponible');
        return;
      }
      const popup = window.open('', '_blank', 'noopener,noreferrer,width=980,height=1100');
      if (!popup) {
        toast.error('Popup bloquee. Autorisez les popups puis reessayez.');
        return;
      }
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      popup.focus();
    } catch (err) {
      toast.error(err.message || 'Impression bon interne impossible');
    }
  };

  const validateForm = () => {
    const newErrors = {};
    const hasInternalBond = Boolean(formData.internalBondQr.trim());

    if (!productInfo) newErrors.product = 'Produit requis';

    const qty = asPositiveInt(formData.quantite, { min: 1, max: 1000000000 });
    if (!Number.isFinite(qty)) {
      newErrors.quantite = 'Quantite valide requise';
    }

    if (!hasInternalBond && !isSafeText(formData.directionLaboratoire, { min: 2, max: 80 })) {
      newErrors.directionLaboratoire = 'Direction / laboratoire requis (2-80, sans < >)';
    }

    if (!hasInternalBond && !isSafeText(formData.beneficiaire, { min: 2, max: 80 })) {
      newErrors.beneficiaire = 'Beneficiaire requis (2-80, sans < >)';
    }

    if (hasInternalBond && bondResolution?.already_used) {
      newErrors.internalBondQr = 'Bon interne deja utilise';
    }

    if (
      formData.lotQrCode
      && nextFifoLot?.qr_code_value
      && String(formData.lotQrCode).trim() !== String(nextFifoLot.qr_code_value).trim()
    ) {
      newErrors.lotQrCode = 'Le QR scanne ne correspond pas au premier lot FIFO';
    }

    if (formData.commentaire && !isSafeText(formData.commentaire, { min: 0, max: 600 })) {
      newErrors.commentaire = 'Commentaire trop long (max 600, sans < >)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
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

    try {
      const internalBondQr = String(formData.internalBondQr || '').trim();
      if (internalBondQr) {
        const resolved = await resolveInternalBond(internalBondQr, { silent: true });
        if (!resolved) {
          toast.error('QR bon interne invalide');
          return;
        }
        if (resolved.already_used) {
          toast.error('Ce bon interne est deja utilise');
          return;
        }
      }

      const attachments = [];
      if (attachmentFile) {
        const uploaded = await uploadFile('/files/upload', attachmentFile);
        attachments.push({
          label: attachmentLabel || 'Document',
          file_name: uploaded.file_name,
          file_url: uploaded.file_url,
        });
      }

      const createdExit = await post('/stock/exits', {
        product: productInfo.id,
        quantity: Number(asPositiveInt(formData.quantite, { min: 1, max: 1000000000 })),
        submission_duration_ms: Math.max(0, Date.now() - formOpenedAtRef.current),
        date_exit: formData.dateSortie,
        withdrawal_paper_number: sanitizeText(formData.numeroBonPrelevementPapier, { maxLen: 60 }) || undefined,
        direction_laboratory: sanitizeText(formData.directionLaboratoire, { maxLen: 80 }) || undefined,
        beneficiary: sanitizeText(formData.beneficiaire, { maxLen: 80 }) || undefined,
        scanned_lot_qr: sanitizeText(formData.lotQrCode, { maxLen: 220 }) || undefined,
        internal_bond_token: internalBondQr || undefined,
        exit_mode: internalBondQr ? 'internal_bond' : (formData.lotQrCode ? 'fifo_qr' : 'manual'),
        demandeur: demandeInfo?.demandeurId || undefined,
        request: demandeInfo?.id || undefined,
        note: sanitizeText(formData.commentaire, { maxLen: 600 }) || undefined,
        attachments,
      });

      if (demandeInfo?.id) {
        try {
          await patch(`/requests/${demandeInfo.id}/serve`, {
            stock_exit_id: createdExit?._id,
            note: sanitizeText(formData.commentaire, { maxLen: 600 }) || undefined,
          });
        } catch {
          toast.warning("Sortie creee, mais la demande n'a pas ete cloturee automatiquement");
        }
      }

      if (createdExit?.exit_number) {
        toast.success(`Bon de prelevement ${createdExit.exit_number} enregistre avec succes`);
      } else {
        toast.success('Sortie de stock enregistree avec succes');
      }

      navigate('/magasinier/historique');
    } catch (err) {
      toast.error(err.message || 'Echec enregistrement sortie');
    } finally {
      setIsSubmitting(false);
    }
  };

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
          title="Sortie de Stock"
          showSearch={false}
          onMenuClick={() => setSidebarCollapsed((prev) => !prev)}
        />

        <main className="main-content">
          {(isSubmitting || isLoadingProducts || isGeneratingBond || isResolvingBond || isLoadingFifoLot) && <LoadingSpinner overlay text="Chargement..." />}

          <div className="stock-operation-page">
            <div className="operation-card">
              <div className="operation-header exit">
                <ArrowUpFromLine size={24} />
                <h2>Nouvelle sortie de stock</h2>
                {demandeInfo && (
                  <span className="operation-badge">Demande {demandeInfo.reference || demandeInfo.id}</span>
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
                          maxLength={80}
                          value={formData.codeBarres}
                          onChange={(e) => setFormData({ ...formData, codeBarres: e.target.value })}
                          placeholder="Scanner ou saisir le code"
                        />
                        <button type="button" className="scan-btn" onClick={handleScanBarcode}>
                          <ScanLine size={18} />
                          Scanner
                        </button>
                        <button type="button" className="scan-btn" onClick={() => setScanTarget('codeBarres')}>
                          <ScanLine size={18} />
                          Camera
                        </button>
                      </div>
                      {errors.product && (
                        <span className="error-text" role="alert">
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
                        <span className="info-label">Stock disponible</span>
                        <span className="info-value">
                          {productInfo.quantite} {productInfo.unite}
                        </span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Categorie</span>
                        <span className="info-value">{productInfo.categorie}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="form-section">
                  <h3>Bon de prelevement</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="numeroBonPrelevementPapier">
                        <FileText size={16} />
                        N Bon prelevement (papier)
                      </label>
                      <input
                        id="numeroBonPrelevementPapier"
                        type="text"
                        maxLength={80}
                        value={formData.numeroBonPrelevementPapier}
                        onChange={(e) => setFormData({ ...formData, numeroBonPrelevementPapier: e.target.value })}
                        placeholder="Ex: BP-CHIM-2026-001"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="lotQrCode">
                        <ScanLine size={16} />
                        QR lot FIFO (scan)
                      </label>
                      <input
                        id="lotQrCode"
                        type="text"
                        maxLength={180}
                        value={formData.lotQrCode}
                        onChange={(e) => setFormData({ ...formData, lotQrCode: e.target.value })}
                        placeholder="Scanner le QR du premier lot"
                      />
                      <button type="button" className="scan-btn" onClick={() => setScanTarget('lotQrCode')}>
                        <ScanLine size={18} />
                        Camera
                      </button>
                      {errors.lotQrCode && (
                        <span className="error-text" role="alert">
                          {errors.lotQrCode}
                        </span>
                      )}
                      {nextFifoLot?.qr_code_value && (
                        <span className="field-hint">
                          FIFO attendu: lot {nextFifoLot.lot_number || '-'} | QR {nextFifoLot.qr_code_value}
                        </span>
                      )}
                      {!nextFifoLot?.qr_code_value && productInfo && (
                        <span className="field-hint">Aucun QR lot ouvert detecte: FIFO sera applique sur les lots disponibles.</span>
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
                  <h3>Bon interne QR (optionnel)</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="internalBondQr">
                        <QrCode size={16} />
                        QR bon interne
                      </label>
                      <div className="input-with-btn">
                        <input
                          id="internalBondQr"
                          type="text"
                          maxLength={4000}
                          value={formData.internalBondQr}
                          onChange={(e) => {
                            const value = e.target.value;
                            setFormData((prev) => ({ ...prev, internalBondQr: value }));
                            if (!String(value || '').trim()) {
                              setBondResolution(null);
                              setGeneratedBond(null);
                              setErrors((prev) => ({ ...prev, internalBondQr: undefined }));
                            }
                          }}
                          placeholder="Scanner ou coller le QR signe du bon interne"
                          className={errors.internalBondQr ? 'error' : ''}
                        />
                        <button type="button" className="scan-btn" onClick={() => setScanTarget('internalBondQr')}>
                          <ScanLine size={18} />
                          Camera
                        </button>
                        <button
                          type="button"
                          className="scan-btn"
                          onClick={() => resolveInternalBond(formData.internalBondQr)}
                          disabled={!formData.internalBondQr.trim() || isResolvingBond}
                        >
                          <RefreshCcw size={18} />
                          Verifier
                        </button>
                      </div>
                      {errors.internalBondQr && (
                        <span className="error-text" role="alert">
                          {errors.internalBondQr}
                        </span>
                      )}
                    </div>
                    <div className="form-group">
                      <label htmlFor="generateInternalBond">Generer bon interne depuis ce formulaire</label>
                      <button
                        id="generateInternalBond"
                        type="button"
                        className="scan-btn"
                        onClick={handleGenerateInternalBond}
                        disabled={!productInfo || !formData.quantite || isGeneratingBond}
                      >
                        <QrCode size={18} />
                        Generer QR
                      </button>
                      <span className="field-hint">Le bon contient produit + quantite + beneficiaire, avec signature backend.</span>
                    </div>
                  </div>

                  {(bondResolution?.payload || generatedBond?.bond_id) && (
                    <div className={`helper-card ${bondResolution?.already_used ? 'danger' : 'success'}`}>
                      <strong>Bon interne</strong>
                      <div>
                        ID: {bondResolution?.payload?.bond_id || generatedBond?.bond_id || '-'}
                        {generatedBond?.expires_at ? ` | Expire: ${new Date(generatedBond.expires_at).toLocaleString('fr-FR')}` : ''}
                      </div>
                      <div>
                        Produit: {bondResolution?.payload?.product_name || productInfo?.nom || '-'} | Quantite: {bondResolution?.payload?.quantity || formData.quantite || 0}
                      </div>
                      {bondResolution?.already_used && (
                        <div>Deja consomme par: {bondResolution?.used_exit?.exit_number || '-'}</div>
                      )}
                      {!bondResolution?.already_used && (
                        <div style={{ marginTop: 8 }}>
                          <button type="button" className="scan-btn" onClick={handlePrintInternalBond}>
                            <Printer size={16} />
                            Imprimer PDF
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="form-section">
                  <h3>Consommation</h3>
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
                        step="1"
                        value={formData.quantite}
                        onChange={(e) => setFormData({ ...formData, quantite: e.target.value })}
                        placeholder="0"
                        className={errors.quantite || isInsufficientStock ? 'error' : ''}
                        aria-invalid={errors.quantite || isInsufficientStock ? 'true' : 'false'}
                      />
                      {errors.quantite && (
                        <span className="error-text" role="alert">
                          {errors.quantite}
                        </span>
                      )}
                      {isInsufficientStock && (
                        <span className="input-error" role="alert">
                          <AlertTriangle size={14} />
                          Stock insuffisant
                        </span>
                      )}
                    </div>
                    <div className="form-group">
                      <label htmlFor="directionLaboratoire">
                        <Building2 size={16} />
                        Direction / Laboratoire
                      </label>
                      <input
                        id="directionLaboratoire"
                        type="text"
                        maxLength={80}
                        value={formData.directionLaboratoire}
                        onChange={(e) => setFormData({ ...formData, directionLaboratoire: e.target.value })}
                        placeholder="Ex: DSP"
                        className={errors.directionLaboratoire ? 'error' : ''}
                        readOnly={Boolean(demandeInfo?.id)}
                      />
                      {errors.directionLaboratoire && (
                        <span className="error-text" role="alert">
                          {errors.directionLaboratoire}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="beneficiaire">
                      <User size={16} />
                      Beneficiaire / Demandeur
                    </label>
                    <input
                      id="beneficiaire"
                      type="text"
                      maxLength={80}
                      value={formData.beneficiaire}
                      onChange={(e) => setFormData({ ...formData, beneficiaire: e.target.value })}
                      placeholder="Nom de la personne"
                      className={errors.beneficiaire ? 'error' : ''}
                      readOnly={Boolean(demandeInfo?.id)}
                    />
                    {errors.beneficiaire && (
                      <span className="error-text" role="alert">
                        {errors.beneficiaire}
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <label htmlFor="commentaire">Commentaire (optionnel)</label>
                    <textarea
                      id="commentaire"
                      maxLength={600}
                      value={formData.commentaire}
                      onChange={(e) => setFormData({ ...formData, commentaire: e.target.value })}
                      placeholder="Informations supplementaires..."
                      rows={3}
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="attachmentLabel">Type de piece</label>
                      <input
                        id="attachmentLabel"
                        type="text"
                        value={attachmentLabel}
                        onChange={(e) => setAttachmentLabel(e.target.value)}
                        placeholder="Ex: Bon de prelevement signe"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="pieceJointe">Fichier joint (optionnel)</label>
                      <input
                        id="pieceJointe"
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.docx,.xlsx"
                        onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                      />
                    </div>
                  </div>
                </div>

                <div className="fifo-notice" role="note">
                  <AlertTriangle size={16} />
                  <span>FIFO est applique automatiquement. Avec QR lot, le systeme verifie que vous scannez le premier lot autorise.</span>
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

                {scanTarget && (
                  <InlineQrScanner
                    onDetected={handleDetectedQr}
                    onClose={() => setScanTarget('')}
                  />
                )}

                <div className="form-actions">
                  <button type="button" className="btn-cancel" onClick={() => navigate('/magasinier')} disabled={isSubmitting}>
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
