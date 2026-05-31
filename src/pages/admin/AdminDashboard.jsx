import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Brain,
  CheckCircle2,
  Clock3,
  Database,
  FileText,
  Gauge,
  KeyRound,
  LifeBuoy,
  Mail,
  MessageCircle,
  MonitorX,
  Package,
  RefreshCw,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Star,
  UserPlus,
  Users,
} from 'lucide-react';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { get } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import { getUiErrorMessage } from '../../services/uiError';
import './AdminDashboard.css';

const WINDOW_OPTIONS = [
  { label: '24h', days: 1 },
  { label: '7j', days: 7 },
  { label: '30j', days: 30 },
];

const QUICK_ACTIONS = [
  { label: 'Nouvel utilisateur', icon: UserPlus, path: '/admin/utilisateurs?action=create', primary: true },
  { label: 'Sessions actives', icon: MonitorX, path: '/admin/sessions' },
  { label: 'Journal audit', icon: FileText, path: '/admin/audit' },
  { label: 'Paramètres système', icon: Settings, path: '/admin/parametres' },
  { label: 'Tickets support', icon: LifeBuoy, path: '/admin/support' },
];

function pillScore(score) {
  const n = Number(score || 0);
  if (n >= 90) return 'ok';
  if (n >= 70) return 'warn';
  return n > 0 ? 'bad' : 'warn';
}

function systemStateFromScore(score) {
  const n = Number(score || 0);
  if (!Number.isFinite(n) || n <= 0) return { label: 'inconnu', tone: 'warn' };
  if (n >= 90) return { label: 'opérationnel', tone: 'ok' };
  if (n >= 70) return { label: 'à surveiller', tone: 'warn' };
  return { label: 'problème détecté', tone: 'bad' };
}

function classifyLatency(latencyMs) {
  const n = Number(latencyMs);
  if (!Number.isFinite(n) || n <= 0) return 'correct';
  if (n <= 400) return 'rapide';
  if (n <= 900) return 'correct';
  return 'à surveiller';
}

function bestP95ForKey(list, keyIncludes) {
  const items = Array.isArray(list) ? list : [];
  const needle = String(keyIncludes || '').toLowerCase();
  const hit = items.find((x) => String(x?.key || '').toLowerCase().includes(needle));
  const p95 = Number(hit?.p95_ms);
  return Number.isFinite(p95) ? p95 : null;
}

function yesNo(value) {
  if (value === true) return 'activé';
  if (value === false) return 'non activé';
  return '-';
}

function formatUptime(seconds) {
  const n = Number(seconds || 0);
  if (!Number.isFinite(n) || n <= 0) return '-';
  const days = Math.floor(n / 86400);
  const hours = Math.floor((n % 86400) / 3600);
  const minutes = Math.floor((n % 3600) / 60);
  if (days > 0) return `${days}j ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function labelSecurityEvent(type) {
  const key = String(type || '');
  if (key === 'login_success') return 'Connexion réussie';
  if (key === 'login_failed') return 'Connexion échouée';
  if (key === 'logout') return 'Déconnexion';
  if (key === 'session_revoked') return 'Session révoquée';
  if (key === 'sessions_revoked') return 'Sessions révoquées';
  if (key === 'user_status_changed') return 'Statut utilisateur modifié';
  if (key === 'password_reset_done') return 'Mot de passe réinitialisé';
  if (key === 'email_failed') return 'Email non envoyé';
  return key || 'Événement système';
}

function routeForSecurityEvent(type) {
  const key = String(type || '');
  if (key.includes('session') || key === 'logout') return '/admin/sessions';
  if (key.includes('user') || key.includes('password')) return '/admin/utilisateurs';
  return '/admin/securite';
}

function labelPerfArea(item) {
  const key = String(item?.path || item?.key || '').toLowerCase();
  if (key.includes('/auth/')) return 'Authentification';
  if (key.includes('/admin/')) return 'Console admin';
  if (key.includes('/ai/')) return 'Module IA';
  if (key.includes('/support')) return 'Support';
  if (key.includes('/users')) return 'Utilisateurs';
  return 'Service applicatif';
}

function labelHealthIssue(issue) {
  const key = String(issue || '');
  const labels = {
    mongodb_not_connected: 'Base de données indisponible',
    internal_bond_qr_secret_missing: 'Secret QR interne manquant',
    smtp_unreachable: 'Service email indisponible',
    mail_queue_not_ready: 'File email non prête',
    internal_bond_qr_secret_fallback_or_invalid: 'Secret QR en mode secours',
    supplier_portal_secret_fallback_or_missing: 'Secret portail fournisseur à vérifier',
  };
  return labels[key] || key || 'Signal système';
}

function labelAlertType(type) {
  const key = String(type || '').toLowerCase();
  if (key === 'rupture') return 'Rupture';
  if (key === 'surconsommation') return 'Surconsommation';
  if (key === 'anomaly') return 'Anomalie';
  return 'Alerte IA';
}

function alertTone(alert) {
  const risk = String(alert?.risk_level || '').toLowerCase();
  if (risk === 'high') return 'bad';
  if (risk === 'medium') return 'warn';
  return 'ok';
}

const AdminDashboard = ({ userName, onLogout }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  ));
  const [isLoading, setIsLoading] = useState(false);
  const [health, setHealth] = useState(null);
  const [overview, setOverview] = useState(null);
  const [perf, setPerf] = useState(null);
  const [supportSummary, setSupportSummary] = useState(null);
  const [aiSummary, setAiSummary] = useState(null);
  const [aiAlerts, setAiAlerts] = useState([]);
  const [showPerfDetails, setShowPerfDetails] = useState(false);
  const [windowDays, setWindowDays] = useState(1);

  const loadAll = useCallback(async ({ silent = true } = {}) => {
    setIsLoading(true);
    try {
      const [h, ov, pf, sup, ai, alerts] = await Promise.all([
        get('/health').catch(() => null),
        get(`/admin/overview?days=${windowDays}`).catch(() => null),
        get('/admin/perf?window_ms=900000&limit=6').catch(() => null),
        get('/admin/support/summary').catch(() => null),
        get('/ai/admin/kpis').catch(() => null),
        get('/ai/alerts').catch(() => []),
      ]);
      setHealth(h);
      setOverview(ov);
      setPerf(pf);
      setSupportSummary(sup);
      setAiSummary(ai);
      setAiAlerts(Array.isArray(alerts) ? alerts : []);
      if (!silent) toast.success('Données admin mises à jour');
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Erreur chargement console admin'));
    } finally {
      setIsLoading(false);
    }
  }, [toast, windowDays]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const healthIssues = useMemo(() => {
    const critical = Array.isArray(health?.issues?.critical) ? health.issues.critical : [];
    const warnings = Array.isArray(health?.issues?.warnings) ? health.issues.warnings : [];
    return { critical, warnings };
  }, [health]);

  const security = useMemo(() => {
    const recentLoginFailures = Array.isArray(overview?.security_audit?.recent_login_failures)
      ? overview.security_audit.recent_login_failures
      : [];
    const recentEvents = Array.isArray(overview?.security_audit?.recent_events)
      ? overview.security_audit.recent_events
      : [];
    return {
      recentLoginFailures,
      recentEvents,
      blockedUsers: Number(overview?.users?.blocked || 0),
      totalUsers: Number(overview?.users?.total || 0),
      activeUsers: Number(overview?.users?.active || 0),
      activeSessions: Number(overview?.sessions?.active || 0),
      healthScore: Number(overview?.system_health?.score || 0),
      breakdown: Array.isArray(overview?.system_health?.breakdown) ? overview.system_health.breakdown : [],
    };
  }, [overview]);

  const perfSummary = useMemo(() => {
    const topSlow = Array.isArray(perf?.top_slow) ? perf.top_slow : [];
    const topErrors = Array.isArray(perf?.top_errors) ? perf.top_errors : [];
    return { topSlow, topErrors, total: Number(perf?.total_events || 0) };
  }, [perf]);

  const systemState = useMemo(() => systemStateFromScore(security.healthScore), [security.healthScore]);

  const supportKpis = useMemo(() => {
    const k = supportSummary?.kpis || {};
    const open = Number(k.open || 0);
    const urgent = Number(k.urgent || 0);
    const inProgress = Number(k.in_progress || 0);
    const resolvedToday = Number(k.resolved_today || 0);
    return {
      open,
      urgent,
      inProgress,
      resolvedToday,
      allZero: open === 0 && urgent === 0 && inProgress === 0 && resolvedToday === 0,
    };
  }, [supportSummary]);

  const responseSignals = useMemo(() => {
    const loginP95 = bestP95ForKey(perfSummary.topSlow, '/auth/login');
    const healthP95 = bestP95ForKey(perfSummary.topSlow, '/health');
    const aiP95 = bestP95ForKey(perfSummary.topSlow, '/ai/');
    const adminP95 = bestP95ForKey(perfSummary.topSlow, '/admin/');
    return {
      login: classifyLatency(loginP95),
      health: classifyLatency(healthP95),
      ai: classifyLatency(aiP95),
      admin: classifyLatency(adminP95),
    };
  }, [perfSummary.topSlow]);

  const activitySeries = useMemo(() => {
    const rows = Array.isArray(overview?.security_audit?.daily_series) ? overview.security_audit.daily_series : [];
    return rows.map((row) => ({
      date: row.date,
      connexions: Number(row.connexions || 0),
      erreurs: Number(row.erreurs || 0),
      securite: Number(row.securite || 0),
    }));
  }, [overview]);

  const maxActivity = useMemo(() => (
    Math.max(1, ...activitySeries.map((x) => x.connexions + x.erreurs + x.securite))
  ), [activitySeries]);

  const aiKpis = useMemo(() => {
    const k = aiSummary?.kpis || aiSummary || {};
    return {
      alerts: Number(k.alerts || k.active_alerts || k.ai_alerts || 0),
      predictions: Number(k.predictions || k.ai_predictions || 0),
      errors: Number(k.errors || k.recent_errors || 0),
      models: Number(k.models || k.active_models || 0),
    };
  }, [aiSummary]);

  const aiAlertPreview = useMemo(() => (
    aiAlerts
      .filter((item) => String(item?.status || 'new') === 'new')
      .slice(0, 5)
  ), [aiAlerts]);

  const commandSignals = useMemo(() => {
    const issueCount = healthIssues.critical.length + healthIssues.warnings.length;
    const highAiAlerts = aiAlertPreview.filter((item) => String(item?.risk_level || '').toLowerCase() === 'high').length;
    const notificationCount = issueCount + supportKpis.urgent + highAiAlerts;
    return {
      notificationCount,
      issueCount,
      uptime: formatUptime(health?.uptime_seconds),
      lastUpdate: formatDate(overview?.generated_at || health?.timestamp || health?.generated_at),
      emailReady: Boolean(health?.smtp?.configured && health?.smtp?.ok),
      queueReady: health?.queue?.enabled ? Boolean(health?.queue?.ready) : true,
      dbReady: String(health?.mongodb?.status || '').toLowerCase() === 'connected',
    };
  }, [aiAlertPreview, health, healthIssues, overview, supportKpis.urgent]);

  return (
    <div className="admin-layout">
      <SidebarAdmin
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((p) => !p)}
        onLogout={onLogout}
        userName={userName}
      />
      <div className={`admin-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <HeaderPage
          userName={userName}
          title="Console Admin"
          subtitle="Suivi décisionnel du système, des accès, de la sécurité et de l’IA"
          icon={<Server size={24} />}
          showSearch={false}
          onRefresh={() => loadAll({ silent: false })}
        />
        {isLoading && <LoadingSpinner overlay text="Chargement..." />}

        <div className="admin-page">
          <section className="admin-hero" aria-label="Synthèse console admin">
            <div className="admin-hero-main">
              <span className={`admin-status-dot ${systemState.tone}`} />
              <div>
                <p className="admin-eyebrow">État général</p>
                <h2>{systemState.label}</h2>
                <p>
                  Score calculé avec disponibilité, sécurité, comptes bloqués et activité des sessions.
                </p>
              </div>
            </div>
            <div className="admin-hero-score">
              <strong>{security.healthScore || 0}</strong>
              <span>/100</span>
            </div>
            <div className="admin-window-switch" role="group" aria-label="Fenêtre d'analyse">
              {WINDOW_OPTIONS.map((option) => (
                <button
                  key={option.days}
                  type="button"
                  className={windowDays === option.days ? 'active' : ''}
                  onClick={() => setWindowDays(option.days)}
                  disabled={isLoading}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="admin-command-strip" aria-label="Signaux rapides console admin">
            <div className="admin-command-pill">
              <span className="admin-command-icon live"><Bell size={16} /></span>
              <div>
                <strong>{commandSignals.notificationCount}</strong>
                <span>signal prioritaire</span>
              </div>
            </div>
            <div className="admin-command-pill">
              <span className="admin-command-icon"><Star size={16} /></span>
              <div>
                <strong>{security.healthScore || 0}/100</strong>
                <span>score système</span>
              </div>
            </div>
            <div className="admin-command-pill">
              <span className="admin-command-icon"><Clock3 size={16} /></span>
              <div>
                <strong>{commandSignals.lastUpdate}</strong>
                <span>dernière mise à jour</span>
              </div>
            </div>
            <button className="admin-command-pill as-button" type="button" onClick={() => loadAll({ silent: false })} disabled={isLoading}>
              <span className="admin-command-icon"><RefreshCw size={16} /></span>
              <div>
                <strong>Actualiser</strong>
                <span>{isLoading ? 'chargement...' : 'données temps réel'}</span>
              </div>
            </button>
          </section>

          <div className="admin-quick-actions" aria-label="Actions rapides admin">
            <span>Actions rapides</span>
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.path}
                  type="button"
                  className={action.primary ? 'primary' : ''}
                  onClick={() => navigate(action.path)}
                >
                  <Icon size={15} />
                  {action.label}
                </button>
              );
            })}
          </div>

          <div className="admin-focus-grid">
            <section className="admin-card admin-focus-card">
              <div className="admin-card-header">
                <div className="admin-card-title"><Gauge size={18} /> Continuité système</div>
                <span className={`admin-pill ${commandSignals.dbReady && commandSignals.queueReady ? 'ok' : 'warn'}`}>
                  {commandSignals.uptime}
                </span>
              </div>
              <div className="admin-signal-list">
                <div><span>Base de données</span><strong className={commandSignals.dbReady ? 'ok' : 'bad'}>{health?.mongodb?.status || '-'}</strong></div>
                <div><span>File email</span><strong className={commandSignals.queueReady ? 'ok' : 'warn'}>{commandSignals.queueReady ? 'prête' : 'à vérifier'}</strong></div>
                <div><span>Email sortant</span><strong className={commandSignals.emailReady ? 'ok' : 'warn'}>{commandSignals.emailReady ? 'opérationnel' : 'non configuré'}</strong></div>
                <div><span>Incidents</span><strong className={commandSignals.issueCount ? 'bad' : 'ok'}>{commandSignals.issueCount}</strong></div>
              </div>
            </section>

            <section className="admin-card admin-focus-card">
              <div className="admin-card-header">
                <div className="admin-card-title"><Package size={18} /> Alertes IA stock</div>
                <button type="button" className="admin-link-btn" onClick={() => navigate('/admin/supervision-ia')}>Superviser</button>
              </div>
              <div className="admin-alert-preview">
                {aiAlertPreview.length ? aiAlertPreview.map((alert) => (
                  <button
                    type="button"
                    key={alert._id || `${alert.alert_type}-${alert.detected_at}`}
                    className="admin-alert-row"
                    onClick={() => navigate('/admin/supervision-ia')}
                  >
                    <span className={`admin-pill ${alertTone(alert)}`}>{labelAlertType(alert.alert_type)}</span>
                    <div>
                      <strong>{alert?.product?.name || alert?.product?.code_product || 'Produit à vérifier'}</strong>
                      <small>{alert.message || `Risque ${alert.risk_level || 'IA'} détecté`}</small>
                    </div>
                  </button>
                )) : (
                  <div className="admin-ok compact">Aucune alerte IA ouverte.</div>
                )}
              </div>
            </section>
          </div>

          {health?.maintenance?.enabled ? (
            <button className="admin-warn admin-maintenance" type="button" onClick={() => navigate('/admin/parametres')}>
              <AlertTriangle size={16} />
              Maintenance activée{health?.maintenance?.message ? ` : ${health.maintenance.message}` : ''}. Ouvrir les paramètres.
            </button>
          ) : null}

          <div className="admin-kpi-grid">
            <div className="admin-kpi-card">
              <div className="admin-kpi-icon green"><Users size={18} /></div>
              <strong>{security.activeUsers || 0}</strong>
              <span>Utilisateurs actifs</span>
              <small>{security.totalUsers || 0} comptes au total</small>
            </div>
            <div className="admin-kpi-card">
              <div className="admin-kpi-icon blue"><Database size={18} /></div>
              <strong>{health?.mongodb?.status || '-'}</strong>
              <span>Base de données</span>
              <small>{health?.mongodb?.db_name || 'nom indisponible'}</small>
            </div>
            <div className="admin-kpi-card">
              <div className="admin-kpi-icon amber"><ShieldAlert size={18} /></div>
              <strong>{security.recentLoginFailures.length}</strong>
              <span>Connexions échouées</span>
              <small>sur la période sélectionnée</small>
            </div>
            <div className="admin-kpi-card">
              <div className="admin-kpi-icon green"><Brain size={18} /></div>
              <strong>{aiKpis.alerts + aiKpis.predictions}</strong>
              <span>Signaux IA</span>
              <small>{aiKpis.errors} erreur(s) IA récente(s)</small>
            </div>
          </div>

          <div className="admin-dashboard-grid">
            <section className="admin-card admin-card-wide">
              <div className="admin-card-header">
                <div className="admin-card-title"><BarChart3 size={18} /> Activité sécurité</div>
                <span className="admin-card-meta">{windowDays === 1 ? 'dernières 24h' : `${windowDays} derniers jours`}</span>
              </div>
              <div className="admin-chart">
                {activitySeries.map((item) => {
                  const total = item.connexions + item.erreurs + item.securite;
                  const height = Math.max(8, Math.round((total / maxActivity) * 100));
                  return (
                    <div className="admin-chart-bar-wrap" key={item.date}>
                      <div className="admin-chart-bar" style={{ height: `${height}%` }}>
                        <span className="login" style={{ height: `${Math.max(0, (item.connexions / Math.max(1, total)) * 100)}%` }} />
                        <span className="error" style={{ height: `${Math.max(0, (item.erreurs / Math.max(1, total)) * 100)}%` }} />
                        <span className="event" style={{ height: `${Math.max(0, (item.securite / Math.max(1, total)) * 100)}%` }} />
                      </div>
                      <span>{item.date?.slice(5) || '-'}</span>
                    </div>
                  );
                })}
                {!activitySeries.length ? <div className="admin-empty">Aucune activité sur la période.</div> : null}
              </div>
              <div className="admin-chart-legend">
                <span><i className="login" /> Connexions</span>
                <span><i className="error" /> Échecs</span>
                <span><i className="event" /> Événements</span>
              </div>
            </section>

            <section className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title"><ShieldCheck size={18} /> Décomposition du score</div>
                <span className={`admin-pill ${pillScore(security.healthScore)}`}>{security.healthScore || 0}/100</span>
              </div>
              <div className="admin-score-list">
                {security.breakdown.map((item) => (
                  <div className="admin-score-item" key={item.label}>
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.detail}</span>
                    </div>
                    <b>{item.score}/100</b>
                    <div className="admin-score-track"><span style={{ width: `${item.score}%` }} /></div>
                  </div>
                ))}
                {!security.breakdown.length ? <div className="admin-empty">Score non disponible.</div> : null}
              </div>
            </section>

            <section className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title"><Activity size={18} /> Activité récente</div>
                <button type="button" className="admin-link-btn" onClick={() => navigate('/admin/audit')}>Tout voir</button>
              </div>
              <div className="admin-activity-list">
                {security.recentEvents.slice(0, 6).map((event) => (
                  <button
                    type="button"
                    key={`${event.event_type}-${event.date_event}-${event.email || ''}`}
                    onClick={() => navigate(routeForSecurityEvent(event.event_type))}
                    className="admin-activity-item"
                  >
                    <span className={event.success === false ? 'danger' : 'ok'}>
                      {event.success === false ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                    </span>
                    <div>
                      <strong>{labelSecurityEvent(event.event_type)}</strong>
                      <small>{event.email || event.role || 'Système'} · {formatDate(event.date_event)}</small>
                    </div>
                  </button>
                ))}
                {!security.recentEvents.length ? <div className="admin-ok compact">Aucune activité sensible récente.</div> : null}
              </div>
            </section>

            <section className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title"><LifeBuoy size={18} /> Support utilisateurs</div>
                <button type="button" className="admin-link-btn" onClick={() => navigate('/admin/support')}>Ouvrir</button>
              </div>
              <div className="admin-kv">
                <div><span>Tickets ouverts</span><strong>{supportKpis.open}</strong></div>
                <div><span>Urgents</span><strong>{supportKpis.urgent}</strong></div>
                <div><span>En cours</span><strong>{supportKpis.inProgress}</strong></div>
                <div><span>Résolus aujourd’hui</span><strong>{supportKpis.resolvedToday}</strong></div>
              </div>
              {supportKpis.allZero ? <div className="admin-ok compact">Aucun ticket ouvert.</div> : <div className="admin-warn compact">Tickets à traiter dans la console support.</div>}
            </section>

            <section className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title"><KeyRound size={18} /> Sécurité & accès</div>
                <button type="button" className="admin-link-btn" onClick={() => navigate('/admin/securite')}>Historique</button>
              </div>
              <div className="admin-kv">
                <div><span>Connexions échouées</span><strong>{security.recentLoginFailures.length}</strong></div>
                <div><span>Utilisateurs bloqués</span><strong>{security.blockedUsers}</strong></div>
                <div><span>Sessions actives</span><strong>{security.activeSessions}</strong></div>
                <div><span>Période</span><strong>{windowDays === 1 ? '24h' : `${windowDays}j`}</strong></div>
              </div>
              {security.recentLoginFailures.length === 0 && security.blockedUsers === 0 ? (
                <div className="admin-ok compact">Aucun problème de sécurité récent.</div>
              ) : (
                <div className="admin-warn compact">Des événements de sécurité nécessitent une vérification.</div>
              )}
            </section>

            <section className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title"><Server size={18} /> Temps de réponse</div>
                <button type="button" className="admin-link-btn" onClick={() => setShowPerfDetails((p) => !p)}>
                  {showPerfDetails ? 'Masquer' : 'Détails'}
                </button>
              </div>
              <div className="admin-kv">
                <div><span>Connexion</span><strong>{responseSignals.login}</strong></div>
                <div><span>Vérification système</span><strong>{responseSignals.health}</strong></div>
                <div><span>Assistant IA</span><strong>{responseSignals.ai}</strong></div>
                <div><span>Console admin</span><strong>{responseSignals.admin}</strong></div>
              </div>
              {showPerfDetails ? (
                <div className="admin-perf-details">
                  {perfSummary.topErrors.length ? (
                    perfSummary.topErrors.slice(0, 4).map((x, idx) => (
                      <span key={`${x.key || x.path || 'perf'}-${idx}`}>{labelPerfArea(x)} : {x.error_count} erreur(s)</span>
                    ))
                  ) : (
                    <span>Aucune erreur récente.</span>
                  )}
                </div>
              ) : (
                <div className="admin-note">Lecture simple : rapide, correct, à surveiller.</div>
              )}
            </section>

            <section className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title"><Mail size={18} /> Notifications</div>
                <button type="button" className="admin-link-btn" onClick={() => navigate('/admin/parametres')}>Configurer</button>
              </div>
              <div className="admin-kv">
                <div><span>Email</span><strong>{yesNo(health?.smtp?.configured)}</strong></div>
                <div><span>Service email</span><strong>{health?.smtp?.ok ? 'opérationnel' : 'à vérifier'}</strong></div>
                <div><span>SMS</span><strong>{yesNo(Boolean(health?.messaging?.twilio?.sms_configured))}</strong></div>
                <div><span>WhatsApp</span><strong>{yesNo(Boolean(health?.messaging?.twilio?.whatsapp_configured))}</strong></div>
              </div>
              {health?.smtp?.configured && !health?.smtp?.ok ? <div className="admin-warn compact">Service email indisponible.</div> : null}
            </section>

            <section className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title"><MessageCircle size={18} /> Problèmes détectés</div>
                <span className="admin-card-meta">{healthIssues.critical.length + healthIssues.warnings.length} signalement(s)</span>
              </div>
              {healthIssues.critical.length ? (
                <ul className="admin-list">
                  {healthIssues.critical.slice(0, 4).map((x) => <li key={x}>{labelHealthIssue(x)}</li>)}
                </ul>
              ) : (
                <div className="admin-ok compact">Aucun problème critique.</div>
              )}
              {healthIssues.warnings.length ? (
                <ul className="admin-list admin-list-warning">
                  {healthIssues.warnings.slice(0, 4).map((x) => <li key={x}>{labelHealthIssue(x)}</li>)}
                </ul>
              ) : null}
            </section>

            <section className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title"><Brain size={18} /> Résumé IA</div>
                <button type="button" className="admin-link-btn" onClick={() => navigate('/admin/supervision-ia')}>Superviser</button>
              </div>
              <div className="admin-kv">
                <div><span>Alertes IA</span><strong>{aiKpis.alerts}</strong></div>
                <div><span>Prédictions</span><strong>{aiKpis.predictions}</strong></div>
                <div><span>Modèles</span><strong>{aiKpis.models}</strong></div>
                <div><span>Erreurs récentes</span><strong>{aiKpis.errors}</strong></div>
              </div>
              <div className="admin-note">Les actions détaillées restent dans Supervision IA.</div>
            </section>
          </div>

          <div className="admin-footer-note">
            <Clock3 size={15} />
            Dernière mise à jour : {formatDate(overview?.generated_at || health?.generated_at)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
