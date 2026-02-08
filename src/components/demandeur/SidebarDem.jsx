import { Link, useLocation } from 'react-router-dom';
import { Package, FileText, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import logoETAP from '../../assets/logoETAP.png';
import './SidebarDem.css';

const SidebarDem = ({ collapsed, onToggle, onLogout }) => {
  const location = useLocation();

  const menuItems = [
    { icon: Package, label: 'Produits', path: '/demandeur' },
    { icon: FileText, label: 'Mes Demandes', path: '/demandeur/mes-demandes' },
  ];

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    }
  };

  return (
    <aside className={`sidebar-dem ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-logo">
        <img src={logoETAP} alt="ETAP" className="sidebar-logo-img" />
        {!collapsed && (
          <div className="sidebar-logo-text">
            <span className="sidebar-logo-title">DEMANDEUR</span>
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

export default SidebarDem;
