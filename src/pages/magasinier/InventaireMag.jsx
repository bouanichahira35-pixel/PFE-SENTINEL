// BLOC 1 - Role du fichier.
// Ce fichier affiche une page de l'espace magasinier pour InventaireMag.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

/**
 * SENTINEL – Mes Inventaires (Magasinier)
 *
 * Conforme au rapport Sprint 3 :
 *
 * Cas d'utilisation « Lancer un inventaire »  → Responsable (lecture seule ici)
 * Cas d'utilisation « Réaliser un inventaire » → MAGASINIER :
 *    - Ouvre la session EN_COURS (POST start si A_FAIRE)
 *    - Sélectionne une ligne produit/lot
 *    - Saisit la quantité réellement comptée
 *    - Le système calcule l'écart automatiquement
 *    - Marque la ligne comme "comptée"
 *    - Scanner QR code pour identifier produit/lot
 *    - Clôture le comptage (soumet la session)
 *
 * Cas d'utilisation « Prendre une décision sur l'inventaire » → Responsable
 *
 * Règles métier :
 *   - Quantité saisie ≥ 0 (0 autorisé avec observation obligatoire)
 *   - Écart = quantité réelle - quantité théorique
 *   - Soumission bloquée si lignes non comptées sans motif
 *   - Recomptage : seules les lignes demandées sont re-saisissables
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw, ClipboardCheck, History, Info,
  Play, RotateCcw, ArrowRight, CalendarClock,
  CheckCircle,
  ChevronDown, ChevronUp, Eye
} from 'lucide-react';
import SidebarMag      from '../../components/magasinier/SidebarMag';
import HeaderPage      from '../../components/shared/HeaderPage';
import LoadingSpinner  from '../../components/shared/LoadingSpinner';
import { useToast }    from '../../components/shared/Toast';
import { get, post }   from '../../services/api';
import './InventaireMag.css';

/* ═══════════════════════════════════════
   Pure helpers
═══════════════════════════════════════ */
function fmtDate(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString('fr-FR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
  } catch { return '—'; }
}

function perimeterLabel(inv) {
  if (!inv) return '—';
  if (String(inv.type_inventaire) === 'GLOBAL') return 'Tous les articles';
  const p = inv.product_id?.name
    ? `${inv.product_id.code_product || ''} ${inv.product_id.name}`.trim() : '';
  const f = inv.famille_id   ? `Famille: ${inv.famille_id}` : '';
  const c = inv.categorie_id?.name ? `Catégorie: ${inv.categorie_id.name}` : '';
  return [p, f, c].filter(Boolean).join(' · ') || 'Périmètre ciblé';
}

function typeLabel(inv) {
  if (!inv) return '—';
  if (String(inv.status) === 'A_RECOMPTER') return 'Recomptage';
  return String(inv.type_inventaire) === 'GLOBAL' ? 'Général' : 'Tournant';
}

/** Stage label + tone — from the use-case descriptions in the report */
function stageInfo(inv, progress) {
  const st  = String(inv?.status || '');
  const cnt = Number(progress?.counted ?? 0);
  const tot = Number(progress?.total   ?? 0);

  if (st === 'A_FAIRE')      return { label: 'À démarrer',          tone: 'info' };
  if (st === 'A_RECOMPTER')  return { label: 'Recomptage demandé',  tone: 'crit' };
  if (st === 'A_VALIDER')    return { label: 'Soumis',              tone: 'ready' };
  if (st === 'VALIDE')       return { label: 'Validé',              tone: 'ok' };
  if (st === 'REJETE')       return { label: 'Rejeté',              tone: 'neutral' };
  if (st === 'ANNULE')       return { label: 'Interrompu par responsable', tone: 'neutral' };
  if (st === 'EN_COURS') {
    if (tot > 0 && cnt >= tot) return { label: 'À soumettre',       tone: 'ready' };
    return                       { label: 'En cours',               tone: 'warn' };
  }
  return { label: st || '—', tone: 'neutral' };
}

/** Priority for "mission du jour" sorting */
function statusPriority(st) {
  if (st === 'A_RECOMPTER') return 0;
  if (st === 'EN_COURS')    return 1;
  if (st === 'A_FAIRE')     return 2;
  return 9;
}

/** Progress fill class */
function fillCls(pct) {
  if (pct >= 100) return 'full';
  if (pct >= 50)  return '';
  return 'warn';
}

const ACTIVE_STATUSES   = ['A_FAIRE', 'EN_COURS', 'A_RECOMPTER'];
const READONLY_STATUSES = ['A_VALIDER', 'VALIDE', 'REJETE', 'ANNULE'];

/* ═══════════════════════════════════════
   Component
═══════════════════════════════════════ */
export default function InventaireMag({ userName, onLogout }) {
  const toast    = useToast();
  const navigate = useNavigate();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 768
  );
  const [isLoading,  setIsLoading]  = useState(false);
  const [missions,   setMissions]   = useState([]);
  const [showHelp,   setShowHelp]   = useState(false);
  const [startingId, setStartingId] = useState(null); // which inv is being started

  /* ── Data ── */
  const loadMissions = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = await get('/inventory/magasinier/missions');
      setMissions(Array.isArray(payload?.missions) ? payload.missions : []);
    } catch (e) {
      toast.error(e.message || 'Erreur chargement missions inventaire');
    } finally { setIsLoading(false); }
  }, [toast]);

  useEffect(() => { loadMissions(); }, [loadMissions]);

  /* ── Derived lists ── */
  const activeMissions = useMemo(
    () => missions.filter(m => ACTIVE_STATUSES.includes(String(m?.inventory?.status || ''))),
    [missions]
  );
  const readonlyMissions = useMemo(
    () => missions.filter(m => READONLY_STATUSES.includes(String(m?.inventory?.status || ''))),
    [missions]
  );

  /** Mission du jour = highest priority active mission */
  const missionDuJour = useMemo(() => {
    if (!activeMissions.length) return null;
    return [...activeMissions].sort((a, b) => {
      const sa = String(a?.inventory?.status || '');
      const sb = String(b?.inventory?.status || '');
      const diff = statusPriority(sa) - statusPriority(sb);
      if (diff !== 0) return diff;
      const da = a?.inventory?.date_prevue ? new Date(a.inventory.date_prevue).getTime() : Infinity;
      const db = b?.inventory?.date_prevue ? new Date(b.inventory.date_prevue).getTime() : Infinity;
      return da - db;
    })[0];
  }, [activeMissions]);

  /* KPIs for pipeline */
  const kpi = useMemo(() => ({
    aFaire:     missions.filter(m => String(m?.inventory?.status) === 'A_FAIRE').length,
    enCours:    missions.filter(m => String(m?.inventory?.status) === 'EN_COURS').length,
    aRecompter: missions.filter(m => String(m?.inventory?.status) === 'A_RECOMPTER').length,
    soumis:     missions.filter(m => String(m?.inventory?.status) === 'A_VALIDER').length,
  }), [missions]);

  /* ── Open / Start a mission ──
     Sprint 3 : if status = A_FAIRE → POST start first, then navigate
                if status = EN_COURS / A_RECOMPTER → navigate directly      */
  const openMission = useCallback(async (mission) => {
    const inv = mission?.inventory;
    if (!inv?._id) return;
    const st = String(inv.status || '');

    if (st === 'A_FAIRE') {
      setStartingId(inv._id);
      try {
        await post(`/inventory/magasinier/inventories/${inv._id}/start`, {});
        toast.success('Inventaire démarré — bon comptage !');
      } catch (e) {
        toast.error(e.message || 'Impossible de démarrer cet inventaire');
        return;
      } finally { setStartingId(null); }
    }

    navigate(`/magasinier/inventaire/${inv._id}`);
  }, [navigate, toast]);

  /* ── Render helpers ── */
  const renderProgress = (progress, size = 'normal') => {
    const pct = Math.min(100, Math.max(0, Number(progress?.pct ?? 0)));
    const cnt = Number(progress?.counted ?? 0);
    const tot = Number(progress?.total   ?? 0);
    return (
      <div className="inv-prog-wrap">
        <div className="inv-prog-row">
          <span className="inv-prog-txt">{cnt} / {tot} articles</span>
          <span className="inv-prog-pct">{pct}%</span>
        </div>
        <div className="inv-prog-bar">
          <div className={`inv-prog-fill ${fillCls(pct)}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };

  const renderActionBtn = (mission) => {
    const inv = mission?.inventory;
    const st  = String(inv?.status || '');
    const busy = startingId === inv?._id || isLoading;

    if (st === 'A_FAIRE') return (
      <button className="inv-btn inv-btn-primary" onClick={() => openMission(mission)} disabled={busy}>
        {busy
          ? <><span className="inv-spin"><RefreshCw size={14} /></span> Démarrage…</>
          : <><Play size={14} /> Démarrer le comptage</>
        }
      </button>
    );
    if (st === 'A_RECOMPTER') return (
      <button className="inv-btn inv-btn-orange" onClick={() => openMission(mission)} disabled={busy}>
        <RotateCcw size={14} /> Ouvrir recomptage
      </button>
    );
    if (st === 'EN_COURS') return (
      <button className="inv-btn inv-btn-primary" onClick={() => openMission(mission)} disabled={busy}>
        <ArrowRight size={14} /> Reprendre le comptage
      </button>
    );
    // read-only
    return (
      <button className="inv-btn" onClick={() => navigate(`/magasinier/inventaire/${inv._id}`)}>
        <Eye size={14} /> Consulter
      </button>
    );
  };

  /* ═══════════════════════════════════════
     RENDER
  ═══════════════════════════════════════ */
  return (
    <div className="inv-root">
      <SidebarMag
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(p => !p)}
        onLogout={onLogout}
        userName={userName}
      />

      <div className="inv-main">
        <HeaderPage
          userName={userName}
          title="Mes inventaires"
          subtitle="Comptage terrain — réalisation et suivi de sessions d'inventaire"
          showSearch={false}
          onMenuClick={() => setSidebarCollapsed(p => !p)}
          onRefresh={loadMissions}
          onLogout={onLogout}
        />

        <main className="inv-page">

          {/* ══ Sprint 3 workflow pipeline ══ */}
          <div className="inv-pipeline">
            <div className={`inv-pipe-step ${kpi.aFaire > 0 ? 'active' : 'done'}`}>
              <div className="inv-pipe-icon"><ClipboardCheck size={20} /></div>
              <div className="inv-pipe-body">
                <span className="inv-pipe-count">{kpi.aFaire}</span>
                <span className="inv-pipe-label">À démarrer</span>
              </div>
            </div>
            <div className={`inv-pipe-step ${kpi.enCours > 0 ? 'active' : 'done'}`}>
              <div className="inv-pipe-icon"><Play size={20} /></div>
              <div className="inv-pipe-body">
                <span className="inv-pipe-count">{kpi.enCours}</span>
                <span className="inv-pipe-label">En cours</span>
              </div>
            </div>
            <div className={`inv-pipe-step ${kpi.aRecompter > 0 ? 'active' : 'done'}`}>
              <div className="inv-pipe-icon"><RotateCcw size={20} /></div>
              <div className="inv-pipe-body">
                <span className="inv-pipe-count">{kpi.aRecompter}</span>
                <span className="inv-pipe-label">Recomptage</span>
              </div>
            </div>
            <div className={`inv-pipe-step ${kpi.soumis > 0 ? 'active' : 'done'}`}>
              <div className="inv-pipe-icon"><CheckCircle size={20} /></div>
              <div className="inv-pipe-body">
                <span className="inv-pipe-count">{kpi.soumis}</span>
                <span className="inv-pipe-label">Soumis</span>
              </div>
            </div>
          </div>

          {/* ══ Help card ══ */}
          <div className="inv-help">
            <div className="inv-help-head">
              <span className="inv-help-label"><Info size={15} /> Règles de comptage terrain</span>
              <button className="inv-help-toggle" onClick={() => setShowHelp(p => !p)}>
                {showHelp
                  ? <><ChevronUp size={13} /> Masquer</>
                  : <><ChevronDown size={13} /> Afficher</>}
              </button>
            </div>
            {showHelp && (
              <div className="inv-help-body">
                <div className="inv-help-block">
                  <strong>Votre rôle (Sprint 3 — Réaliser un inventaire)</strong>
                  <ul>
                    <li>Comptez physiquement chaque article et saisissez la quantité réelle.</li>
                    <li>Le système calcule automatiquement l'écart : quantité réelle − quantité théorique.</li>
                    <li>Si une quantité est 0, ajoutez une observation (ex : "introuvable", "casse").</li>
                    <li>Soumettez uniquement quand toutes les lignes sont traitées.</li>
                  </ul>
                </div>
                <div className="inv-help-block">
                  <strong>Recomptage demandé</strong>
                  <ul>
                    <li>Le responsable a identifié des écarts suspects et demande une nouvelle vérification.</li>
                    <li>Seules les lignes marquées "À recompter" sont éditables.</li>
                    <li>Consultez le motif du responsable avant de recompter.</li>
                  </ul>
                </div>
                <div className="inv-help-block">
                  <strong>Après soumission</strong>
                  <ul>
                    <li>Le responsable analyse les écarts et valide ou demande un nouveau recomptage.</li>
                    <li>Vous recevrez une notification selon la décision prise.</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* ══ Missions actives ══ */}
          <div className="inv-section">
            <div className="inv-section-head">
              <div>
                <span className="inv-section-title">
                  <ClipboardCheck size={17} /> Mes missions
                </span>
                <div className="inv-section-sub">Inventaires assignés nécessitant une action de votre part</div>
              </div>
              <button className="inv-btn" onClick={loadMissions} disabled={isLoading}>
                <span className={isLoading ? 'inv-spin' : ''}><RefreshCw size={14} /></span>
                Actualiser
              </button>
            </div>

            {isLoading && !missions.length ? (
              <LoadingSpinner message="Chargement des missions…" />
            ) : activeMissions.length === 0 ? (
              <div className="inv-empty">
                <div className="inv-empty-icon"><ClipboardCheck size={26} /></div>
                <span className="inv-empty-title">Aucune mission active</span>
                <span className="inv-empty-sub">
                  Vous n'avez aucun inventaire à traiter. Les nouvelles missions assignées apparaîtront ici.
                </span>
                <button className="inv-btn" onClick={loadMissions} disabled={isLoading}>
                  <RefreshCw size={14} /> Actualiser
                </button>
              </div>
            ) : (
              <>
                {/* ── Mission du jour hero ── */}
                {missionDuJour && (() => {
                  const inv  = missionDuJour.inventory;
                  const prog = missionDuJour.progress || { counted:0, total:0, pct:0 };
                  const si   = stageInfo(inv, prog);
                  return (
                    <div className="inv-hero">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="inv-hero-kicker">
                          <CalendarClock size={14} /> Mission du jour
                        </div>
                        <div className="inv-hero-name">
                          <span>{inv.reference}</span>
                          <span className={`inv-stage ${si.tone}`}>{si.label}</span>
                        </div>
                        <div className="inv-hero-meta">
                          <div className="inv-hero-meta-item">
                            <span className="inv-hero-meta-lbl">Type</span>
                            <span className="inv-hero-meta-val">{typeLabel(inv)}</span>
                          </div>
                          <div className="inv-hero-meta-item">
                            <span className="inv-hero-meta-lbl">Magasin</span>
                            <span className="inv-hero-meta-val">{inv.magasin_id?.name || '—'}</span>
                          </div>
                          <div className="inv-hero-meta-item">
                            <span className="inv-hero-meta-lbl">Périmètre</span>
                            <span className="inv-hero-meta-val">{perimeterLabel(inv)}</span>
                          </div>
                          <div className="inv-hero-meta-item">
                            <span className="inv-hero-meta-lbl">Date prévue</span>
                            <span className="inv-hero-meta-val">{fmtDate(inv.date_prevue)}</span>
                          </div>
                        </div>
                        {renderProgress(prog)}
                      </div>
                      <div className="inv-hero-right">
                        {renderActionBtn(missionDuJour)}
                      </div>
                    </div>
                  );
                })()}

                {/* ── Other active missions grid ── */}
                {activeMissions.length > 1 && (
                  <div className="inv-grid" style={{ marginTop: '1rem' }}>
                    {activeMissions.map(m => {
                      const inv  = m.inventory;
                      const prog = m.progress || { counted:0, total:0, pct:0 };
                      const si   = stageInfo(inv, prog);
                      const pct  = Math.min(100, Math.max(0, Number(prog.pct ?? 0)));
                      return (
                        <div key={inv._id} className={`inv-mcard status-${inv.status}`}>
                          <div className="inv-mcard-top">
                            <div>
                              <div className="inv-mcard-ref">{inv.reference}</div>
                              <div className="inv-mcard-type">{typeLabel(inv)}</div>
                            </div>
                            <span className={`inv-stage ${si.tone}`}>{si.label}</span>
                          </div>
                          <div className="inv-mcard-meta">
                            <div className="inv-mcard-meta-row">
                              <span className="inv-mcard-meta-k">Magasin</span>
                              <span className="inv-mcard-meta-v">{inv.magasin_id?.name || '—'}</span>
                            </div>
                            <div className="inv-mcard-meta-row">
                              <span className="inv-mcard-meta-k">Périmètre</span>
                              <span className="inv-mcard-meta-v">{perimeterLabel(inv)}</span>
                            </div>
                            <div className="inv-mcard-meta-row">
                              <span className="inv-mcard-meta-k">Date prévue</span>
                              <span className="inv-mcard-meta-v">{fmtDate(inv.date_prevue)}</span>
                            </div>
                          </div>
                          <div className="inv-prog-wrap">
                            <div className="inv-prog-row">
                              <span className="inv-prog-txt">{prog.counted}/{prog.total} articles</span>
                              <span className="inv-prog-pct">{pct}%</span>
                            </div>
                            <div className="inv-prog-bar">
                              <div className={`inv-prog-fill ${fillCls(pct)}`} style={{ width:`${pct}%` }} />
                            </div>
                          </div>
                          <div className="inv-mcard-actions">
                            {renderActionBtn(m)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ══ Historique (lecture seule) ══ */}
          <div className="inv-section">
            <div className="inv-section-head">
              <div>
                <span className="inv-section-title">
                  <History size={17} /> Historique
                </span>
                <div className="inv-section-sub">Inventaires soumis ou terminés — consultation uniquement</div>
              </div>
            </div>

            {readonlyMissions.length === 0 ? (
              <div className="inv-empty" style={{ padding:'1.5rem' }}>
                <span className="inv-empty-title" style={{ fontSize:'.88rem' }}>Aucun inventaire soumis ou terminé</span>
              </div>
            ) : (
              <div className="inv-hist-list">
                {readonlyMissions.map(m => {
                  const inv  = m.inventory;
                  const prog = m.progress || { counted:0, total:0, pct:0 };
                  const si   = stageInfo(inv, prog);
                  return (
                    <div key={inv._id} className="inv-hist-item">
                      <div className="inv-hist-info">
                        <div className="inv-hist-ref">{inv.reference}</div>
                        <div className="inv-hist-meta">
                          <span>{typeLabel(inv)}</span>
                          <span className="inv-hist-sep">·</span>
                          <span>{inv.magasin_id?.name || '—'}</span>
                          <span className="inv-hist-sep">·</span>
                          <span>{fmtDate(inv.date_prevue)}</span>
                          <span className="inv-hist-sep">·</span>
                          <span className={`inv-stage ${si.tone}`}>{si.label}</span>
                        </div>
                        <div className="inv-hist-prog">{prog.counted}/{prog.total} articles ({prog.pct}%)</div>
                      </div>
                      <button className="inv-btn" onClick={() => navigate(`/magasinier/inventaire/${inv._id}`)}>
                        <Eye size={14} /> Consulter
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </main>
      </div>
    </div>
  );
}
