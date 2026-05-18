import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, CheckCircle2, RefreshCw, Camera, Plus, Info, RotateCcw } from 'lucide-react';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import InlineQrScanner from '../../components/shared/InlineQrScanner';
import { useToast } from '../../components/shared/Toast';
import { get, patch, post } from '../../services/api';
import './FeuilleInventaireMag.css';

function formatDateTime(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '-';
  }
}

function perimeterLabel(inv) {
  if (!inv) return '-';
  if (String(inv.type_inventaire) === 'GLOBAL') return 'Tous les articles';
  const zone = inv.zone_id?.name ? `Zone: ${inv.zone_id.name}` : '';
  const fam = inv.famille_id ? `Famille: ${inv.famille_id}` : '';
  const cat = inv.categorie_id?.name ? `Catégorie: ${inv.categorie_id.name}` : '';
  return [zone, fam, cat].filter(Boolean).join(' | ') || 'Périmètre ciblé';
}

function canEditInventory(status) {
  return ['EN_COURS', 'A_RECOMPTER', 'A_FAIRE'].includes(String(status || ''));
}

const FeuilleInventaireMag = ({ userName, onLogout }) => {
  const toast = useToast();
  const navigate = useNavigate();
  const params = useParams();
  const inventoryId = String(params.id || '');

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);
  const [inventory, setInventory] = useState(null);
  const [progress, setProgress] = useState({ total: 0, counted: 0, pct: 0 });
  const [lines, setLines] = useState([]);
  const [query, setQuery] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [recountOnly, setRecountOnly] = useState(true);

  const [editing, setEditing] = useState(() => new Map());

  const [products, setProducts] = useState([]);
  const [addProductId, setAddProductId] = useState('');
  const [addQty, setAddQty] = useState('0');
  const [addObs, setAddObs] = useState('');

  const loadSheet = useCallback(async () => {
    if (!inventoryId) return;
    setIsLoading(true);
    try {
      const payload = await get(`/inventory/magasinier/inventories/${inventoryId}`);
      setInventory(payload?.inventory || null);
      setProgress(payload?.progress || { total: 0, counted: 0, pct: 0 });
      setLines(Array.isArray(payload?.lines) ? payload.lines : []);
      setEditing(new Map());
      const status = String(payload?.inventory?.status || '');
      setRecountOnly(status === 'A_RECOMPTER');
    } catch (err) {
      toast.error(err.message || 'Erreur chargement inventaire');
    } finally {
      setIsLoading(false);
    }
  }, [inventoryId, toast]);

  const loadProducts = useCallback(async () => {
    try {
      const items = await get('/products');
      const normalized = (items || []).map((p) => ({
        _id: p._id,
        code_product: p.code_product || '-',
        name: p.name || 'Produit',
        emplacement: p.emplacement || '',
        qr_code_value: p.qr_code_value || '',
      }));
      normalized.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      setProducts(normalized);
    } catch {
      setProducts([]);
    }
  }, []);

  useEffect(() => {
    loadSheet();
  }, [loadSheet]);

  useEffect(() => {
    if (String(inventory?.type_inventaire) === 'GLOBAL') loadProducts();
  }, [inventory?.type_inventaire, loadProducts]);

  const filteredLines = useMemo(() => {
    const status = String(inventory?.status || '');
    const hasRecountTargets = (lines || []).some((l) => Boolean(l.requires_recount));
    let base = lines;
    if (status === 'A_RECOMPTER' && recountOnly && hasRecountTargets) {
      base = lines.filter((l) => Boolean(l.requires_recount));
    }

    const q = String(query || '').trim().toLowerCase();
    if (!q) return base;
    return base.filter((l) => {
      const code = String(l.product?.code_product || '').toLowerCase();
      const name = String(l.product?.name || '').toLowerCase();
      const emp = String(l.product?.emplacement || '').toLowerCase();
      return code.includes(q) || name.includes(q) || emp.includes(q);
    });
  }, [inventory?.status, lines, query, recountOnly]);

  const readonly = useMemo(() => !canEditInventory(inventory?.status), [inventory?.status]);
  const showRecountBanner = String(inventory?.status) === 'A_RECOMPTER';

  const startInventory = async () => {
    if (!inventoryId) return;
    setIsLoading(true);
    try {
      await post(`/inventory/magasinier/inventories/${inventoryId}/start`, {});
      toast.success('Inventaire démarré');
      await loadSheet();
    } catch (err) {
      toast.error(err.message || 'Impossible de démarrer');
    } finally {
      setIsLoading(false);
    }
  };

  const saveProgress = async () => {
    setIsLoading(true);
    try {
      await post(`/inventory/magasinier/inventories/${inventoryId}/save-progress`, {});
      toast.success('Progression sauvegardée');
    } catch (err) {
      toast.error(err.message || 'Erreur sauvegarde');
    } finally {
      setIsLoading(false);
    }
  };

  const submitInventory = async () => {
    const confirmed = window.confirm("Soumettre l'inventaire au responsable ? Après soumission vous ne pourrez plus modifier.");
    if (!confirmed) return;
    setIsLoading(true);
    try {
      await post(`/inventory/magasinier/inventories/${inventoryId}/submit`, {});
      toast.success('Inventaire soumis au responsable');
      await loadSheet();
    } catch (err) {
      toast.error(err.message || 'Erreur soumission');
    } finally {
      setIsLoading(false);
    }
  };

  const setLineDraft = (lineId, patchDraft) => {
    setEditing((prev) => {
      const next = new Map(prev);
      const current = next.get(lineId) || {};
      next.set(lineId, { ...current, ...patchDraft });
      return next;
    });
  };

  const saveLine = async (line) => {
    if (readonly) return;
    const lineId = String(line?._id || '');
    if (!lineId) return;

    const draft = editing.get(lineId) || {};
    const qtyRaw = draft.quantite_comptee;
    const obsRaw = draft.observation_magasinier;

    const qty = Number(qtyRaw);
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error('Quantité invalide');
      return;
    }
    const counted = Math.floor(qty);
    const obs = String(obsRaw || '').trim();
    if (counted === 0 && !obs) {
      toast.error('Observation obligatoire si quantité = 0');
      return;
    }

    setIsLoading(true);
    try {
      await patch(`/inventory/magasinier/inventories/${inventoryId}/lines/${lineId}`, {
        quantite_comptee: counted,
        observation_magasinier: obs,
      });
      toast.success('Votre comptage est enregistré.');
      await loadSheet();
    } catch (err) {
      toast.error(err.message || 'Erreur enregistrement ligne');
    } finally {
      setIsLoading(false);
    }
  };

  const onDetected = async (value) => {
    const scanned = String(value || '').trim();
    if (!scanned) return;

    // Prefer matching existing lines (code or QR).
    const foundLine = lines.find((l) => String(l.product?.qr_code_value || '') === scanned || String(l.product?.code_product || '') === scanned);
    if (foundLine) {
      setQuery(String(foundLine.product?.code_product || scanned));
      toast.success('Produit trouvé dans la feuille');
      return;
    }

    // GLOBAL only: allow adding found article by scanning product list.
    if (String(inventory?.type_inventaire) === 'GLOBAL') {
      const p = products.find((x) => String(x.qr_code_value || '') === scanned || String(x.code_product || '') === scanned);
      if (p?._id) {
        setAddProductId(String(p._id));
        toast.success('Produit sélectionné pour ajout');
        return;
      }
    }

    setQuery(scanned);
    toast.error('Produit non reconnu. Utilisez la recherche.');
  };

  const addFoundArticle = async () => {
    if (readonly) return;
    if (String(inventory?.type_inventaire) !== 'GLOBAL') return;
    if (!addProductId) {
      toast.error('Choisissez un produit');
      return;
    }
    const qty = Number(addQty);
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error('Quantité invalide');
      return;
    }
    const obs = String(addObs || '').trim();
    if (!obs) {
      toast.error('Observation obligatoire');
      return;
    }
    setIsLoading(true);
    try {
      await post(`/inventory/magasinier/inventories/${inventoryId}/add-found`, {
        product_id: addProductId,
        quantite_comptee: Math.floor(qty),
        observation_magasinier: obs,
      });
      toast.success('Article ajouté');
      setAddProductId('');
      setAddQty('0');
      setAddObs('');
      await loadSheet();
    } catch (err) {
      toast.error(err.message || 'Erreur ajout article');
    } finally {
      setIsLoading(false);
    }
  };

  const topMotifs = useMemo(() => {
    if (!showRecountBanner) return [];
    const motifs = (lines || [])
      .map((l) => String(l.motif_recompte || '').trim())
      .filter(Boolean)
      .slice(0, 5);
    return motifs;
  }, [lines, showRecountBanner]);

  return (
    <div className="app-layout">
      <div className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`} onClick={() => setSidebarCollapsed(true)} />
      <SidebarMag collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} onLogout={onLogout} userName={userName} />

      <div className="main-container">
        <HeaderPage userName={userName} title="Feuille de comptage" showSearch={false} onMenuClick={() => setSidebarCollapsed((p) => !p)} />
        <main className="main-content">
          {isLoading && <LoadingSpinner overlay text="Traitement..." />}

          <div className="inv-sheet-head">
            <div className="inv-sheet-title">
              <h2>{inventory?.reference || 'Inventaire'}</h2>
              <div className="inv-sheet-sub">
                <span className={`inv-pill ${String(inventory?.status || '').toLowerCase()}`}>{inventory?.status || '-'}</span>
                <span className="inv-sheet-meta">Type: <strong>{inventory?.type_inventaire || '-'}</strong></span>
                <span className="inv-sheet-meta">Magasin: <strong>{inventory?.magasin_id?.name || '-'}</strong></span>
                <span className="inv-sheet-meta">Périmètre: <strong>{perimeterLabel(inventory)}</strong></span>
                <span className="inv-sheet-meta">Prévu: <strong>{formatDateTime(inventory?.date_prevue)}</strong></span>
              </div>
            </div>

            <div className="inv-sheet-actions">
              <button className="inv-btn" type="button" onClick={() => navigate('/magasinier/inventaire')}>
                <ArrowLeft size={16} /> Retour
              </button>
              <button className="inv-btn" type="button" onClick={loadSheet} disabled={isLoading}>
                <RefreshCw size={16} /> Actualiser
              </button>
              {String(inventory?.status) === 'A_FAIRE' ? (
                <button className="inv-btn primary" type="button" onClick={startInventory} disabled={isLoading}>
                  <CheckCircle2 size={16} /> Commencer
                </button>
              ) : null}
            </div>
          </div>

          {showRecountBanner ? (
            <div className="inv-recount-banner">
              <RotateCcw size={18} />
              <div>
                <strong>À recompter</strong>
                <div>Le responsable a demandé un recomptage. Recomptez puis soumettez à nouveau.</div>
                {topMotifs.length ? (
                  <div className="inv-recount-motifs">
                    <Info size={14} /> Motif(s): {topMotifs.join(' | ')}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="inv-sheet-progress">
            <div className="inv-progress-top">
              <span>Progression</span>
              <span><strong>{progress.counted}</strong>/{progress.total} ({progress.pct}%)</span>
            </div>
            <div className="inv-progress-bar">
              <div className="inv-progress-fill" style={{ width: `${Math.min(100, Math.max(0, progress.pct))}%` }} />
            </div>
          </div>

          <section className="inv-sheet-card">
            <div className="inv-sheet-toolbar">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher (référence, désignation, emplacement)..." />
              <button className="inv-btn" type="button" onClick={() => setShowScanner(true)} disabled={isLoading}>
                <Camera size={16} /> Scanner produit
              </button>
            </div>

            {showRecountBanner ? (
              <label className="inv-recount-toggle">
                <input type="checkbox" checked={recountOnly} onChange={(e) => setRecountOnly(e.target.checked)} />
                Afficher seulement les lignes demandées (si motif présent)
              </label>
            ) : null}

            {showScanner ? (
              <div className="inv-scanner-wrap">
                <InlineQrScanner onDetected={onDetected} onClose={() => setShowScanner(false)} />
              </div>
            ) : null}

            {String(inventory?.type_inventaire) === 'GLOBAL' ? (
              <div className="inv-add-found">
                <div className="inv-add-found-title">
                  <Plus size={16} />
                  <strong>Ajouter article trouvé</strong>
                </div>
                <div className="inv-add-found-grid">
                  <select value={addProductId} onChange={(e) => setAddProductId(e.target.value)} disabled={readonly}>
                    <option value="">Choisir un produit</option>
                    {products.slice(0, 400).map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name} ({p.code_product}) {p.emplacement ? `— ${p.emplacement}` : ''}
                      </option>
                    ))}
                  </select>
                  <input type="number" min="0" value={addQty} onChange={(e) => setAddQty(e.target.value)} disabled={readonly} />
                  <input value={addObs} onChange={(e) => setAddObs(e.target.value)} placeholder="Observation obligatoire (ex: trouvé hors zone prévue)" disabled={readonly} />
                  <button className="inv-btn primary" type="button" onClick={addFoundArticle} disabled={readonly || isLoading}>
                    <Plus size={16} /> Ajouter
                  </button>
                </div>
              </div>
            ) : null}

            <div className="inv-lines">
              {filteredLines.map((l) => {
                const lineId = String(l._id);
                const draft = editing.get(lineId) || {};
                const qtyValue = draft.quantite_comptee !== undefined ? draft.quantite_comptee : (l.quantite_comptee ?? '');
                const obsValue = draft.observation_magasinier !== undefined ? draft.observation_magasinier : (l.observation_magasinier ?? '');
                const isCounted = Boolean(l.is_counted);
                return (
                  <div key={l._id} className={`inv-line ${isCounted ? 'counted' : 'pending'}`}>
                    <div className="inv-line-main">
                      <div className="inv-line-title">
                        <strong>{l.product?.name || 'Produit'}</strong>
                        <span className="inv-code">{l.product?.code_product || '-'}</span>
                      </div>
                      <span className={`inv-line-badge ${isCounted ? 'ok' : 'todo'}`}>{isCounted ? 'Compté' : 'Non compté'}</span>
                    </div>
                    <div className="inv-line-sub">
                      Emplacement: <strong>{l.product?.emplacement || '-'}</strong>
                    </div>

                    <div className="inv-line-form">
                      <div className="inv-line-field">
                        <label>Quantité comptée</label>
                        <input
                          type="number"
                          min="0"
                          value={qtyValue}
                          onChange={(e) => setLineDraft(lineId, { quantite_comptee: e.target.value })}
                          disabled={readonly}
                        />
                      </div>
                      <div className="inv-line-field">
                        <label>Observation</label>
                        <input
                          value={obsValue}
                          onChange={(e) => setLineDraft(lineId, { observation_magasinier: e.target.value })}
                          placeholder={Number(qtyValue) === 0 ? 'Obligatoire si quantité = 0 (ex: introuvable)' : 'Optionnel'}
                          disabled={readonly}
                        />
                      </div>
                      <button className="inv-btn primary" type="button" onClick={() => saveLine(l)} disabled={readonly || isLoading}>
                        <Save size={16} /> Enregistrer ligne
                      </button>
                    </div>
                  </div>
                );
              })}

              {!filteredLines.length && <div className="inv-empty">Aucune ligne.</div>}
            </div>

            <div className="inv-sheet-footer">
              <button className="inv-btn" type="button" onClick={saveProgress} disabled={readonly || isLoading || String(inventory?.status) !== 'EN_COURS'}>
                <Save size={16} /> Sauvegarder progression
              </button>
              <button className="inv-btn primary" type="button" onClick={submitInventory} disabled={readonly || isLoading || !['EN_COURS', 'A_RECOMPTER'].includes(String(inventory?.status || ''))}>
                <CheckCircle2 size={16} /> Terminer / Soumettre
              </button>
              {readonly ? <div className="inv-readonly-hint">Vous ne pouvez plus modifier cet inventaire après soumission.</div> : null}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default FeuilleInventaireMag;
