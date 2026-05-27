import { Search, RefreshCw, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import './HeaderMag.css';

const HeaderMag = ({ magasinierName, searchValue, onSearchChange, onRefresh }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  const initials = magasinierName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark');
  };

  return (
    <header className="header-mag">
      <div className="header-search-container">
        <Search className="header-search-icon" size={18} />
        <input
          type="text"
          placeholder="Rechercher un produit..."
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="header-search-input"
        />
      </div>

      <div className="header-actions">
        <button className="header-action-btn" onClick={onRefresh} title="Actualiser">
          <RefreshCw size={20} />
        </button>
        <button className="header-action-btn" onClick={toggleDarkMode} title="Thème">
          {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <div className="header-user">
          <div className="header-avatar">
            {initials}
          </div>
          <span className="header-username">{magasinierName}</span>
        </div>
      </div>
    </header>
  );
};

export default HeaderMag;
