import { useCallback, useEffect, useMemo, useState } from 'react';
import { Server, Database, Mail, ShieldAlert, Sparkles, RefreshCw, Users, KeyRound, Wrench } from 'lucide-react';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { get } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import './AdminDashboard.css';

function pill(status) {
  if (status === 'ok') return 'ok';
  if (status === 'degraded') return 'warn';
  return 'bad';
}

function pillScore(score) {
  const n = Number(score || 0);
  if (n >= 85) return 'ok';
  if (n >= 70) return 'warn';
  return 'bad';
}

const AdminDashboard = ({ userName, onLogout }) => {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);
  const [health, setHealth] = useState(null);
  const [assistantStatus, setAssistantStatus] = useState(null);
  const [geminiStatus, setGeminiStatus] = useState(null);
  const [overview, setOverview] = useState(null);
  const [perf, setPerf] = useState(null);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [h, assistant, gemini, ov, pf] = await Promise.all([
        get('/health').catch(() => null),
        get('/ai/assistant/status').catch(() => null),
        get('/ai/gemini/status').catch(() => null),
        get('/admin/overview').catch(() => null),
        get('/admin/perf?window_ms=900000&limit=6').catch(() => null),
      ]);
      setHealth(h);
      setAssistantStatus(assistant);
      setGeminiStatus(gemini);
      setOverview(ov);
      setPerf(pf);
    } catch (err) {
      toast.error(err.message || 'Erreur chargement console admin');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const state = useMemo(() => {
    const status = health?.status || 'unknown';
    const critical = Array.isArray(health?.issues?.critical) ? health.issues.critical : [];
    const warnings = Array.isArray(health?.issues?.warnings) ? health.issues.warnings : [];
    return { status, critical, warnings };
  }, [health]);

  const security = useMemo(() => {
    const recentLoginFailures = Array.isArray(overview?.security_audit?.recent_login_failures)
      ? overview.security_audit.recent_login_failures
      : [];
    return {
      recentLoginFailures,
      blockedUsers: Number(overview?.users?.blocked || 0),
      totalUsers: Number(overview?.users?.total || 0),
      activeSessions: Number(overview?.sessions?.active || 0),
      healthScore: Number(overview?.system_health?.score || 0),
    };
  }, [overview]);

  const perfSummary = useMemo(() => {
    const topSlow = Array.isArray(perf?.top_slow) ? perf.top_slow : [];
    const topErrors = Array.isArray(perf?.top_errors) ? perf.top_errors : [];
    return { topSlow, topErrors, total: Number(perf?.total_events || 0) };
  }, [perf]);

  return (
    <div className="admin-layout">
      <SidebarAdmin
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((p) => !p)}
        onLogout={onLogout}
        userName={userName}
      />
      <div className={`admin-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <HeaderPage title="Console Admin" subtitle="Supervision système + IA (informatique)" icon={<Server size={24} />} />
        {isLoading && <LoadingSpinner overlay text="Chargement..." />}

        <div className="admin-page">
          <div className="admin-toolbar">
            <button className="admin-btn" type="button" onClick={loadAll} disabled={isLoading}>
              <RefreshCw size={16} />
              <span>Actualiser</span>
            </button>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className={`admin-pill ${pill(state.status)}`}>État: {state.status}</span>
              <span className={`admin-pill ${pillScore(security.healthScore)}`}>Health Score: {security.healthScore || 0}/100</span>
            </div>
          </div>

          {health?.maintenance?.enabled ? (
            <div className="admin-warn" style={{ marginBottom: 14 }}>
              Maintenance activée{health?.maintenance?.message ? ` — ${health.maintenance.message}` : ''}
              <div style={{ marginTop: 8 }}>
                <a href="/admin/parametres" style={{ color: '#991b1b', fontWeight: 1000, textDecoration: 'underline' }}>
                  <Wrench size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                  Gérer la maintenance
                </a>
              </div>
            </div>
          ) : null}

          <div className="admin-grid">
            <div className="admin-card">
              <div className="admin-card-title"><Database size={18} /> MongoDB</div>
              <div className="admin-kv">
                <div><span>Statut</span><strong>{health?.mongodb?.status || '-'}</strong></div>
                <div><span>DB</span><strong>{health?.mongodb?.db_name || '-'}</strong></div>
              </div>
              {health?.mongodb?.critical ? <div className="admin-warn">Critique: MongoDB non connecté</div> : null}
            </div>

            <div className="admin-card">
              <div className="admin-card-title"><Mail size={18} /> SMTP / Mail</div>
              <div className="admin-kv">
                <div><span>Configuré</span><strong>{String(health?.smtp?.configured ?? '-')}</strong></div>
                <div><span>OK</span><strong>{String(health?.smtp?.ok ?? '-')}</strong></div>
              </div>
              {health?.smtp?.configured && !health?.smtp?.ok ? <div className="admin-warn">Alerte: SMTP indisponible</div> : null}
            </div>

            <div className="admin-card">
              <div className="admin-card-title"><Sparkles size={18} /> Assistant IA</div>
              <div className="admin-kv">
                <div><span>Assistant</span><strong>{assistantStatus?.ok ? 'OK' : 'N/A'}</strong></div>
                <div><span>Gemini</span><strong>{geminiStatus?.configured ? 'OK' : 'À configurer'}</strong></div>
              </div>
              <div className="admin-note">
                L’admin gère la config IA; le responsable utilise l’assistant (sans réglages techniques).
              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card-title"><ShieldAlert size={18} /> Incidents</div>
              <div className="admin-kv">
                <div><span>Critiques</span><strong>{state.critical.length}</strong></div>
                <div><span>Warnings</span><strong>{state.warnings.length}</strong></div>
              </div>
              {state.critical.length ? (
                <ul className="admin-list">
                  {state.critical.slice(0, 4).map((x) => <li key={x}>{x}</li>)}
                </ul>
              ) : (
                <div className="admin-ok">Aucun incident critique.</div>
              )}
            </div>

            <div className="admin-card">
              <div className="admin-card-title"><Users size={18} /> Comptes & sessions</div>
              <div className="admin-kv">
                <div><span>Utilisateurs</span><strong>{security.totalUsers || '-'}</strong></div>
                <div><span>Bloqués</span><strong>{security.blockedUsers}</strong></div>
                <div><span>Sessions actives</span><strong>{security.activeSessions}</strong></div>
              </div>
              <div className="admin-note">
                Vue technique (RBAC + sessions). Les opérations métier restent côté Responsable/Magasinier.
              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card-title"><KeyRound size={18} /> Sécurité (24h)</div>
              <div className="admin-kv">
                <div><span>Échecs login</span><strong>{security.recentLoginFailures.length}</strong></div>
                <div><span>Action</span><strong>Audit</strong></div>
              </div>
              {security.recentLoginFailures.length ? (
                <ul className="admin-list">
                  {security.recentLoginFailures.slice(0, 4).map((e) => (
                    <li key={`${e.date_event || ''}-${e.email || ''}-${e.ip_address || ''}`}>
                      {e.email || 'unknown'} — {e.ip_address || 'ip?'}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="admin-ok">Aucun échec de connexion récent.</div>
              )}
            </div>

            <div className="admin-card">
              <div className="admin-card-title"><ShieldAlert size={18} /> Centre d’incidents</div>
              <div className="admin-kv">
                <div><span>Fenêtre</span><strong>15 min</strong></div>
                <div><span>Événements</span><strong>{perfSummary.total}</strong></div>
              </div>
              {perfSummary.topErrors.length ? (
                <ul className="admin-list">
                  {perfSummary.topErrors.slice(0, 4).map((x) => (
                    <li key={x.key}>
                      {x.key} — {x.error_count} erreur(s) (p95 {x.p95_ms ?? '-'}ms)
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="admin-ok">Aucune erreur 5xx récente.</div>
              )}
              <div className="admin-note">
                Le monitoring démarre après redémarrage du backend.
              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card-title"><Server size={18} /> Routes lentes</div>
              {perfSummary.topSlow.length ? (
                <ul className="admin-list">
                  {perfSummary.topSlow.slice(0, 4).map((x) => (
                    <li key={x.key}>
                      {x.key} — p95 {x.p95_ms ?? '-'}ms (avg {x.avg_ms}ms)
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="admin-ok">Pas assez de trafic pour mesurer.</div>
              )}
              <div className="admin-note">
                Plus d’infos via `GET /api/admin/perf`.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
