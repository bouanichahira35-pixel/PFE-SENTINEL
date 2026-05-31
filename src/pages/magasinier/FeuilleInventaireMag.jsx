import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, CheckCircle2, RefreshCw, Save, ShieldCheck, XCircle } from 'lucide-react';
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
  const product = inv.product_id?.name
    ? `Produit: ${inv.product_id.code_product || ''} ${inv.product_id.name}`.trim()
    : '';
  const fam = inv.famille_id ? `Famille: ${inv.famille_id}` : '';
  const cat = inv.categorie_id?.name ? `Catégorie: ${inv.categorie_id.name}` : '';
  return [product, fam, cat].filter(Boolean).join(' | ') || 'Périmètre ciblé';
}

function canEditInventory(status) {
  return ['EN_COURS', 'A_RECOMPTER', 'A_FAIRE'].includes(String(status || ''));
}

function displayInventoryStatus(status) {
  const s = String(status || '');
  if (s === 'A_FAIRE') return 'PLANIFIE';
  if (s === 'A_RECOMPTER') return 'RECOMPTAGE_DEMANDE';
  if (s === 'VALIDE') return 'CLOTURE';
  if (s === 'REJETE') return 'CLOTURE';
  return s || '-';
}

function lineStatusLabel(line) {
  if (!line) return '-';
  if (line.requires_recount) return 'Recomptage';
  if (!line.is_counted) return 'À compter';
  if (line.is_verified_by_magasinier) return 'Vérifiée';
  return 'Comptée';
}

const FILTERS = [
  { key: 'all', label: 'Tous' },
  { key: 'to_count', label: 'À compter' },
  { key: 'counted', label: 'Comptés' },
  { key: 'recount', label: 'Recomptage' },
];

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
  const [filter, setFilter] = useState('to_count');
  const [scanInput, setScanInput] = useState('');
  const [showScanner, setShowScanner] = useState(false);

  const [editing, setEditing] = useState(() => new Map());

  const loadSheet = useCallback(async () => {
    if (!inventoryId) return;
    setIsLoading(true);
    try {
      const payload = await get(`/inventory/magasinier/inventories/${inventoryId}`);
      setInventory(payload?.inventory || null);
      setProgress(payload?.progress || { total: 0, counted: 0, pct: 0 });
      setLines(Array.isArray(payload?.lines) ? payload.lines : []);
      setEditing(new Map());
    } catch (err) {
      toast.error(err.message || 'Erreur chargement inventaire');
    } finally {
      setIsLoading(false);
    }
  }, [inventoryId, toast]);

  useEffect(() => {
    loadSheet();
  }, [loadSheet]);

  const readonly = useMemo(() => !canEditInventory(inventory?.status), [inventory?.status]);

  const filteredLines = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    let base = Array.isArray(lines) ? lines : [];

    if (filter === 'to_count') base = base.filter((l) => !l.is_counted);
    if (filter === 'counted') base = base.filter((l) => Boolean(l.is_counted));
    if (filter === 'recount') base = base.filter((l) => Boolean(l.requires_recount));

    if (!q) return base;
    return base.filter((l) => {
      const code = String(l.product?.code_product || '').toLowerCase();
      const name = String(l.product?.name || '').toLowerCase();
      const emp = String(l.product?.emplacement || '').toLowerCase();
      const lot = String(l.lot || '').toLowerCase();
      return code.includes(q) || name.includes(q) || emp.includes(q) || lot.includes(q);
    });
  }, [filter, lines, query]);

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

  const saveDraft = async () => {
    setIsLoading(true);
    try {
      await post(`/inventory/magasinier/inventories/${inventoryId}/save-progress`, {});
      toast.success('Brouillon sauvegardé');
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
      const msg = err.message || 'Erreur soumission';
      if (String(msg).toLowerCase().includes('non modifiable')) toast.error('Inventaire déjà clôturé');
      else toast.error(msg);
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
    const qtyRaw = draft.quantite_comptee ?? line.quantite_comptee ?? '';
    const obsRaw = draft.observation_magasinier ?? line.observation_magasinier ?? '';

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
    if (String(inventory?.status) === 'A_RECOMPTER' && Boolean(line.requires_recount) && !obs) {
      toast.error('Observation obligatoire pendant un recomptage');
      return;
    }

    setIsLoading(true);
    try {
      await patch(`/inventory/magasinier/inventories/${inventoryId}/lines/${lineId}`, {
        quantite_comptee: counted,
        observation_magasinier: obs,
      });
      toast.success('Ligne enregistrée');
      await loadSheet();
    } catch (err) {
      toast.error(err.message || 'Erreur enregistrement ligne');
    } finally {
      setIsLoading(false);
    }
  };

  const markVerified = async (line) => {
    if (readonly) return;
    const lineId = String(line?._id || '');
    if (!lineId) return;
    if (line.quantite_comptee === null || line.quantite_comptee === undefined) {
      toast.error('Enregistrez une quantité avant de vérifier');
      return;
    }
    setIsLoading(true);
    try {
      await post(`/inventory/magasinier/inventories/${inventoryId}/lines/${lineId}/verify`, { verified: true });
      toast.success('Ligne marquée comme vérifiée');
      setLines((prev) => prev.map((l) => (String(l._id) === lineId ? { ...l, is_verified_by_magasinier: true } : l)));
    } catch (err) {
      toast.error(err.message || 'Erreur vérification');
    } finally {
      setIsLoading(false);
    }
  };

  const onDetected = async (value) => {
    const scanned = String(value || '').trim();
    if (!scanned) return;
    setQuery(scanned);
    toast.success('Code détecté');
  };

  const onManualScan = () => {
    const v = String(scanInput || '').trim();
    if (!v) return;
    onDetected(v);
    setScanInput('');
  };

  const canSubmit = ['EN_COURS', 'A_RECOMPTER'].includes(String(inventory?.status || ''));
  const canSaveDraft = ['EN_COURS', 'A_RECOMPTER'].includes(String(inventory?.status || ''));

  return (
    <div className="app-layout">
      <div className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`} onClick={() => setSidebarCollapsed(true)} />
      <SidebarMag collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} onLogout={onLogout} userName={userName} />

      <div className="main-container">
        <HeaderPage userName={userName} title="Comptage inventaire" showSearch={false} onMenuClick={() => setSidebarCollapsed((p) => !p)} />
        <main className="main-content">
          {isLoading && <LoadingSpinner overlay text="Traitement..." />}

          <div className="inv-sheet-head">
            <div className="inv-sheet-title">
              <h2>{inventory?.reference || 'Inventaire'}</h2>
              <div className="inv-sheet-sub">
                <span className={`inv-pill ${String(inventory?.status || '').toLowerCase()}`}>{displayInventoryStatus(inventory?.status)}</span>
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
                  <CheckCircle2 size={16} /> Démarrer
                </button>
              ) : null}
            </div>
          </div>

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
              <div className="inv-search">
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher produit (code, nom, emplacement, lot)..." />
              </div>
              <button className="inv-btn" type="button" onClick={() => setShowScanner(true)} disabled={isLoading}>
                <Camera size={16} /> Scanner QR / Code
              </button>
            </div>

            <div className="inv-scan-manual">
              <input
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onManualScan();
                }}
                placeholder="Coller un code produit puis Entrée…"
                disabled={isLoading}
              />
              <button className="inv-btn" type="button" onClick={onManualScan} disabled={isLoading || !String(scanInput || '').trim()}>
                Appliquer
              </button>
            </div>

            {showScanner ? (
              <div className="inv-scanner-wrap">
                <InlineQrScanner onDetected={onDetected} onClose={() => setShowScanner(false)} />
              </div>
            ) : null}

            <div className="inv-filters">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={`inv-filter ${filter === f.key ? 'active' : ''}`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
              <div className="inv-filter-spacer" />
              {readonly ? (
                <div className="inv-readonly-hint">Lecture seule : inventaire soumis / clôturé.</div>
              ) : (
                <div className="inv-readonly-hint">Astuce : enregistrez les lignes au fur et à mesure.</div>
              )}
            </div>

            <div className="inv-table-wrap">
              <table className="inv-table inv-table-sheet">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Code</th>
                    <th>Lot</th>
                    <th>Qté comptée</th>
                    <th>Statut</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLines.map((l) => {
                    const lineId = String(l._id);
                    const draft = editing.get(lineId) || {};
                    const qtyValue = draft.quantite_comptee !== undefined ? draft.quantite_comptee : (l.quantite_comptee ?? '');
                    const obsValue = draft.observation_magasinier !== undefined ? draft.observation_magasinier : (l.observation_magasinier ?? '');
                    // Important: keep the counting sheet blind to system audit values.
                    return (
                      <tr key={l._id}>
                        <td className="cell-product">
                          <div className="p-name">{l.product?.name || 'Produit'}</div>
                          <div className="p-sub">{l.product?.emplacement || '-'}</div>
                          {String(inventory?.status) === 'A_RECOMPTER' && l.requires_recount && l.motif_recompte ? (
                            <div className="p-recount">Motif: {l.motif_recompte}</div>
                          ) : null}
                          <div className="p-obs">
                            <input
                              value={obsValue}
                              onChange={(e) => setLineDraft(lineId, { observation_magasinier: e.target.value })}
                              placeholder="Observation courte…"
                              disabled={readonly}
                            />
                          </div>
                        </td>
                        <td><strong>{l.product?.code_product || '-'}</strong></td>
                        <td>{l.lot || '-'}</td>
                        <td className="cell-qty">
                          <input
                            type="number"
                            min="0"
                            value={qtyValue}
                            onChange={(e) => setLineDraft(lineId, { quantite_comptee: e.target.value })}
                            disabled={readonly}
                          />
                        </td>
                        <td>
                          <span className={`line-pill ${l.requires_recount ? 'recount' : !l.is_counted ? 'todo' : l.is_verified_by_magasinier ? 'verified' : 'counted'}`}>
                            {lineStatusLabel(l)}
                          </span>
                        </td>
                        <td className="cell-actions">
                          <button className="inv-btn primary" type="button" onClick={() => saveLine(l)} disabled={readonly || isLoading}>
                            <Save size={16} /> Enregistrer
                          </button>
                          <button className="inv-btn" type="button" onClick={() => markVerified(l)} disabled={readonly || isLoading}>
                            <ShieldCheck size={16} /> Vérifier
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!filteredLines.length && (
                    <tr>
                      <td colSpan={6}>
                        <div className="inv-empty">Aucune ligne.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="inv-sheet-footer">
              <button className="inv-btn" type="button" onClick={saveDraft} disabled={readonly || isLoading || !canSaveDraft}>
                <Save size={16} /> Enregistrer brouillon
              </button>
              <button className="inv-btn primary" type="button" onClick={submitInventory} disabled={readonly || isLoading || !canSubmit}>
                <CheckCircle2 size={16} /> Soumettre au responsable
              </button>
              <button className="inv-btn" type="button" onClick={() => navigate('/magasinier/inventaire')} disabled={isLoading}>
                <XCircle size={16} /> Fermer
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default FeuilleInventaireMag;
