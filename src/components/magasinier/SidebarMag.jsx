import { Link, useLocation } from 'react-router-dom';
import { Package, History, FileText, MessageCircle, Settings, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import logoETAP from '../../assets/logoETAP.png';
import { useUiLanguage } from '../../utils/uiLanguage';
import './SidebarMag.css';

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

const SidebarMag = ({ collapsed, onToggle, onLogout, userName }) => {
  const language = useUiLanguage();
  const location = useLocation();
  const sessionUserName = sessionStorage.getItem('userName') || localStorage.getItem('userName') || userName || 'Utilisateur';
  const profileImage = sessionStorage.getItem('imageProfile') || localStorage.getItem('imageProfile') || '';
  const avatarUrl = resolveProfileUrl(profileImage);

  const labels = {
    fr: { produits: 'Produits', demandes: 'Demandes', historique: 'Historique', chat: 'Chat', parametres: 'Parametres', logout: 'Deconnexion' },
    en: { produits: 'Products', demandes: 'Requests', historique: 'History', chat: 'Chat', parametres: 'Settings', logout: 'Logout' },
    ar: { produits: 'Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª', demandes: 'Ø§Ù„Ø·Ù„Ø¨Ø§Øª', historique: 'Ø§Ù„Ø³Ø¬Ù„', chat: 'Ø§Ù„Ø¯Ø±Ø¯Ø´Ø©', parametres: 'Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª', logout: 'ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø®Ø±ÙˆØ¬' },
  }[language] || {};

  const menuItems = [
    { icon: Package, label: labels.produits, path: '/magasinier' },
    { icon: FileText, label: labels.demandes, path: '/magasinier/demandes' },
    { icon: History, label: labels.historique, path: '/magasinier/historique' },
    { icon: MessageCircle, label: labels.chat, path: '/magasinier/chat' },
    { icon: Settings, label: labels.parametres, path: '/magasinier/parametres' },
  ];

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    }
  };

  return (
    <aside className={`sidebar-mag ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-logo">
        <img src={logoETAP} alt="ETAP" className="sidebar-logo-img" />
        {!collapsed && (
          <div className="sidebar-logo-text">
            <div className="sidebar-logo-ident">
              <span className="sidebar-logo-title">MAGASINIER</span>
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
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <IconComponent className="sidebar-nav-icon" size={20} />
              {!collapsed && (
                <span className="sidebar-nav-label">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-logout">
        <button onClick={handleLogout} className="sidebar-logout-btn">
          <LogOut size={20} />
          {!collapsed && <span>{labels.logout}</span>}
        </button>
      </div>
    </aside>
  );
};

export default SidebarMag;

