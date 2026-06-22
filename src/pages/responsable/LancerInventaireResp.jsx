// BLOC 1 - Role du fichier.
// Ce fichier affiche une page de l'espace responsable pour LancerInventaireResp.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ClipboardCheck, Rocket, RefreshCw, Info } from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get, post } from '../../services/api';
import { getUiErrorMessage } from '../../services/uiError';
import './LancerInventaireResp.css';

function toDateInputValue(date) {
  if (!date) return '';
  try {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return '';
  }
}

function getLaunchInventoryErrorMessage(err) {
  const data = err?.data && typeof err.data === 'object' ? err.data : {};
  const code = String(data.code || '');
  const error = String(data.error || err?.message || '');

  if (Number(err?.status) === 409 && (code === 'ACTIVE_INVENTORY_EXISTS' || error.includes('Inventaire deja actif'))) {
    const existing = data.existing_inventory && typeof data.existing_inventory === 'object' ? data.existing_inventory : {};
    const refFromDetails = String(data.details || '').match(/INV-\d{4}-\d+/)?.[0] || '';
    const reference = String(existing.reference || refFromDetails || '').trim();
    const status = String(existing.status || '').trim();
    const suffix = reference ? ` (${reference}${status ? ` - ${status}` : ''})` : '';
    return `Inventaire deja en cours pour ce perimetre${suffix}. Ouvrez la liste des inventaires pour le suivre ou le cloturer avant de relancer.`;
  }

  if (Number(err?.status) === 409 && (code === 'NO_PRODUCTS_FOR_INVENTORY' || error.includes('Aucun article concerne'))) {
    return 'Aucun article actif ne correspond a ce perimetre. Choisissez un seul filtre valide: produit, famille ou categorie.';
  }

  return getUiErrorMessage(err, "Erreur lancement inventaire");
}

const LancerInventaireResp = ({ userName, onLogout }) => {
  const toast = useToast();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);

  const [options, setOptions] = useState({
    magasins: [],
    categories: [],
    products: [],
    familles: [],
    magasiniers: [],
  });

  const [typeInventaire, setTypeInventaire] = useState('GLOBAL');
  const [magasinId, setMagasinId] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [familleId, setFamilleId] = useState('');
  const [categorieId, setCategorieId] = useState('');
  const [magasinierIds, setMagasinierIds] = useState([]);
  const [datePrevue, setDatePrevue] = useState(() => toDateInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [commentaire, setCommentaire] = useState('');
  const [bloquerMouvements, setBloquerMouvements] = useState(true);
  const [notificationsActives, setNotificationsActives] = useState(true);
  const [formErrors, setFormErrors] = useState([]);
  const [magasinierQuery, setMagasinierQuery] = useState('');

  const loadOptions = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = await get('/inventory/launch/options');
      const magasins = Array.isArray(payload?.magasins) ? payload.magasins : [];
      setOptions({
        magasins,
        categories: Array.isArray(payload?.categories) ? payload.categories : [],
        products: Array.isArray(payload?.products) ? payload.products : [],
        familles: Array.isArray(payload?.familles) ? payload.familles : [],
        magasiniers: Array.isArray(payload?.magasiniers) ? payload.magasiniers : [],
      });

      setMagasinId((prev) => {
        const current = String(prev || '');
        const first = magasins?.[0]?._id ? String(magasins[0]._id) : '';
        if (!first) return current;
        if (!current) return first;
        const stillExists = magasins.some((m) => String(m?._id) === current);
        return stillExists ? current : first;
      });
    } catch (err) {
      toast.error(err.message || "Erreur chargement options d'inventaire");
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    if (typeInventaire === 'GLOBAL') {
      setProductQuery('');
      setFamilleId('');
      setCategorieId('');
      setBloquerMouvements(true);
    }
  }, [typeInventaire]);

  useEffect(() => {
    if (familleId && !(options.familles || []).some((f) => String(f?.value || '') === String(familleId))) {
      setFamilleId('');
    }
    if (categorieId && !(options.categories || []).some((c) => String(c?._id || '') === String(categorieId))) {
      setCategorieId('');
    }
  }, [categorieId, familleId, options.categories, options.familles]);

  const productDisabled = typeInventaire === 'GLOBAL';
  const familleDisabled = typeInventaire === 'GLOBAL';
  const categorieDisabled = typeInventaire === 'GLOBAL';

  const handleProductQueryChange = (value) => {
    setProductQuery(value);
    if (String(value || '').trim()) {
      setFamilleId('');
      setCategorieId('');
    }
  };

  const handleFamilleChange = (value) => {
    setFamilleId(value);
    if (value) {
      setProductQuery('');
      setCategorieId('');
    }
  };

  const handleCategorieChange = (value) => {
    setCategorieId(value);
    if (value) {
      setProductQuery('');
      setFamilleId('');
    }
  };

  const productOptions = useMemo(() => {
    const items = Array.isArray(options.products) ? options.products : [];
    return items.map((p) => ({
      ...p,
      searchLabel: `${p?.code_product || ''} - ${p?.name || ''}`.trim(),
    }));
  }, [options.products]);

  const productCounts = useMemo(() => {
    const family = new Map();
    const category = new Map();
    for (const product of productOptions) {
      const familyKey = String(product?.family || '').trim();
      const categoryKey = String(product?.category?._id || product?.category || '').trim();
      if (familyKey) family.set(familyKey, Number(family.get(familyKey) || 0) + 1);
      if (categoryKey) category.set(categoryKey, Number(category.get(categoryKey) || 0) + 1);
    }
    return { family, category };
  }, [productOptions]);

  const availableFamilles = useMemo(
    () => (options.familles || [])
      .map((f) => ({
        ...f,
        article_count: Number(f?.article_count || productCounts.family.get(String(f?.value || '')) || 0),
      }))
      .filter((f) => Number(f.article_count || 0) > 0),
    [options.familles, productCounts]
  );

  const availableCategories = useMemo(
    () => (options.categories || [])
      .map((c) => ({
        ...c,
        article_count: Number(c?.article_count || productCounts.category.get(String(c?._id || '')) || 0),
      }))
      .filter((c) => Number(c.article_count || 0) > 0),
    [options.categories, productCounts]
  );

  const selectedProduct = useMemo(() => {
    const q = String(productQuery || '').trim().toLowerCase();
    if (!q) return null;
    return productOptions.find((p) => {
      const id = String(p?._id || '').toLowerCase();
      const code = String(p?.code_product || '').toLowerCase();
      const name = String(p?.name || '').toLowerCase();
      const label = String(p?.searchLabel || '').toLowerCase();
      return q === id || q === code || q === name || q === label;
    }) || null;
  }, [productOptions, productQuery]);

  const selectedFamilyOption = useMemo(
    () => availableFamilles.find((f) => String(f?.value || '') === String(familleId)) || null,
    [availableFamilles, familleId]
  );

  const selectedCategoryOption = useMemo(
    () => availableCategories.find((c) => String(c?._id || '') === String(categorieId)) || null,
    [availableCategories, categorieId]
  );

  useEffect(() => {
    if (familleId && !availableFamilles.some((f) => String(f?.value || '') === String(familleId))) {
      setFamilleId('');
    }
    if (categorieId && !availableCategories.some((c) => String(c?._id || '') === String(categorieId))) {
      setCategorieId('');
    }
  }, [availableCategories, availableFamilles, categorieId, familleId]);

  const magasinierChoices = useMemo(() => {
    const items = Array.isArray(options.magasiniers) ? options.magasiniers : [];
    const seen = new Set();
    const unique = [];
    for (const u of items) {
      const id = String(u?._id || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      unique.push(u);
    }

    const q = String(magasinierQuery || '').trim().toLowerCase();
    if (!q) return unique;
    return unique.filter((u) => (
      String(u?.username || '').toLowerCase().includes(q) ||
      String(u?.email || '').toLowerCase().includes(q)
    ));
  }, [magasinierQuery, options.magasiniers]);

  const selectedMagasiniers = useMemo(() => {
    const selected = new Set((Array.isArray(magasinierIds) ? magasinierIds : []).map((id) => String(id)));
    return (Array.isArray(options.magasiniers) ? options.magasiniers : [])
      .filter((u) => selected.has(String(u?._id || '')))
      .map((u) => String(u?.username || '').trim())
      .filter(Boolean);
  }, [magasinierIds, options.magasiniers]);

  const selectedPerimeterLabel = useMemo(() => {
    if (typeInventaire === 'GLOBAL') return 'Tout le magasin';
    const parts = [];
    const typedProduct = String(productQuery || '').trim();
    if (selectedProduct) parts.push(`Produit: ${selectedProduct.code_product}`);
    else if (typedProduct) parts.push(`Produit: ${typedProduct}`);
    if (selectedFamilyOption) parts.push(`Famille: ${selectedFamilyOption.label}`);
    const category = selectedCategoryOption;
    if (category) parts.push(`Catégorie: ${category.name}`);
    return parts.length ? parts.join(' | ') : '-';
  }, [productQuery, selectedCategoryOption, selectedFamilyOption, selectedProduct, typeInventaire]);

  const toggleMagasinier = (id, checked) => {
    const key = String(id || '');
    if (!key) return;
    setMagasinierIds((prev) => {
      const set = new Set((Array.isArray(prev) ? prev : []).map((x) => String(x)));
      if (checked) set.add(key);
      else set.delete(key);
      return Array.from(set);
    });
  };

  const validateForm = () => {
    const errs = [];
    if (!typeInventaire) errs.push('type_inventaire obligatoire');
    if (!magasinierIds.length) errs.push('magasinier(s) obligatoire(s)');
    if (!datePrevue) errs.push('date_prevue obligatoire');

    if (typeInventaire === 'TOURNANT' && !String(productQuery || '').trim() && !familleId && !categorieId) {
      errs.push('Pour TOURNANT, choisir au moins un produit, une famille ou une catégorie');
    }

    if (typeInventaire === 'TOURNANT') {
      const perimeterCount = [
        String(productQuery || '').trim(),
        familleId,
        categorieId,
      ].filter(Boolean).length;
      if (perimeterCount > 1) {
        errs.push('Pour TOURNANT, choisir un seul perimetre: produit, famille ou categorie.');
      }
    }

    if (typeInventaire === 'TOURNANT' && familleId && !selectedFamilyOption) {
      errs.push('Cette famille ne contient aucun article actif a inventorier.');
    }

    if (typeInventaire === 'TOURNANT' && categorieId && !selectedCategoryOption) {
      errs.push('Cette categorie ne contient aucun article actif a inventorier.');
    }

    if (typeInventaire === 'GLOBAL' && (String(productQuery || '').trim() || familleId || categorieId)) {
      errs.push('Pour GLOBAL, le périmètre est tout le magasin (ne pas sélectionner produit/famille/catégorie).');
    }

    setFormErrors(errs);
    return errs.length === 0;
  };

  const launchInventory = async () => {
    if (!validateForm()) {
      toast.error('Données invalides');
      return;
    }

    setIsLoading(true);
    try {
      const selectedMagasiniers = (Array.isArray(magasinierIds) ? magasinierIds : []).filter(Boolean);
      const payload = await post('/inventory/inventories', {
        type_inventaire: typeInventaire,
        magasin_id: magasinId,
        product_id: typeInventaire === 'TOURNANT' && selectedProduct?._id ? selectedProduct._id : null,
        product_query: typeInventaire === 'TOURNANT' ? (productQuery.trim() || null) : null,
        famille_id: familleDisabled ? null : (familleId || null),
        categorie_id: categorieDisabled ? null : (categorieId || null),
        magasinier_ids: selectedMagasiniers,
        magasinier_id: selectedMagasiniers[0] || '',
        date_prevue: datePrevue,
        commentaire,
        bloquer_mouvements: Boolean(bloquerMouvements),
        notifications_activees: Boolean(notificationsActives),
      });

      const ref = payload?.inventory?.reference || 'Inventaire';
      const linesCount = Number(payload?.lines_count || 0);
      toast.success(`${ref} lancé (${linesCount} ligne(s))`);
      navigate('/responsable/inventaires', { replace: true });
    } catch (err) {
      const isDuplicateInventory = Number(err?.status) === 409 && String(err?.data?.code || '') === 'ACTIVE_INVENTORY_EXISTS';
      const message = getLaunchInventoryErrorMessage(err);
      if (isDuplicateInventory) toast.warning(message, 8000);
      else toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ProtectedPage userName={userName}>
      <div className="app-layout">
        <div className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`} onClick={() => setSidebarCollapsed(true)} />
        <SidebarResp collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} onLogout={onLogout} userName={userName} />

        <div className="main-container">
          <HeaderPage userName={userName} title="Inventaires" showSearch={false} onMenuClick={() => setSidebarCollapsed((p) => !p)} />
          <main className="main-content">
            {isLoading && <LoadingSpinner overlay text="Traitement..." />}

            <div className="inv-launch-header">
              <div className="inv-launch-title">
                <h2><ClipboardCheck size={20} /> Lancer une session d'inventaire</h2>
                <div className="inv-launch-sub">Définissez le périmètre et assignez la mission aux magasiniers.</div>
              </div>
              <div className="inv-launch-actions">
                <button className="inv-launch-btn" type="button" onClick={() => navigate('/responsable/inventaires')}>
                  <ArrowLeft size={16} /> Retour aux inventaires
                </button>
                <button className="inv-launch-btn" type="button" onClick={loadOptions} disabled={isLoading}>
                  <RefreshCw size={16} /> Actualiser
                </button>
              </div>
            </div>

            <div className="inv-launch-grid">
              <section className="inv-launch-card">
                <div className="inv-launch-card-head">
                  <strong>Paramètres</strong>
                </div>

                <div className="inv-launch-type">
                  <button
                    type="button"
                    className={`inv-type-card ${typeInventaire === 'GLOBAL' ? 'active' : ''}`}
                    onClick={() => setTypeInventaire('GLOBAL')}
                  >
                    <div className="inv-type-kicker">GLOBAL</div>
                    <div className="inv-type-title">Inventaire global</div>
                    <div className="inv-type-desc">Tous les articles du magasin seront concernés.</div>
                  </button>
                  <button
                    type="button"
                    className={`inv-type-card ${typeInventaire === 'TOURNANT' ? 'active' : ''}`}
                    onClick={() => setTypeInventaire('TOURNANT')}
                  >
                    <div className="inv-type-kicker">TOURNANT</div>
                    <div className="inv-type-title">Inventaire tournant</div>
                    <div className="inv-type-desc">Contrôle ciblé par produit, famille ou catégorie.</div>
                  </button>
                </div>

                {typeInventaire === 'GLOBAL' ? (
                  <div className="inv-launch-info global">
                    <Info size={16} />
                    <div>
                      <strong>Inventaire global</strong>
                      <div>Tous les articles du magasin seront inclus. Il est recommandé de bloquer les mouvements.</div>
                    </div>
                  </div>
                ) : (
                  <div className="inv-launch-info tournant">
                    <Info size={16} />
                    <div>
                      <strong>Inventaire tournant</strong>
                      <div>Sélectionnez un produit, une famille ou une catégorie à contrôler.</div>
                    </div>
                  </div>
                )}

                <div className="inv-launch-form">
                  <div className="inv-launch-row two">
                    <div>
                      <label>Produit (optionnel)</label>
                      <input
                        type="text"
                        list="inventory-product-options"
                        value={productQuery}
                        onChange={(e) => handleProductQueryChange(e.target.value)}
                        disabled={productDisabled}
                        placeholder={productDisabled ? 'Désactivé (GLOBAL)' : 'Écrire un code/nom produit ou choisir...'}
                      />
                      <datalist id="inventory-product-options">
                        {productOptions.map((p) => (
                          <option key={p._id} value={p.searchLabel}>
                            {p.code_product} - {p.name}
                          </option>
                        ))}
                      </datalist>
                      {!productDisabled ? (
                        <div className="inv-launch-field-hint">
                          {selectedProduct
                            ? `${selectedProduct.code_product} sélectionné`
                            : 'La saisie libre doit identifier un seul produit actif.'}
                        </div>
                      ) : null}
                    </div>
                    <div>
                      <label>Famille (optionnel)</label>
                      <select value={familleId} onChange={(e) => handleFamilleChange(e.target.value)} disabled={familleDisabled}>
                        <option value="">{familleDisabled ? 'Désactivé (GLOBAL)' : 'Choisir une famille'}</option>
                        {availableFamilles.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label} ({Number(f.article_count || 0)} article(s))
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="inv-launch-row two">
                    <div>
                      <label>Catégorie (optionnel)</label>
                      <select value={categorieId} onChange={(e) => handleCategorieChange(e.target.value)} disabled={categorieDisabled}>
                        <option value="">{categorieDisabled ? 'Désactivé (GLOBAL)' : 'Choisir une catégorie'}</option>
                        {availableCategories.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.name} ({Number(c.article_count || 0)} article(s))
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label>Magasinier(s) assigné(s)</label>
                      <div className="inv-launch-multi">
                        <div className="inv-launch-multi-head">
                          <input
                            type="text"
                            value={magasinierQuery}
                            onChange={(e) => setMagasinierQuery(e.target.value)}
                            placeholder="Rechercher un magasinier..."
                          />
                          <div className="inv-launch-multi-actions">
                            <button
                              type="button"
                              className="inv-launch-btn ghost"
                              onClick={() => setMagasinierIds(magasinierChoices.map((u) => String(u._id)))}
                            >
                              Tout
                            </button>
                            <button
                              type="button"
                              className="inv-launch-btn ghost"
                              onClick={() => setMagasinierIds([])}
                            >
                              Aucun
                            </button>
                          </div>
                        </div>

                        <div className="inv-launch-multi-list" role="list">
                          {magasinierChoices.map((u) => {
                            const id = String(u._id);
                            const checked = magasinierIds.includes(id);
                            return (
                              <label key={id} className="inv-launch-multi-item">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => toggleMagasinier(id, e.target.checked)}
                                />
                                <span>{u.username}</span>
                              </label>
                            );
                          })}
                          {!magasinierChoices.length ? (
                            <div className="inv-launch-multi-empty">Aucun magasinier</div>
                          ) : null}
                        </div>

                        <div className="inv-launch-multi-hint">
                          Sélectionnez un ou plusieurs magasiniers. Les notifications seront envoyées à tous si activées.
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="inv-launch-row two">
                    <div>
                      <label>Date prévue</label>
                      <input type="date" value={datePrevue} onChange={(e) => setDatePrevue(e.target.value)} />
                    </div>
                    <div className="inv-launch-checks">
                      <label className="inv-launch-check">
                        <input
                          type="checkbox"
                          checked={bloquerMouvements}
                          onChange={(e) => setBloquerMouvements(e.target.checked)}
                        />
                        Bloquer les mouvements pendant l'inventaire
                      </label>
                      <label className="inv-launch-check">
                        <input
                          type="checkbox"
                          checked={notificationsActives}
                          onChange={(e) => setNotificationsActives(e.target.checked)}
                        />
                        Notifier les magasiniers
                      </label>
                    </div>
                  </div>

                  <div className="inv-launch-row">
                    <label>Commentaire</label>
                    <textarea
                      rows={3}
                      value={commentaire}
                      onChange={(e) => setCommentaire(e.target.value)}
                      placeholder="Objectif, consignes, contraintes..."
                    />
                  </div>

                  {formErrors.length ? (
                    <div className="inv-launch-errors">
                      <strong>Données invalides</strong>
                      <ul>
                        {formErrors.map((e, idx) => <li key={`${e}_${idx}`}>{e}</li>)}
                      </ul>
                    </div>
                  ) : null}

                  <div className="inv-launch-footer">
                    <button className="inv-launch-btn ghost" type="button" onClick={() => navigate('/responsable/inventaires')} disabled={isLoading}>
                      Annuler
                    </button>
                    <button className="inv-launch-btn primary" type="button" onClick={launchInventory} disabled={isLoading}>
                      <Rocket size={16} /> Lancer inventaire
                    </button>
                  </div>
                </div>
              </section>

              <aside className="inv-launch-card side">
                <div className="inv-launch-side-head">
                  <strong>Résumé</strong>
                </div>
                <div className="inv-launch-kv">
                  <div className="k"><span>Type</span></div>
                  <div className="v"><span className={`inv-status-badge type ${typeInventaire === 'GLOBAL' ? 'global' : 'tournant'}`}>{typeInventaire}</span></div>
                </div>
                <div className="inv-launch-kv">
                  <div className="k"><span>Périmètre</span></div>
                  <div className="v">{selectedPerimeterLabel}</div>
                </div>
                <div className="inv-launch-kv">
                  <div className="k"><span>Mouvements</span></div>
                  <div className="v">{typeInventaire === 'GLOBAL' ? (bloquerMouvements ? 'Bloqués' : 'Non bloqués') : 'Non applicable'}</div>
                </div>
                <div className="inv-launch-kv">
                  <div className="k"><span>Notification</span></div>
                  <div className="v">{notificationsActives ? 'Active' : 'Désactivée'}</div>
                </div>
                <div className="inv-launch-kv">
                  <div className="k"><span>Assignation</span></div>
                  <div className="v">
                    <div className="inv-launch-assignment-summary">
                      <strong>{magasinierIds.length} magasinier(s)</strong>
                      {selectedMagasiniers.length ? (
                        <div className="inv-launch-assignment-list">
                          {selectedMagasiniers.slice(0, 4).map((name) => (
                            <span className="inv-launch-assignment-chip" key={name}>{name}</span>
                          ))}
                          {selectedMagasiniers.length > 4 ? (
                            <span className="inv-launch-assignment-more">+{selectedMagasiniers.length - 4}</span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="inv-launch-assignment-empty">Aucun magasinier selectionne</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="inv-launch-side-note">
                  Statut initial après lancement: <span className="inv-status-badge a_faire">A_FAIRE</span>
                </div>
              </aside>
            </div>
          </main>
        </div>
      </div>
    </ProtectedPage>
  );
};

export default LancerInventaireResp;