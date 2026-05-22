import { Link, useLocation } from 'react-router-dom';
import {
  Grid3X3,
  Users,
  Bot,
  Monitor,
  KeyRound,
  ShieldAlert,
  FileText,
  Settings,
  Headset,
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
      section_console: 'CONSOLE',
      section_governance: 'GOUVERNANCE & ACCÈS',
      section_ai: 'PILOTAGE & IA',
      section_settings: 'PARAMÈTRES',
      dashboard: 'Vue générale',
      users: 'Utilisateurs',
      roles_permissions: 'Rôles & permissions',
      sessions: 'Sessions',
      security: 'Sécurité',
      audit: 'Historique / Audit',
      ia: 'Supervision IA',
      support: 'Support utilisateurs',
      settings: 'Paramètres',
      logout: 'Déconnexion',
    },
    en: {
      section_console: 'CONSOLE',
      section_governance: 'GOVERNANCE & ACCESS',
      section_ai: 'PILOTAGE & AI',
      section_settings: 'SETTINGS',
      dashboard: 'Overview',
      users: 'Users',
      roles_permissions: 'Roles & permissions',
      sessions: 'Sessions',
      security: 'Security',
      audit: 'Audit / History',
      ia: 'AI supervision',
      support: 'User support',
      settings: 'Settings',
      logout: 'Logout',
    },
    ar: {
      section_console: 'CONSOLE',
      section_governance: 'GOUVERNANCE & ACCÈS',
      section_ai: 'PILOTAGE & IA',
      section_settings: 'PARAMÈTRES',
      dashboard: 'Vue générale',
      users: 'Utilisateurs',
      roles_permissions: 'Rôles & permissions',
      sessions: 'Sessions',
      security: 'Sécurité',
      audit: 'Historique / Audit',
      ia: 'Supervision IA',
      support: 'Support utilisateurs',
      settings: 'Paramètres',
      logout: 'Déconnexion',
    },
  }[language] || {};

  const sections = [
    {
      title: labels.section_console || 'CONSOLE',
      items: [{ icon: Grid3X3, label: labels.dashboard || 'Vue générale', path: '/admin' }],
    },
    {
      title: labels.section_governance || 'GOUVERNANCE & ACCÈS',
      items: [
        { icon: Users, label: labels.users || 'Utilisateurs', path: '/admin/utilisateurs' },
        { icon: KeyRound, label: labels.roles_permissions || 'Rôles & permissions', path: '/admin/roles-permissions' },
        { icon: Monitor, label: labels.sessions || 'Sessions', path: '/admin/sessions' },
        { icon: ShieldAlert, label: labels.security || 'Sécurité', path: '/admin/securite' },
        { icon: FileText, label: labels.audit || 'Historique / Audit', path: '/admin/audit' },
      ],
    },
    {
      title: labels.section_ai || 'PILOTAGE & IA',
      items: [
        { icon: Bot, label: labels.ia || 'Supervision IA', path: '/admin/supervision-ia' },
        { icon: Headset, label: labels.support || 'Support utilisateurs', path: '/admin/support' },
      ],
    },
    {
      title: labels.section_settings || 'PARAMÈTRES',
      items: [{ icon: Settings, label: labels.settings || 'Paramètres', path: '/admin/parametres' }],
    },
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

      <nav className="sidebar-nav" aria-label="Menu admin">
        {(() => {
          let index = 0;
          return sections.map((section) => (
            <div key={section.title} className="sidebar-section">
              {!collapsed && <div className="sidebar-section-title">{section.title}</div>}
              {section.items.map((item) => {
                const isActive = location.pathname === item.path;
                const IconComponent = item.icon;
                const delay = `${index * 45}ms`;
                index += 1;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                    style={{ animationDelay: delay }}
                  >
                    <IconComponent className="sidebar-nav-icon" size={20} />
                    {!collapsed && <span className="sidebar-nav-label">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ));
        })()}
      </nav>

      <div className="sidebar-logout">
        <button onClick={onLogout} className="sidebar-logout-btn" type="button">
          <LogOut size={20} />
          {!collapsed && <span>{labels.logout || 'Déconnexion'}</span>}
        </button>
      </div>
    </aside>
  );
};

export default SidebarAdmin;

