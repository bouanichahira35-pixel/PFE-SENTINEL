// BLOC 1 - Role du fichier.
// Ce fichier fournit un composant React partage pour HeaderPage.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { useEffect, useRef, useState } from 'react';
import { Search, Bell, Moon, Sun, User, RefreshCw, Menu } from 'lucide-react';
import useTheme from '../../hooks/useTheme';
import { get, patch } from '../../services/api';
import { useUiLanguage } from '../../utils/uiLanguage';
import useProtectedFileUrl from '../../hooks/useProtectedFileUrl';
import './HeaderPage.css';

const HeaderPage = ({
  userName,
  title,
  subtitle,
  icon,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  showSearch = true,
  onRefresh,
  onMenuClick,
}) => {
  const language = useUiLanguage();
  const { isDarkMode, toggleTheme } = useTheme();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [requestReplyMailEnabled, setRequestReplyMailEnabled] = useState(true);
  const [notifPrefLoading, setNotifPrefLoading] = useState(false);
  const [notifPrefSaving, setNotifPrefSaving] = useState(false);
  const [notifPrefLoaded, setNotifPrefLoaded] = useState(false);
  const notifRef = useRef(null);
  const [profileImage, setProfileImage] = useState(sessionStorage.getItem('imageProfile') || localStorage.getItem('imageProfile') || '');
  const currentRole = (sessionStorage.getItem('userRole') || localStorage.getItem('userRole') || '').toLowerCase();
  const isDemandeur = currentRole === 'demandeur';

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const displayName = sessionStorage.getItem('userName') || localStorage.getItem('userName') || userName;
  const avatarUrl = useProtectedFileUrl(profileImage);
  const i18n = {
    fr: {
      search: 'Rechercher...',
      refresh: 'Actualiser',
      light: 'Mode clair',
      dark: 'Mode sombre',
      notifications: 'Notifications',
      loading: 'Chargement...',
      none: 'Aucune notification',
      notifItemTitle: 'Notification',
      searchAria: 'Rechercher',
      refreshAria: 'Actualiser la liste',
      lightAria: 'Activer le mode clair',
      darkAria: 'Activer le mode sombre',
      notifAria: 'Voir les notifications',
      replyMailLabel: 'Email reponses de mes demandes',
      replyMailDesc: 'Recevoir un email seulement quand la demande est traitee',
      markAllRead: 'Tout marquer comme lu',
      bySubject: 'Par sujet',
      enabled: 'Active',
      disabled: 'Desactive',
    },
    en: {
      search: 'Search...',
      refresh: 'Refresh',
      light: 'Light mode',
      dark: 'Dark mode',
      notifications: 'Notifications',
      loading: 'Loading...',
      none: 'No notifications',
      notifItemTitle: 'Notification',
      searchAria: 'Search',
      refreshAria: 'Refresh list',
      lightAria: 'Enable light mode',
      darkAria: 'Enable dark mode',
      notifAria: 'Open notifications',
      replyMailLabel: 'Request response emails',
      replyMailDesc: 'Receive email only when your request is processed',
      markAllRead: 'Mark all as read',
      bySubject: 'By subject',
      enabled: 'Enabled',
      disabled: 'Disabled',
    },
    ar: {
      search: 'بحث...',
      refresh: 'تحديث',
      light: 'الوضع الفاتح',
      dark: 'الوضع الداكن',
      notifications: 'الإشعارات',
      loading: 'جار التحميل...',
      none: 'لا توجد إشعارات',
      notifItemTitle: 'إشعار',
      searchAria: 'بحث',
      refreshAria: 'تحديث القائمة',
      lightAria: 'تفعيل الوضع الفاتح',
      darkAria: 'تفعيل الوضع الداكن',
      notifAria: 'عرض الإشعارات',
    },
  }[language] || {};

  const loadNotifications = async () => {
    setLoadingNotifications(true);
    try {
      const items = await get('/notifications');
      setNotifications((items || []).slice(0, 12));
    } catch {
      setNotifications([]);
    } finally {
      setLoadingNotifications(false);
    }
  };

  const loadDemandeurMailPreference = async () => {
    if (!isDemandeur || notifPrefLoaded || notifPrefLoading) return;
    setNotifPrefLoading(true);
    try {
      const me = await get('/settings/me');
      const enabled = me?.preferences?.notifications?.demandesAlerts ?? true;
      setRequestReplyMailEnabled(Boolean(enabled));
      setNotifPrefLoaded(true);
    } catch {
      // keep notification panel usable even if settings load fails
    } finally {
      setNotifPrefLoading(false);
    }
  };

  const handleToggleReplyMail = async (nextEnabled) => {
    if (!isDemandeur || notifPrefSaving) return;
    const previous = requestReplyMailEnabled;
    setRequestReplyMailEnabled(nextEnabled);
    setNotifPrefSaving(true);
    try {
      await patch('/settings/me/preferences', {
        notifications: {
          demandesAlerts: nextEnabled,
        },
      });
      setNotifPrefLoaded(true);
    } catch {
      setRequestReplyMailEnabled(previous);
    } finally {
      setNotifPrefSaving(false);
    }
  };

  const toggleNotifications = async () => {
    const next = !notificationsOpen;
    setNotificationsOpen(next);
    if (next) {
      await Promise.all([
        loadNotifications(),
        loadDemandeurMailPreference(),
      ]);
    }
  };

  const markNotificationRead = async (id) => {
    try {
      await patch(`/notifications/${id}/read`, {});
      setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, is_read: true } : n)));
    } catch {
      // keep panel usable even if mark-read fails
    }
  };

  const markAllNotificationsRead = async () => {
    if (!unreadCount) return;
    try {
      await patch('/notifications/read-all', {});
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      // keep panel usable even if mark-all fails
    }
  };

  const formatNotificationDate = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(language === 'en' ? 'en-US' : 'fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const classifyNotification = (notification) => {
    const event = String(notification?.event_type || '').toLowerCase();
    const titleText = String(notification?.title || '').toLowerCase();
    const messageText = String(notification?.message || '').toLowerCase();
    const raw = `${event} ${titleText} ${messageText}`;

    if (
      event.includes('inventory_to_validate')
      || event.includes('recount_finished')
      || raw.includes('en attente de validation')
    ) {
      return { context: 'Inventaire' };
    }

    if (
      event.includes('stock_anomaly')
      || raw.includes('anomalie')
      || raw.includes('sortie anormale')
    ) {
      return { context: 'Anomalies' };
    }

    if (
      event.includes('inventory')
      || event.includes('recount')
      || raw.includes('inventaire')
      || raw.includes('recomptage')
      || raw.includes('mission')
    ) {
      return { context: 'Inventaire' };
    }

    if (
      event.includes('request_receipt_confirmed')
      || raw.includes('reception confirmee')
      || raw.includes('a confirme la reception')
    ) {
      return { context: 'Demandes' };
    }

    if (
      event.includes('request_served_for_demandeur')
    ) {
      return { context: 'Demandes' };
    }

    if (
      event.includes('request')
      || raw.includes('demande')
      || raw.includes('statut de votre demande')
      || raw.includes('demande cloturee')
    ) {
      return { context: 'Demandes' };
    }

    if (
      event.includes('product')
      || raw.includes('catalogue')
      || raw.includes('produit archive')
      || raw.includes('nouveau produit')
    ) {
      return { context: 'Catalogue' };
    }

    if (
      event.includes('supplier')
      || event.includes('purchase')
      || raw.includes('fournisseur')
      || raw.includes('commande')
    ) {
      return { context: 'Achats' };
    }

    if (
      raw.includes('stock')
      || raw.includes('sortie')
      || raw.includes('rupture')
      || raw.includes('seuil')
    ) {
      return { context: 'Stock' };
    }

    if (
      event.includes('user')
      || event.includes('support')
      || event.includes('admin')
      || event.includes('email')
      || event.includes('login')
      || event.includes('password')
    ) {
      return { context: 'Administration' };
    }

    return { context: 'General' };
  };

  const groupedNotifications = ['Demandes', 'Inventaire', 'Anomalies', 'Stock', 'Catalogue', 'Achats', 'Administration', 'General']
    .map((context) => {
      const items = notifications
        .map((n) => ({ ...n, notificationGroup: classifyNotification(n) }))
        .filter((n) => n.notificationGroup.context === context);

      return {
        context,
        label: context,
        unread: items.filter((n) => !n.is_read).length,
        items,
      };
    })
    .filter((group) => group.items.length > 0);

  useEffect(() => {
    loadNotifications();
  }, []);

  useEffect(() => {
    if (!notificationsOpen) return undefined;
    const onClickOutside = (event) => {
      if (!notifRef.current) return;
      if (!notifRef.current.contains(event.target)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [notificationsOpen]);

  useEffect(() => {
    const syncProfile = () => {
      setProfileImage(sessionStorage.getItem('imageProfile') || localStorage.getItem('imageProfile') || '');
    };
    window.addEventListener('profile-updated', syncProfile);
    window.addEventListener('storage', syncProfile);
    return () => {
      window.removeEventListener('profile-updated', syncProfile);
      window.removeEventListener('storage', syncProfile);
    };
  }, []);

  return (
    <header className="header-page" role="banner">
      <div className="header-left">
        {onMenuClick && (
          <button
            type="button"
            className="header-icon-btn header-menu-btn"
            onClick={onMenuClick}
            aria-label="Ouvrir le menu"
            title="Menu"
          >
            <Menu size={20} />
          </button>
        )}
        <div className="header-title-block">
          <div className="header-title-row">
            {icon && <span className="header-title-icon" aria-hidden="true">{icon}</span>}
            <h1 className="header-title">{title}</h1>
          </div>
          {subtitle && <div className="header-subtitle">{subtitle}</div>}
        </div>
      </div>

      <div className="header-center">
        {showSearch && (
          <div className="header-search">
            <Search size={18} className="header-search-icon" aria-hidden="true" />
            <input
              type="search"
              placeholder={searchPlaceholder || i18n.search}
              value={searchValue || ''}
              onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
              className="header-search-input"
              aria-label={i18n.searchAria}
            />
          </div>
        )}
      </div>

      <div className="header-right">
        {onRefresh && (
          <button
            className="header-icon-btn"
            onClick={onRefresh}
            title={i18n.refresh}
            aria-label={i18n.refreshAria}
          >
            <RefreshCw size={20} />
          </button>
        )}
        <button
          className="header-icon-btn"
          onClick={toggleTheme}
          title={isDarkMode ? i18n.light : i18n.dark}
          aria-label={isDarkMode ? i18n.lightAria : i18n.darkAria}
          aria-pressed={isDarkMode}
        >
          {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <div className="header-notif-wrap" ref={notifRef}>
          <button
            className="header-icon-btn header-notif-btn"
            onClick={toggleNotifications}
            title={i18n.notifications}
            aria-label={i18n.notifAria}
          >
            <Bell size={20} />
            {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>
          {notificationsOpen && (
            <div className="notif-panel" role="dialog" aria-label="Notifications">
              <div className="notif-panel-header">
                <strong>{i18n.notifications}</strong>
                <button
                  type="button"
                  className="notif-mark-all"
                  onClick={markAllNotificationsRead}
                  disabled={loadingNotifications || unreadCount === 0}
                >
                  {i18n.markAllRead || 'Tout marquer comme lu'}
                </button>
              </div>
              {isDemandeur && (
                <div className="notif-settings-row">
                  <div className="notif-settings-text">
                    <div className="notif-settings-title">{i18n.replyMailLabel || 'Email des reponses de demandes'}</div>
                    <div className="notif-settings-desc">{i18n.replyMailDesc || 'Recevoir un email uniquement quand la demande est traitee'}</div>
                    <div className="notif-settings-state">
                      {notifPrefLoading ? i18n.loading : (requestReplyMailEnabled ? (i18n.enabled || 'Active') : (i18n.disabled || 'Desactive'))}
                    </div>
                  </div>
                  <label className="notif-switch" aria-label={i18n.replyMailLabel || 'Email des reponses de demandes'}>
                    <input
                      type="checkbox"
                      checked={requestReplyMailEnabled}
                      disabled={notifPrefLoading || notifPrefSaving}
                      onChange={(e) => handleToggleReplyMail(e.target.checked)}
                    />
                    <span className="notif-switch-slider"></span>
                  </label>
                </div>
              )}
              <div className="notif-list">
                {loadingNotifications && <div className="notif-empty">{i18n.loading}</div>}
                {!loadingNotifications && notifications.length === 0 && (
                  <div className="notif-empty">{i18n.none}</div>
                )}
                {!loadingNotifications && groupedNotifications.length > 0 && (
                  <div className="notif-groups" aria-label={i18n.bySubject || 'Par sujet'}>
                    {groupedNotifications.map((group) => (
                      <section className="notif-group" key={group.context}>
                        <div className="notif-group-header">
                          <span>{group.label}</span>
                          <span>{group.unread > 0 ? `${group.unread}/${group.items.length}` : group.items.length}</span>
                        </div>
                        {group.items.map((n) => (
                          <button
                            key={n._id}
                            className={`notif-item ${n.is_read ? 'read' : 'unread'}`}
                            onClick={() => markNotificationRead(n._id)}
                            aria-label={`${n.title || i18n.notifItemTitle}. ${n.message || ''}`}
                          >
                            <div className="notif-item-top">
                              <div className="notif-title">{n.title || i18n.notifItemTitle}</div>
                              {formatNotificationDate(n.createdAt) && (
                                <span className="notif-date">{formatNotificationDate(n.createdAt)}</span>
                              )}
                            </div>
                            <div className="notif-context">{n.notificationGroup.context}</div>
                            <div className="notif-message">{n.message || '-'}</div>
                          </button>
                        ))}
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="header-user">
          <div className="header-avatar" aria-hidden="true">
            {avatarUrl ? <img src={avatarUrl} alt="Profil" className="header-avatar-img" /> : <User size={18} />}
          </div>
          <span className="header-username">{displayName}</span>
        </div>
      </div>
    </header>
  );
};

export default HeaderPage;
