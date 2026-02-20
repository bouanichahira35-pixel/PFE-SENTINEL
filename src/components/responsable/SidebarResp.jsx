import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  LineChart,
  ShieldAlert,
  History,
  MessageCircle,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from 'lucide-react';
import logoETAP from '../../assets/logoETAP.png';
import { useUiLanguage } from '../../utils/uiLanguage';
import './SidebarResp.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '');

function resolveProfileUrl(path) {
  if (!path) return '';
  const token = sessionStorage.getItem('token') || localStorage.getItem('token') || '';
  const base = /^https?:\/\//i.test(path) ? path : `${API_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
  if (!token) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}token=${encodeURIComponent(token)}`;
}

const SidebarResp = ({ collapsed, onToggle, onLogout, userName }) => {
  const language = useUiLanguage();
  const location = useLocation();
  const sessionUserName = sessionStorage.getItem('userName') || localStorage.getItem('userName') || userName || 'Utilisateur';
  const profileImage = sessionStorage.getItem('imageProfile') || localStorage.getItem('imageProfile') || '';
  const avatarUrl = resolveProfileUrl(profileImage);

  const labels = {
    fr: {
      dashboard: 'Dashboard',
      analyse: 'Analyse',
      surveillance: 'Surveillance',
      transactions: 'Transactions',
      chat: 'Chat',
      parametres: 'Parametres',
      logout: 'Deconnexion',
    },
    en: {
      dashboard: 'Dashboard',
      analyse: 'Analytics',
      surveillance: 'Monitoring',
      transactions: 'Transactions',
      chat: 'Chat',
      parametres: 'Settings',
      logout: 'Logout',
    },
    ar: {
      dashboard: 'لوحة القيادة',
      analyse: 'التحليل',
      surveillance: 'المراقبة',
      transactions: 'المعاملات',
      chat: 'الدردشة',
      parametres: 'الإعدادات',
      logout: 'تسجيل الخروج',
    },
  }[language] || {};

  const menuItems = [
    { icon: LayoutDashboard, label: labels.dashboard, path: '/responsable' },
    { icon: LineChart, label: labels.analyse, path: '/responsable/analyse' },
    { icon: ShieldAlert, label: labels.surveillance, path: '/responsable/surveillance' },
    { icon: History, label: labels.transactions, path: '/responsable/transactions' },
    { icon: MessageCircle, label: labels.chat, path: '/responsable/chat' },
    { icon: Settings, label: labels.parametres, path: '/responsable/parametres' },
  ];

  return (
    <aside className={`sidebar-resp ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-logo">
        <img src={logoETAP} alt="ETAP" className="sidebar-logo-img" />
        {!collapsed && (
          <div className="sidebar-logo-text">
            <div className="sidebar-logo-ident">
              <span className="sidebar-logo-title">RESPONSABLE</span>
              <span className="sidebar-user-name">{sessionUserName}</span>
            </div>
            {avatarUrl && <img src={avatarUrl} alt="Profil" className="sidebar-user-avatar" />}
            <button onClick={onToggle} className="sidebar-toggle-btn">
              <ChevronLeft size={20} />
            </button>
          </div>
        )}
        {collapsed && (
          <button onClick={onToggle} className="sidebar-expand-btn">
            <ChevronRight size={16} />
          </button>
        )}
      </div>

      <nav className="sidebar-nav">
        {menuItems.map((item, index) => {
          const isActive = location.pathname === item.path;
          const IconComponent = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
              style={{ animationDelay: `${index * 45}ms` }}
            >
              <IconComponent className="sidebar-nav-icon" size={20} />
              {!collapsed && <span className="sidebar-nav-label">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-logout">
        <button onClick={onLogout} className="sidebar-logout-btn">
          <LogOut size={20} />
          {!collapsed && <span>{labels.logout}</span>}
        </button>
      </div>
    </aside>
  );
};

export default SidebarResp;
