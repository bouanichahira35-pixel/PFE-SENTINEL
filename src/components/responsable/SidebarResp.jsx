import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, History, MessageCircle, Settings, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import logoETAP from '../../assets/logoETAP.png';
import './SidebarResp.css';

const SidebarResp = ({ collapsed, onToggle, onLogout, userName }) => {
  const location = useLocation();
  const sessionUserName = userName || sessionStorage.getItem('userName') || localStorage.getItem('userName') || 'Utilisateur';

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/responsable' },
    { icon: History, label: 'Historique', path: '/responsable/historique' },
    { icon: MessageCircle, label: 'Chat', path: '/responsable/chat' },
    { icon: Settings, label: 'Parametres', path: '/responsable/parametres' },
  ];

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    }
  };

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
          {!collapsed && <span>Deconnexion</span>}
        </button>
      </div>
    </aside>
  );
};

export default SidebarResp;
