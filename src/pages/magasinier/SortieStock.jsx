import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Package, ArrowUpFromLine, Save, X, ScanLine, Calendar, User, Hash, AlertTriangle, FileText, Building2 } from 'lucide-react';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get, patch, post, uploadFile } from '../../services/api';
import './EntreeStock.css';

const SortieStock = ({ userName, onLogout }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  const initialProduct = location.state?.product || null;
  const demandeInfo = location.state?.demandeInfo || null;

  const [productsIndex, setProductsIndex] = useState([]);
  const [productInfo, setProductInfo] = useState(initialProduct);
  const [errors, setErrors] = useState({});
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [attachmentLabel, setAttachmentLabel] = useState('Bon de prelevement');

  const [formData, setFormData] = useState({
    codeBarres: initialProduct?.code || '',
    quantite: demandeInfo?.quantite?.toString() || '',
    dateSortie: new Date().toISOString().split('T')[0],
    directionLaboratoire: demandeInfo?.direction || '',
    beneficiaire: demandeInfo?.demandeur || '',
    numeroBonPrelevementPapier: '',
    commentaire: '',
  });

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
          const found = mapped.find((x) => x.code === formData.codeBarres.trim().toUpperCase());
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
    const code = formData.codeBarres.trim().toUpperCase();
    if (!code) {
      toast.error('Saisissez un code produit');
      return;
    }

    const found = productsIndex.find((p) => p.code === code);
    if (!found) {
      setProductInfo(null);
      toast.error('Produit introuvable pour ce code');
      return;
    }

    setProductInfo(found);
    setErrors((prev) => ({ ...prev, product: undefined }));
    toast.success(`Produit identifie: ${found.nom}`);
  };

  const validateForm = () => {
    const newErrors = {};

    if (!productInfo) newErrors.product = 'Produit requis';

    if (!formData.quantite || Number.parseInt(formData.quantite, 10) < 1) {
      newErrors.quantite = 'Quantite valide requise';
    }

    if (!formData.directionLaboratoire.trim()) {
      newErrors.directionLaboratoire = 'Direction / laboratoire requis';
    }

    if (!formData.beneficiaire.trim()) {
      newErrors.beneficiaire = 'Beneficiaire requis';
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
        quantity: Number(formData.quantite),
        date_exit: formData.dateSortie,
        withdrawal_paper_number: formData.numeroBonPrelevementPapier || undefined,
        direction_laboratory: formData.directionLaboratoire,
        beneficiary: formData.beneficiaire,
        demandeur: demandeInfo?.demandeurId || undefined,
        note: formData.commentaire || undefined,
        attachments,
      });

      if (demandeInfo?.id) {
        try {
          await patch(`/requests/${demandeInfo.id}/process`, { status: 'accepted' });
        } catch {
          toast.warning("Sortie creee, mais la demande n'a pas ete mise a jour automatiquement");
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
      <SidebarMag
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onLogout={onLogout}
        userName={userName}
      />

      <div className="main-container">
        <HeaderPage userName={userName} title="Sortie de Stock" showSearch={false} />

        <main className="main-content">
          {(isSubmitting || isLoadingProducts) && <LoadingSpinner overlay text="Chargement..." />}

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
                          value={formData.codeBarres}
                          onChange={(e) => setFormData({ ...formData, codeBarres: e.target.value })}
                          placeholder="Scanner ou saisir le code"
                        />
                        <button type="button" className="scan-btn" onClick={handleScanBarcode}>
                          <ScanLine size={18} />
                          Scanner
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
                        value={formData.numeroBonPrelevementPapier}
                        onChange={(e) => setFormData({ ...formData, numeroBonPrelevementPapier: e.target.value })}
                        placeholder="Ex: BP-CHIM-2026-001"
                      />
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
                        value={formData.directionLaboratoire}
                        onChange={(e) => setFormData({ ...formData, directionLaboratoire: e.target.value })}
                        placeholder="Ex: DSP"
                        className={errors.directionLaboratoire ? 'error' : ''}
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
                      value={formData.beneficiaire}
                      onChange={(e) => setFormData({ ...formData, beneficiaire: e.target.value })}
                      placeholder="Nom de la personne"
                      className={errors.beneficiaire ? 'error' : ''}
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
