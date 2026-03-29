import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ShieldAlert,
  Activity,
  History,
  ClipboardCheck,
  Bot,
  MessageCircle,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from 'lucide-react';
import logoETAP from '../../assets/logoETAP.png';
import { useUiLanguage } from '../../utils/uiLanguage';
import useProtectedFileUrl from '../../hooks/useProtectedFileUrl';
import './SidebarResp.css';

const SidebarResp = ({ collapsed, onToggle, onLogout, userName }) => {
  const language = useUiLanguage();
  const location = useLocation();
  const sessionUserName =
    sessionStorage.getItem('userName') ||
    localStorage.getItem('userName') ||
    userName ||
    'Utilisateur';
  const profileImage = sessionStorage.getItem('imageProfile') || localStorage.getItem('imageProfile') || '';
  const avatarUrl = useProtectedFileUrl(profileImage);

  const labels = {
    fr: {
      dashboard: 'Dashboard',
      pilotage: 'Pilotage',
      flux: 'Flux',
      inventaires: 'Inventaires',
      transactions: 'Transactions',
      chatbot: 'Assistant IA',
      chat: 'Chat',
      parametres: 'Paramètres',
      logout: 'Déconnexion',
    },
    en: {
      dashboard: 'Dashboard',
      pilotage: 'Control Center',
      flux: 'Feed',
      inventaires: 'Inventory',
      transactions: 'Transactions',
      chatbot: 'AI Assistant',
      chat: 'Chat',
      parametres: 'Settings',
      logout: 'Logout',
    },
    ar: {
      dashboard: 'Dashboard',
      pilotage: 'Pilotage',
      flux: 'Flux',
      inventaires: 'Inventaires',
      transactions: 'Transactions',
      chatbot: 'Assistant IA',
      chat: 'Chat',
      parametres: 'Paramètres',
      logout: 'Déconnexion',
    },
  }[language] || {};

  const menuItems = [
    { icon: LayoutDashboard, label: labels.dashboard, path: '/responsable' },
    { icon: ShieldAlert, label: labels.pilotage, path: '/responsable/pilotage' },
    { icon: Activity, label: labels.flux || 'Flux', path: '/responsable/flux' },
    { icon: ClipboardCheck, label: labels.inventaires || 'Inventaires', path: '/responsable/inventaires' },
    { icon: History, label: labels.transactions, path: '/responsable/transactions' },
    { icon: Bot, label: labels.chatbot, path: '/responsable/chatbot' },
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
