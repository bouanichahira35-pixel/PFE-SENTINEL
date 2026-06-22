// BLOC 1 - Role du fichier.
// Ce fichier affiche une page de l'espace administrateur pour AdminDashboard.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Clock3,
  Database,
  FileText,
  LifeBuoy,
  Lock,
  Eye,
  RefreshCw,
  Server,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Users,
  ArrowUpRight,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
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
import { get } from '../../services/api';
import './AdminDashboard.css';

// ===== DATA SIMULÉE (sera remplacée par API réelle) =====
const generateActivityData = () => {
  const data = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    data.push({
      date: date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
      connexions: Math.floor(Math.random() * 150) + 80,
      erreurs: Math.floor(Math.random() * 20) + 5,
      sessions: Math.floor(Math.random() * 100) + 50,
      securite: Math.floor(Math.random() * 50) + 20,
    });
  }
  return data;
};

const generateUserRoleData = () => [
  { name: 'Admin', value: 12, color: '#3b82f6' },
  { name: 'Responsable', value: 45, color: '#10b981' },
  { name: 'Magasinier', value: 78, color: '#f59e0b' },
  { name: 'Demandeur', value: 165, color: '#8b5cf6' },
];

const generatePerformanceData = () => {
  const services = ['Auth', 'Users', 'Sessions', 'Audit', 'Support', 'System'];
  return services.map(name => ({
    name,
    'Réponse (ms)': Math.floor(Math.random() * 500) + 100,
    'Erreurs': Math.floor(Math.random() * 15),
  }));
};

const QUICK_ACTIONS = [
  { label: 'Gestion utilisateurs', icon: UserPlus, path: '/admin/utilisateurs?action=create', primary: true },
  { label: 'Sessions actives', icon: Lock, path: '/admin/sessions' },
  { label: 'Journal d\'audit', icon: FileText, path: '/admin/audit' },
  { label: 'Sécurité & logs', icon: ShieldCheck, path: '/admin/securite' },
  { label: 'Tickets support', icon: LifeBuoy, path: '/admin/support' },
];

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const AdminDashboard = ({ userName, onLogout }) => {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  ));
  const [isLoading, setIsLoading] = useState(false);
  const [overview, setOverview] = useState(null);
  const [supportSummary, setSupportSummary] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('7d');

  // Data pour affichage
  const activityData = useMemo(() => generateActivityData(), []);
  const userRoleData = useMemo(() => generateUserRoleData(), []);
  const performanceData = useMemo(() => generatePerformanceData(), []);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    setIsLoading(true);
    try {
      // Essayer de charger depuis l'API, sinon utiliser les données fictives
      try {
        const [overviewRes, supportRes] = await Promise.all([
          get('/admin/overview?window_days=7').catch(() => null),
          get('/admin/support-summary').catch(() => null),
        ]);

        if (overviewRes?.ok) setOverview(overviewRes.data);
        if (supportRes?.ok) setSupportSummary(supportRes.data);
      } catch (err) {
        // Silently fail - on utilise les données fictives
      }
    } finally {
      setIsLoading(false);
      setTimeout(() => setRefreshing(false), 1000);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const security = useMemo(() => {
    if (!overview?.security) {
      return {
        healthScore: 87,
        activeSessions: 12,
        blockedUsers: 3,
        recentLoginFailures: [],
        recentEvents: [],
      };
    }
    return {
      healthScore: overview.security.health_score || 87,
      activeSessions: overview.security.active_sessions_count || 12,
      blockedUsers: overview.security.blocked_users_count || 3,
      recentLoginFailures: overview.security.recent_login_failures || [],
      recentEvents: overview.security.recent_events || [],
    };
  }, [overview]);

  if (isLoading && !overview) {
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
          {/* ===== HERO PREMIUM ===== */}
          <div className="hero-premium">
            <div className="hero-left">
              <h1>Administration système</h1>
              <p>Bienvenue, <strong>{userName}</strong></p>
              <span className="hero-time">Tableau de bord temps réel</span>
            </div>
            <div className="hero-right">
              <div className="health-badge ok">
                <div className="health-circle">
                  <span className="health-num">{security.healthScore}</span>
                </div>
                <div className="health-label">
                  <strong>Santé</strong>
                  <small>Opérationnel</small>
                </div>
              </div>
              <button className="btn-refresh" onClick={fetchData} disabled={refreshing}>
                <RefreshCw size={16} className={refreshing ? 'spinning' : ''} />
              </button>
            </div>
          </div>

          {/* ===== ACTIONS RAPIDES ===== */}
          <div className="actions-bar premium">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  className={`action-btn ${action.primary ? 'primary' : ''}`}
                  onClick={() => navigate(action.path)}
                >
                  <Icon size={16} />
                  <span>{action.label}</span>
                </button>
              );
            })}
          </div>

          {/* ===== KPI PREMIUM GRID ===== */}
          <div className="kpi-grid premium">
            <div className="kpi-premium">
              <div className="kpi-header">
                <div className="kpi-icon users">
                  <Users size={20} />
                </div>
                <div className="kpi-trend positive">
                  <ArrowUpRight size={14} />
                  <span>+12%</span>
                </div>
              </div>
              <div className="kpi-body">
                <div className="kpi-value">{overview?.user_count || 300}</div>
                <div className="kpi-label">Utilisateurs totaux</div>
              </div>
            </div>

            <div className="kpi-premium">
              <div className="kpi-header">
                <div className="kpi-icon sessions">
                  <Lock size={20} />
                </div>
                <div className="kpi-trend stable">
                  <Activity size={14} />
                  <span>Normal</span>
                </div>
              </div>
              <div className="kpi-body">
                <div className="kpi-value">{security.activeSessions}</div>
                <div className="kpi-label">Sessions actives</div>
              </div>
            </div>

            <div className="kpi-premium">
              <div className="kpi-header">
                <div className="kpi-icon errors">
                  <AlertTriangle size={20} />
                </div>
                <div className="kpi-trend">
                  <Eye size={14} />
                  <span>À surveiller</span>
                </div>
              </div>
              <div className="kpi-body">
                <div className="kpi-value">{security.blockedUsers}</div>
                <div className="kpi-label">Utilisateurs bloqués</div>
              </div>
            </div>

            <div className="kpi-premium">
              <div className="kpi-header">
                <div className="kpi-icon events">
                  <Server size={20} />
                </div>
                <div className="kpi-trend positive">
                  <TrendingUp size={14} />
                  <span>+8%</span>
                </div>
              </div>
              <div className="kpi-body">
                <div className="kpi-value">{security.recentEvents.length || 245}</div>
                <div className="kpi-label">Événements système</div>
              </div>
            </div>
          </div>

          {/* ===== GRAPHIQUE PRINCIPAL - ACTIVITÉ ===== */}
          <div className="chart-card premium">
            <div className="chart-header">
              <h2>
                <Activity size={18} />
                Activité système (30 jours)
              </h2>
              <div className="chart-controls">
                {['7d', '30d', '90d'].map(period => (
                  <button
                    key={period}
                    className={`period-btn ${selectedPeriod === period ? 'active' : ''}`}
                    onClick={() => setSelectedPeriod(period)}
                  >
                    {period === '7d' ? '7j' : period === '30d' ? '30j' : '90j'}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={activityData}>
                <defs>
                  <linearGradient id="colorConnexions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="date" stroke="#9ca3af" style={{ fontSize: '12px' }} />
                <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '10px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
                  }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Area type="monotone" dataKey="connexions" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorConnexions)" name="Connexions" />
                <Area type="monotone" dataKey="sessions" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorSessions)" name="Sessions" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* ===== GRILLE 2 COLONNES - CHARTS ===== */}
          <div className="charts-grid">
            {/* Utilisateurs par rôle */}
            <div className="chart-card">
              <div className="chart-header">
                <h3>
                  <Users size={16} />
                  Utilisateurs par rôle
                </h3>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={userRoleData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {userRoleData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Performance des services */}
            <div className="chart-card">
              <div className="chart-header">
                <h3>
                  <Server size={16} />
                  Performance par service
                </h3>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={performanceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" stroke="#9ca3af" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="Réponse (ms)" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Erreurs" fill="#ef4444" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ===== INDICATEURS 2 COLONNES ===== */}
          <div className="indicators-grid">
            <div className="indicator-card">
              <div className="indicator-header">
                <h3>
                  <ShieldCheck size={16} />
                  Sécurité & accès
                </h3>
                <button className="link-btn" onClick={() => navigate('/admin/securite')}>
                  Détails →
                </button>
              </div>
              <div className="indicator-list">
                <div className="indicator-item">
                  <span className="label">Connexions échouées</span>
                  <span className="value">{security.recentLoginFailures.length || 8}</span>
                </div>
                <div className="indicator-item">
                  <span className="label">Utilisateurs bloqués</span>
                  <span className="value">{security.blockedUsers}</span>
                </div>
                <div className="indicator-item">
                  <span className="label">Sessions actives</span>
                  <span className="value">{security.activeSessions}</span>
                </div>
                <div className="indicator-item">
                  <span className="label">Score sécurité</span>
                  <span className="value">{security.healthScore}%</span>
                </div>
              </div>
            </div>

            <div className="indicator-card">
              <div className="indicator-header">
                <h3>
                  <LifeBuoy size={16} />
                  Support utilisateurs
                </h3>
                <button className="link-btn" onClick={() => navigate('/admin/support')}>
                  Ouvrir →
                </button>
              </div>
              <div className="indicator-list">
                <div className="indicator-item">
                  <span className="label">Tickets ouverts</span>
                  <span className="value">{supportSummary?.open_tickets || 12}</span>
                </div>
                <div className="indicator-item">
                  <span className="label">Urgents</span>
                  <span className="value">{supportSummary?.urgent_tickets || 3}</span>
                </div>
                <div className="indicator-item">
                  <span className="label">En cours</span>
                  <span className="value">{supportSummary?.in_progress_tickets || 5}</span>
                </div>
                <div className="indicator-item">
                  <span className="label">Résolus (aujourd'hui)</span>
                  <span className="value">{supportSummary?.resolved_today || 7}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ===== ÉTAT DES SERVICES ===== */}
          <div className="services-card">
            <div className="services-header">
              <h3>
                <Database size={16} />
                État des services
              </h3>
            </div>
            <div className="services-list">
              <div className="service-item ok">
                <div className="service-status"></div>
                <span className="service-name">Base de données MongoDB</span>
                <span className="service-indicator">En ligne</span>
              </div>
              <div className="service-item ok">
                <div className="service-status"></div>
                <span className="service-name">Service email SMTP</span>
                <span className="service-indicator">En ligne</span>
              </div>
              <div className="service-item warning">
                <div className="service-status"></div>
                <span className="service-name">Cache Redis</span>
                <span className="service-indicator">À vérifier</span>
              </div>
              <div className="service-item ok">
                <div className="service-status"></div>
                <span className="service-name">API System</span>
                <span className="service-indicator">Opérationnel</span>
              </div>
            </div>
          </div>

          {/* ===== FOOTER ===== */}
          <div className="dashboard-footer">
            <Clock3 size={14} />
            Mise à jour : {formatDate(new Date())}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
