import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, RefreshCw, Play, ArrowRight, RotateCcw, Info } from 'lucide-react';
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
  const zone = inv.zone_id?.name ? `Zone: ${inv.zone_id.name}` : '';
  const fam = inv.famille_id ? `Famille: ${inv.famille_id}` : '';
  const cat = inv.categorie_id?.name ? `Catégorie: ${inv.categorie_id.name}` : '';
  return [zone, fam, cat].filter(Boolean).join(' | ') || 'Périmètre ciblé';
}

function statusActionLabel(status) {
  if (status === 'A_FAIRE') return { label: 'Commencer', kind: 'start', icon: Play };
  if (status === 'EN_COURS') return { label: 'Continuer', kind: 'open', icon: ArrowRight };
  if (status === 'A_RECOMPTER') return { label: 'Recompter', kind: 'open', icon: RotateCcw };
  if (status === 'A_VALIDER') return { label: 'Soumis au responsable', kind: 'readonly' };
  if (status === 'VALIDE') return { label: 'Terminé', kind: 'readonly' };
  if (status === 'REJETE') return { label: 'Rejeté', kind: 'readonly' };
  return { label: 'Voir', kind: 'open', icon: ArrowRight };
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
      toast.error(err.message || 'Erreur chargement missions inventaire');
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

  const handleAction = async (mission) => {
    const inv = mission?.inventory;
    if (!inv?._id) return;
    const status = String(inv.status || '');
    const action = statusActionLabel(status);

    if (action.kind === 'readonly') return;

    if (action.kind === 'start') {
      setIsLoading(true);
      try {
        await post(`/inventory/magasinier/inventories/${inv._id}/start`, {});
        toast.success('Inventaire démarré');
        navigate(`/magasinier/inventaire/${inv._id}`);
      } catch (err) {
        toast.error(err.message || 'Impossible de démarrer');
      } finally {
        setIsLoading(false);
      }
      return;
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
                    <li>Vous comptez physiquement. Le responsable valide.</li>
                    <li>Aucune quantité système / écart n’est affiché pendant le comptage.</li>
                  </ul>
                </div>
                <div className="inv-help-block">
                  <strong>Conseils</strong>
                  <ul>
                    <li>Si quantité = 0, ajoutez une observation (ex: "introuvable").</li>
                    <li>Sauvegardez régulièrement votre progression.</li>
                  </ul>
                </div>
              </div>
            )}
          </section>

          <section className="inv-card">
            <div className="inv-head">
              <h3><ClipboardCheck size={18} /> Missions actives</h3>
              <button className="inv-btn" type="button" onClick={loadMissions} disabled={isLoading}>
                <RefreshCw size={16} /> Actualiser
              </button>
            </div>

            <div className="inv-table-wrap">
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Type</th>
                    <th>Magasin</th>
                    <th>Zone/Famille/Catégorie</th>
                    <th>Date prévue</th>
                    <th>Statut</th>
                    <th>Progression</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activeMissions.map((m) => {
                    const inv = m.inventory;
                    const progress = m.progress || { counted: 0, total: 0, pct: 0 };
                    const action = statusActionLabel(String(inv.status));
                    const Icon = action.icon;
                    return (
                      <tr key={inv._id}>
                        <td><strong>{inv.reference}</strong></td>
                        <td>{inv.type_inventaire}</td>
                        <td>{inv.magasin_id?.name || '-'}</td>
                        <td>{perimeterLabel(inv)}</td>
                        <td>{formatDate(inv.date_prevue)}</td>
                        <td>
                          <span className={`inv-pill ${String(inv.status || '').toLowerCase()}`}>{inv.status}</span>
                        </td>
                        <td>
                          <div className="inv-progress">
                            <div className="inv-progress-top">
                              <span>{progress.counted}/{progress.total}</span>
                              <span className="inv-progress-pct">{progress.pct}%</span>
                            </div>
                            <div className="inv-progress-bar">
                              <div className="inv-progress-fill" style={{ width: `${Math.min(100, Math.max(0, progress.pct))}%` }} />
                            </div>
                          </div>
                        </td>
                        <td>
                          <button className="inv-btn primary" type="button" onClick={() => handleAction(m)} disabled={isLoading}>
                            {Icon ? <Icon size={16} /> : null} {action.label}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!activeMissions.length && (
                    <tr>
                      <td colSpan={8}>
                        <div className="inv-empty">Aucune mission active.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="inv-card" style={{ marginTop: 14 }}>
            <div className="inv-head">
              <h3>Historique (lecture seule)</h3>
            </div>

            <div className="inv-table-wrap">
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Type</th>
                    <th>Magasin</th>
                    <th>Périmètre</th>
                    <th>Date prévue</th>
                    <th>Statut</th>
                    <th>Progression</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {readOnlyMissions.map((m) => {
                    const inv = m.inventory;
                    const progress = m.progress || { counted: 0, total: 0, pct: 0 };
                    return (
                      <tr key={inv._id}>
                        <td><strong>{inv.reference}</strong></td>
                        <td>{inv.type_inventaire}</td>
                        <td>{inv.magasin_id?.name || '-'}</td>
                        <td>{perimeterLabel(inv)}</td>
                        <td>{formatDate(inv.date_prevue)}</td>
                        <td>
                          <span className={`inv-pill ${String(inv.status || '').toLowerCase()}`}>{inv.status}</span>
                        </td>
                        <td>{progress.counted}/{progress.total}</td>
                        <td>
                          <button className="inv-btn" type="button" onClick={() => navigate(`/magasinier/inventaire/${inv._id}`)}>
                            Voir détail
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!readOnlyMissions.length && (
                    <tr>
                      <td colSpan={8}>
                        <div className="inv-empty">Aucun inventaire soumis/terminé.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default InventaireMag;
