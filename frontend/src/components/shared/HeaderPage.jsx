import { Search, Bell, Moon, Sun, User, RefreshCw } from 'lucide-react';
import logoETAP from '../../assets/logoETAP.png';
import useTheme from '../../hooks/useTheme';
import './HeaderPage.css';

const HeaderPage = ({ userName, title, searchValue, onSearchChange, showSearch = true, onRefresh }) => {
  const { isDarkMode, toggleTheme } = useTheme();

  return (
    <header className="header-page" role="banner">
      <div className="header-left">
        <img src={logoETAP} alt="ETAP Logo" className="header-logo" />
        <h1 className="header-title">{title}</h1>
      </div>

      <div className="header-center">
        {showSearch && (
          <div className="header-search">
            <Search size={18} className="header-search-icon" aria-hidden="true" />
            <input
              type="search"
              placeholder="Rechercher..."
              value={searchValue || ''}
              onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
              className="header-search-input"
              aria-label="Rechercher"
            />
          </div>
        )}
      </div>

      <div className="header-right">
        {onRefresh && (
          <button 
            className="header-icon-btn"
            onClick={onRefresh}
            title="Actualiser"
            aria-label="Actualiser la liste"
          >
            <RefreshCw size={20} />
          </button>
        )}
        <button 
          className="header-icon-btn"
          onClick={toggleTheme}
          title={isDarkMode ? 'Mode clair' : 'Mode sombre'}
          aria-label={isDarkMode ? 'Activer le mode clair' : 'Activer le mode sombre'}
          aria-pressed={isDarkMode}
        >
          {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <button 
          className="header-icon-btn"
          title="Notifications"
          aria-label="Voir les notifications"
        >
          <Bell size={20} />
        </button>
        <div className="header-user">
          <div className="header-avatar" aria-hidden="true">
            <User size={18} />
          </div>
          <span className="header-username">{userName}</span>
        </div>
      </div>
    </header>
  );
};

export default HeaderPage;
