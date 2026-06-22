// BLOC 1 - Role du fichier.
// Ce fichier fournit un composant React specialise pour SidebarResp.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FlaskConical,
  History,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  PackageSearch,
  Settings,
  ShoppingCart,
  Truck,
} from 'lucide-react';
import logoETAP from '../../assets/logoETAP.png';
import { useUiLanguage } from '../../utils/uiLanguage';
import './SidebarResp.css';

/* ─── Helpers ─────────────────────────────────── */
const norm = (s = '') => (s.startsWith('?') ? s : s ? `?${s}` : '');
const normH = (h = '') => (h.startsWith('#') ? h : h ? `#${h}` : '');

function isActive(location, item) {
  if (location.pathname !== item.to) return false;
  if (item.search && !String(location.search).includes(item.search)) return false;
  if (item.hash   && String(location.hash) !== normH(item.hash))     return false;
  return true;
}

function badge(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  const n = Math.max(0, Math.floor(Number(v)));
  return !Number.isFinite(n) ? '' : n > 99 ? '99+' : String(n);
}

/* ─── Structure de navigation ─────────────────── */
function useSections(labels, badges) {
  return useMemo(() => [
    {
      key: 'dashboard',
      title: labels.tableauDeBord,
      defaultOpen: true,
      items: [
        { key: 'vue',     icon: LayoutDashboard, label: labels.vueGenerale,     to: '/responsable' },
      ],
    },
    {
      key: 'validation',
      title: labels.validation,
      defaultOpen: true,
      items: [
        { key: 'requests', icon: ClipboardList,  label: labels.demandes,    to: '/responsable/pilotage',              search: 'tab=validations', badge: badges.demandes    },
        { key: 'inv',      icon: ClipboardCheck, label: labels.inventaires, to: '/responsable/inventaires',                                      badge: badges.inventaires },
      ],
    },
    {
      key: 'stock',
      title: labels.stock,
      defaultOpen: false,
      items: [
        { key: 'produits',  icon: PackageSearch, label: labels.produits,        to: '/responsable/categories' },
        { key: 'critiques', icon: AlertTriangle,  label: labels.critiques,       to: '/responsable/produits',   search: 'filter=critiques', badge: badges.critiques },
        { key: 'chimique',  icon: FlaskConical,   label: labels.chimique,        to: '/responsable/registre-chimique' },
        { key: 'tx',        icon: History,        label: labels.transactions,    to: '/responsable/transactions' },
      ],
    },
    {
      key: 'supply',
      title: labels.approvisionnement,
      defaultOpen: false,
      items: [
        { key: 'fournisseurs', icon: Truck,        label: labels.fournisseurs, to: '/responsable/fournisseurs' },
        { key: 'commandes',    icon: ShoppingCart, label: labels.commandes,    to: '/responsable/commandes/nouvelle' },
      ],
    },
    {
      key: 'communication',
      title: labels.communication,
      defaultOpen: true,
      items: [
        { key: 'chat', icon: MessageCircle, label: labels.chat, to: '/responsable/chat' },
      ],
    },
    {
      key: 'analyse',
      title: labels.analyse,
      defaultOpen: false,
      items: [
        { key: 'alertes',   icon: AlertTriangle, label: labels.alertes,      to: '/responsable/pilotage', search: 'tab=alertes', badge: badges.alertes },
        { key: 'assistant', icon: Bot,           label: labels.assistant,    to: '/responsable/chatbot' },
      ],
    },
    {
      key: 'account',
      title: labels.compte,
      defaultOpen: false,
      items: [
        { key: 'settings', icon: Settings, label: labels.parametres, to: '/responsable/parametres' },
        { key: 'logout',   icon: LogOut,   label: labels.deconnexion, action: 'logout' },
      ],
    },
  ], [labels, badges]);
}

/* ─── Traductions ─────────────────────────────── */
const LABELS = {
  fr: {
    tableauDeBord: 'TABLEAU DE BORD', vueGenerale: 'Vue générale',
    validation: 'VALIDATION',         demandes: 'Demandes à valider', inventaires: 'Inventaires',
    stock: 'STOCK',                   produits: 'Référentiel produit', critiques: 'Produits critiques',
                                      chimique: 'Registre chimique',  transactions: 'Transactions',
    approvisionnement: 'APPROVISIONNEMENT', fournisseurs: 'Fournisseurs', commandes: 'Commandes',
    communication: 'COMMUNICATION',        chat: 'Chat',
    analyse: 'ANALYSE & IA',          alertes: 'Alertes',
                                      assistant: 'Assistant IA',
    compte: 'COMPTE',                 parametres: 'Paramètres',       deconnexion: 'Déconnexion',
  },
  en: {
    tableauDeBord: 'DASHBOARD',       vueGenerale: 'Overview',
    validation: 'VALIDATION',         demandes: 'Requests', inventaires: 'Inventories',
    stock: 'STOCK',                   produits: 'Product catalog', critiques: 'Critical products',
                                      chimique: 'Chemical register', transactions: 'Transactions',
    approvisionnement: 'SUPPLY',      fournisseurs: 'Suppliers', commandes: 'Orders',
    communication: 'COMMUNICATION',   chat: 'Chat',
    analyse: 'ANALYTICS & AI',        alertes: 'Alerts',
                                      assistant: 'AI Assistant',
    compte: 'ACCOUNT',                parametres: 'Settings',       deconnexion: 'Logout',
  },
};

/* ─── Composant ───────────────────────────────── */
export default function SidebarResp({ collapsed, onToggle, onLogout, userName }) {
  const lang     = useUiLanguage();
  const location = useLocation();
  const labels   = LABELS[lang] ?? LABELS.fr;

  const sessionName  = sessionStorage.getItem('userName') || localStorage.getItem('userName') || userName || 'Utilisateur';

  /* Badges — à brancher sur vos vraies données */
  const badges = useMemo(() => ({
    demandes:    3,
    inventaires: null,
    critiques:   65,
    alertes:     '99+',
  }), []);

  const sections = useSections(labels, badges);

  /* État ouverture sections — persisté localStorage */
  const defaults = useMemo(() => Object.fromEntries(sections.map((s) => [s.key, s.defaultOpen])), [sections]);

  const [open, setOpen] = useState(() => {
    try {
      const raw = localStorage.getItem('sidebar_resp_open');
      const parsed = raw ? JSON.parse(raw) : {};
      return { ...defaults, ...parsed };
    } catch { return defaults; }
  });

  const toggle = useCallback((key) => {
    setOpen((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem('sidebar_resp_open', JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  }, []);

  /* ─── Rendu item ─────────────────────────────── */
  const renderItem = (item, isCollapsed = false) => {
    const Icon      = item.icon;
    const active    = item.action ? false : isActive(location, item);
    const href      = item.search ? `${item.to}${norm(item.search)}` : item.to;
    const to        = item.hash   ? `${href}${normH(item.hash)}`     : href;
    const badgeVal  = badge(item.badge);

    if (item.action === 'logout') {
      return (
        <button key={item.key} type="button" className="sb-item sb-logout" title={item.label} onClick={() => onLogout?.()}>
          <Icon size={18} className="sb-icon" />
          {!isCollapsed && <span className="sb-label">{item.label}</span>}
        </button>
      );
    }

    return (
      <Link key={item.key} to={to} className={`sb-item${active ? ' active' : ''}`} title={item.label}>
        <Icon size={18} className="sb-icon" />
        {!isCollapsed && <span className="sb-label">{item.label}</span>}
        {badgeVal && (
          <span className={`sb-badge${isCollapsed ? ' sm' : ''}`} aria-label={`${badgeVal} éléments`}>
            {badgeVal}
          </span>
        )}
      </Link>
    );
  };

  /* ─── JSX ────────────────────────────────────── */
  return (
    <aside className={`sidebar-resp${collapsed ? ' collapsed' : ''}`} aria-label="Menu responsable">

      {/* ── En-tête / Logo ── */}
      <div className="sb-head">
        <img src={logoETAP} alt="ETAP" className="sb-logo" />

        {!collapsed && (
          <div className="sb-head-body">
            <div className="sb-user-info">
              <span className="sb-username">{sessionName}</span>
            </div>
            <button type="button" className="sb-toggle" onClick={onToggle} aria-label="Réduire">
              <ChevronLeft size={18} />
            </button>
          </div>
        )}

        {collapsed && (
          <button type="button" className="sb-expand" onClick={onToggle} aria-label="Ouvrir">
            <ChevronRight size={15} />
          </button>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className="sb-nav">
        {!collapsed ? (
          /* Mode étendu — sections accordéon */
          sections.map((section) => (
            <div className="sb-section" key={section.key}>
              <button
                type="button"
                className="sb-section-head"
                onClick={() => toggle(section.key)}
                aria-expanded={Boolean(open[section.key])}
              >
                <span>{section.title}</span>
                <ChevronDown size={14} className={`sb-chevron${open[section.key] ? ' open' : ''}`} />
              </button>

              <div className={`sb-section-body${open[section.key] ? '' : ' closed'}`}>
                {section.items.map((item) => renderItem(item, false))}
              </div>
            </div>
          ))
        ) : (
          /* Mode réduit — icônes seules */
          <div className="sb-icons">
            {sections.flatMap((s) => s.items).map((item) => renderItem(item, true))}
          </div>
        )}
      </nav>
    </aside>
  );
}
