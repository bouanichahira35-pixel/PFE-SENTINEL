import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarClock, ClipboardCheck, History, Info, Play, RefreshCw, RotateCcw } from 'lucide-react';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get, post } from '../../services/api';
import './InventaireMag.css';

function formatDate(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleDateString('fr-FR', { year: 'numeric', month: '2-digit', day: '2-digit' });
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

function statusActionLabel(status) {
  if (status === 'A_FAIRE') return { kind: 'start', icon: Play };
  if (status === 'A_RECOMPTER') return { kind: 'open', icon: RotateCcw };
  return { kind: 'open', icon: ArrowRight };
}

function missionTypeLabel(inv) {
  if (!inv) return '-';
  if (String(inv.status) === 'A_RECOMPTER') return 'Recomptage';
  return String(inv.type_inventaire) === 'GLOBAL' ? 'Général' : 'Tournant';
}

function missionStageLabel(inv, progress) {
  const status = String(inv?.status || '');
  const counted = Number(progress?.counted || 0);
  const total = Number(progress?.total || 0);
  if (status === 'A_FAIRE') return 'À démarrer';
  if (status === 'EN_COURS' && total > 0 && counted >= total) return 'À soumettre';
  if (status === 'EN_COURS') return 'En cours';
  if (status === 'A_RECOMPTER') return 'Recomptage demandé';
  if (status === 'A_VALIDER') return 'Soumis';
  if (['VALIDE', 'REJETE'].includes(status)) return 'Terminé';
  return status || '-';
}

function stageTone(inv, progress) {
  const stage = missionStageLabel(inv, progress);
  if (stage === 'À démarrer') return 'info';
  if (stage === 'En cours') return 'warn';
  if (stage === 'À soumettre') return 'ready';
  if (stage === 'Recomptage demandé') return 'crit';
  if (stage === 'Soumis') return 'neutral';
  if (stage === 'Terminé') return 'ok';
  return 'neutral';
}

const InventaireMag = ({ userName, onLogout }) => {
  const toast = useToast();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);
  const [missions, setMissions] = useState([]);
  const [showHelp, setShowHelp] = useState(false);

  const loadMissions = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = await get('/inventory/magasinier/missions');
      setMissions(Array.isArray(payload?.missions) ? payload.missions : []);
    } catch (err) {
      toast.error(err.message || "Erreur chargement missions inventaire");
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadMissions();
  }, [loadMissions]);

  const activeMissions = useMemo(
    () => missions.filter((m) => ['A_FAIRE', 'EN_COURS', 'A_RECOMPTER'].includes(String(m?.inventory?.status || ''))),
    [missions]
  );

  const readOnlyMissions = useMemo(
    () => missions.filter((m) => ['A_VALIDER', 'VALIDE', 'REJETE'].includes(String(m?.inventory?.status || ''))),
    [missions]
  );

  const missionDuJour = useMemo(() => {
    if (!activeMissions.length) return null;
    const priority = (status) => {
      if (status === 'A_RECOMPTER') return 0;
      if (status === 'EN_COURS') return 1;
      if (status === 'A_FAIRE') return 2;
      return 9;
    };
    const sorted = [...activeMissions].sort((a, b) => {
      const sa = String(a?.inventory?.status || '');
      const sb = String(b?.inventory?.status || '');
      const pa = priority(sa);
      const pb = priority(sb);
      if (pa !== pb) return pa - pb;
      const da = a?.inventory?.date_prevue ? new Date(a.inventory.date_prevue).getTime() : Number.MAX_SAFE_INTEGER;
      const db = b?.inventory?.date_prevue ? new Date(b.inventory.date_prevue).getTime() : Number.MAX_SAFE_INTEGER;
      if (da !== db) return da - db;
      return String(a?.inventory?.reference || '').localeCompare(String(b?.inventory?.reference || ''));
    });
    return sorted[0] || null;
  }, [activeMissions]);

  const openMission = async (mission) => {
    const inv = mission?.inventory;
    if (!inv?._id) return;

    const status = String(inv.status || '');
    const action = statusActionLabel(status);

    if (action.kind === 'start') {
      setIsLoading(true);
      try {
        await post(`/inventory/magasinier/inventories/${inv._id}/start`, {});
        toast.success("Inventaire démarré");
      } catch (err) {
        toast.error(err.message || "Impossible de démarrer");
        return;
      } finally {
        setIsLoading(false);
      }
    }

    navigate(`/magasinier/inventaire/${inv._id}`);
  };

  return (
    <div className="app-layout">
      <div className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`} onClick={() => setSidebarCollapsed(true)} />
      <SidebarMag collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} onLogout={onLogout} userName={userName} />

      <div className="main-container">
        <HeaderPage userName={userName} title="Mes inventaires" showSearch={false} onMenuClick={() => setSidebarCollapsed((p) => !p)} />
        <main className="main-content">
          {isLoading && <LoadingSpinner overlay text="Chargement..." />}

          <section className="inv-help-card">
            <div className="inv-help-head">
              <div className="inv-help-title">
                <Info size={16} />
                <span>Comptage terrain</span>
              </div>
              <button className="inv-help-toggle" type="button" onClick={() => setShowHelp((p) => !p)}>
                {showHelp ? 'Masquer' : 'Afficher'}
              </button>
            </div>
            {showHelp && (
              <div className="inv-help-body">
                <div className="inv-help-block">
                  <strong>Règle principale</strong>
                  <ul>
                    <li>Vous comptez physiquement. Le responsable valide et ajuste le stock.</li>
                    <li>Soumettez uniquement quand tout est compté.</li>
                  </ul>
                </div>
                <div className="inv-help-block">
                  <strong>Conseils</strong>
                  <ul>
                    <li>Si quantité = 0, ajoutez une observation (ex: "introuvable").</li>
                    <li>En cas de recomptage, suivez le motif et vérifiez les lignes demandées.</li>
                  </ul>
                </div>
              </div>
            )}
          </section>

          <section className="inv-card">
            <div className="inv-head">
              <h3><ClipboardCheck size={18} /> Mes missions</h3>
              <button className="inv-btn" type="button" onClick={loadMissions} disabled={isLoading}>
                <RefreshCw size={16} /> Actualiser
              </button>
            </div>

            {missionDuJour ? (
              <div className="inv-hero">
                <div className="inv-hero-left">
                  <div className="inv-hero-kicker">
                    <CalendarClock size={16} />
                    <span>Mission du jour</span>
                  </div>
                  <div className="inv-hero-title">
                    <strong>{missionDuJour.inventory?.reference}</strong>
                    <span className={`inv-stage ${stageTone(missionDuJour.inventory, missionDuJour.progress)}`}>
                      {missionStageLabel(missionDuJour.inventory, missionDuJour.progress)}
                    </span>
                  </div>
                  <div className="inv-hero-meta">
                    <span>Type: <strong>{missionTypeLabel(missionDuJour.inventory)}</strong></span>
                    <span>Magasin: <strong>{missionDuJour.inventory?.magasin_id?.name || '-'}</strong></span>
                    <span>Produit / famille / catégorie: <strong>{perimeterLabel(missionDuJour.inventory)}</strong></span>
                    <span>Prévu: <strong>{formatDate(missionDuJour.inventory?.date_prevue)}</strong></span>
                  </div>
                  <div className="inv-hero-progress">
                    <div className="inv-progress-top">
                      <span>{missionDuJour.progress?.counted ?? 0}/{missionDuJour.progress?.total ?? 0} articles</span>
                      <span className="inv-progress-pct">{missionDuJour.progress?.pct ?? 0}%</span>
                    </div>
                    <div className="inv-progress-bar">
                      <div className="inv-progress-fill" style={{ width: `${Math.min(100, Math.max(0, missionDuJour.progress?.pct ?? 0))}%` }} />
                    </div>
                  </div>
                </div>
                <div className="inv-hero-right">
                  <button className="inv-btn primary" type="button" onClick={() => openMission(missionDuJour)} disabled={isLoading}>
                    <ArrowRight size={16} /> Ouvrir comptage
                  </button>
                </div>
              </div>
            ) : null}

            {activeMissions.length ? (
              <div className="inv-missions-grid">
                {activeMissions.map((m) => {
                  const inv = m.inventory;
                  const progress = m.progress || { counted: 0, total: 0, pct: 0 };
                  return (
                    <div key={inv._id} className="inv-mission-card">
                      <div className="inv-mission-top">
                        <div className="inv-mission-ref">
                          <strong>{inv.reference}</strong>
                          <span className={`inv-stage ${stageTone(inv, progress)}`}>{missionStageLabel(inv, progress)}</span>
                        </div>
                        <div className="inv-mission-type">{missionTypeLabel(inv)}</div>
                      </div>
                      <div className="inv-mission-meta">
                        <div><span className="k">Magasin</span><span className="v">{inv.magasin_id?.name || '-'}</span></div>
                        <div><span className="k">Produit / famille / catégorie</span><span className="v">{perimeterLabel(inv)}</span></div>
                        <div><span className="k">Date prévue</span><span className="v">{formatDate(inv.date_prevue)}</span></div>
                      </div>
                      <div className="inv-mission-progress">
                        <div className="inv-progress-top">
                          <span>{progress.counted}/{progress.total}</span>
                          <span className="inv-progress-pct">{progress.pct}%</span>
                        </div>
                        <div className="inv-progress-bar">
                          <div className="inv-progress-fill" style={{ width: `${Math.min(100, Math.max(0, progress.pct))}%` }} />
                        </div>
                      </div>
                      <div className="inv-mission-actions">
                        <button className="inv-btn primary" type="button" onClick={() => openMission(m)} disabled={isLoading}>
                          <ArrowRight size={16} /> Ouvrir comptage
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="inv-empty-state">
                <div className="inv-empty-icon">
                  <ClipboardCheck size={22} />
                </div>
                <div className="inv-empty-text">
                  <strong>Aucune mission active</strong>
                  <div>Vous n’avez aucun inventaire à traiter pour le moment.</div>
                </div>
                <button className="inv-btn" type="button" onClick={loadMissions} disabled={isLoading}>
                  <RefreshCw size={16} /> Actualiser
                </button>
              </div>
            )}
          </section>

          <section className="inv-card" style={{ marginTop: 14 }}>
            <div className="inv-head">
              <h3><History size={18} /> Historique (lecture seule)</h3>
            </div>

            {readOnlyMissions.length ? (
              <div className="inv-history-grid">
                {readOnlyMissions.map((m) => {
                  const inv = m.inventory;
                  const progress = m.progress || { counted: 0, total: 0, pct: 0 };
                  return (
                    <div key={inv._id} className="inv-history-card">
                      <div className="inv-history-main">
                        <div className="inv-history-ref">
                          <strong>{inv.reference}</strong>
                          <span className="inv-history-type">{missionTypeLabel(inv)}</span>
                        </div>
                        <div className="inv-history-meta">
                          <span>{inv.magasin_id?.name || '-'}</span>
                          <span>•</span>
                          <span>{formatDate(inv.date_prevue)}</span>
                          <span>•</span>
                          <span>{missionStageLabel(inv, progress)}</span>
                        </div>
                        <div className="inv-history-progress">
                          {progress.counted}/{progress.total} ({progress.pct}%)
                        </div>
                      </div>
                      <button className="inv-btn" type="button" onClick={() => navigate(`/magasinier/inventaire/${inv._id}`)}>
                        Consulter
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="inv-empty-mini">Aucun inventaire soumis ou terminé.</div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
};

export default InventaireMag;
