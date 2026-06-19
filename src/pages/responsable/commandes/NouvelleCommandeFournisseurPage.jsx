import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle,
  Clock,
  FileText,
  Info,
  Package,
  Save,
  ShoppingCart,
  Truck,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import SidebarResp from '../../../components/responsable/SidebarResp';
import HeaderPage from '../../../components/shared/HeaderPage';
import LoadingSpinner from '../../../components/shared/LoadingSpinner';
import { useToast } from '../../../components/shared/Toast';

import { get, post } from '../../../services/api';
import { listFournisseurs } from '../../../services/fournisseurService';
import { recommendFournisseurs } from '../../../services/fournisseurRecommendationService';
import {
  fallbackApprovisionnementProducts,
  fallbackApprovisionnementSuppliers,
} from '../../../data/catalogueFallback';

import '../../../components/fournisseurs/fournisseurs.css';
import '../FournisseursResp.css';

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toDateInput = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

const addDaysInput = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + Math.max(0, Math.floor(toNumber(days, 0))));
  return toDateInput(d);
};

const normalizeProduct = (product) => {
  const stockActuel = toNumber(product?.stockActuel ?? product?.quantity_current, 0);
  const seuilMinimum = toNumber(product?.seuilMinimum ?? product?.seuil_minimum, 0);
  const stockSecurite = toNumber(product?.stockSecurite ?? product?.stock_security ?? product?.safety_stock, Math.ceil(seuilMinimum / 2));
  const consommationMensuelle = toNumber(product?.consommationMensuelle ?? product?.monthly_consumption ?? product?.consumption_monthly, 0);
  const prixEstime = toNumber(product?.prixEstime ?? product?.estimated_price ?? product?.unit_price, 0);
  return {
    id: String(product?._id || product?.id || '').trim(),
    nom: product?.nom || product?.name || 'Produit',
    code: product?.code_product || product?.code || '',
    stockActuel,
    seuilMinimum,
    stockSecurite,
    consommationMensuelle,
    prixEstime,
  };
};

const normalizeSupplier = (supplier, fallbackPrice = 0) => {
  const id = String(supplier?.supplier_id || supplier?._id || supplier?.id || '').trim();
  const score = Math.round(toNumber(supplier?.score, supplier?.reliability_level === 'FIABLE' ? 88 : 78));
  const kpis = supplier?.kpis || {};
  return {
    id,
    nom: supplier?.supplier_name || supplier?.nom || supplier?.name || 'Fournisseur',
    score,
    delaiMoyen: toNumber(supplier?.delaiMoyen ?? supplier?.lead_time_days ?? supplier?.default_lead_time_days ?? kpis.avg_lead_time_days, 7),
    fiabilite: Math.round(toNumber(supplier?.fiabilite ?? kpis.on_time_rate, Math.min(98, Math.max(70, score + 2)))),
    prixUnitaire: toNumber(supplier?.prixUnitaire ?? supplier?.unit_price, fallbackPrice),
    derniereCommande: supplier?.derniereCommande || supplier?.last_order || 'Non disponible',
    commandesPrecedentes: Math.max(0, Math.round(toNumber(supplier?.commandesPrecedentes ?? kpis.orders_count, 0))),
    status: String(supplier?.status || 'ACTIF').toUpperCase(),
  };
};

const getAlertLevel = (product) => {
  if (!product) return { key: 'empty', label: 'À analyser', className: 'info' };
  if (product.stockActuel <= 0 || product.stockActuel <= product.stockSecurite) return { key: 'critical', label: 'Critique', className: 'danger' };
  if (product.stockActuel <= product.seuilMinimum) return { key: 'low', label: 'Faible', className: 'warning' };
  return { key: 'normal', label: 'Normal', className: 'success' };
};

const getRecommendedQty = (product) => {
  if (!product) return 10;
  return Math.max(product.seuilMinimum + product.stockSecurite - product.stockActuel, 10);
};

const getPriorityFromStock = (product) => {
  const level = getAlertLevel(product);
  if (level.key === 'critical') return 'Critique';
  if (level.key === 'low') return 'Urgente';
  return 'Normale';
};

const NouvelleCommandeFournisseurPage = ({ userName, onLogout }) => {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));

  const fournisseurId = String(searchParams.get('fournisseurId') || '').trim();
  const produitId = String(searchParams.get('produitId') || '').trim();
  const quantite = String(searchParams.get('quantite') || '').trim();
  const source = String(searchParams.get('source') || '').trim();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [recommendation, setRecommendation] = useState(null);
  const [recommendationLoading, setRecommendationLoading] = useState(false);

  const [draftSupplierId, setDraftSupplierId] = useState(fournisseurId);
  const [draftProductId, setDraftProductId] = useState(produitId);
  const [draftQty, setDraftQty] = useState(quantite ? Number(quantite) : 10);
  const [priority, setPriority] = useState('Normale');
  const [desiredDeliveryDate, setDesiredDeliveryDate] = useState('');
  const [motif, setMotif] = useState('');
  const [autoQtyApplied, setAutoQtyApplied] = useState(Boolean(quantite));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [productsRes, suppliersRes] = await Promise.all([
        get('/products').catch(() => []),
        listFournisseurs({ page: 1, limit: 80, q: '', status: 'all', reliability: 'all', profile_state: 'all' }).catch(() => ({ items: [] })),
      ]);
      const nextProducts = Array.isArray(productsRes) ? productsRes : (Array.isArray(productsRes?.items) ? productsRes.items : []);
      const nextSuppliers = Array.isArray(suppliersRes?.items) ? suppliersRes.items : [];
      setProducts(nextProducts.length ? nextProducts : fallbackApprovisionnementProducts);
      setSuppliers(nextSuppliers.length ? nextSuppliers : fallbackApprovisionnementSuppliers);
    } catch {
      setProducts(fallbackApprovisionnementProducts);
      setSuppliers(fallbackApprovisionnementSuppliers);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const normalizedProducts = useMemo(() => products.map(normalizeProduct), [products]);

  const selectedProduct = useMemo(
    () => normalizedProducts.find((p) => p.id === draftProductId) || null,
    [draftProductId, normalizedProducts]
  );

  const recommendedQty = useMemo(() => getRecommendedQty(selectedProduct), [selectedProduct]);

  const fallbackRecommendedSupplier = useMemo(() => {
    const candidates = suppliers.map((item) => normalizeSupplier(item, selectedProduct?.prixEstime || 0));
    return candidates.sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0] || null;
  }, [selectedProduct?.prixEstime, suppliers]);

  useEffect(() => {
    if (!selectedProduct) {
      setRecommendation(null);
      setDesiredDeliveryDate('');
      return;
    }

    setPriority(getPriorityFromStock(selectedProduct));
    if (!autoQtyApplied) {
      setDraftQty(recommendedQty);
    }

    let alive = true;
    setRecommendationLoading(true);
    (async () => {
      try {
        const res = await recommendFournisseurs({ productId: selectedProduct.id, quantity: recommendedQty });
        if (!alive) return;
        const normalized = res?.recommended
          ? normalizeSupplier(res.recommended, selectedProduct.prixEstime)
          : fallbackRecommendedSupplier;
        setRecommendation(normalized);
        setDesiredDeliveryDate(addDaysInput(normalized?.delaiMoyen || 7));
      } catch {
        if (!alive) return;
        setRecommendation(fallbackRecommendedSupplier);
        setDesiredDeliveryDate(addDaysInput(fallbackRecommendedSupplier?.delaiMoyen || 7));
      } finally {
        if (alive) setRecommendationLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [autoQtyApplied, fallbackRecommendedSupplier, recommendedQty, selectedProduct]);

  const normalizedSuppliers = useMemo(
    () => suppliers.map((item) => normalizeSupplier(item, selectedProduct?.prixEstime || 0)),
    [selectedProduct?.prixEstime, suppliers]
  );

  const selectedSupplier = useMemo(
    () => normalizedSuppliers.find((s) => s.id === draftSupplierId) || null,
    [draftSupplierId, normalizedSuppliers]
  );

  const effectiveSupplier = draftSupplierId ? selectedSupplier : recommendation;
  const supplierStatus = String(effectiveSupplier?.status || 'ACTIF').toUpperCase();
  const supplierBlocked = supplierStatus === 'SUSPENDU' || supplierStatus === 'INACTIF';
  const alertLevel = getAlertLevel(selectedProduct);
  const unitPrice = toNumber(effectiveSupplier?.prixUnitaire, selectedProduct?.prixEstime || 0);
  const totalEstimated = Math.max(0, toNumber(draftQty, 0) * unitPrice);
  const qtyConsistent = toNumber(draftQty, 0) >= recommendedQty;

  const canSubmit = useMemo(() => {
    const qty = Number(draftQty);
    if (!draftProductId) return false;
    if (!Number.isFinite(qty) || qty <= 0) return false;
    if (!effectiveSupplier?.id) return false;
    if (supplierBlocked) return false;
    return true;
  }, [draftProductId, draftQty, effectiveSupplier?.id, supplierBlocked]);

  const submit = async (targetStatus = 'EN_ATTENTE_VALIDATION') => {
    if (!canSubmit || saving) return;
    setSaving(true);
    try {
      const command = {
        produitId: draftProductId,
        fournisseurId: effectiveSupplier.id,
        quantite: Number(draftQty),
        priorite: priority,
        dateLivraisonSouhaitee: desiredDeliveryDate || addDaysInput(effectiveSupplier.delaiMoyen),
        motif,
        prixUnitaireEstime: unitPrice,
        montantTotalEstime: totalEstimated,
        statut: targetStatus,
        source: source || 'CREATION_MANUELLE_ASSISTEE',
        fournisseurRecommande: !draftSupplierId || effectiveSupplier.id === recommendation?.id,
      };
      const created = await post('/purchase-orders', {
        supplier_id: command.fournisseurId,
        promised_at: command.dateLivraisonSouhaitee,
        status: targetStatus === 'BROUILLON' ? 'draft' : 'ordered',
        note: [
          command.motif || null,
          `Source: ${command.source}`,
          `Priorite: ${command.priorite}`,
          `Fournisseur recommande: ${command.fournisseurRecommande ? 'oui' : 'non'}`,
        ].filter(Boolean).join(' | ').slice(0, 600),
        decision_id: `ASSIST-${Date.now()}`,
        lines: [{
          product_id: command.produitId,
          quantity: command.quantite,
          unit_price: command.prixUnitaireEstime,
        }],
      });
      toast.success(
        targetStatus === 'BROUILLON'
          ? 'Brouillon de commande fournisseur enregistré.'
          : 'Commande fournisseur créée avec succès et envoyée en attente de validation.'
      );
      const poId = String(created?._id || created?.purchase_order_id || '').trim();
      if (poId) navigate(`/responsable/commandes/${poId}`);
      else navigate('/responsable/fournisseurs');
    } catch (e) {
      toast.error(e.message || 'Création commande échouée');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="resp-suppliers">
      <SidebarResp collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((p) => !p)} onLogout={onLogout} userName={userName} />
      <div className={`resp-suppliers-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <HeaderPage
          userName={userName}
          title="Nouvelle commande fournisseur"
          subtitle="Création assistée depuis le besoin produit, le stock critique et le meilleur fournisseur disponible"
          icon={<ShoppingCart size={22} />}
          showSearch={false}
          onMenuClick={() => setSidebarCollapsed((p) => !p)}
        />

        <div className="resp-suppliers-page">
          {loading && <LoadingSpinner overlay text="Chargement..." />}

          <div className="po-assist-banner">
            <Info size={18} />
            <span>
              Sélectionnez un produit à réapprovisionner. Le système proposera automatiquement le fournisseur le plus pertinent selon le prix, le délai, la fiabilité et l’historique des commandes.
            </span>
          </div>

          <div className="po-assist-layout">
            <section className="resp-card po-card po-form-card">
              <h3><FileText size={18} />Informations de commande</h3>
              <div className="resp-form-grid">
                <div className="resp-field">
                  <span>Produit à commander <em className="po-required">Obligatoire</em></span>
                  <select
                    value={draftProductId}
                    onChange={(e) => {
                      setDraftProductId(e.target.value);
                      setAutoQtyApplied(false);
                    }}
                    disabled={saving}
                  >
                    <option value="">Choisir un produit à réapprovisionner...</option>
                    {normalizedProducts.slice(0, 250).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nom}{p.code ? ` (${p.code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="resp-field">
                  <span>Quantité demandée <em className="po-required">Obligatoire</em></span>
                  <input
                    type="number"
                    min="1"
                    value={draftQty}
                    onChange={(e) => {
                      setDraftQty(e.target.value);
                      setAutoQtyApplied(true);
                    }}
                    disabled={saving}
                  />
                </div>

                <div className="resp-field">
                  <span>Priorité</span>
                  <select value={priority} onChange={(e) => setPriority(e.target.value)} disabled={saving}>
                    <option value="Normale">Normale</option>
                    <option value="Urgente">Urgente</option>
                    <option value="Critique">Critique</option>
                  </select>
                </div>

                <div className="resp-field">
                  <span>Date souhaitée de livraison</span>
                  <input
                    type="date"
                    value={desiredDeliveryDate}
                    onChange={(e) => setDesiredDeliveryDate(e.target.value)}
                    disabled={saving}
                  />
                </div>

                <div className="resp-field resp-field-wide">
                  <span>Fournisseur</span>
                  <select value={draftSupplierId} onChange={(e) => setDraftSupplierId(e.target.value)} disabled={saving}>
                    <option value="">
                      {recommendation
                        ? `${recommendation.nom} — recommandé automatiquement`
                        : 'Auto — meilleur fournisseur recommandé'}
                    </option>
                    {normalizedSuppliers.slice(0, 80).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nom} — {s.status}
                      </option>
                    ))}
                  </select>
                  {supplierBlocked ? (
                    <div className="po-inline-alert danger">
                      Règle métier: un fournisseur {supplierStatus} ne peut pas être utilisé pour une nouvelle commande.
                    </div>
                  ) : null}
                </div>

                <div className="resp-field resp-field-wide">
                  <span>Motif de commande</span>
                  <textarea
                    value={motif}
                    onChange={(e) => setMotif(e.target.value)}
                    placeholder="Exemple : réapprovisionnement suite à un stock faible, besoin chantier, consommation élevée..."
                    disabled={saving}
                    rows={4}
                  />
                </div>
              </div>
            </section>

            <aside className="po-side-stack">
              <section className="resp-card po-card">
                <h3><Truck size={18} />Recommandation fournisseur</h3>
                {!selectedProduct ? (
                  <div className="po-empty-state">
                    <Truck size={22} />
                    <span>Ici apparaîtra le fournisseur recommandé après sélection du produit.</span>
                  </div>
                ) : recommendationLoading ? (
                  <div className="po-empty-state">Calcul du meilleur fournisseur...</div>
                ) : effectiveSupplier ? (
                  <div className="po-supplier-card">
                    <div className="po-supplier-top">
                      <strong>{effectiveSupplier.nom}</strong>
                      <span className="po-badge success">Meilleur choix</span>
                    </div>
                    <div className="po-score-line">
                      <span>Score fournisseur</span>
                      <strong>{effectiveSupplier.score} %</strong>
                    </div>
                    <div className="po-metric-grid">
                      <div><Clock size={15} /><span>Délai moyen</span><strong>{effectiveSupplier.delaiMoyen} jours</strong></div>
                      <div><CheckCircle size={15} /><span>Fiabilité</span><strong>{effectiveSupplier.fiabilite} %</strong></div>
                      <div><ShoppingCart size={15} /><span>Prix estimé</span><strong>{unitPrice || '-'} DT</strong></div>
                      <div><CalendarDays size={15} /><span>Dernière commande</span><strong>{effectiveSupplier.derniereCommande}</strong></div>
                    </div>
                    <div className="po-orders-count">{effectiveSupplier.commandesPrecedentes} commandes précédentes</div>
                    <button className="f360-btn secondary" type="button" onClick={() => setDraftSupplierId('')} disabled={saving}>
                      Changer fournisseur
                    </button>
                    <p className="po-formula">Score calculé selon : prix, délai, fiabilité et historique.</p>
                  </div>
                ) : (
                  <div className="po-empty-state">Aucun fournisseur actif disponible.</div>
                )}
              </section>

              <section className="resp-card po-card">
                <h3><Package size={18} />Analyse produit & stock</h3>
                {!selectedProduct ? (
                  <div className="po-empty-state">Sélectionnez un produit pour consulter l’état du stock.</div>
                ) : (
                  <>
                    <div className="po-stock-head">
                      <strong>{selectedProduct.nom}</strong>
                      <span className={`po-badge ${alertLevel.className}`}>{alertLevel.label}</span>
                    </div>
                    <div className="po-metric-grid stock">
                      <div><span>Stock actuel</span><strong>{selectedProduct.stockActuel}</strong></div>
                      <div><span>Seuil minimum</span><strong>{selectedProduct.seuilMinimum}</strong></div>
                      <div><span>Stock de sécurité</span><strong>{selectedProduct.stockSecurite}</strong></div>
                      <div><span>Conso. mensuelle</span><strong>{selectedProduct.consommationMensuelle || '-'}</strong></div>
                      <div><span>Qté recommandée</span><strong>{recommendedQty}</strong></div>
                    </div>
                    <div className={`po-inline-alert ${qtyConsistent ? 'success' : 'warning'}`}>
                      {qtyConsistent
                        ? 'Quantité cohérente avec le besoin de réapprovisionnement.'
                        : 'La quantité saisie est inférieure au besoin recommandé.'}
                    </div>
                  </>
                )}
              </section>
            </aside>
          </div>

          <section className="resp-card po-card po-summary-card">
            <h3><AlertTriangle size={18} />Résumé de la commande</h3>
            {selectedProduct && effectiveSupplier && canSubmit ? (
              <div className="po-summary-grid">
                <div><span>Produit sélectionné</span><strong>{selectedProduct.nom}</strong></div>
                <div><span>Fournisseur</span><strong>{effectiveSupplier.nom}</strong></div>
                <div><span>Quantité</span><strong>{draftQty}</strong></div>
                <div><span>Prix unitaire estimé</span><strong>{unitPrice || 0} DT</strong></div>
                <div><span>Montant total estimé</span><strong>{totalEstimated.toFixed(2)} DT</strong></div>
                <div><span>Livraison estimée</span><strong>{desiredDeliveryDate || '-'}</strong></div>
                <div><span>Priorité</span><strong>{priority}</strong></div>
                <div><span>Statut initial</span><strong className="po-badge info">En attente de validation</strong></div>
              </div>
            ) : (
              <div className="po-empty-state">Complétez les informations nécessaires pour générer le résumé.</div>
            )}
          </section>

          <div className="po-actions">
            <button className="f360-btn secondary" type="button" onClick={() => navigate(-1)} disabled={saving}>
              Annuler
            </button>
            <button className="f360-btn secondary" type="button" onClick={() => submit('BROUILLON')} disabled={!canSubmit || saving}>
              <Save size={15} /> Enregistrer brouillon
            </button>
            <button className="f360-btn primary" type="button" onClick={() => submit('EN_ATTENTE_VALIDATION')} disabled={!canSubmit || saving}>
              {saving ? 'Création...' : 'Créer commande'}
            </button>
          </div>

          {selectedProduct && !effectiveSupplier ? (
            <div className="po-inline-alert warning">
              Aucun fournisseur recommandé ou choisi: la création de commande reste bloquée.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default NouvelleCommandeFournisseurPage;
