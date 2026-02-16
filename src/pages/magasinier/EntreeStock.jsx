import { useState, useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Package, ArrowDownToLine, Save, X, ScanLine, Calendar, Truck, Hash } from 'lucide-react';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get, post, uploadFile } from '../../services/api';
import './EntreeStock.css';

const EntreeStock = ({ userName, onLogout }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const initialProduct = location.state?.product || null;

  const [formData, setFormData] = useState({
    codeBarres: initialProduct?.code || '',
    quantite: '',
    provenance: '',
    numeroLot: '',
    dateEntree: new Date().toISOString().split('T')[0],
    numeroBonCommande: '',
    numeroBonAchat: '',
    numeroBonLivraison: '',
    dateLivraison: '',
    serviceDemandeur: '',
    beneficiaire: '',
    datePeremption: '',
    statutChimique: 'Utilisable',
    attestationProduitDangereux: '',
    numeroContratGaz: '',
    commentaire: ''
  });

  const [productsIndex, setProductsIndex] = useState([]);
  const [productInfo, setProductInfo] = useState(initialProduct || null);
  const [errors, setErrors] = useState({});
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [attachmentLabel, setAttachmentLabel] = useState('Bon de livraison');

  const mapProduct = (p) => ({
    id: p._id,
    code: p.code_product,
    nom: p.name,
    categorie: p.category?.name || '-',
    quantite: Number(p.quantity_current || 0),
    seuil: Number(p.seuil_minimum || 0),
    unite: p.unite || 'Unite'
  });

  useEffect(() => {
    const loadProducts = async () => {
      setIsLoadingProducts(true);
      try {
        const products = await get('/products');
        setProductsIndex(products.map(mapProduct));
      } catch (err) {
        toast.error(err.message || 'Chargement produits echoue');
      } finally {
        setIsLoadingProducts(false);
      }
    };
    loadProducts();
  }, [toast]);

  const detectProductByCode = useCallback((code) => {
    const normalized = String(code || '').trim().toLowerCase();
    if (!normalized) return null;
    return productsIndex.find((p) => p.code.toLowerCase() === normalized) || null;
  }, [productsIndex]);

  const handleScanBarcode = useCallback(() => {
    const found = detectProductByCode(formData.codeBarres);
    if (!found) {
      toast.error('Produit introuvable pour ce code');
      return;
    }
    setProductInfo(found);
    toast.success('Produit identifie');
  }, [detectProductByCode, formData.codeBarres, toast]);

  const validateForm = useCallback(() => {
    const newErrors = {};
    if (!productInfo?.id) newErrors.product = 'Produit requis';
    if (!formData.quantite || parseInt(formData.quantite, 10) < 1) {
      newErrors.quantite = 'Quantite valide requise';
    }
    if (!formData.provenance.trim()) {
      newErrors.provenance = 'Fournisseur / provenance requise';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [productInfo, formData]);

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
          label: attachmentLabel || 'Document',
          file_name: uploaded.file_name,
          file_url: uploaded.file_url,
        });
      }

      await post('/stock/entries', {
        product: productInfo.id,
        quantity: Number(formData.quantite),
        supplier: formData.provenance,
        lot_number: formData.numeroLot,
        date_entry: formData.dateEntree,
        purchase_order_number: formData.numeroBonCommande,
        purchase_voucher_number: formData.numeroBonAchat,
        delivery_note_number: formData.numeroBonLivraison,
        delivery_date: formData.dateLivraison || undefined,
        service_requester: formData.serviceDemandeur,
        reference_code: formData.codeBarres,
        commercial_name: productInfo.nom,
        beneficiary: formData.beneficiaire || undefined,
        expiry_date: formData.datePeremption || undefined,
        chemical_status: formData.statutChimique || undefined,
        dangerous_product_attestation: formData.attestationProduitDangereux || undefined,
        contract_number: formData.numeroContratGaz || undefined,
        observation: formData.commentaire,
        attachments,
      });

      toast.success("Entree de stock enregistree avec succes");
      navigate('/magasinier');
    } catch (err) {
      toast.error(err.message || "Echec enregistrement entree");
    } finally {
      setIsSubmitting(false);
    }
  }, [attachmentFile, attachmentLabel, formData, productInfo, validateForm, navigate, toast]);

  const newQuantity = productInfo ? productInfo.quantite + (parseInt(formData.quantite, 10) || 0) : 0;

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
          title="Entree de Stock"
          showSearch={false}
        />

        <main className="main-content">
          {(isSubmitting || isLoadingProducts) && <LoadingSpinner overlay text="Chargement..." />}

          <div className="stock-operation-page">
            <div className="operation-card">
              <div className="operation-header entry">
                <ArrowDownToLine size={24} />
                <h2>Nouvelle entree de stock</h2>
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
                      {errors.product && <span className="error-text" role="alert">{errors.product}</span>}
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
                      <div className="info-item"><span className="info-label">Nom</span><span className="info-value">{productInfo.nom}</span></div>
                      <div className="info-item"><span className="info-label">Code</span><span className="info-value code">{productInfo.code}</span></div>
                      <div className="info-item"><span className="info-label">Stock actuel</span><span className="info-value">{productInfo.quantite} {productInfo.unite}</span></div>
                      <div className="info-item"><span className="info-label">Categorie</span><span className="info-value">{productInfo.categorie}</span></div>
                    </div>
                  </div>
                )}

                <div className="form-section">
                  <h3>Quantite a entrer</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="quantite"><Hash size={16} />Quantite</label>
                      <input
                        id="quantite"
                        type="number"
                        min="1"
                        value={formData.quantite}
                        onChange={(e) => setFormData({ ...formData, quantite: e.target.value })}
                        placeholder="0"
                        className={errors.quantite ? 'error' : ''}
                      />
                      {errors.quantite && <span className="error-text" role="alert">{errors.quantite}</span>}
                    </div>
                    <div className="form-group">
                      <label htmlFor="numeroLot"><Hash size={16} />Numero de lot</label>
                      <input
                        id="numeroLot"
                        type="text"
                        value={formData.numeroLot}
                        onChange={(e) => setFormData({ ...formData, numeroLot: e.target.value })}
                        placeholder="LOT-2026-001"
                      />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h3>Pieces / documents</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="numeroBonCommande">Numero bon de commande</label>
                      <input id="numeroBonCommande" type="text" value={formData.numeroBonCommande} onChange={(e) => setFormData({ ...formData, numeroBonCommande: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="numeroBonAchat">Numero bon d'achat</label>
                      <input id="numeroBonAchat" type="text" value={formData.numeroBonAchat} onChange={(e) => setFormData({ ...formData, numeroBonAchat: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="numeroBonLivraison">Numero bon de livraison</label>
                      <input id="numeroBonLivraison" type="text" value={formData.numeroBonLivraison} onChange={(e) => setFormData({ ...formData, numeroBonLivraison: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="dateLivraison">Date de livraison</label>
                      <input
                        id="dateLivraison"
                        type="date"
                        value={formData.dateLivraison}
                        onChange={(e) => setFormData({ ...formData, dateLivraison: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="attachmentLabel">Type de piece</label>
                      <input
                        id="attachmentLabel"
                        type="text"
                        value={attachmentLabel}
                        onChange={(e) => setAttachmentLabel(e.target.value)}
                        placeholder="Ex: Bon de livraison"
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

                <div className="form-section">
                  <h3>Informations supplementaires</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="provenance"><Truck size={16} />Fournisseur / Provenance</label>
                      <input
                        id="provenance"
                        type="text"
                        value={formData.provenance}
                        onChange={(e) => setFormData({ ...formData, provenance: e.target.value })}
                        className={errors.provenance ? 'error' : ''}
                      />
                      {errors.provenance && <span className="error-text" role="alert">{errors.provenance}</span>}
                    </div>
                    <div className="form-group">
                      <label htmlFor="serviceDemandeur">Service demandeur</label>
                      <input id="serviceDemandeur" type="text" value={formData.serviceDemandeur} onChange={(e) => setFormData({ ...formData, serviceDemandeur: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="beneficiaire">Beneficiaire</label>
                      <input
                        id="beneficiaire"
                        type="text"
                        value={formData.beneficiaire}
                        onChange={(e) => setFormData({ ...formData, beneficiaire: e.target.value })}
                        placeholder="Nom du beneficiaire"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="dateEntree"><Calendar size={16} />Date d'entree</label>
                      <input id="dateEntree" type="date" value={formData.dateEntree} onChange={(e) => setFormData({ ...formData, dateEntree: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="datePeremption">Date de peremption</label>
                      <input
                        id="datePeremption"
                        type="date"
                        value={formData.datePeremption}
                        onChange={(e) => setFormData({ ...formData, datePeremption: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="statutChimique">Statut chimique</label>
                      <select
                        id="statutChimique"
                        value={formData.statutChimique}
                        onChange={(e) => setFormData({ ...formData, statutChimique: e.target.value })}
                      >
                        <option value="Utilisable">Utilisable</option>
                        <option value="Perime">Perime</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="numeroContratGaz">Numero contrat (gaz)</label>
                      <input
                        id="numeroContratGaz"
                        type="text"
                        value={formData.numeroContratGaz}
                        onChange={(e) => setFormData({ ...formData, numeroContratGaz: e.target.value })}
                        placeholder="Ex: CTR-GAZ-2026-001"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="attestationProduitDangereux">Attestation produit dangereux (reference)</label>
                    <input
                      id="attestationProduitDangereux"
                      type="text"
                      value={formData.attestationProduitDangereux}
                      onChange={(e) => setFormData({ ...formData, attestationProduitDangereux: e.target.value })}
                      placeholder="Ex: ATT-PD-2026-001"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="commentaire">Commentaire (optionnel)</label>
                    <textarea id="commentaire" value={formData.commentaire} onChange={(e) => setFormData({ ...formData, commentaire: e.target.value })} rows={3} />
                  </div>
                </div>

                {productInfo && formData.quantite && (
                  <div className="operation-summary entry">
                    <h3>Resume de l'operation</h3>
                    <div className="summary-grid">
                      <div className="summary-item"><span className="summary-label">Stock avant</span><span className="summary-value">{productInfo.quantite}</span></div>
                      <div className="summary-item highlight"><span className="summary-label">Quantite entree</span><span className="summary-value">+{formData.quantite}</span></div>
                      <div className="summary-item result"><span className="summary-label">Stock apres</span><span className="summary-value">{newQuantity}</span></div>
                    </div>
                  </div>
                )}

                <div className="form-actions">
                  <button type="button" className="btn-cancel" onClick={() => navigate('/magasinier')} disabled={isSubmitting}>
                    <X size={18} />
                    Annuler
                  </button>
                  <button type="submit" className="btn-submit entry" disabled={!productInfo || !formData.quantite || isSubmitting}>
                    <Save size={18} />
                    Confirmer l'entree
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
