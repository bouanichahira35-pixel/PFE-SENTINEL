import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Bot,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from 'lucide-react';
import logoETAP from '../../assets/logoETAP.png';
import useProtectedFileUrl from '../../hooks/useProtectedFileUrl';
import { useUiLanguage } from '../../utils/uiLanguage';
import './SidebarAdmin.css';

const SidebarAdmin = ({ collapsed, onToggle, onLogout, userName }) => {
  const language = useUiLanguage();
  const location = useLocation();
  const sessionUserName =
    sessionStorage.getItem('userName') ||
    localStorage.getItem('userName') ||
    userName ||
    'Administrateur';
  const profileImage = sessionStorage.getItem('imageProfile') || localStorage.getItem('imageProfile') || '';
  const avatarUrl = useProtectedFileUrl(profileImage);

  const labels = {
    fr: {
      dashboard: 'Console',
      users: 'Utilisateurs',
      ia: 'Supervision IA',
      settings: 'Parametres',
      logout: 'Deconnexion',
    },
    en: {
      dashboard: 'Console',
      users: 'Users',
      ia: 'AI Supervision',
      settings: 'Settings',
      logout: 'Logout',
    },
    ar: {
      dashboard: 'Console',
      users: 'Utilisateurs',
      ia: 'Supervision IA',
      settings: 'Parametres',
      logout: 'Deconnexion',
    },
  }[language] || {};

  const menuItems = [
    { icon: LayoutDashboard, label: labels.dashboard, path: '/admin' },
    { icon: Users, label: labels.users, path: '/admin/utilisateurs' },
    { icon: Bot, label: labels.ia, path: '/admin/ia' },
    { icon: Settings, label: labels.settings, path: '/admin/parametres' },
  ];

  return (
    <aside className={`sidebar-admin ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-logo">
        <img src={logoETAP} alt="ETAP" className="sidebar-logo-img" />
        {!collapsed && (
          <div className="sidebar-logo-text">
            <div className="sidebar-logo-ident">
              <span className="sidebar-logo-title">ADMIN</span>
              <span className="sidebar-user-name">{sessionUserName}</span>
            </div>
            {avatarUrl && <img src={avatarUrl} alt="Profil" className="sidebar-user-avatar" />}
            <button onClick={onToggle} className="sidebar-toggle-btn" type="button">
              <ChevronLeft size={20} />
            </button>
          </div>
        )}
        {collapsed && (
          <button onClick={onToggle} className="sidebar-expand-btn" type="button">
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
        <button onClick={onLogout} className="sidebar-logout-btn" type="button">
          <LogOut size={20} />
          {!collapsed && <span>{labels.logout}</span>}
        </button>
      </div>
    </aside>
  );
};

export default SidebarAdmin;

