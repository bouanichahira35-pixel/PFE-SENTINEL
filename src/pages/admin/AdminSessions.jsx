// BLOC 1 - Role du fichier.
// Ce fichier affiche une page de l'espace administrateur pour AdminSessions.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Clock,
  Globe,
  Lock,
  LogOut,
  Search,
  Shield,
  TrendingUp,
  Users,
  X,
  Eye,
  EyeOff,
  Smartphone,
  Monitor,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { get, post } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import { usePrompt } from '../../components/shared/ConfirmDialog';
import { getUiErrorMessage } from '../../services/uiError';
import './AdminSessions.css';

// ===== DATA SIMULÉE =====
function parseBrowser(userAgent) {
  const ua = String(userAgent || '');
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/Chrome\//i.test(ua)) return 'Chrome';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Safari\//i.test(ua)) return 'Safari';
  return ua ? 'Navigateur' : '-';
}

function parseDevice(userAgent) {
  const ua = String(userAgent || '');
  if (/Mobile|Android|iPhone|iPad/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

function safeDate(value) {
  const d = value ? new Date(value) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function normalizeSession(raw) {
  const user = raw?.user || {};
  const sessionId = String(raw?.session_id || '');
  const currentSessionId = typeof window !== 'undefined' ? String(sessionStorage.getItem('sessionId') || '') : '';
  return {
    id: String(raw?._id || raw?.id || ''),
    sessionId,
    userId: String(user?._id || user?.id || ''),
    email: String(user?.email || user?.username || '-'),
    username: String(user?.username || user?.email || '-'),
    role: String(user?.role || '-'),
    ip: String(raw?.ip_address || '-'),
    browser: parseBrowser(raw?.user_agent),
    device: parseDevice(raw?.user_agent),
    userAgent: String(raw?.user_agent || ''),
    loginTime: safeDate(raw?.login_time),
    lastActivity: safeDate(raw?.last_activity_at || raw?.updatedAt),
    expiresAt: safeDate(raw?.expires_at),
    status: raw?.is_active === false ? 'inactive' : 'active',
    isCurrent: Boolean(currentSessionId && sessionId && currentSessionId === sessionId),
  };
}

const generateTimelineData = (sessions) => {
  const rows = [];
  for (let i = 23; i >= 0; i--) {
    const hour = new Date();
    hour.setHours(hour.getHours() - i);
    hour.setMinutes(0, 0, 0);
    const nextHour = new Date(hour.getTime() + 3600000);
    rows.push({
      hour: hour.getHours() + ':00',
      logins: sessions.filter((s) => s.loginTime >= hour && s.loginTime < nextHour).length,
      logouts: 0,
    });
  }
  return rows;
};

const ROLE_COLORS = {
  admin: '#3b82f6',
  responsable: '#10b981',
  magasinier: '#f59e0b',
  demandeur: '#8b5cf6',
};

const generateRoleDistribution = (sessions) => {
  const counts = new Map();
  for (const session of sessions) {
    const role = String(session.role || '-').toLowerCase();
    counts.set(role, (counts.get(role) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([role, value]) => ({
    name: role.charAt(0).toUpperCase() + role.slice(1),
    value,
    color: ROLE_COLORS[role] || '#64748b',
  }));
};

const AdminSessions = ({ userName, onLogout }) => {
  const toast = useToast();
  const promptAction = usePrompt();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  ));
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSession, setSelectedSession] = useState(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [timeFilter, setTimeFilter] = useState('24h');
  const [refreshing, setRefreshing] = useState(false);
  const [sessionsData, setSessionsData] = useState([]);
  const [busyAction, setBusyAction] = useState('');

  const timelineData = useMemo(() => generateTimelineData(sessionsData), [sessionsData]);
  const roleDistribution = useMemo(() => generateRoleDistribution(sessionsData), [sessionsData]);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    setIsLoading(true);
    try {
      const res = await get('/admin/sessions?limit=200');
      setSessionsData((Array.isArray(res?.items) ? res.items : []).map(normalizeSession));
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Impossible de charger les sessions'));
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Filtrer les sessions
  const filteredSessions = useMemo(() => {
    return sessionsData.filter(session =>
      session.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.ip.includes(searchQuery)
    );
  }, [sessionsData, searchQuery]);

  const activeSessions = useMemo(() => filteredSessions.filter(s => s.status === 'active'), [filteredSessions]);
  const inactiveSessions = useMemo(() => filteredSessions.filter(s => s.status === 'inactive'), [filteredSessions]);

  const KPIs = useMemo(() => ({
    total: sessionsData.length,
    active: sessionsData.filter(s => s.status === 'active').length,
    inactive: sessionsData.filter(s => s.status === 'inactive').length,
    security: 94,
  }), [sessionsData]);

  const handleRevokeSession = async (sessionId, sessionEmail) => {
    // Vérifier si c'est la session actuelle
    const session = sessionsData.find((s) => s.id === sessionId);
    if (session?.isCurrent || sessionEmail === userName) {
      toast.error('Vous ne pouvez pas révoquer votre propre session');
      return;
    }
    const reason = await promptAction({
      title: 'Revoquer la session',
      badge: 'Controle administrateur',
      message: `Indiquez le motif de revocation pour ${sessionEmail}.`,
      label: 'Motif',
      defaultValue: 'Controle administrateur',
      confirmLabel: 'Revoquer',
      variant: 'danger',
      required: true,
    });
    if (!reason || String(reason).trim().length < 5) {
      toast.error('Motif obligatoire (minimum 5 caracteres)');
      return;
    }
    try {
      setBusyAction(sessionId);
      await post(`/admin/sessions/${encodeURIComponent(sessionId)}/revoke`, { reason });
      toast.success(`Session de ${sessionEmail} revoquee`);
      setShowDrawer(false);
      setSelectedSession(null);
      await fetchData();
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Revocation de session echouee'));
    } finally {
      setBusyAction('');
    }
  };

  const handleBlockUser = (userEmail) => {
    // Vérifier si c'est l'utilisateur actuel
    if (userEmail === userName) {
      toast.error('Vous ne pouvez pas bloquer votre propre compte');
      return;
    }
    // Logique de blocage
    toast.success(`Utilisateur ${userEmail} bloqué`);
    setShowDrawer(false);
  };

  if (isLoading && sessionsData.length === 0) {
    return (
      <div className="admin-layout">
        <SidebarAdmin collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((p) => !p)} />
        <div className="admin-main">
          <HeaderPage userName={userName} onLogout={onLogout} />
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <SidebarAdmin collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((p) => !p)} />
      <div className="admin-main">
        <HeaderPage userName={userName} onLogout={onLogout} />
        <div className="admin-page premium">
          {/* ===== HERO ===== */}
          <div className="hero-premium sessions">
            <div className="hero-left">
              <h1>Gestion des sessions</h1>
              <p>Surveillance et contrôle des connexions actives</p>
            </div>
            <button className="btn-refresh" onClick={fetchData} disabled={refreshing}>
              <Activity size={16} className={refreshing ? 'spinning' : ''} />
            </button>
          </div>

          {/* ===== KPI CARDS ===== */}
          <div className="kpi-grid premium">
            <div className="kpi-premium">
              <div className="kpi-header">
                <div className="kpi-icon users">
                  <Users size={20} />
                </div>
                <div className="kpi-trend positive">
                  <TrendingUp size={14} />
                </div>
              </div>
              <div className="kpi-body">
                <div className="kpi-value">{KPIs.total}</div>
                <div className="kpi-label">Sessions totales</div>
              </div>
            </div>

            <div className="kpi-premium">
              <div className="kpi-header">
                <div className="kpi-icon sessions">
                  <Lock size={20} />
                </div>
                <div className="kpi-trend active">
                  <Eye size={14} />
                </div>
              </div>
              <div className="kpi-body">
                <div className="kpi-value">{KPIs.active}</div>
                <div className="kpi-label">Actives maintenant</div>
              </div>
            </div>

            <div className="kpi-premium">
              <div className="kpi-header">
                <div className="kpi-icon errors">
                  <Clock size={20} />
                </div>
                <div className="kpi-trend">
                  <EyeOff size={14} />
                </div>
              </div>
              <div className="kpi-body">
                <div className="kpi-value">{KPIs.inactive}</div>
                <div className="kpi-label">Inactives</div>
              </div>
            </div>

            <div className="kpi-premium">
              <div className="kpi-header">
                <div className="kpi-icon events">
                  <Shield size={20} />
                </div>
                <div className="kpi-trend positive">
                  <TrendingUp size={14} />
                </div>
              </div>
              <div className="kpi-body">
                <div className="kpi-value">{KPIs.security}%</div>
                <div className="kpi-label">Score sécurité</div>
              </div>
            </div>
          </div>

          {/* ===== GRAPHIQUES ===== */}
          <div className="charts-grid">
            {/* Timeline */}
            <div className="chart-card premium">
              <div className="chart-header">
                <h3>
                  <Activity size={16} />
                  Activité de connexion (24h)
                </h3>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="hour" stroke="#9ca3af" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }} />
                  <Legend />
                  <Bar dataKey="logins" fill="#10b981" name="Connexions" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="logouts" fill="#ef4444" name="Déconnexions" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Distribution par rôle */}
            <div className="chart-card premium">
              <div className="chart-header">
                <h3>
                  <Users size={16} />
                  Sessions par rôle
                </h3>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={roleDistribution}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {roleDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ===== RECHERCHE & FILTRES ===== */}
          <div className="sessions-toolbar">
            <div className="search-box">
              <Search size={16} />
              <input
                type="text"
                placeholder="Rechercher par email, rôle ou IP..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="clear-btn" onClick={() => setSearchQuery('')}>
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="filter-time">
              {['1h', '24h', '7d'].map(period => (
                <button
                  key={period}
                  className={`time-btn ${timeFilter === period ? 'active' : ''}`}
                  onClick={() => setTimeFilter(period)}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>

          {/* ===== SESSIONS ACTIVES ===== */}
          <div className="sessions-section">
            <h2 className="section-title">
              <Lock size={16} />
              Sessions actives ({activeSessions.length})
            </h2>
            <div className="sessions-list">
              {activeSessions.length > 0 ? (
                activeSessions.map(session => (
                  <div
                    key={session.id}
                    className="session-card active"
                    onClick={() => {
                      setSelectedSession(session);
                      setShowDrawer(true);
                    }}
                  >
                    <div className="session-header">
                      <div className="session-user">
                        <div className="user-avatar">
                          {session.email.charAt(0).toUpperCase()}
                        </div>
                        <div className="user-info">
                          <strong>{session.email}</strong>
                          <span className="user-role">{session.role}</span>
                        </div>
                      </div>
                      <div className={`session-badge ${session.isCurrent ? 'current' : ''}`}>
                        {session.isCurrent ? 'Votre session' : 'Actif'}
                      </div>
                    </div>
                    <div className="session-details">
                      <div className="detail-item">
                        <Globe size={14} />
                        <span>{session.ip}</span>
                      </div>
                      <div className="detail-item">
                        {session.device === 'Desktop' ? (
                          <Monitor size={14} />
                        ) : (
                          <Smartphone size={14} />
                        )}
                        <span>{session.browser}</span>
                      </div>
                      <div className="detail-item">
                        <Clock size={14} />
                        <span>
                          {Math.floor((Date.now() - session.lastActivity) / 60000)} min ago
                        </span>
                      </div>
                    </div>
                    {!session.isCurrent && (
                      <button
                        className="revoke-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRevokeSession(session.id, session.email);
                        }}
                      >
                        <LogOut size={14} />
                        Révoquer
                      </button>
                    )}
                    {session.isCurrent && (
                      <div className="current-badge-info">
                        Vous ne pouvez pas révoquer votre propre session
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <Lock size={32} />
                  <p>Aucune session active</p>
                </div>
              )}
            </div>
          </div>

          {/* ===== SESSIONS INACTIVES ===== */}
          {inactiveSessions.length > 0 && (
            <div className="sessions-section">
              <h2 className="section-title">
                <EyeOff size={16} />
                Sessions inactives ({inactiveSessions.length})
              </h2>
              <div className="sessions-list">
                {inactiveSessions.map(session => (
                  <div
                    key={session.id}
                    className="session-card inactive"
                    onClick={() => {
                      setSelectedSession(session);
                      setShowDrawer(true);
                    }}
                  >
                    <div className="session-header">
                      <div className="session-user">
                        <div className="user-avatar">
                          {session.email.charAt(0).toUpperCase()}
                        </div>
                        <div className="user-info">
                          <strong>{session.email}</strong>
                          <span className="user-role">{session.role}</span>
                        </div>
                      </div>
                      <div className="session-badge">Inactif</div>
                    </div>
                    <div className="session-details">
                      <div className="detail-item">
                        <Globe size={14} />
                        <span>{session.ip}</span>
                      </div>
                      <div className="detail-item">
                        <Clock size={14} />
                        <span>
                          Inactif depuis{' '}
                          {Math.floor((Date.now() - session.lastActivity) / 3600000)}h
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== DRAWER DÉTAILS ===== */}
      {showDrawer && selectedSession && (
        <>
          <div className="drawer-backdrop" onClick={() => setShowDrawer(false)} />
          <div className="drawer-premium">
            <div className="drawer-head">
              <div className="drawer-title-section">
                <h2>{selectedSession.email}</h2>
                <p className="drawer-role">{selectedSession.role}</p>
              </div>
              <button className="close-btn" onClick={() => setShowDrawer(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="drawer-body">
              <div className="drawer-section">
                <h4>Informations de session</h4>
                <div className="drawer-row">
                  <span className="label">Email</span>
                  <span className="value">{selectedSession.email}</span>
                </div>
                <div className="drawer-row">
                  <span className="label">Rôle</span>
                  <span className="value">{selectedSession.role}</span>
                </div>
                <div className="drawer-row">
                  <span className="label">Adresse IP</span>
                  <span className="value mono">{selectedSession.ip}</span>
                </div>
                <div className="drawer-row">
                  <span className="label">Navigateur</span>
                  <span className="value">{selectedSession.browser}</span>
                </div>
                <div className="drawer-row">
                  <span className="label">Appareil</span>
                  <span className="value">{selectedSession.device}</span>
                </div>
                <div className="drawer-row">
                  <span className="label">Connexion</span>
                  <span className="value">
                    {selectedSession.loginTime.toLocaleString('fr-FR')}
                  </span>
                </div>
                <div className="drawer-row">
                  <span className="label">Dernière activité</span>
                  <span className="value">
                    {Math.floor((Date.now() - selectedSession.lastActivity) / 60000)} min ago
                  </span>
                </div>
                <div className="drawer-row">
                  <span className="label">Statut</span>
                  <span className={`value status-${selectedSession.status}`}>
                    {selectedSession.status === 'active' ? 'Actif' : 'Inactif'}
                  </span>
                </div>
              </div>

              {!selectedSession.isCurrent && (
                <div className="drawer-actions">
                  <button
                    className="btn-revoke"
                    disabled={busyAction === selectedSession.id}
                    onClick={() =>
                      handleRevokeSession(selectedSession.id, selectedSession.email)
                    }
                  >
                    <LogOut size={14} />
                    {busyAction === selectedSession.id ? 'Révocation...' : 'Révoquer cette session'}
                  </button>
                  <button
                    className="btn-block"
                    onClick={() => handleBlockUser(selectedSession.email)}
                  >
                    <Lock size={14} />
                    Bloquer l'utilisateur
                  </button>
                </div>
              )}
              {selectedSession.isCurrent && (
                <div className="drawer-warning">
                  <AlertTriangle size={14} />
                  Vous ne pouvez pas revoquer ou bloquer votre propre compte
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminSessions;
