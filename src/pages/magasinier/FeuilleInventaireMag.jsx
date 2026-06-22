// BLOC 1 - Role du fichier.
// Ce fichier affiche une page de l'espace magasinier pour FeuilleInventaireMag.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

/**
 * SENTINEL – Feuille de comptage inventaire (Magasinier)
 *
 * Fidèle au rapport Sprint 3 :
 *   Lancer inventaire → Réaliser inventaire → Prendre décision
 *
 * Règles métier :
 *   - Comptage aveugle (quantité théorique masquée)
 *   - Calcul écart automatique après saisie
 *   - Observation obligatoire si qty = 0 ou recomptage
 *   - Soumission bloquée si lignes non comptées
 *   - Recomptage : motif affiché, obs obligatoire
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Camera, CheckCircle2, RefreshCw,
  Save, ShieldCheck, XCircle, Search,
  ClipboardList, CheckCheck, AlertTriangle,
  RotateCcw, SendHorizonal, MapPin, Package,
  TrendingDown
} from 'lucide-react';
import SidebarMag      from '../../components/magasinier/SidebarMag';
import HeaderPage      from '../../components/shared/HeaderPage';
import LoadingSpinner  from '../../components/shared/LoadingSpinner';
import InlineQrScanner from '../../components/shared/InlineQrScanner';
import { useToast }    from '../../components/shared/Toast';
import { get, patch, post } from '../../services/api';
import './FeuilleInventaireMag.css';

/* ═══════════════════════════════════════
   Helpers
═══════════════════════════════════════ */
function fmtDate(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}

function perimeterLabel(inv) {
  if (!inv) return '—';
  if (String(inv.type_inventaire) === 'GLOBAL') return 'Tous les articles';
  const parts = [
    inv.product_id?.name ? `Produit : ${inv.product_id.code_product || ''} ${inv.product_id.name}`.trim() : '',
    inv.famille_id       ? `Famille : ${inv.famille_id}` : '',
    inv.categorie_id?.name ? `Catégorie : ${inv.categorie_id.name}` : '',
  ].filter(Boolean);
  return parts.join(' · ') || 'Périmètre ciblé';
}

function canEdit(status) {
  return ['EN_COURS', 'A_RECOMPTER', 'A_FAIRE'].includes(String(status || ''));
}

function displayStatus(status) {
  const s = String(status || '');
  if (s === 'A_FAIRE')     return 'Planifié';
  if (s === 'EN_COURS')    return 'En cours';
  if (s === 'A_VALIDER')   return 'À valider';
  if (s === 'A_RECOMPTER') return 'Recomptage';
  if (s === 'VALIDE')      return 'Clôturé ✓';
  if (s === 'REJETE')      return 'Rejeté';
  return s || '—';
}

function pillClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'a_faire')     return 'a_faire';
  if (s === 'en_cours')    return 'en_cours';
  if (s === 'a_valider')   return 'a_valider';
  if (s === 'a_recompter') return 'a_recompter';
  if (s === 'valide')      return 'valide';
  if (s === 'rejete')      return 'rejete';
  return '';
}

function lineChipInfo(line) {
  if (line.requires_recount)              return { label: 'Recomptage',  cls: 'recount'  };
  if (!line.is_counted)                   return { label: 'À compter',   cls: 'todo'     };
  if (line.is_verified_by_magasinier)     return { label: 'Vérifiée',    cls: 'verified' };
  return                                         { label: 'Comptée',     cls: 'counted'  };
}

function ecartInfo(line, draftQty) {
  const counted = draftQty !== undefined && draftQty !== ''
    ? Number(draftQty)
    : line.quantite_comptee;
  if (counted === null || counted === undefined || isNaN(counted)) return null;
  const theo = Number(line.quantite_theorique ?? 0);
  const diff = counted - theo;
  if (diff === 0) return { label: '±0', cls: 'zero' };
  return { label: diff > 0 ? `+${diff}` : `${diff}`, cls: diff > 0 ? 'pos' : 'neg' };
}

const FILTERS = [
  { key: 'all',      label: 'Tous'       },
  { key: 'to_count', label: 'À compter'  },
  { key: 'counted',  label: 'Comptés'    },
  { key: 'recount',  label: 'Recomptage' },
  { key: 'verified', label: 'Vérifiés'   },
];

/* ═══════════════════════════════════════
   Component
═══════════════════════════════════════ */
const FeuilleInventaireMag = ({ userName, onLogout }) => {
  const toast     = useToast();
  const navigate  = useNavigate();
  const { id: inventoryId } = useParams();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 768
  );

  /* data */
  const [isLoading,  setIsLoading]  = useState(false);
  const [inventory,  setInventory]  = useState(null);
  const [progress,   setProgress]   = useState({ total: 0, counted: 0, verified: 0, recount: 0, pct: 0 });
  const [lines,      setLines]      = useState([]);

  /* filters / search */
  const [query,      setQuery]      = useState('');
  const [filter,     setFilter]     = useState('to_count');
  const [scanInput,  setScanInput]  = useState('');
  const [showScan,   setShowScan]   = useState(false);

  /* per-line draft edits  { lineId -> { quantite_comptee, observation } } */
  const [drafts, setDrafts] = useState(() => new Map());

  /* submit confirm modal */
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  /* ── Load ────────────────────────────────────────────────── */
  const loadSheet = useCallback(async () => {
    if (!inventoryId) return;
    setIsLoading(true);
    try {
      const data = await get(`/inventory/magasinier/inventories/${inventoryId}`);
      setInventory(data?.inventory || null);
      const raw = data?.progress || {};
      setProgress({
        total:    raw.total    ?? 0,
        counted:  raw.counted  ?? 0,
        verified: raw.verified ?? 0,
        recount:  raw.recount  ?? 0,
        pct:      raw.pct      ?? 0,
      });
      setLines(Array.isArray(data?.lines) ? data.lines : []);
      setDrafts(new Map());
    } catch (e) {
      toast.error(e.message || 'Erreur chargement inventaire');
    } finally {
      setIsLoading(false);
    }
  }, [inventoryId, toast]);

  useEffect(() => { loadSheet(); }, [loadSheet]);

  const readonly = useMemo(() => !canEdit(inventory?.status), [inventory?.status]);

  /* ── Derived lists ───────────────────────────────────────── */
  const filteredLines = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    let base = lines;

    if (filter === 'to_count')  base = base.filter(l => !l.is_counted && !l.requires_recount);
    if (filter === 'counted')   base = base.filter(l => l.is_counted);
    if (filter === 'recount')   base = base.filter(l => l.requires_recount);
    if (filter === 'verified')  base = base.filter(l => l.is_verified_by_magasinier);

    if (!q) return base;
    return base.filter(l => [
      l.product?.code_product, l.product?.name,
      l.product?.emplacement, l.lot,
    ].filter(Boolean).some(x => String(x).toLowerCase().includes(q)));
  }, [filter, lines, query]);

  /* tab counts */
  const tabCounts = useMemo(() => ({
    all:      lines.length,
    to_count: lines.filter(l => !l.is_counted && !l.requires_recount).length,
    counted:  lines.filter(l => l.is_counted).length,
    recount:  lines.filter(l => l.requires_recount).length,
    verified: lines.filter(l => l.is_verified_by_magasinier).length,
  }), [lines]);

  /* uncounted count for submit warning */
  const uncountedCount = useMemo(() =>
    lines.filter(l => !l.is_counted).length, [lines]);

  /* ── Draft helpers ───────────────────────────────────────── */
  const setDraft = (lineId, patch) => {
    setDrafts(prev => {
      const next = new Map(prev);
      next.set(lineId, { ...(next.get(lineId) || {}), ...patch });
      return next;
    });
  };

  /* ── Actions ─────────────────────────────────────────────── */
  const startInventory = async () => {
    setIsLoading(true);
    try {
      await post(`/inventory/magasinier/inventories/${inventoryId}/start`, {});
      toast.success('Inventaire démarré ✓');
      await loadSheet();
    } catch (e) {
      toast.error(e.message || 'Impossible de démarrer');
    } finally { setIsLoading(false); }
  };

  const saveDraft = async () => {
    setIsLoading(true);
    try {
      await post(`/inventory/magasinier/inventories/${inventoryId}/save-progress`, {});
      toast.success('Progression sauvegardée ✓');
    } catch (e) {
      toast.error(e.message || 'Erreur sauvegarde');
    } finally { setIsLoading(false); }
  };

  const submitInventory = async () => {
    setShowSubmitModal(false);
    setIsLoading(true);
    try {
      await post(`/inventory/magasinier/inventories/${inventoryId}/submit`, {});
      toast.success('Inventaire soumis au responsable ✓');
      await loadSheet();
    } catch (e) {
      const msg = String(e.message || '');
      toast.error(msg.toLowerCase().includes('non modifiable')
        ? 'Inventaire déjà clôturé'
        : msg || 'Erreur soumission');
    } finally { setIsLoading(false); }
  };

  /* Save one line (Sprint 3 : saisir quantités comptées) */
  const saveLine = async (line) => {
    if (readonly) return;
    const lineId = String(line?._id || '');
    if (!lineId) return;
    const draft = drafts.get(lineId) || {};

    const qtyRaw = draft.quantite_comptee !== undefined
      ? draft.quantite_comptee
      : (line.quantite_comptee ?? '');
    const obsRaw = draft.observation_magasinier !== undefined
      ? draft.observation_magasinier
      : (line.observation_magasinier ?? '');

    const qty = Number(qtyRaw);
    if (!Number.isFinite(qty) || qty < 0) { toast.error('Quantité invalide'); return; }
    const counted = Math.floor(qty);
    const obs = String(obsRaw || '').trim();

    if (counted === 0 && !obs) {
      toast.error('Observation obligatoire si quantité = 0'); return;
    }
    if (String(inventory?.status) === 'A_RECOMPTER' && line.requires_recount && !obs) {
      toast.error('Observation obligatoire pour le recomptage'); return;
    }

    setIsLoading(true);
    try {
      await patch(
        `/inventory/magasinier/inventories/${inventoryId}/lines/${lineId}`,
        { quantite_comptee: counted, observation_magasinier: obs }
      );
      toast.success('Ligne enregistrée ✓');
      await loadSheet();
    } catch (e) {
      toast.error(e.message || 'Erreur enregistrement');
    } finally { setIsLoading(false); }
  };

  /* Verify line (magasinier confirms physical check) */
  const verifyLine = async (line) => {
    if (readonly) return;
    const lineId = String(line?._id || '');
    if (!lineId) return;
    if (line.quantite_comptee === null || line.quantite_comptee === undefined) {
      toast.error('Enregistrez une quantité avant de vérifier'); return;
    }
    setIsLoading(true);
    try {
      await post(
        `/inventory/magasinier/inventories/${inventoryId}/lines/${lineId}/verify`,
        { verified: true }
      );
      toast.success('Ligne vérifiée ✓');
      setLines(prev =>
        prev.map(l => String(l._id) === lineId
          ? { ...l, is_verified_by_magasinier: true }
          : l
        )
      );
    } catch (e) {
      toast.error(e.message || 'Erreur vérification');
    } finally { setIsLoading(false); }
  };

  /* QR scan */
  const onDetected = (value) => {
    const v = String(value || '').trim();
    if (!v) return;
    setQuery(v);
    setFilter('all');
    setShowScan(false);
    toast.success(`Code détecté : ${v}`);
  };

  const onManualScan = () => {
    const v = String(scanInput || '').trim();
    if (!v) return;
    onDetected(v);
    setScanInput('');
  };

  /* ── Computed ────────────────────────────────────────────── */
  const canSubmit   = ['EN_COURS', 'A_RECOMPTER'].includes(String(inventory?.status || ''));
  const canSaveDraft = canSubmit;
  const pct = Math.min(100, Math.max(0, progress.pct));
  const progFillCls = pct === 100 ? 'done' : pct >= 50 ? '' : 'warn';

  /* ═══ RENDER ══════════════════════════════════════════════ */
  return (
    <div className="fi-root">
      <div
        className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`}
        onClick={() => setSidebarCollapsed(true)}
      />
      <SidebarMag
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(p => !p)}
        onLogout={onLogout}
        userName={userName}
      />

      <div className="fi-main">
        <HeaderPage
          userName={userName}
          title="Comptage inventaire"
          subtitle="Saisie des quantités physiques constatées"
          showSearch={false}
          onMenuClick={() => setSidebarCollapsed(p => !p)}
          onLogout={onLogout}
        />

        <main className="fi-page">
          {isLoading && <LoadingSpinner overlay text="Traitement…" />}

          {/* ══ Workflow banner (Sprint 3 : 3 étapes) ══ */}
          <div className="fi-wf">
            <div className={`fi-wf-step ${['EN_COURS','A_RECOMPTER','A_VALIDER','VALIDE','REJETE'].includes(inventory?.status) ? 'done' : ''}`}>
              <div className="fi-wf-icon"><ClipboardList size={20} /></div>
              <div className="fi-wf-body">
                <span className="fi-wf-count">1</span>
                <span className="fi-wf-label">Lancer inventaire</span>
                <span className="fi-wf-sub">Responsable</span>
              </div>
            </div>

            <div className={`fi-wf-step ${['EN_COURS','A_RECOMPTER'].includes(inventory?.status) ? 'active' : ['A_VALIDER','VALIDE','REJETE'].includes(inventory?.status) ? 'done' : ''}`}>
              <div className="fi-wf-icon"><Package size={20} /></div>
              <div className="fi-wf-body">
                <span className="fi-wf-count">{progress.counted}</span>
                <span className="fi-wf-label">Réaliser inventaire</span>
                <span className="fi-wf-sub">Magasinier · {progress.counted}/{progress.total} lignes</span>
              </div>
            </div>

            <div className={`fi-wf-step ${['A_VALIDER','VALIDE','REJETE'].includes(inventory?.status) ? 'active' : ''}`}>
              <div className="fi-wf-icon"><CheckCheck size={20} /></div>
              <div className="fi-wf-body">
                <span className="fi-wf-count">{progress.verified ?? 0}</span>
                <span className="fi-wf-label">Prendre décision</span>
                <span className="fi-wf-sub">Responsable · validation écarts</span>
              </div>
            </div>

            {progress.recount > 0 && (
              <div className="fi-wf-step urgent">
                <div className="fi-wf-icon"><RotateCcw size={20} /></div>
                <div className="fi-wf-body">
                  <span className="fi-wf-count">{progress.recount}</span>
                  <span className="fi-wf-label">Recomptage demandé</span>
                  <span className="fi-wf-sub">Lignes à revérifier</span>
                </div>
              </div>
            )}
          </div>

          {/* ══ Page header ══ */}
          <div className="fi-head">
            <div className="fi-head-left">
              <div className="fi-head-title">
                <span className={`fi-pill ${pillClass(inventory?.status)}`}>
                  {displayStatus(inventory?.status)}
                </span>
                {inventory?.reference || 'Inventaire'}
              </div>
              <div className="fi-head-meta">
                <span className="fi-head-chip">
                  Magasin : <strong>{inventory?.magasin_id?.name || '—'}</strong>
                </span>
                <span className="fi-head-chip">·</span>
                <span className="fi-head-chip">
                  Périmètre : <strong>{perimeterLabel(inventory)}</strong>
                </span>
                <span className="fi-head-chip">·</span>
                <span className="fi-head-chip">
                  Prévu : <strong>{fmtDate(inventory?.date_prevue)}</strong>
                </span>
              </div>
            </div>

            <div className="fi-head-actions">
              <button
                className="fi-btn fi-btn-ghost"
                onClick={() => navigate('/magasinier/inventaire')}
              >
                <ArrowLeft size={15} /> Retour
              </button>
              <button
                className="fi-btn fi-btn-ghost"
                onClick={loadSheet}
                disabled={isLoading}
              >
                <span className={isLoading ? 'fi-spin' : ''}><RefreshCw size={15} /></span>
                Actualiser
              </button>
              {String(inventory?.status) === 'A_FAIRE' && (
                <button
                  className="fi-btn fi-btn-primary"
                  onClick={startInventory}
                  disabled={isLoading}
                >
                  <CheckCircle2 size={15} /> Démarrer le comptage
                </button>
              )}
            </div>
          </div>

          {/* ══ Progress ══ */}
          <div className="fi-progress">
            <div className="fi-prog-top">
              <span className="fi-prog-label">
                <TrendingDown size={15} /> Progression du comptage
              </span>
              <div className="fi-prog-stats">
                <div className="fi-prog-stat">
                  <span className={`fi-prog-val ${pct === 100 ? 'green' : ''}`}>{pct}%</span>
                  <span className="fi-prog-sub">Avancement</span>
                </div>
                <div className="fi-prog-stat">
                  <span className="fi-prog-val green">{progress.counted}</span>
                  <span className="fi-prog-sub">Comptés</span>
                </div>
                <div className="fi-prog-stat">
                  <span className="fi-prog-val">{progress.total}</span>
                  <span className="fi-prog-sub">Total</span>
                </div>
                {progress.recount > 0 && (
                  <div className="fi-prog-stat">
                    <span className="fi-prog-val amber">{progress.recount}</span>
                    <span className="fi-prog-sub">Recomptage</span>
                  </div>
                )}
                {progress.verified > 0 && (
                  <div className="fi-prog-stat">
                    <span className="fi-prog-val green">{progress.verified}</span>
                    <span className="fi-prog-sub">Vérifiés</span>
                  </div>
                )}
              </div>
            </div>
            <div className="fi-prog-track">
              <div
                className={`fi-prog-fill ${progFillCls}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* ══ Toolbar ══ */}
          <div className="fi-toolbar">
            {/* Row 1 : search + scan */}
            <div className="fi-toolbar-row">
              <div className="fi-search">
                <Search size={15} />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Rechercher produit (code, nom, emplacement, lot)…"
                />
              </div>

              <div className="fi-scan-row">
                <input
                  className="fi-scan-input"
                  value={scanInput}
                  onChange={e => setScanInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') onManualScan(); }}
                  placeholder="Coller un code produit puis Entrée…"
                  disabled={isLoading}
                />
                <button
                  className="fi-btn fi-btn-ghost"
                  onClick={onManualScan}
                  disabled={isLoading || !String(scanInput).trim()}
                >
                  Appliquer
                </button>
                <button
                  className="fi-btn fi-btn-ghost"
                  onClick={() => setShowScan(v => !v)}
                  disabled={isLoading}
                >
                  <Camera size={15} /> Scanner QR
                </button>
              </div>
            </div>

            {/* Row 2 : filters */}
            <div className="fi-toolbar-row">
              <div className="fi-filters">
                {FILTERS.map(f => (
                  <button
                    key={f.key}
                    className={`fi-filter ${filter === f.key ? 'active' : ''}`}
                    onClick={() => setFilter(f.key)}
                  >
                    {f.label}
                    <span className="fi-filter-badge">{tabCounts[f.key] ?? 0}</span>
                  </button>
                ))}
              </div>
              {readonly && (
                <div className="fi-readonly-banner">
                  <AlertTriangle size={13} /> Lecture seule — inventaire soumis ou clôturé
                </div>
              )}
            </div>
          </div>

          {/* ══ Inline scanner ══ */}
          {showScan && (
            <div className="fi-scanner-box">
              <InlineQrScanner
                onDetected={onDetected}
                onClose={() => setShowScan(false)}
              />
            </div>
          )}

          {/* ══ Table ══ */}
          <div className="fi-table-wrap">
            <table className="fi-table">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Code</th>
                  <th>Lot</th>
                  <th>Emplacement</th>
                  <th>Qté comptée</th>
                  <th>Écart</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLines.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="fi-empty">
                        <div className="fi-empty-icon"><Package size={26} /></div>
                        <span className="fi-empty-title">Aucune ligne</span>
                        <span className="fi-empty-sub">
                          Modifiez le filtre ou la recherche pour afficher d'autres articles.
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : filteredLines.map(line => {
                  const lineId   = String(line._id);
                  const draft    = drafts.get(lineId) || {};
                  const chip     = lineChipInfo(line);
                  const isDone   = line.is_verified_by_magasinier;
                  const isRec    = line.requires_recount;
                  const rowCls   = isRec ? 'fi-row-recount' : isDone ? 'fi-row-done' : '';

                  const qtyVal = draft.quantite_comptee !== undefined
                    ? draft.quantite_comptee
                    : (line.quantite_comptee ?? '');
                  const obsVal = draft.observation_magasinier !== undefined
                    ? draft.observation_magasinier
                    : (line.observation_magasinier ?? '');

                  const ecart    = ecartInfo(line, draft.quantite_comptee);
                  const hasValue = qtyVal !== '' && qtyVal !== null && qtyVal !== undefined;

                  return (
                    <tr key={lineId} className={rowCls}>

                      {/* Produit */}
                      <td className="fi-cell-product">
                        <div className="fi-prod-name">{line.product?.name || 'Produit'}</div>
                        <div className="fi-prod-code">{line.product?.code_product || '—'}</div>

                        {isRec && line.motif_recompte && (
                          <div className="fi-prod-recount-badge">
                            <RotateCcw size={11} /> Motif : {line.motif_recompte}
                          </div>
                        )}

                        {/* Observation */}
                        <div className="fi-prod-obs">
                          <input
                            className="fi-obs-input"
                            value={obsVal}
                            onChange={e => setDraft(lineId, { observation_magasinier: e.target.value })}
                            placeholder={isRec ? 'Observation obligatoire (recomptage)…' : 'Observation courte…'}
                            disabled={readonly}
                            maxLength={400}
                          />
                        </div>
                      </td>

                      {/* Code */}
                      <td>
                        <strong>{line.product?.code_product || '—'}</strong>
                      </td>

                      {/* Lot */}
                      <td>
                        <span style={{ fontSize: '.82rem', color: '#475569' }}>
                          {line.lot || '—'}
                        </span>
                      </td>

                      {/* Emplacement */}
                      <td>
                        <span className="fi-prod-loc">
                          <MapPin size={12} />
                          {line.product?.emplacement || '—'}
                        </span>
                      </td>

                      {/* Quantité comptée */}
                      <td className="fi-cell-qty">
                        <div className="fi-qty-wrap">
                          <input
                            className={`fi-qty-input ${hasValue ? 'has-value' : ''}`}
                            type="number"
                            min="0"
                            value={qtyVal}
                            onChange={e => setDraft(lineId, { quantite_comptee: e.target.value })}
                            disabled={readonly}
                            placeholder="0"
                          />
                        </div>
                      </td>

                      {/* Écart (calculé automatiquement) */}
                      <td>
                        {ecart ? (
                          <span className={`fi-ecart ${ecart.cls}`}>{ecart.label}</span>
                        ) : (
                          <span style={{ color: '#cbd5e1', fontSize: '.78rem' }}>—</span>
                        )}
                      </td>

                      {/* Statut */}
                      <td>
                        <span className={`fi-line-chip ${chip.cls}`}>
                          <span className="fi-line-chip-dot" />
                          {chip.label}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="fi-cell-actions">
                        <div className="fi-action-row">
                          <button
                            className="fi-act-btn fi-act-save"
                            onClick={() => saveLine(line)}
                            disabled={readonly || isLoading}
                          >
                            <Save size={13} /> Enregistrer
                          </button>
                          <button
                            className={`fi-act-btn fi-act-verify ${isDone ? 'done' : ''}`}
                            onClick={() => verifyLine(line)}
                            disabled={readonly || isLoading || isDone}
                            title={isDone ? 'Déjà vérifiée' : 'Marquer comme vérifiée'}
                          >
                            <ShieldCheck size={13} />
                            {isDone ? 'Vérifiée' : 'Vérifier'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ══ Footer ══ */}
          <div className="fi-footer">
            <div className="fi-footer-left">
              <button
                className="fi-btn fi-btn-ghost"
                onClick={() => navigate('/magasinier/inventaire')}
                disabled={isLoading}
              >
                <XCircle size={15} /> Fermer
              </button>
              <button
                className="fi-btn fi-btn-ghost"
                onClick={saveDraft}
                disabled={readonly || isLoading || !canSaveDraft}
              >
                <Save size={15} /> Enregistrer progression
              </button>
            </div>

            <div className="fi-footer-right">
              {uncountedCount > 0 && canSubmit && (
                <span style={{ fontSize: '.8rem', color: '#d97706', fontWeight: 600, display:'flex', alignItems:'center', gap:'.4rem' }}>
                  <AlertTriangle size={14} /> {uncountedCount} ligne{uncountedCount > 1 ? 's' : ''} non comptée{uncountedCount > 1 ? 's' : ''}
                </span>
              )}
              <button
                className="fi-btn fi-btn-success"
                onClick={() => setShowSubmitModal(true)}
                disabled={readonly || isLoading || !canSubmit}
              >
                <SendHorizonal size={15} /> Soumettre au responsable
              </button>
            </div>
          </div>

          {/* ══ Submit confirm modal ══ */}
          {showSubmitModal && (
            <div className="fi-backdrop" role="dialog" aria-modal="true">
              <div className="fi-modal">
                <div className="fi-modal-bar" />
                <div className="fi-modal-body">
                  <div className="fi-modal-icon"><SendHorizonal size={24} /></div>
                  <div className="fi-modal-title">Soumettre l'inventaire ?</div>
                  <div className="fi-modal-sub">
                    L'inventaire sera transmis au responsable pour validation des écarts.
                    Après soumission, vous ne pourrez plus modifier les lignes.
                  </div>

                  <div className="fi-modal-stats">
                    <div className="fi-modal-stat">
                      <span className="fi-modal-stat-val">{progress.counted}</span>
                      <span className="fi-modal-stat-lbl">Lignes comptées</span>
                    </div>
                    <div className="fi-modal-stat">
                      <span className="fi-modal-stat-val">{progress.total - progress.counted}</span>
                      <span className="fi-modal-stat-lbl">Non comptées</span>
                    </div>
                    <div className="fi-modal-stat">
                      <span className="fi-modal-stat-val">{progress.verified ?? 0}</span>
                      <span className="fi-modal-stat-lbl">Vérifiées</span>
                    </div>
                    <div className="fi-modal-stat">
                      <span className="fi-modal-stat-val">{pct}%</span>
                      <span className="fi-modal-stat-lbl">Avancement</span>
                    </div>
                  </div>

                  {uncountedCount > 0 && (
                    <div className="fi-modal-warn">
                      <AlertTriangle size={15} />
                      {uncountedCount} ligne{uncountedCount > 1 ? 's' : ''} non comptée{uncountedCount > 1 ? 's' : ''} — le responsable pourra demander un recomptage.
                    </div>
                  )}
                </div>

                <div className="fi-modal-foot">
                  <button
                    className="fi-btn fi-btn-ghost"
                    onClick={() => setShowSubmitModal(false)}
                    disabled={isLoading}
                  >
                    Annuler
                  </button>
                  <button
                    className="fi-btn fi-btn-success"
                    onClick={submitInventory}
                    disabled={isLoading}
                  >
                    <SendHorizonal size={15} /> Confirmer la soumission
                  </button>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
};

export default FeuilleInventaireMag;
