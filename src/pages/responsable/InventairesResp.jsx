import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, RefreshCw, Rocket, ClipboardList, Info } from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get } from '../../services/api';
import './InventairesResp.css';

function formatDt(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '-';
  }
}

const ACTIVE_STATUSES = new Set(['A_FAIRE', 'EN_COURS', 'A_VALIDER', 'A_RECOMPTER']);

const InventairesResp = ({ userName, onLogout }) => {
  const toast = useToast();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);
  const [inventories, setInventories] = useState([]);
  const [activeInventoryId, setActiveInventoryId] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  const activeInventory = useMemo(
    () => (inventories || []).find((x) => String(x._id) === String(activeInventoryId)) || null,
    [activeInventoryId, inventories]
  );

  const loadInventories = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = await get('/inventory/inventories');
      setInventories(Array.isArray(payload?.inventories) ? payload.inventories : []);
    } catch (err) {
      toast.error(err.message || 'Erreur chargement inventaires');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadInventories();
  }, [loadInventories]);

  const activeCount = useMemo(() => (inventories || []).filter((i) => ACTIVE_STATUSES.has(String(i.status))).length, [inventories]);

  return (
    <ProtectedPage userName={userName}>
      <div className="app-layout">
        <div className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`} onClick={() => setSidebarCollapsed(true)} />
        <SidebarResp collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} onLogout={onLogout} userName={userName} />

        <div className="main-container">
          <HeaderPage userName={userName} title="Inventaires" showSearch={false} onMenuClick={() => setSidebarCollapsed((p) => !p)} />
          <main className="main-content">
            {isLoading && <LoadingSpinner overlay text="Chargement..." />}

            <section className="inv-help-card">
              <div className="inv-help-head">
                <div className="inv-help-title">
                  <Info size={16} />
                  <span>Rôle du responsable</span>
                </div>
                <button className="inv-help-toggle" type="button" onClick={() => setShowHelp((p) => !p)}>
                  {showHelp ? 'Masquer' : 'Afficher'}
                </button>
              </div>
              {showHelp && (
                <div className="inv-help-body">
                  <div className="inv-help-block">
                    <strong>Lancement & suivi</strong>
                    <ol>
                      <li>Définir le périmètre (GLOBAL ou TOURNANT).</li>
                      <li>Assigner le magasinier et la date prévue.</li>
                      <li>Suivre l'avancement puis valider à la fin.</li>
                    </ol>
                  </div>
                  <div className="inv-help-block">
                    <strong>Statuts métier</strong>
                    <ul>
                      <li><code>A_FAIRE</code> : inventaire lancé et assigné.</li>
                      <li><code>EN_COURS</code> : comptage démarré par le magasinier.</li>
                      <li><code>A_VALIDER</code> : comptage terminé, attente validation.</li>
                      <li><code>A_RECOMPTER</code> : recomptage demandé.</li>
                      <li><code>VALIDE</code> / <code>REJETE</code> : clôture.</li>
                    </ul>
                  </div>
                </div>
              )}
            </section>

            <div className="inv-resp-grid">
              <section className="inv-card">
                <div className="inv-head">
                  <h3><ClipboardCheck size={18} /> Inventaires</h3>
                  <div className="inv-head-actions">
                    <button className="inv-btn" type="button" onClick={loadInventories} disabled={isLoading}>
                      <RefreshCw size={16} /> Actualiser
                    </button>
                    <button className="inv-btn" type="button" onClick={() => navigate('/responsable/inventaires/a-valider')} disabled={isLoading}>
                      <ClipboardList size={16} /> À valider
                    </button>
                    <button className="inv-btn primary" type="button" onClick={() => navigate('/responsable/inventaires/lancer')} disabled={isLoading}>
                      <Rocket size={16} /> Lancer un inventaire
                    </button>
                  </div>
                </div>
                <div className="inv-banner">
                  <span>Inventaires actifs: <strong>{activeCount}</strong></span>
                </div>
                <div className="inv-list">
                  {inventories.map((s) => (
                    <button
                      key={s._id}
                      type="button"
                      className={`inv-session ${String(activeInventoryId) === String(s._id) ? 'active' : ''}`}
                      onClick={() => setActiveInventoryId(String(s._id))}
                    >
                      <div className="inv-session-title">
                        <strong>{s.reference}</strong>
                        <span className={`inv-pill ${String(s.status || '').toLowerCase()}`}>{String(s.status || '-')}</span>
                      </div>
                      <div className="inv-session-sub">{String(s.type_inventaire || '-')}</div>
                      <div className="inv-session-meta">
                        Lancé: {formatDt(s.date_lancement || s.createdAt)} — Magasinier: {s.magasinier_id?.username || '-'}
                      </div>
                    </button>
                  ))}
                  {!inventories.length && <div className="inv-empty">Aucun inventaire.</div>}
                </div>
              </section>

              <section className="inv-card">
                <div className="inv-head">
                  <h3>Détails</h3>
                  {activeInventory?.reference ? <div className="inv-ref">Réf: <strong>{activeInventory.reference}</strong></div> : null}
                </div>

                {!activeInventory ? (
                  <div className="inv-empty">Sélectionnez un inventaire.</div>
                ) : (
                  <>
                    <div className="inv-banner">
                      <span>Statut: <strong>{activeInventory.status}</strong></span>
                      <span>Type: <strong>{activeInventory.type_inventaire}</strong></span>
                      <span>Magasin: <strong>{activeInventory.magasin_id?.name || '-'}</strong></span>
                    </div>

                    <div className="inv-lines">
                      <div className="inv-line">
                        <div className="inv-line-main"><strong>Périmètre</strong></div>
                        <div className="inv-line-kv">
                          <span>Zone: <strong>{activeInventory.zone_id?.name || '-'}</strong></span>
                          <span>Famille: <strong>{activeInventory.famille_id || '-'}</strong></span>
                          <span>Catégorie: <strong>{activeInventory.categorie_id?.name || '-'}</strong></span>
                        </div>
                      </div>
                      <div className="inv-line">
                        <div className="inv-line-main"><strong>Affectation</strong></div>
                        <div className="inv-line-kv">
                          <span>Magasinier: <strong>{activeInventory.magasinier_id?.username || '-'}</strong></span>
                          <span>Date prévue: <strong>{formatDt(activeInventory.date_prevue)}</strong></span>
                        </div>
                      </div>
                      <div className="inv-line">
                        <div className="inv-line-main"><strong>Règles</strong></div>
                        <div className="inv-line-kv">
                          <span>Mouvements: <strong>{activeInventory.bloquer_mouvements ? 'bloqués' : 'non bloqués'}</strong></span>
                          <span>Notifications: <strong>{activeInventory.notifications_activees ? 'activées' : 'désactivées'}</strong></span>
                        </div>
                      </div>
                      {activeInventory.commentaire ? (
                        <div className="inv-line">
                          <div className="inv-line-main"><strong>Commentaire</strong></div>
                          <div className="inv-line-kv">
                            <span>{activeInventory.commentaire}</span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </>
                )}
              </section>
            </div>
          </main>
        </div>
      </div>
    </ProtectedPage>
  );
};

export default InventairesResp;
