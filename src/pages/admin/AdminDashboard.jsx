import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Server,
  Database,
  Mail,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  Users,
  KeyRound,
  Wrench,
  MessageCircle,
  LifeBuoy,
} from 'lucide-react';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { get } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import './AdminDashboard.css';

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
  if (n >= 70) return { label: 'À surveiller', tone: 'warn' };
  return { label: 'Problème détecté', tone: 'bad' };
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('fr-FR');
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

const AdminDashboard = ({ userName, onLogout }) => {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  ));
  const [isLoading, setIsLoading] = useState(false);
  const [health, setHealth] = useState(null);
  const [assistantStatus, setAssistantStatus] = useState(null);
  const [overview, setOverview] = useState(null);
  const [perf, setPerf] = useState(null);
  const [supportSummary, setSupportSummary] = useState(null);
  const [weeklyAiSummary, setWeeklyAiSummary] = useState(null);
  const [lastRefreshAt, setLastRefreshAt] = useState(null);
  const [showPerfDetails, setShowPerfDetails] = useState(false);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [h, assistant, ov, pf, sup, weekly] = await Promise.all([
        get('/health').catch(() => null),
        get('/ai/assistant/status').catch(() => null),
        get('/admin/overview').catch(() => null),
        get('/admin/perf?window_ms=900000&limit=6').catch(() => null),
        get('/admin/support/summary').catch(() => null),
        get('/admin/ai/weekly-summary?days=7&limit=6').catch(() => null),
      ]);
      setHealth(h);
      setAssistantStatus(assistant);
      setOverview(ov);
      setPerf(pf);
      setSupportSummary(sup);
      setWeeklyAiSummary(weekly);
      setLastRefreshAt(new Date().toISOString());
    } catch (err) {
      toast.error(err.message || 'Erreur chargement console admin');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

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
    return {
      recentLoginFailures,
      blockedUsers: Number(overview?.users?.blocked || 0),
      totalUsers: Number(overview?.users?.total || 0),
      activeSessions: Number(overview?.sessions?.active || 0),
      healthScore: Number(overview?.system_health?.score || 0),
      signals: overview?.system_health?.signals || {},
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

  const systemSummary = useMemo(() => {
    const mongodbOk = Boolean(security.signals?.mongodb_ok ?? (health?.mongodb?.ready_state === 1));
    const assistantOk = Boolean(assistantStatus?.ok);
    const predictionsEnabled = Boolean(assistantStatus?.ai_config?.predictionsEnabled);
    const geminiConfigured = Boolean(assistantStatus?.gemini?.configured);
    const geminiModel = String(assistantStatus?.gemini?.model_default || '').trim();
    const modelsTrained = Boolean(assistantStatus?.models?.trained);
    const modelVersion = String(assistantStatus?.models?.model_version || '').trim();
    const criticalCount = healthIssues.critical.length;

    const appLine = systemState.label === 'opérationnel'
      ? 'L’application fonctionne correctement.'
      : (systemState.label === 'À surveiller'
        ? 'L’application fonctionne, avec des points à surveiller.'
        : (systemState.label === 'Problème détecté'
          ? 'Des problèmes ont été détectés sur l’application.'
          : 'État global indisponible pour le moment.'));

    const dbLine = mongodbOk ? 'La base de données est connectée.' : 'La base de données doit être vérifiée.';
    let aiLine = assistantOk ? 'L’assistant IA est disponible.' : 'L’assistant IA est indisponible.';
    if (assistantOk) {
      if (!predictionsEnabled) {
        aiLine = "IA désactivée dans la configuration (prédictions OFF).";
      } else {
        const parts = [];
        parts.push(geminiConfigured ? 'Gemini: OK' : 'Gemini: à configurer');
        if (geminiModel) parts.push(`modèle: ${geminiModel}`);
        parts.push(modelsTrained ? 'modèles: entraînés' : 'modèles: à entraîner');
        if (modelVersion) parts.push(`version: ${modelVersion}`);
        aiLine = `IA — ${parts.join(' • ')}`;
      }
    }
    const incidentsLine = criticalCount === 0 ? 'Aucun incident critique détecté.' : `${criticalCount} problème(s) critique(s) détecté(s).`;

    return { appLine, dbLine, aiLine, incidentsLine };
  }, [assistantStatus, health, healthIssues.critical.length, security.signals, systemState.label]);

  const weeklyReport = useMemo(() => {
    const text = String(weeklyAiSummary?.report?.text || '').trim();
    return {
      ok: Boolean(weeklyAiSummary?.ok) && Boolean(text),
      text,
      generatedAt: weeklyAiSummary?.generated_at || null,
      cached: Boolean(weeklyAiSummary?.cached),
      source: weeklyAiSummary?.report?.source || null,
      chatbotReady: Boolean(weeklyAiSummary?.stats?.chatbot?.ready),
      geminiConfigured: Boolean(weeklyAiSummary?.stats?.chatbot?.gemini_configured),
      pythonState: weeklyAiSummary?.stats?.chatbot?.python?.state || null,
    };
  }, [weeklyAiSummary]);

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
          title="Console Admin"
          subtitle="Suivi du système, des utilisateurs, de la sécurité et de l’IA"
          icon={<Server size={24} />}
        />
        {isLoading && <LoadingSpinner overlay text="Chargement..." />}

        <div className="admin-page">
          <div className="admin-toolbar">
            <button className="admin-btn" type="button" onClick={loadAll} disabled={isLoading}>
              <RefreshCw size={16} />
              <span>Actualiser</span>
            </button>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className={`admin-pill ${systemState.tone}`}>État : {systemState.label}</span>
              <span className={`admin-pill ${pillScore(security.healthScore)}`}>Score système : {security.healthScore || 0}/100</span>
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
            <div className="admin-card admin-card-wide">
              <div className="admin-card-title"><Server size={18} /> Résumé du système</div>
              <div className="admin-summary-lines">
                <div>{systemSummary.appLine}</div>
                <div>{systemSummary.dbLine}</div>
                <div>{systemSummary.aiLine}</div>
                <div>{systemSummary.incidentsLine}</div>
              </div>
              <div className="admin-note" style={{ marginTop: 10 }}>
                Dernière mise à jour : <strong>{formatDateTime(lastRefreshAt)}</strong>
              </div>
            </div>

            <div className="admin-card admin-card-wide admin-ai-weekly">
              <div className="admin-card-title"><Sparkles size={18} /> Résumé IA (hebdo)</div>

              <div className="admin-ai-weekly-strip">
                <div className="admin-ai-weekly-strip-icon">
                  <Sparkles size={18} />
                </div>
                <div className="admin-ai-weekly-strip-body">
                  <div className="admin-ai-weekly-strip-title">Petit rapport génératif sur les 7 derniers jours</div>
                  <div className="admin-ai-weekly-strip-meta">
                    {weeklyReport.generatedAt ? `Généré : ${formatDateTime(weeklyReport.generatedAt)}` : 'Génération en attente'}
                    {weeklyReport.cached ? ' • cache' : ''}
                    {weeklyReport.source ? ` • source : ${weeklyReport.source}` : ''}
                  </div>
                </div>
                <div className="admin-ai-weekly-strip-right">
                  <span className={`admin-pill ${weeklyReport.chatbotReady ? 'ok' : 'warn'}`}>
                    Chatbot : {weeklyReport.chatbotReady ? 'OK' : 'À vérifier'}
                  </span>
                </div>
              </div>

              {weeklyReport.ok ? (
                <div className="admin-ai-weekly-report" aria-label="Résumé IA hebdomadaire">
                  {weeklyReport.text}
                </div>
              ) : (
                <div className="admin-warn">
                  Résumé IA indisponible pour le moment. Cliquez sur « Actualiser » pour réessayer.
                </div>
              )}

              {!weeklyReport.chatbotReady ? (
                <div className="admin-note" style={{ marginTop: 10 }}>
                  Détails : Gemini {weeklyReport.geminiConfigured ? 'configuré' : 'non configuré'} • Python {weeklyReport.pythonState || 'inconnu'}.
                </div>
              ) : null}
            </div>

            <div className="admin-card">
              <div className="admin-card-title"><LifeBuoy size={18} /> Support utilisateurs</div>
              <div className="admin-kv">
                <div><span>Tickets ouverts</span><strong>{supportKpis.open}</strong></div>
                <div><span>Urgents</span><strong>{supportKpis.urgent}</strong></div>
                <div><span>En cours</span><strong>{supportKpis.inProgress}</strong></div>
                <div><span>Résolus aujourd’hui</span><strong>{supportKpis.resolvedToday}</strong></div>
              </div>
              {supportKpis.allZero ? <div className="admin-ok">Aucun ticket ouvert.</div> : null}
              <div className="admin-note" style={{ marginTop: 10 }}>
                <a href="/admin/support" style={{ color: '#1d4ed8', fontWeight: 1000, textDecoration: 'underline' }}>
                  Voir tickets
                </a>
              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card-title"><Database size={18} /> Base de données</div>
              <div className="admin-kv">
                <div><span>Statut</span><strong>{health?.mongodb?.status || '-'}</strong></div>
                <div><span>Nom</span><strong>{health?.mongodb?.db_name || '-'}</strong></div>
              </div>
              {health?.mongodb?.critical ? <div className="admin-warn">Problème critique : base de données non connectée</div> : null}
            </div>

            <div className="admin-card">
              <div className="admin-card-title"><Mail size={18} /> Email</div>
              <div className="admin-kv">
                <div><span>Configuré</span><strong>{String(health?.smtp?.configured ?? '-')}</strong></div>
                <div><span>OK</span><strong>{String(health?.smtp?.ok ?? '-')}</strong></div>
              </div>
              {health?.smtp?.configured && !health?.smtp?.ok ? <div className="admin-warn">Alerte : service Email indisponible</div> : null}
            </div>

            <div className="admin-card">
              <div className="admin-card-title"><MessageCircle size={18} /> SMS / WhatsApp</div>
              <div className="admin-kv">
                <div><span>SMS</span><strong>{health?.messaging?.twilio?.sms_configured ? 'activé' : 'non activé'}</strong></div>
                <div><span>WhatsApp</span><strong>{health?.messaging?.twilio?.whatsapp_configured ? 'activé' : 'non activé'}</strong></div>
              </div>
              <div className="admin-note">
                Ces options peuvent être activées plus tard pour les notifications.
              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card-title"><ShieldAlert size={18} /> Problèmes détectés</div>
              <div className="admin-kv">
                <div><span>Problèmes critiques</span><strong>{healthIssues.critical.length}</strong></div>
                <div><span>Avertissements</span><strong>{healthIssues.warnings.length}</strong></div>
              </div>
              {healthIssues.critical.length ? (
                <ul className="admin-list">
                  {healthIssues.critical.slice(0, 4).map((x) => <li key={x}>{x}</li>)}
                </ul>
              ) : (
                <div className="admin-ok">Aucun problème critique.</div>
              )}
            </div>

            <div className="admin-card">
              <div className="admin-card-title"><KeyRound size={18} /> Sécurité</div>
              <div className="admin-kv">
                <div><span>Connexions échouées</span><strong>{security.recentLoginFailures.length}</strong></div>
                <div><span>Utilisateurs bloqués</span><strong>{security.blockedUsers}</strong></div>
                <div><span>Utilisateurs connectés</span><strong>{security.activeSessions}</strong></div>
                <div><span>Voir l’historique</span><strong>24h</strong></div>
              </div>
              {security.recentLoginFailures.length === 0 && security.blockedUsers === 0 ? (
                <div className="admin-ok">Aucun problème de sécurité récent.</div>
              ) : (
                <div className="admin-warn">Des événements de sécurité ont été détectés. Voir l’historique.</div>
              )}
              <div className="admin-note" style={{ marginTop: 10 }}>
                <a href="/admin/securite" style={{ color: '#1d4ed8', fontWeight: 1000, textDecoration: 'underline' }}>
                  Voir l’historique
                </a>
              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card-title"><Users size={18} /> Comptes et connexions</div>
              <div className="admin-kv">
                <div><span>Utilisateurs</span><strong>{security.totalUsers || '-'}</strong></div>
                <div><span>Utilisateurs bloqués</span><strong>{security.blockedUsers}</strong></div>
                <div><span>Utilisateurs connectés</span><strong>{security.activeSessions}</strong></div>
              </div>
              <div className="admin-note">
                Détails disponibles dans les pages “Sessions” et “Utilisateurs”.
              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card-title"><Server size={18} /> Temps de réponse</div>
              <div className="admin-kv">
                <div><span>Connexion</span><strong>{responseSignals.login}</strong></div>
                <div><span>Vérification système</span><strong>{responseSignals.health}</strong></div>
                <div><span>Assistant IA</span><strong>{responseSignals.ai}</strong></div>
                <div><span>Console admin</span><strong>{responseSignals.admin}</strong></div>
              </div>
              <div className="admin-note">
                Règle simple : <strong>rapide</strong>, <strong>correct</strong>, <strong>à surveiller</strong>.
              </div>
              <button
                className="admin-btn"
                type="button"
                onClick={() => setShowPerfDetails((p) => !p)}
                style={{ marginTop: 10 }}
              >
                <span>{showPerfDetails ? 'Masquer détails' : 'Voir détails'}</span>
              </button>
              {showPerfDetails ? (
                <div style={{ marginTop: 10 }}>
                  {perfSummary.topErrors.length ? (
                    <ul className="admin-list">
                      {perfSummary.topErrors.slice(0, 4).map((x) => (
                        <li key={x.key}>
                          {x.key} — {x.error_count} erreur(s)
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="admin-ok">Aucune erreur récente.</div>
                  )}
                  {perfSummary.topSlow.length ? (
                    <ul className="admin-list" style={{ marginTop: 8 }}>
                      {perfSummary.topSlow.slice(0, 4).map((x) => (
                        <li key={x.key}>
                          {x.key} — p95 {x.p95_ms ?? '-'}ms
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
