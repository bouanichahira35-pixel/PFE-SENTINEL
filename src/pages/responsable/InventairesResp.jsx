import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, RefreshCw, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get, post } from '../../services/api';
import './InventairesResp.css';

function formatDt(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '-';
  }
}

const InventairesResp = ({ userName, onLogout }) => {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [activeSession, setActiveSession] = useState(null);
  const [lines, setLines] = useState([]);
  const [summary, setSummary] = useState(null);
  const [showHelp, setShowHelp] = useState(false);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = await get('/inventory/sessions');
      setSessions(Array.isArray(payload?.sessions) ? payload.sessions : []);
    } catch (err) {
      toast.error(err.message || 'Erreur chargement inventaires');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const loadSession = useCallback(async (id) => {
    if (!id) return;
    setIsLoading(true);
    try {
      const payload = await get(`/inventory/sessions/${id}`);
      setActiveSession(payload?.session || null);
      setLines(Array.isArray(payload?.lines) ? payload.lines : []);
      setSummary(payload?.summary || null);
    } catch (err) {
      toast.error(err.message || 'Erreur chargement session');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!activeSessionId) return;
    loadSession(activeSessionId);
  }, [activeSessionId, loadSession]);

  const pendingToApply = useMemo(() => (sessions || []).filter((s) => String(s.status) === 'closed').length, [sessions]);

  const applySession = async () => {
    if (!activeSessionId) return;
    const confirmed = window.confirm('Appliquer cet inventaire ? Cela va creer des ajustements (entree/sortie) et mettre a jour les stocks.');
    if (!confirmed) return;
    setIsLoading(true);
    try {
      const r = await post(`/inventory/sessions/${activeSessionId}/apply`, {});
      toast.success(`Inventaire applique (${r?.adjustments?.length || 0} ajustements)`);
      await loadSession(activeSessionId);
      await loadSessions();
    } catch (err) {
      toast.error(err.message || 'Erreur application inventaire');
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
                    <strong>Contrôle & validation</strong>
                    <ol>
                      <li>Vérifier la session clôturée et les écarts.</li>
                      <li>Analyser les anomalies (surplus / manquants).</li>
                      <li>Appliquer l’inventaire pour générer les ajustements.</li>
                    </ol>
                  </div>
                  <div className="inv-help-block">
                    <strong>Impact métier</strong>
                    <p>Après application, les stocks sont corrigés et l’historique est mis à jour.</p>
                  </div>
                  <div className="inv-help-block">
                    <strong>Types d’inventaire</strong>
                    <ul>
                      <li><strong>Annuel</strong> : contrôle global à date fixe.</li>
                      <li><strong>Tournant</strong> : contrôles réguliers par familles de produits.</li>
                    </ul>
                  </div>
                </div>
              )}
            </section>

            <div className="inv-resp-grid">
              <section className="inv-card">
                <div className="inv-head">
                  <h3><ClipboardCheck size={18} /> Sessions</h3>
                  <button className="inv-btn" type="button" onClick={loadSessions} disabled={isLoading}><RefreshCw size={16} /> Actualiser</button>
                </div>
                <div className="inv-banner">
                  <span>En attente d'application: <strong>{pendingToApply}</strong></span>
                </div>
                <div className="inv-list">
                  {sessions.map((s) => (
                    <button
                      key={s._id}
                      type="button"
                      className={`inv-session ${String(activeSessionId) === String(s._id) ? 'active' : ''}`}
                      onClick={() => setActiveSessionId(String(s._id))}
                    >
                      <div className="inv-session-title">
                        <strong>{s.reference}</strong>
                        <span className={`inv-pill ${String(s.status)}`}>{s.status}</span>
                      </div>
                      <div className="inv-session-sub">{s.title}</div>
                      <div className="inv-session-meta">
                        Cree: {formatDt(s.createdAt || s.created_at)} — Par: {s.created_by?.username || '-'}
                      </div>
                    </button>
                  ))}
                  {!sessions.length && <div className="inv-empty">Aucune session.</div>}
                </div>
              </section>

              <section className="inv-card">
                <div className="inv-head">
                  <h3>Validation & ajustements</h3>
                  {activeSession?.reference ? <div className="inv-ref">Session: <strong>{activeSession.reference}</strong></div> : null}
                </div>

                {!activeSession ? (
                  <div className="inv-empty">Selectionnez une session.</div>
                ) : (
                  <>
                    <div className="inv-banner">
                      <span>Statut: <strong>{activeSession.status}</strong></span>
                      <span>Cloture: <strong>{formatDt(activeSession.closed_at)}</strong></span>
                      <span>Magasinier: <strong>{activeSession.created_by?.username || '-'}</strong></span>
                    </div>

                    {activeSession.status === 'closed' ? (
                      <div className="inv-actions">
                        <button className="inv-btn primary" type="button" onClick={applySession} disabled={isLoading}>
                          <CheckCircle2 size={16} /> Appliquer l'inventaire
                        </button>
                        <div className="inv-hint">
                          <AlertTriangle size={16} /> Conseil: appliquez apres cloture (mouvements geles).
                        </div>
                      </div>
                    ) : (
                      <div className="inv-empty">Cette session n'est pas en statut "closed".</div>
                    )}

                    <div className="inv-subhead">
                      <strong>Ecarts</strong>
                      {summary ? (
                        <span className="inv-mini">
                          OK: {summary.ok} | Surplus: {summary.surplus} | Manquants: {summary.missing} | Abs: {Math.round(Number(summary.total_abs_delta || 0))}
                        </span>
                      ) : null}
                    </div>

                    <div className="inv-lines">
                      {lines.map((l) => (
                        <div key={l._id} className="inv-line">
                          <div className="inv-line-main">
                            <strong>{l.product?.name || 'Produit'}</strong>
                            <span className="inv-code">{l.product?.code_product || '-'}</span>
                          </div>
                          <div className="inv-line-kv">
                            <span>Systeme: <strong>{l.system_quantity_at_count}</strong></span>
                            <span>Compte: <strong>{l.counted_quantity}</strong></span>
                            <span className={`inv-delta ${l.delta > 0 ? 'pos' : l.delta < 0 ? 'neg' : 'zero'}`}>
                              Ecart: <strong>{l.delta}</strong>
                            </span>
                          </div>
                        </div>
                      ))}
                      {!lines.length && <div className="inv-empty">Aucune ligne.</div>}
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
