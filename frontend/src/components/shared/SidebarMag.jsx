import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Package, History, MessageCircle, Settings, ChevronLeft, ChevronRight, LogOut, FileText } from 'lucide-react';
import './SidebarMag.css';

const SidebarMag = ({ collapsed, onToggle, onLogout }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const menuItems = [
    { icon: Package, label: 'Produits', path: '/' },
    { icon: History, label: 'Historique', path: '/historique' },
    { icon: FileText, label: 'Demandes', path: '/demandes' },
    { icon: MessageCircle, label: 'Chat', path: '/chat' },
    { icon: Settings, label: 'Paramètres', path: '/parametres' },
  ];

  const handleLogout = () => {
    // Appeler onLogout pour réinitialiser l'état d'authentification
    if (onLogout) {
      onLogout();
    }
    // La redirection vers /login sera automatique via App.tsx quand isAuthenticated devient false
  };

  return (
    <aside className={`sidebar-mag ${collapsed ? 'collapsed' : ''}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <span>E</span>
        </div>
        {!collapsed && (
          <div className="sidebar-logo-text">
            <span className="sidebar-logo-title">MAGASINIER</span>
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

      {/* Navigation */}
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

      {/* Logout Button */}
      <div className="sidebar-logout">
        <button onClick={handleLogout} className="sidebar-logout-btn">
          <LogOut size={20} />
          {!collapsed && <span>Déconnexion</span>}
        </button>
      </div>
    </aside>
  );
};

export default SidebarMag;
