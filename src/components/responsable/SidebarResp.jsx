import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  ClipboardCheck,
  ClipboardList,
  FlaskConical,
  History,
  Layers,
  LayoutDashboard,
  LineChart,
  LogOut,
  ShoppingCart,
  Settings,
  Truck,
} from 'lucide-react';
import logoETAP from '../../assets/logoETAP.png';
import { useUiLanguage } from '../../utils/uiLanguage';
import useProtectedFileUrl from '../../hooks/useProtectedFileUrl';
import './SidebarResp.css';

function normalizeSearch(search) {
  const raw = String(search || '').trim();
  if (!raw) return '';
  return raw.startsWith('?') ? raw : `?${raw}`;
}

function normalizeHash(hash) {
  const raw = String(hash || '').trim();
  if (!raw) return '';
  return raw.startsWith('#') ? raw : `#${raw}`;
}

function isActiveLink(location, item) {
  if (location.pathname !== item.to) return false;
  if (item.search && !String(location.search || '').includes(item.search)) return false;
  if (item.hash && String(location.hash || '') !== normalizeHash(item.hash)) return false;
  return true;
}

function formatBadgeValue(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  const n = Math.max(0, Math.floor(Number(value || 0)));
  if (!Number.isFinite(n)) return '';
  return n > 99 ? '99+' : String(n);
}

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

  const labels = useMemo(() => ({
    fr: {
      tableauBord: 'TABLEAU DE BORD',
      vueGenerale: 'Vue générale',
      validation: 'VALIDATION',
      demandesATraiter: 'Demandes à traiter',
      inventairesAValider: 'Inventaires à valider',
      stockRisques: 'STOCK & RISQUES',
      referentielProduit: 'Référentiel produit',
      produitsCritiques: 'Produits critiques',
      reglesStock: 'Règles métier du stock',
      transactions: 'Transactions',
      approvisionnement: 'APPROVISIONNEMENT',
      fournisseurs: 'Fournisseurs',
      commandesFournisseurs: 'Commandes fournisseurs',
      retardsFournisseurs: 'Retards fournisseurs',
      analyseAide: 'ANALYSE & AIDE',
      analyse: 'Analyse',
      consommation: 'Consommation',
      alertes: 'Alertes',
      aideDecision: 'Aide à la décision',
      hseSecurite: 'HSE & Sécurité',
      registreChimique: 'Registre chimique',
      compte: 'COMPTE',
      parametres: 'Paramètres',
      logout: 'Déconnexion',
    },
    en: {
      tableauBord: 'DASHBOARD',
      vueGenerale: 'Overview',
      validation: 'VALIDATION',
      demandesATraiter: 'Requests to process',
      inventairesAValider: 'Inventories to validate',
      stockRisques: 'STOCK & RISKS',
      referentielProduit: 'Products catalog',
      produitsCritiques: 'Critical products',
      reglesStock: 'Stock business rules',
      transactions: 'Transactions',
      approvisionnement: 'SUPPLY',
      fournisseurs: 'Suppliers',
      commandesFournisseurs: 'Supplier orders',
      retardsFournisseurs: 'Supplier delays',
      analyseAide: 'ANALYTICS & HELP',
      analyse: 'Analytics',
      consommation: 'Consumption',
      alertes: 'Alerts',
      aideDecision: 'Decision support',
      hseSecurite: 'HSE & Safety',
      registreChimique: 'Chemical register',
      compte: 'ACCOUNT',
      parametres: 'Settings',
      logout: 'Logout',
    },
    ar: {
      tableauBord: 'TABLEAU DE BORD',
      vueGenerale: 'Vue générale',
      validation: 'VALIDATION',
      demandesATraiter: 'Demandes à traiter',
      inventairesAValider: 'Inventaires à valider',
      stockRisques: 'STOCK & RISQUES',
      referentielProduit: 'Référentiel produit',
      produitsCritiques: 'Produits critiques',
      reglesStock: 'Règles métier du stock',
      transactions: 'Transactions',
      approvisionnement: 'APPROVISIONNEMENT',
      fournisseurs: 'Fournisseurs',
      commandesFournisseurs: 'Commandes fournisseurs',
      retardsFournisseurs: 'Retards fournisseurs',
      analyseAide: 'ANALYSE & AIDE',
      analyse: 'Analyse',
      consommation: 'Consommation',
      alertes: 'Alertes',
      aideDecision: 'Aide à la décision',
      hseSecurite: 'HSE & Sécurité',
      registreChimique: 'Registre chimique',
      compte: 'COMPTE',
      parametres: 'Paramètres',
      logout: 'Déconnexion',
    },
  }[language] || {}), [language]);

  const badges = useMemo(() => ({
    demandes: 3,
    inventaires: 0,
    produitsCritiques: 65,
    lots: 0,
    alertes: '99+',
    retardsFournisseurs: 0,
  }), []);

  const sections = useMemo(
    () => [
      {
        key: 'dashboard',
        title: labels.tableauBord,
        defaultOpen: true,
        items: [
          { key: 'vue', icon: LayoutDashboard, label: labels.vueGenerale, to: '/responsable' },
        ],
      },
      {
        key: 'validation',
        title: labels.validation,
        defaultOpen: true,
        items: [
          { key: 'requests', icon: ClipboardList, label: labels.demandesATraiter, to: '/responsable/pilotage', search: 'tab=validations', badge: badges.demandes },
          { key: 'inv', icon: ClipboardCheck, label: labels.inventairesAValider, to: '/responsable/inventaires/a-valider', badge: badges.inventaires },
        ],
      },
      {
        key: 'stock',
        title: labels.stockRisques,
        defaultOpen: false,
        items: [
          { key: 'ref', icon: Layers, label: labels.referentielProduit, to: '/responsable/categories' },
          { key: 'critiques', icon: AlertTriangle, label: labels.produitsCritiques, to: '/responsable/produits', search: 'filter=critiques', badge: badges.produitsCritiques },
          { key: 'rules', icon: Settings, label: labels.reglesStock, to: '/responsable/regles-stock' },
          { key: 'chemreg', icon: FlaskConical, label: labels.registreChimique, to: '/responsable/registre-chimique' },
          { key: 'tx', icon: History, label: labels.transactions, to: '/responsable/transactions' },
        ],
      },
      {
        key: 'supply',
        title: labels.approvisionnement,
        defaultOpen: false,
        items: [
          { key: 'suppliers', icon: Truck, label: labels.fournisseurs, to: '/responsable/fournisseurs' },
          { key: 'po', icon: ShoppingCart, label: labels.commandesFournisseurs, to: '/responsable/commandes/nouvelle' },
          { key: 'late', icon: Clipboard, label: labels.retardsFournisseurs, to: '/responsable/fournisseurs', search: 'filter=retards', badge: badges.retardsFournisseurs },
        ],
      },
      {
        key: 'analysis',
        title: labels.analyseAide,
        defaultOpen: false,
        items: [
          { key: 'analyse', icon: LineChart, label: labels.analyse, to: '/responsable/pilotage', search: 'tab=analyse' },
          { key: 'conso', icon: LineChart, label: labels.consommation, to: '/responsable/consommation' },
          { key: 'alertes', icon: AlertTriangle, label: labels.alertes, to: '/responsable/pilotage', search: 'tab=alertes', badge: badges.alertes },
          { key: 'assistant', icon: Bot, label: labels.aideDecision, to: '/responsable/chatbot' },
        ],
      },
      {
        key: 'account',
        title: labels.compte,
        defaultOpen: false,
        items: [
          { key: 'settings', icon: Settings, label: labels.parametres, to: '/responsable/parametres' },
          { key: 'logout', icon: LogOut, label: labels.logout, action: 'logout' },
        ],
      },
    ],
    [badges, labels]
  );

  const defaultOpenSections = useMemo(() => {
    const base = {};
    sections.forEach((section) => {
      base[section.key] = Boolean(section.defaultOpen);
    });
    return base;
  }, [sections]);

  const [openSections, setOpenSections] = useState(() => {
    try {
      const raw = localStorage.getItem('resp_sidebar_sections');
      if (!raw) return defaultOpenSections;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return defaultOpenSections;
      const next = { ...defaultOpenSections };
      Object.keys(next).forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(parsed, key)) next[key] = Boolean(parsed[key]);
      });
      return next;
    } catch {
      return defaultOpenSections;
    }
  });

  const persistOpenSections = useCallback((next) => {
    setOpenSections(next);
    try {
      localStorage.setItem('resp_sidebar_sections', JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const toggleSection = useCallback(
    (key) => {
      persistOpenSections({ ...openSections, [key]: !openSections[key] });
    },
    [openSections, persistOpenSections]
  );

  const handleLogout = useCallback(() => {
    onLogout?.();
  }, [onLogout]);

  return (
    <aside className={`sidebar-resp ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-logo">
        <img src={logoETAP} alt="ETAP" className="sidebar-logo-img" />
        {!collapsed && (
          <div className="sidebar-logo-text">
            <div className="sidebar-logo-ident">
              <span className="sidebar-logo-title">RESPONSABLE</span>
              <span className="sidebar-logo-subtitle">- VALIDATION</span>
              <span className="sidebar-user-name">{sessionUserName}</span>
            </div>
            {avatarUrl && <img src={avatarUrl} alt="Profil" className="sidebar-user-avatar" />}
            <button onClick={onToggle} className="sidebar-toggle-btn" type="button" aria-label="Réduire le menu">
              <ChevronLeft size={20} />
            </button>
          </div>
        )}
        {collapsed && (
          <button onClick={onToggle} className="sidebar-expand-btn" type="button" aria-label="Ouvrir le menu">
            <ChevronRight size={16} />
          </button>
        )}
      </div>

      <nav className="sidebar-nav" aria-label="Menu responsable">
        {!collapsed ? (
          <div className="sidebar-sections">
            {sections.map((section) => (
              <div className="sidebar-section" key={section.key}>
                <button
                  type="button"
                  className="sidebar-section-head"
                  onClick={() => toggleSection(section.key)}
                  aria-expanded={Boolean(openSections[section.key])}
                >
                  <span className="sidebar-section-title">{section.title}</span>
                  <ChevronDown className={`sidebar-section-chevron ${openSections[section.key] ? 'open' : ''}`} size={16} />
                </button>

                <div className={`sidebar-section-items ${openSections[section.key] ? 'open' : 'closed'}`} aria-hidden={!openSections[section.key]}>
                  {section.items.map((item) => {
                    const IconComponent = item.icon;
                    const active = item.action ? false : isActiveLink(location, item);
                    const toBase = item.search ? `${item.to}${normalizeSearch(item.search)}` : item.to;
                    const to = item.hash ? `${toBase}${normalizeHash(item.hash)}` : toBase;
                    const badgeLabel = formatBadgeValue(item.badge);

                    if (item.action === 'logout') {
                      return (
                        <button
                          key={item.key}
                          type="button"
                          className="sidebar-nav-item sidebar-nav-item-btn"
                          title={item.label}
                          onClick={handleLogout}
                        >
                          <IconComponent className="sidebar-nav-icon" size={20} />
                          <span className="sidebar-nav-label">{item.label}</span>
                        </button>
                      );
                    }

                    return (
                      <Link key={item.key} to={to} className={`sidebar-nav-item ${active ? 'active' : ''}`} title={item.label}>
                        <IconComponent className="sidebar-nav-icon" size={20} />
                        <span className="sidebar-nav-label">{item.label}</span>
                        {badgeLabel !== '' ? <span className="sidebar-nav-badge" aria-label={`Badge ${badgeLabel}`}>{badgeLabel}</span> : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="sidebar-collapsed-items">
            {sections.flatMap((s) => s.items).map((item) => {
              const IconComponent = item.icon;
              const active = item.action ? false : isActiveLink(location, item);
              const toBase = item.search ? `${item.to}${normalizeSearch(item.search)}` : item.to;
              const to = item.hash ? `${toBase}${normalizeHash(item.hash)}` : toBase;
              const badgeLabel = formatBadgeValue(item.badge);

              if (item.action === 'logout') {
                return (
                  <button
                    key={item.key}
                    type="button"
                    className="sidebar-nav-item sidebar-nav-item-btn"
                    title={item.label}
                    onClick={handleLogout}
                  >
                    <IconComponent className="sidebar-nav-icon" size={20} />
                  </button>
                );
              }

              return (
                <Link key={item.key} to={to} className={`sidebar-nav-item ${active ? 'active' : ''}`} title={item.label}>
                  <IconComponent className="sidebar-nav-icon" size={20} />
                  {badgeLabel !== '' ? <span className="sidebar-nav-badge collapsed" aria-label={`Badge ${badgeLabel}`}>{badgeLabel}</span> : null}
                </Link>
              );
            })}
          </div>
        )}
      </nav>
    </aside>
  );
};

export default SidebarResp;
