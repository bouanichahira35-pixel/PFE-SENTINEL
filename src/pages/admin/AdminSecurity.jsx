// BLOC 1 - Role du fichier.
// Ce fichier affiche une page de l'espace administrateur pour AdminSecurity.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShieldAlert, RefreshCw, Search, Download,
  Monitor, X, TrendingUp, Users, Wifi,
  AlertTriangle, MapPin, Clock,
  CheckCircle, XCircle, Lock, Activity, FileText, ShieldCheck, Settings, UserCog
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import ProtectedImage from '../../components/shared/ProtectedImage';
import { get } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import { getUiErrorMessage } from '../../services/uiError';
import './AdminDashboard.css';
import './AdminSecurity.css';

function safeStr(value) {
  return String(value || '').trim();
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return safeStr(value).slice(0, 19).replace('T', ' ');
  return d.toLocaleString('fr-FR');
}

function isLocalIp(ip) {
  const s = safeStr(ip);
  return s === '::1' || s.startsWith('127.') || s === 'localhost' || s === '::ffff:127.0.0.1';
}

function getEventStyle(eventType) {
  const t = safeStr(eventType).toLowerCase();
  if (t.includes('failed') || t.includes('fail') || t.includes('reject')) return { cls: 'sec-ev-failed' };
  if (t.includes('logout'))                        return { cls: 'sec-ev-logout' };
  if (t.includes('login') || t.includes('success'))return { cls: 'sec-ev-login' };
  if (t.includes('block'))                         return { cls: 'sec-ev-blocked' };
  if (t.includes('perm') || t.includes('role'))    return { cls: 'sec-ev-perm' };
  if (t.includes('revok') || t.includes('session'))return { cls: 'sec-ev-session' };
  return { cls: 'sec-ev-other' };
}

function getStartDate(filter) {
  const now = new Date();
  if (filter === '24h') return new Date(now - 24 * 60 * 60 * 1000);
  if (filter === '7j')  return new Date(now - 7  * 24 * 60 * 60 * 1000);
  if (filter === '30j') return new Date(now - 30 * 24 * 60 * 60 * 1000);
  return null;
}

function exportCsv(rows) {
  const headers = ['Date', 'Événement', 'Utilisateur', 'Email', 'IP', 'Résultat', 'Détails'];
  const lines = rows.map((r) =>
    [r.date, r.eventType, r.user, r.email, r.ip, r.success ? 'OK' : 'FAILED', r.details]
      .map((v) => `"${safeStr(v).replace(/"/g, "'")}"`)
      .join(',')
  );
  const csv  = [headers.join(','), ...lines].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `securite_audit_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const PAGE_SIZE = 20;

const EVENT_TAGS = [
  { id: 'all', label: 'Tous' },
  { id: 'failed', label: 'Echecs' },
  { id: 'success', label: 'Succes' },
  { id: 'login', label: 'Logins' },
  { id: 'token', label: 'Tokens' },
  { id: 'session', label: 'Sessions' },
];

const ADMIN_AUDIT_TYPES = new Set([
  'login_success',
  'login_failed',
  'logout',
  'logout_all',
  'token_rejected',
  'password_reset_request',
  'password_reset_verify',
  'password_reset_done',
  'password_change',
  'user_status_changed',
  'user_created',
  'user_role_changed',
  'user_password_reset',
  'user_deleted',
  'session_revoked',
  'sessions_revoked',
  'rbac_policy_updated',
  'support_request',
  'email_sent',
  'email_failed',
  'supplier_email_enqueued',
  'supplier_email_manual_enqueued',
  'supplier_ack',
  'ai_admin',
  'block',
  'user_create',
  'user_update',
  'user_delete',
]);

function getEventLabel(eventType) {
  const t = safeStr(eventType);
  const labels = {
    login_success: 'Connexion reussie',
    login_failed: 'Connexion echouee',
    logout: 'Deconnexion',
    logout_all: 'Deconnexion globale',
    token_rejected: 'Token rejete',
    session_revoked: 'Session revoquee',
    sessions_revoked: 'Sessions revoquees',
    password_reset_request: 'Reset demande',
    password_reset_verify: 'Reset verifie',
    password_reset_done: 'Reset termine',
    password_change: 'Mot de passe modifie',
    user_status_changed: 'Statut utilisateur',
    user_created: 'Creation utilisateur',
    user_role_changed: 'Changement de role',
    user_password_reset: 'Reset mot de passe admin',
    user_deleted: 'Suppression utilisateur',
    rbac_policy_updated: 'Politique RBAC modifiee',
    support_request: 'Demande support',
    email_sent: 'Email systeme envoye',
    email_failed: 'Echec email systeme',
    supplier_email_enqueued: 'Email fournisseur planifie',
    supplier_email_manual_enqueued: 'Email fournisseur manuel',
    supplier_ack: 'Accuse fournisseur',
    ai_admin: 'Configuration IA',
    block: 'Blocage / deblocage',
    user_create: 'Creation utilisateur',
    user_update: 'Mise a jour utilisateur',
    user_delete: 'Suppression utilisateur',
  };
  return labels[t] || t || '-';
}

function getAdminAuditCategory(eventType) {
  const t = safeStr(eventType);
  if (['login_success', 'login_failed', 'logout', 'logout_all', 'token_rejected', 'password_reset_request', 'password_reset_verify', 'password_reset_done', 'password_change', 'session_revoked', 'sessions_revoked'].includes(t)) return 'access';
  if (['user_status_changed', 'user_created', 'user_role_changed', 'user_password_reset', 'user_deleted', 'block', 'user_create', 'user_update', 'user_delete'].includes(t)) return 'accounts';
  if (['rbac_policy_updated', 'ai_admin'].includes(t)) return 'config';
  return 'system';
}

function getAdminAuditCategoryLabel(category) {
  const labels = {
    access: 'Acces & sessions',
    accounts: 'Comptes & privileges',
    config: 'Configuration admin',
    system: 'Systeme',
  };
  return labels[category] || 'Systeme';
}

function isAdminAuditSensitive(row) {
  const t = safeStr(row?.eventType);
  return row?.success === false
    || ['login_failed', 'token_rejected', 'email_failed', 'user_status_changed', 'user_role_changed', 'user_password_reset', 'user_deleted', 'session_revoked', 'sessions_revoked', 'rbac_policy_updated', 'ai_admin', 'block', 'user_update', 'user_delete'].includes(t);
}

function extractAdminAuditTarget(item) {
  const ctx = item?.context && typeof item.context === 'object' ? item.context : {};
  const after = item?.after && typeof item.after === 'object' ? item.after : {};
  return safeStr(ctx.target_username)
    || safeStr(ctx.target_email)
    || safeStr(after.target_user_email)
    || safeStr(after.target_user_role)
    || safeStr(item?.user?.email)
    || safeStr(item?.email)
    || '-';
}

function normalizeAdminAuditRow(item) {
  const eventType = safeStr(item?.event_type || item?.action_type);
  if (!ADMIN_AUDIT_TYPES.has(eventType)) return null;

  const ctx = item?.context && typeof item.context === 'object' ? item.context : {};
  const category = getAdminAuditCategory(eventType);
  const success = item?.success !== false && !['login_failed', 'token_rejected', 'email_failed'].includes(eventType);
  const row = {
    id: String(item?._id || `${eventType}_${item?.date_event || item?.date_action || item?.createdAt}`),
    date: item?.audit_date || item?.date_event || item?.date_action || item?.createdAt || '',
    eventType,
    label: getEventLabel(eventType),
    category,
    actor: safeStr(item?.user?.username) || safeStr(item?.user?.email) || safeStr(item?.actor_role) || safeStr(item?.role) || 'Systeme',
    target: extractAdminAuditTarget(item),
    ip: safeStr(item?.ip_address) || '-',
    success,
    result: safeStr(ctx.reason) || safeStr(ctx.result) || safeStr(item?.status_after) || (success ? 'OK' : 'Echec'),
    details: safeStr(item?.details || item?.description) || '-',
  };
  row.sensitive = isAdminAuditSensitive(row);
  return row;
}

function shortDetails(value) {
  const s = safeStr(value);
  if (s.length <= 72) return s || '-';
  return `${s.slice(0, 72)}...`;
}

function parseClientInfo(userAgent) {
  const ua = safeStr(userAgent);
  const browser = /edg/i.test(ua) ? 'Edge'
    : /chrome|chromium/i.test(ua) ? 'Chrome'
      : /firefox/i.test(ua) ? 'Firefox'
        : /safari/i.test(ua) ? 'Safari'
          : ua ? 'Navigateur inconnu' : '-';
  const os = /windows/i.test(ua) ? 'Windows'
    : /android/i.test(ua) ? 'Android'
      : /iphone|ipad|ios/i.test(ua) ? 'iOS'
        : /mac os|macintosh/i.test(ua) ? 'macOS'
          : /linux/i.test(ua) ? 'Linux'
            : ua ? 'OS inconnu' : '-';
  return { browser, os };
}

function matchesEventTag(row, tag) {
  const type = safeStr(row?.eventType).toLowerCase();
  if (tag === 'all') return true;
  if (tag === 'failed') return row?.success === false || type.includes('reject');
  if (tag === 'success') return row?.success !== false;
  if (tag === 'login') return type.includes('login');
  if (tag === 'token') return type.includes('token');
  if (tag === 'session') return type.includes('session') || type.includes('logout') || type.includes('revok');
  return true;
}

function exportAdminAuditCsv(rows) {
  const headers = ['Date', 'Categorie', 'Action', 'Acteur', 'Cible', 'Resultat', 'IP', 'Details'];
  const lines = rows.map((r) => [
    formatDate(r.date),
    getAdminAuditCategoryLabel(r.category),
    r.label,
    r.actor,
    r.target,
    r.result,
    r.ip,
    r.details,
  ].map((v) => `"${safeStr(v).replace(/"/g, "'")}"`).join(','));
  const csv = [headers.join(','), ...lines].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit_administration_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function AdminAuditPanel({ rows, query, onQueryChange, onExport }) {
  const [filter, setFilter] = useState('all');
  const needle = safeStr(query).toLowerCase();
  const filtered = useMemo(() => rows.filter((row) => {
    if (filter === 'sensitive' && !row.sensitive) return false;
    if (filter === 'failures' && row.success !== false) return false;
    if (['access', 'accounts', 'config', 'system'].includes(filter) && row.category !== filter) return false;
    if (!needle) return true;
    return [row.label, row.actor, row.target, row.result, row.details, row.ip, getAdminAuditCategoryLabel(row.category)]
      .some((value) => safeStr(value).toLowerCase().includes(needle));
  }), [filter, needle, rows]);

  const counts = useMemo(() => ({
    all: rows.length,
    sensitive: rows.filter((r) => r.sensitive).length,
    failures: rows.filter((r) => r.success === false).length,
    access: rows.filter((r) => r.category === 'access').length,
    accounts: rows.filter((r) => r.category === 'accounts').length,
    config: rows.filter((r) => r.category === 'config').length,
  }), [rows]);

  const chips = [
    { id: 'all', label: 'Tout', count: counts.all, icon: FileText },
    { id: 'sensitive', label: 'Sensibles', count: counts.sensitive, icon: ShieldAlert },
    { id: 'failures', label: 'Echecs', count: counts.failures, icon: XCircle },
    { id: 'access', label: 'Acces', count: counts.access, icon: Lock },
    { id: 'accounts', label: 'Comptes', count: counts.accounts, icon: UserCog },
    { id: 'config', label: 'Config', count: counts.config, icon: Settings },
  ];

  return (
    <>
      <div className="sec-kpi-row sec-audit-kpi-row">
        <div className="sec-kpi-card">
          <div className="sec-kpi-icon sec-kpi-icon--blue"><FileText size={18} /></div>
          <div>
            <div className="sec-kpi-value">{rows.length}</div>
            <div className="sec-kpi-label">Preuves admin</div>
          </div>
        </div>
        <div className={`sec-kpi-card ${counts.sensitive > 0 ? 'sec-kpi-card--danger' : ''}`}>
          <div className={`sec-kpi-icon ${counts.sensitive > 0 ? 'sec-kpi-icon--red' : 'sec-kpi-icon--slate'}`}>
            <ShieldAlert size={18} />
          </div>
          <div>
            <div className={`sec-kpi-value ${counts.sensitive > 0 ? 'sec-kpi-value--red' : ''}`}>{counts.sensitive}</div>
            <div className="sec-kpi-label">Actions sensibles</div>
          </div>
        </div>
        <div className="sec-kpi-card">
          <div className="sec-kpi-icon sec-kpi-icon--green"><UserCog size={18} /></div>
          <div>
            <div className="sec-kpi-value">{counts.accounts}</div>
            <div className="sec-kpi-label">Comptes & privileges</div>
          </div>
        </div>
        <div className="sec-kpi-card">
          <div className="sec-kpi-icon sec-kpi-icon--purple"><Settings size={18} /></div>
          <div>
            <div className="sec-kpi-value">{counts.config}</div>
            <div className="sec-kpi-label">Configuration admin</div>
          </div>
        </div>
      </div>

      <div className="sec-audit-toolbar">
        <div className="admin-sec-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Rechercher acteur, compte, IP, resultat..."
          />
          {query && (
            <button className="sec-clear-btn" type="button" onClick={() => onQueryChange('')}>
              <X size={14} />
            </button>
          )}
        </div>
        <button className="admin-btn sec-export-btn" type="button" onClick={() => onExport(filtered)} disabled={!filtered.length}>
          <Download size={15} />
          <span>Exporter</span>
        </button>
      </div>

      <div className="sec-event-tags sec-audit-chips" aria-label="Filtres audit admin">
        {chips.map((chip) => {
          const Icon = chip.icon;
          return (
            <button
              key={chip.id}
              type="button"
              className={`sec-event-tag ${filter === chip.id ? 'active' : ''}`}
              onClick={() => setFilter(chip.id)}
            >
              <Icon size={13} />
              {chip.label} <strong>{chip.count}</strong>
            </button>
          );
        })}
      </div>

      <div className="sec-results-count">
        <span><strong>{filtered.length}</strong> preuve{filtered.length !== 1 ? 's' : ''} admin affichee{filtered.length !== 1 ? 's' : ''}</span>
        <span>Administration uniquement</span>
      </div>

      <div className="admin-sec-table sec-admin-audit-table">
        <div className="admin-sec-head sec-admin-audit-head">
          <div>Date</div>
          <div>Categorie</div>
          <div>Action</div>
          <div>Acteur</div>
          <div>Cible</div>
          <div>Resultat</div>
          <div>Details</div>
        </div>
        {filtered.map((row) => (
          <div key={row.id} className={`admin-sec-row sec-admin-audit-row ${row.success ? '' : 'sec-row-failed'}`}>
            <div className="mono sec-date-cell"><Clock size={11} className="sec-cell-icon" />{formatDate(row.date)}</div>
            <div><span className={`sec-admin-category sec-admin-category--${row.category}`}>{getAdminAuditCategoryLabel(row.category)}</span></div>
            <div><span className={`sec-event-badge ${getEventStyle(row.eventType).cls}`}>{row.label}</span></div>
            <div className="sec-user-name">{row.actor}</div>
            <div className="sec-details-cell"><span className="details">{row.target}</span></div>
            <div>
              {row.success ? (
                <span className="sec-badge-ok"><CheckCircle size={11} /> OK</span>
              ) : (
                <span className="sec-badge-fail"><XCircle size={11} /> ECHEC</span>
              )}
            </div>
            <div className="sec-details-cell"><span className="details">{shortDetails(row.details)}</span></div>
          </div>
        ))}
        {!filtered.length && (
          <div className="admin-sec-empty sec-empty-state">
            <ShieldCheck size={30} className="sec-empty-icon" />
            <p>Aucune preuve administrative pour ce filtre.</p>
          </div>
        )}
      </div>
    </>
  );
}

const AdminSecurity = ({ userName, onLogout }) => {
  const toast    = useToast();
  const navigate = useNavigate();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false)
  );
  const [activeTab, setActiveTab]       = useState('access');
  const [isLoading, setIsLoading]     = useState(false);
  const [items, setItems]             = useState([]);
  const [auditItems, setAuditItems]   = useState([]);
  const [q, setQ]                     = useState('');
  const [auditQ, setAuditQ]           = useState('');
  const [eventType, setEventType]     = useState('');
  const [eventTag, setEventTag]       = useState('all');
  const [onlyFailed, setOnlyFailed]   = useState(false);
  const [timeFilter, setTimeFilter]   = useState('7j');
  const [selectedRow, setSelectedRow] = useState(null);
  const [page, setPage]               = useState(1);

  /* ── Chargement (identique à l'original) ── */
  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [securityResult, auditResult] = await Promise.allSettled([
        get('/security-audit'),
        get('/admin/audit-history?limit=300&page=1'),
      ]);

      if (securityResult.status === 'fulfilled') {
        setItems(Array.isArray(securityResult.value) ? securityResult.value : []);
      } else {
        setItems([]);
        toast.error(getUiErrorMessage(securityResult.reason, 'Erreur chargement audit securite'));
      }

      if (auditResult.status === 'fulfilled') {
        const nextAuditItems = Array.isArray(auditResult.value?.items) ? auditResult.value.items : [];
        setAuditItems(nextAuditItems);
      } else {
        setAuditItems([]);
        toast.error(getUiErrorMessage(auditResult.reason, 'Erreur chargement registre audit admin'));
      }
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Erreur chargement securite et audit'));
      setItems([]);
      setAuditItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  /* ── Types d'événements (identique à l'original) ── */
  const eventTypes = useMemo(() => {
    const set = new Set();
    items.forEach((x) => { const t = safeStr(x?.event_type); if (t) set.add(t); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  /* ── Normalisation des lignes ── */
  const allRows = useMemo(() =>
    items.map((x) => ({
      id:        String(x?._id || `${x?.date_event}_${x?.event_type}_${x?.ip_address}`),
      date:      x?.date_event || x?.createdAt || '',
      eventType: safeStr(x?.event_type) || '-',
      user:      x?.user?.username || x?.email || '-',
      email:     x?.user?.email    || x?.email || '-',
      role:      safeStr(x?.role   || x?.user?.role),
      userImage:  safeStr(x?.user?.image_profile),
      ip:        safeStr(x?.ip_address) || '-',
      ua:        safeStr(x?.user_agent),
      success:   x?.success !== false && !safeStr(x?.event_type).toLowerCase().includes('reject'),
      details:   safeStr(x?.details) || '-',
    }))
  , [items]);

  const adminAuditRows = useMemo(() =>
    auditItems
      .map(normalizeAdminAuditRow)
      .filter(Boolean)
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
  , [auditItems]);

  /* ── Filtrage (même logique + filtre temps) ── */
  const filtered = useMemo(() => {
    const needle    = safeStr(q).toLowerCase();
    const startDate = getStartDate(timeFilter);
    return allRows.filter((r) => {
      if (startDate) {
        const d = new Date(r.date);
        if (!Number.isNaN(d.getTime()) && d < startDate) return false;
      }
      if (onlyFailed && r.success !== false) return false;
      if (!matchesEventTag(r, eventTag)) return false;
      if (eventType && r.eventType !== eventType) return false;
      if (!needle) return true;
      return [r.eventType, r.details, r.email, r.role, r.ip, r.ua, r.user]
        .some((p) => p.toLowerCase().includes(needle));
    });
  }, [allRows, eventTag, eventType, onlyFailed, q, timeFilter]);

  /* ── KPIs ── */
  const kpis = useMemo(() => ({
    total:       filtered.length,
    echecs:      filtered.filter((r) => !r.success).length,
    uniqueUsers: new Set(filtered.map((r) => r.email)).size,
    uniqueIps:   new Set(filtered.map((r) => r.ip)).size,
  }), [filtered]);

  /* ── Graphique 7 jours ── */
  const chartData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({
        key:   d.toISOString().slice(0, 10),
        label: d.toLocaleDateString('fr-FR', { weekday: 'short' }),
        ok: 0, fail: 0,
      });
    }
    allRows.forEach((r) => {
      const key = new Date(r.date).toISOString().slice(0, 10);
      const day = days.find((d) => d.key === key);
      if (day) { if (r.success) day.ok++; else day.fail++; }
    });
    const max = Math.max(...days.map((d) => d.ok + d.fail), 1);
    return days.map((d) => ({ ...d, max }));
  }, [allRows]);

  const failSparklinePoints = useMemo(() => {
    const maxFail = Math.max(...chartData.map((d) => d.fail), 1);
    return chartData
      .map((d, index) => {
        const x = index * 18;
        const y = 34 - Math.round((d.fail / maxFail) * 28);
        return `${x},${y}`;
      })
      .join(' ');
  }, [chartData]);

  const searchSuggestions = useMemo(() => {
    const needle = safeStr(q).toLowerCase();
    if (needle.length < 2) return [];
    const seen = new Set();
    return allRows
      .filter((r) => [r.user, r.email, r.role].some((v) => safeStr(v).toLowerCase().includes(needle)))
      .filter((r) => {
        const key = safeStr(r.email || r.user).toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 5);
  }, [allRows, q]);

  const selectedClientInfo = useMemo(() => parseClientInfo(selectedRow?.ua), [selectedRow]);

  const selectedRecentRows = useMemo(() => {
    if (!selectedRow) return [];
    const key = safeStr(selectedRow.email !== '-' ? selectedRow.email : selectedRow.user).toLowerCase();
    return allRows
      .filter((r) => key && [r.email, r.user].some((v) => safeStr(v).toLowerCase() === key))
      .filter((r) => r.id !== selectedRow.id)
      .slice(0, 5);
  }, [allRows, selectedRow]);

  /* ── Pagination ── */
  const totalPages  = Math.ceil(filtered.length / PAGE_SIZE);
  const visibleRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [q, eventTag, eventType, onlyFailed, timeFilter]);

  /* ── Navigation corrigée ── */
  const goToUsers = () => navigate('/admin/utilisateurs');

  return (
    <div className="admin-layout">
      <SidebarAdmin
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((p) => !p)}
        onLogout={onLogout}
        userName={userName}
      />

      <div className={`admin-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <HeaderPage
          title="Sécurité"
          subtitle="Journal des accès et actions sensibles"
          icon={<ShieldAlert size={24} />}
        />
        {isLoading && <LoadingSpinner overlay text="Chargement..." />}

        <div className="admin-page">
          <div className="sec-unified-tabs" role="tablist" aria-label="Securite et audit">
            <button
              type="button"
              className={`sec-unified-tab ${activeTab === 'access' ? 'active' : ''}`}
              onClick={() => setActiveTab('access')}
            >
              <Lock size={15} />
              <span>Surveillance des acces</span>
            </button>
            <button
              type="button"
              className={`sec-unified-tab ${activeTab === 'audit' ? 'active' : ''}`}
              onClick={() => setActiveTab('audit')}
            >
              <FileText size={15} />
              <span>Registre d'audit admin</span>
            </button>
          </div>

          {activeTab === 'access' ? (
            <>

          {/* ── Bannière alerte ── */}
          {kpis.echecs >= 3 && (
            <div className="sec-alert-banner">
              <AlertTriangle size={16} />
              <span>
                <strong>{kpis.echecs} tentatives échouées</strong> détectées sur la période.
                Vérifiez les utilisateurs concernés.
              </span>
              <button className="sec-alert-banner-btn" onClick={goToUsers}>
                Voir les utilisateurs →
              </button>
            </div>
          )}

          {/* ── KPI Cards ── */}
          <div className="sec-kpi-row">
            <div className="sec-kpi-card">
              <div className="sec-kpi-icon sec-kpi-icon--blue"><Activity size={18} /></div>
              <div>
                <div className="sec-kpi-value">{kpis.total}</div>
                <div className="sec-kpi-label">Événements au total</div>
              </div>
            </div>

            <div className={`sec-kpi-card ${kpis.echecs > 0 ? 'sec-kpi-card--danger' : ''}`}>
              <div className={`sec-kpi-icon ${kpis.echecs > 0 ? 'sec-kpi-icon--red' : 'sec-kpi-icon--slate'}`}>
                <XCircle size={18} />
              </div>
              <div>
                <div className={`sec-kpi-value ${kpis.echecs > 0 ? 'sec-kpi-value--red' : ''}`}>
                  {kpis.echecs}
                </div>
                <div className="sec-kpi-label">Connexions échouées</div>
              </div>
              <svg className="sec-kpi-sparkline" viewBox="0 0 108 40" aria-hidden="true">
                <polyline points={failSparklinePoints} />
              </svg>
            </div>

            <div className="sec-kpi-card">
              <div className="sec-kpi-icon sec-kpi-icon--green"><Users size={18} /></div>
              <div>
                <div className="sec-kpi-value">{kpis.uniqueUsers}</div>
                <div className="sec-kpi-label">Utilisateurs concernés</div>
              </div>
            </div>

            <div className="sec-kpi-card">
              <div className="sec-kpi-icon sec-kpi-icon--purple"><Wifi size={18} /></div>
              <div>
                <div className="sec-kpi-value">{kpis.uniqueIps}</div>
                <div className="sec-kpi-label">Adresses IP distinctes</div>
              </div>
            </div>
          </div>

          {/* ── Graphique 7 jours ── */}
          <div className="sec-chart-card">
            <div className="sec-chart-header">
              <span className="sec-chart-title">
                <TrendingUp size={15} /> Activité des 7 derniers jours
              </span>
              <div className="sec-chart-legend">
                <span className="sec-legend-item sec-legend-ok">Succès</span>
                <span className="sec-legend-item sec-legend-fail">Échecs</span>
              </div>
            </div>
            <div className="sec-chart-bars">
              {chartData.map((d) => (
                <div key={d.key} className="sec-chart-col">
                  <div className="sec-chart-bar-wrap">
                    {d.ok > 0 && (
                      <div
                        className="sec-bar sec-bar--ok"
                        style={{ height: `${Math.round((d.ok / d.max) * 100)}%` }}
                        title={`${d.ok} succès`}
                      />
                    )}
                    {d.fail > 0 && (
                      <div
                        className="sec-bar sec-bar--fail"
                        style={{ height: `${Math.round((d.fail / d.max) * 100)}%` }}
                        title={`${d.fail} échecs`}
                      />
                    )}
                    {d.ok === 0 && d.fail === 0 && (
                      <div className="sec-bar sec-bar--empty" />
                    )}
                  </div>
                  <div className="sec-chart-day">{d.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Toolbar ── */}
          <div className="admin-sec-toolbar">
            <div className="admin-sec-search">
              <Search size={16} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher (email, IP, événement, détails...)"
              />
              {q && (
                <button className="sec-clear-btn" onClick={() => setQ('')}>
                  <X size={14} />
                </button>
              )}
              {searchSuggestions.length > 0 && (
                <div className="sec-search-suggestions">
                  {searchSuggestions.map((s) => (
                    <button
                      key={`${s.email}_${s.user}`}
                      type="button"
                      onClick={() => setQ(s.email !== '-' ? s.email : s.user)}
                    >
                      <ProtectedImage filePath={s.userImage || ''} alt={s.user} className="sec-suggestion-avatar" fallbackText="" />
                      <span>
                        <strong>{s.user}</strong>
                        <small>{s.email}</small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="sec-event-tags" aria-label="Filtres rapides evenements">
              {EVENT_TAGS.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className={`sec-event-tag ${eventTag === tag.id ? 'active' : ''}`}
                  onClick={() => {
                    setEventTag(tag.id);
                    setOnlyFailed(tag.id === 'failed');
                    setEventType('');
                  }}
                >
                  {tag.label}
                </button>
              ))}
            </div>

            <select value={eventType} onChange={(e) => { setEventType(e.target.value); setEventTag('all'); }}>
              <option value="">Tous les événements</option>
              {eventTypes.map((t) => <option key={t} value={t}>{getEventLabel(t)}</option>)}
            </select>

            <div className="sec-time-filter">
              {['24h', '7j', '30j', 'Tout'].map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`sec-time-btn ${timeFilter === f ? 'active' : ''}`}
                  onClick={() => setTimeFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>

            <label className="admin-sec-check">
              <input
                type="checkbox"
                checked={onlyFailed}
                onChange={(e) => {
                  setOnlyFailed(e.target.checked);
                  setEventTag(e.target.checked ? 'failed' : 'all');
                }}
              />
              <span>Échecs seulement</span>
            </label>

            <button
              className="admin-btn sec-export-btn"
              type="button"
              onClick={() => { exportCsv(filtered); toast.success('Fichier CSV téléchargé.'); }}
              disabled={filtered.length === 0}
            >
              <Download size={15} />
              <span>Exporter</span>
            </button>

            <button className="admin-btn" type="button" onClick={load} disabled={isLoading}>
              <RefreshCw size={16} className={isLoading ? 'sec-spin' : ''} />
              <span>Actualiser</span>
            </button>
          </div>

          {/* Compteur */}
          <div className="sec-results-count">
            <span>
              <strong>{filtered.length}</strong> résultat{filtered.length !== 1 ? 's' : ''}
              {(q || eventType || onlyFailed) ? ' (filtrés)' : ''}
            </span>
            {totalPages > 1 && (
              <span className="sec-results-page">Page {page} / {totalPages}</span>
            )}
          </div>

          {/* ── Tableau ── */}
          <div className="admin-sec-table">
            <div className="admin-sec-head">
              <div>Date</div>
              <div>Événement</div>
              <div>Utilisateur</div>
              <div>Adresse IP</div>
              <div>Résultat</div>
              <div>Détails</div>
            </div>

            {visibleRows.map((r) => {
              const evStyle = getEventStyle(r.eventType);
              const local   = isLocalIp(r.ip);
              return (
                <div
                  key={r.id}
                  className={`admin-sec-row sec-row-clickable ${!r.success ? 'sec-row-failed' : ''}`}
                  onClick={() => setSelectedRow(r)}
                  title="Cliquer pour voir le détail"
                >
                  {/* Date */}
                  <div className="mono sec-date-cell">
                    <Clock size={11} className="sec-cell-icon" />
                    {formatDate(r.date)}
                  </div>

                  {/* Badge événement coloré */}
                  <div>
                    <span className={`sec-event-badge ${evStyle.cls}`}>
                      {getEventLabel(r.eventType)}
                    </span>
                  </div>

                  {/* Utilisateur */}
                  <div>
                    <div className="sec-user-name">{r.user}</div>
                    {r.role && <div className="sec-user-role">{r.role}</div>}
                  </div>

                  {/* IP */}
                  <div className="mono sec-ip-cell">
                    {local ? (
                      <span className="sec-ip-local">Local</span>
                    ) : (
                      <><MapPin size={11} className="sec-cell-icon" />{r.ip}</>
                    )}
                  </div>

                  {/* Résultat */}
                  <div>
                    {r.success ? (
                      <span className="sec-badge-ok"><CheckCircle size={11} /> OK</span>
                    ) : (
                      <span className="sec-badge-fail"><XCircle size={11} /> FAILED</span>
                    )}
                  </div>

                  {/* Détails + bouton bloquer */}
                  <div className="sec-details-cell">
                    <span className="details">{shortDetails(r.details)}</span>
                    {!r.success && (r.email || r.user) && (
                      <button
                        className="sec-block-btn"
                        title="Aller bloquer cet utilisateur"
                        onClick={(e) => { e.stopPropagation(); goToUsers(); }}
                      >
                        <Lock size={11} /> Bloquer
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {!visibleRows.length && (
              <div className="admin-sec-empty sec-empty-state">
                <ShieldAlert size={32} className="sec-empty-icon" />
                <p>Aucun événement trouvé.</p>
                {(q || eventType || onlyFailed) && (
                  <button
                    className="sec-reset-filters"
                    onClick={() => { setQ(''); setEventType(''); setOnlyFailed(false); }}
                  >
                    Effacer les filtres
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="sec-pagination">
              <button
                className="sec-page-btn"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Précédent
              </button>
              <div className="sec-page-numbers">
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const n = page <= 3 ? i + 1
                    : page >= totalPages - 2 ? totalPages - 4 + i
                    : page - 2 + i;
                  if (n < 1 || n > totalPages) return null;
                  return (
                    <button
                      key={n}
                      className={`sec-page-num ${page === n ? 'active' : ''}`}
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              <button
                className="sec-page-btn"
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant →
              </button>
            </div>
          )}
            </>
          ) : (
            <AdminAuditPanel
              rows={adminAuditRows}
              query={auditQ}
              onQueryChange={setAuditQ}
              onExport={(rows) => {
                exportAdminAuditCsv(rows);
                toast.success('Export audit admin genere.');
              }}
            />
          )}

        </div>
      </div>

      {/* ── Drawer détail ── */}
      {selectedRow && (
        <div className="sec-drawer-backdrop" onClick={() => setSelectedRow(null)}>
          <div className="sec-drawer" onClick={(e) => e.stopPropagation()}>

            <div className="sec-drawer-head">
              <div className="sec-drawer-head-left">
                <div className={`sec-drawer-icon ${!selectedRow.success ? 'sec-drawer-icon--fail' : 'sec-drawer-icon--ok'}`}>
                  {selectedRow.success ? <CheckCircle size={18} /> : <XCircle size={18} />}
                </div>
                <div>
                  <p className="sec-drawer-title">Détail de l'événement</p>
                  <p className="sec-drawer-sub">{formatDate(selectedRow.date)}</p>
                </div>
              </div>
              <button className="sec-drawer-close" onClick={() => setSelectedRow(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="sec-drawer-body">
              <div className="sec-drawer-section">
                <span className={`sec-event-badge sec-event-badge--lg ${getEventStyle(selectedRow.eventType).cls}`}>
                  {getEventLabel(selectedRow.eventType)}
                </span>
                {selectedRow.success ? (
                  <span className="sec-badge-ok" style={{ marginLeft: 8 }}>
                    <CheckCircle size={11} /> OK
                  </span>
                ) : (
                  <span className="sec-badge-fail" style={{ marginLeft: 8 }}>
                    <XCircle size={11} /> FAILED
                  </span>
                )}
              </div>

              <div className="sec-network-card">
                <div className="sec-network-map">
                  <MapPin size={24} />
                  <span>{isLocalIp(selectedRow.ip) ? 'Local' : selectedRow.ip}</span>
                </div>
                <div className="sec-client-grid">
                  <div>
                    <span>Navigateur</span>
                    <strong>{selectedClientInfo.browser}</strong>
                  </div>
                  <div>
                    <span>Systeme</span>
                    <strong>{selectedClientInfo.os}</strong>
                  </div>
                  <div>
                    <span>Adresse IP</span>
                    <strong>{selectedRow.ip}</strong>
                  </div>
                  <div>
                    <span>Risque</span>
                    <strong className={!selectedRow.success ? 'risk-high' : 'risk-low'}>
                      {!selectedRow.success ? 'A verifier' : 'Normal'}
                    </strong>
                  </div>
                </div>
              </div>

              {[
                { icon: <Users size={14} />,    label: 'Utilisateur', value: selectedRow.user },
                { icon: <Users size={14} />,    label: 'Email',       value: selectedRow.email },
                { icon: <Lock size={14} />,     label: 'Rôle',        value: selectedRow.role || '—' },
                { icon: <MapPin size={14} />,   label: 'Adresse IP',  value: selectedRow.ip },
                { icon: <Clock size={14} />,    label: 'Date exacte', value: formatDate(selectedRow.date) },
                { icon: <Monitor size={14} />,  label: 'Appareil',    value: selectedRow.ua || '—' },
                { icon: <Activity size={14} />, label: 'Détails',     value: selectedRow.details },
              ].map(({ icon, label, value }) => (
                <div key={label} className="sec-drawer-row">
                  <div className="sec-drawer-row-label">{icon} {label}</div>
                  <div className="sec-drawer-row-value">{value}</div>
                </div>
              ))}

              {/* ✅ Route corrigée */}
              <div className="sec-recent-card">
                <div className="sec-recent-title">Historique recent utilisateur</div>
                {selectedRecentRows.length === 0 && (
                  <div className="sec-recent-empty">Aucun autre evenement recent.</div>
                )}
                {selectedRecentRows.map((row) => (
                  <button key={row.id} type="button" className="sec-recent-row" onClick={() => setSelectedRow(row)}>
                    <span className={`sec-recent-dot ${row.success ? 'ok' : 'fail'}`} />
                    <span>{getEventLabel(row.eventType)}</span>
                    <small>{formatDate(row.date)}</small>
                  </button>
                ))}
              </div>

              {!selectedRow.success && (
                <button
                  className="sec-drawer-block-btn"
                  onClick={() => { setSelectedRow(null); goToUsers(); }}
                >
                  <Lock size={14} />
                  Aller bloquer cet utilisateur
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminSecurity;
