// BLOC 1 - Role du fichier.
// Ce fichier affiche une page de l'espace administrateur pour AdminAudit.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle,
  Clock,
  Download,
  FileText,
  Lock,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { get } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import { getUiErrorMessage } from '../../services/uiError';
import './AdminDashboard.css';
import './AdminAudit.css';

function safeStr(value) {
  return String(value || '').trim();
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('fr-FR');
}

function formatJson(value) {
  if (!value || typeof value !== 'object') return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

function eventLabel(type) {
  const labels = {
    login_success: 'Connexion reussie',
    login_failed: 'Connexion echouee',
    logout: 'Deconnexion',
    logout_all: 'Deconnexion globale',
    token_rejected: 'Token rejete',
    password_reset_request: 'Reset demande',
    password_reset_verify: 'Reset verifie',
    password_reset_done: 'Reset termine',
    password_change: 'Mot de passe modifie',
    user_status_changed: 'Blocage / deblocage',
    user_created: 'Creation utilisateur',
    user_role_changed: 'Changement de role',
    user_password_reset: 'Reset mot de passe admin',
    user_deleted: 'Suppression utilisateur',
    session_revoked: 'Session revoquee',
    sessions_revoked: 'Sessions revoquees',
    rbac_policy_updated: 'Politique RBAC modifiee',
    support_request: 'Demande support',
    email_sent: 'Email systeme envoye',
    email_failed: 'Echec email systeme',
    supplier_email_enqueued: 'Email fournisseur planifie',
    supplier_email_manual_enqueued: 'Email fournisseur manuel',
    supplier_ack: 'Accuse fournisseur',
    stock_rules_apply: 'Application seuil global',
    stock_rules_update: 'Regles stock modifiees',
    stock_rules_reset: 'Regles stock reinitialisees',
    ai_admin: 'Configuration IA',
    block: 'Blocage / deblocage',
    user_create: 'Creation utilisateur',
    user_update: 'Mise a jour utilisateur',
    user_delete: 'Suppression utilisateur',
  };
  return labels[safeStr(type)] || safeStr(type) || '-';
}

function getCategory(type) {
  const t = safeStr(type);
  if (['login_success', 'login_failed', 'logout', 'logout_all', 'token_rejected'].includes(t)) return 'access';
  if (t.startsWith('password_') || ['password_change'].includes(t)) return 'access';
  if (['user_status_changed', 'user_created', 'user_role_changed', 'user_password_reset', 'user_deleted', 'block', 'user_create', 'user_update', 'user_delete'].includes(t)) return 'accounts';
  if (['session_revoked', 'sessions_revoked'].includes(t)) return 'access';
  if (['rbac_policy_updated', 'stock_rules_apply', 'stock_rules_update', 'stock_rules_reset', 'ai_admin'].includes(t)) return 'config';
  if (t.includes('email') || t.includes('supplier') || t.includes('support')) return 'system';
  return 'system';
}

function isSensitive(row) {
  const type = safeStr(row?.type);
  return row?.success === false
    || ['login_failed', 'token_rejected', 'user_status_changed', 'user_role_changed', 'user_password_reset', 'user_deleted', 'session_revoked', 'sessions_revoked', 'rbac_policy_updated', 'stock_rules_apply', 'stock_rules_update', 'stock_rules_reset', 'ai_admin', 'block', 'user_update', 'user_delete'].includes(type);
}

function getSeverity(row) {
  const type = safeStr(row?.type);
  if (row?.success === false || ['login_failed', 'token_rejected', 'email_failed', 'user_deleted'].includes(type)) return 'danger';
  if (['user_status_changed', 'block', 'user_role_changed', 'user_password_reset', 'session_revoked', 'sessions_revoked', 'rbac_policy_updated', 'stock_rules_apply', 'stock_rules_update', 'stock_rules_reset', 'ai_admin'].includes(type)) return 'warning';
  if (['login_success', 'email_sent', 'password_reset_done', 'supplier_ack'].includes(type)) return 'success';
  return 'info';
}

function categoryLabel(category) {
  const labels = {
    access: 'Acces & sessions',
    accounts: 'Comptes & privileges',
    config: 'Configuration',
    system: 'Systeme',
  };
  return labels[category] || 'Systeme';
}

function extractTarget(item) {
  const ctx = item?.context && typeof item.context === 'object' ? item.context : {};
  const after = item?.after && typeof item.after === 'object' ? item.after : {};
  const before = item?.before && typeof item.before === 'object' ? item.before : {};
  return safeStr(ctx.target_username)
    || safeStr(ctx.target_email)
    || safeStr(after.target_user_email)
    || safeStr(after.target_user_role)
    || safeStr(after.supplier_id)
    || safeStr(after.purchase_order_id)
    || safeStr(before.target_user_email)
    || safeStr(item?.email)
    || safeStr(item?.user?.email)
    || '-';
}

function normalizeAuditItem(item) {
  const type = safeStr(item?.event_type || item?.action_type);
  const ctx = item?.context && typeof item.context === 'object' ? item.context : {};
  const date = item?.audit_date || item?.date_event || item?.date_action || item?.createdAt;
  const actor = safeStr(item?.user?.username)
    || safeStr(item?.user?.email)
    || safeStr(item?.actor_role)
    || safeStr(item?.role)
    || (safeStr(item?.email) ? 'Utilisateur externe' : 'Systeme');
  const success = item?.success !== false && !['login_failed', 'token_rejected', 'email_failed'].includes(type);
  const reason = safeStr(ctx.reason)
    || safeStr(ctx.result)
    || safeStr(item?.status_after)
    || (success ? 'OK' : 'Echec');

  const row = {
    id: String(item?._id || `${type}-${date}`),
    date,
    type,
    action: eventLabel(type),
    category: getCategory(type),
    actor,
    target: extractTarget(item),
    details: safeStr(item?.details || item?.description) || '-',
    reason,
    success,
    source: safeStr(item?.audit_source) || (item?.event_type ? 'security' : 'configuration'),
    ip: safeStr(item?.ip_address),
    userAgent: safeStr(item?.user_agent),
    before: item?.before || null,
    after: item?.after || item?.context || null,
    raw: item,
  };
  row.sensitive = isSensitive(row);
  row.severity = getSeverity(row);
  return row;
}

function matchesFilter(row, filter) {
  if (filter === 'all') return true;
  if (filter === 'sensitive') return row.sensitive;
  if (filter === 'failures') return row.success === false;
  return row.category === filter;
}

function exportCsv(rows) {
  const headers = ['Date', 'Categorie', 'Action', 'Acteur', 'Cible', 'Resultat', 'Details', 'Source', 'IP'];
  const lines = rows.map((r) => [
    formatDateTime(r.date),
    categoryLabel(r.category),
    r.action,
    r.actor,
    r.target,
    r.reason,
    r.details,
    r.source,
    r.ip,
  ].map((v) => `"${safeStr(v).replace(/"/g, "'")}"`).join(','));
  const csv = [headers.join(','), ...lines].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `journal_audit_admin_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminAudit({ userName, onLogout }) {
  const toast = useToast();
  const toastRef = useRef(toast);
  const errorNotifiedRef = useRef(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedRow, setSelectedRow] = useState(null);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await get('/admin/audit-history?limit=300&page=1');
      const rows = Array.isArray(res?.items) ? res.items : [];
      setItems(rows);
      errorNotifiedRef.current = false;
    } catch (err) {
      if (!errorNotifiedRef.current) {
        toastRef.current.error(getUiErrorMessage(err, 'Journal audit admin indisponible pour le moment.'));
        errorNotifiedRef.current = true;
      }
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const allRows = useMemo(() => items.map(normalizeAuditItem), [items]);

  const filtered = useMemo(() => {
    const needle = safeStr(q).toLowerCase();
    return allRows.filter((row) => {
      if (!matchesFilter(row, activeFilter)) return false;
      if (!needle) return true;
      return [
        row.action,
        categoryLabel(row.category),
        row.actor,
        row.target,
        row.details,
        row.reason,
        row.source,
        row.ip,
      ].some((value) => safeStr(value).toLowerCase().includes(needle));
    });
  }, [activeFilter, allRows, q]);

  const summary = useMemo(() => ({
    total: allRows.length,
    visible: filtered.length,
    access: allRows.filter((r) => r.category === 'access').length,
    accounts: allRows.filter((r) => r.category === 'accounts').length,
    config: allRows.filter((r) => r.category === 'config').length,
    sensitive: allRows.filter((r) => r.sensitive).length,
    failures: allRows.filter((r) => r.success === false).length,
  }), [allRows, filtered.length]);

  const filterChips = useMemo(() => [
    { id: 'all', label: 'Tout', count: summary.total, icon: FileText },
    { id: 'sensitive', label: 'Sensibles', count: summary.sensitive, icon: ShieldAlert },
    { id: 'failures', label: 'Echecs', count: summary.failures, icon: XCircle },
    { id: 'access', label: 'Acces', count: summary.access, icon: Lock },
    { id: 'accounts', label: 'Comptes', count: summary.accounts, icon: Users },
    { id: 'config', label: 'Config', count: summary.config, icon: Settings },
  ], [summary]);

  const insights = useMemo(() => {
    const failedLogins = allRows.filter((r) => r.type === 'login_failed').length;
    const configChanges = allRows.filter((r) => r.category === 'config').length;
    const accountChanges = allRows.filter((r) => r.category === 'accounts' && r.sensitive).length;
    return [
      {
        id: 'failures',
        tone: failedLogins >= 3 ? 'danger' : 'neutral',
        icon: AlertTriangle,
        label: 'Connexions echouees',
        value: failedLogins,
        text: failedLogins >= 3 ? 'Verifier les comptes et IP concernes.' : 'Aucun pic critique dans la vue chargee.',
      },
      {
        id: 'accounts',
        tone: accountChanges ? 'warning' : 'neutral',
        icon: UserCog,
        label: 'Privileges et comptes',
        value: accountChanges,
        text: accountChanges ? 'Des actions sensibles demandent une revue.' : 'Pas de changement sensible charge.',
      },
      {
        id: 'config',
        tone: configChanges ? 'info' : 'neutral',
        icon: SlidersHorizontal,
        label: 'Configuration',
        value: configChanges,
        text: configChanges ? 'Regles, RBAC ou IA modifies dans le journal.' : 'Aucune modification de configuration chargee.',
      },
    ];
  }, [allRows]);

  const selectedBefore = formatJson(selectedRow?.before);
  const selectedAfter = formatJson(selectedRow?.after);

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
          userName={userName}
          title="Journal d'audit admin"
          subtitle="Preuves des acces, privileges, sessions et configurations sensibles"
          icon={<FileText size={24} />}
          showSearch={false}
          onRefresh={load}
        />
        {isLoading && <LoadingSpinner overlay text="Chargement..." />}

        <div className="admin-page">
          <div className="admin-audit-summary">
            <div className="admin-audit-kpi">
              <FileText size={18} />
              <div><strong>{summary.total}</strong><span>Evenements admin</span></div>
            </div>
            <div className="admin-audit-kpi">
              <Lock size={18} />
              <div><strong>{summary.access}</strong><span>Acces & sessions</span></div>
            </div>
            <div className="admin-audit-kpi">
              <Settings size={18} />
              <div><strong>{summary.config}</strong><span>Config sensible</span></div>
            </div>
            <div className="admin-audit-kpi danger">
              <AlertTriangle size={18} />
              <div><strong>{summary.sensitive}</strong><span>Actions sensibles</span></div>
            </div>
          </div>

          <div className="admin-audit-insights" aria-label="Signaux audit">
            {insights.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.id} className={`admin-audit-insight ${item.tone}`}>
                  <Icon size={17} />
                  <div>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <p>{item.text}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="admin-audit-toolbar">
            <div className="admin-audit-search">
              <Search size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher acteur, cible, motif, IP ou action..." />
              {q ? (
                <button type="button" className="admin-audit-clear" onClick={() => setQ('')} aria-label="Effacer la recherche">
                  <X size={14} />
                </button>
              ) : null}
            </div>

            <div className="admin-audit-actions">
              <button className="admin-btn" type="button" onClick={() => exportCsv(filtered)} disabled={!filtered.length}>
                <Download size={16} />
                <span>Exporter</span>
              </button>
              <button className="admin-btn" type="button" onClick={load} disabled={isLoading}>
                <RefreshCw size={16} />
                <span>Actualiser</span>
              </button>
            </div>
          </div>

          <div className="admin-audit-chips" aria-label="Filtres audit">
            {filterChips.map((chip) => {
              const Icon = chip.icon;
              return (
                <button
                  key={chip.id}
                  type="button"
                  className={`admin-audit-chip ${activeFilter === chip.id ? 'active' : ''}`}
                  onClick={() => setActiveFilter(chip.id)}
                >
                  <Icon size={14} />
                  <span>{chip.label}</span>
                  <strong>{chip.count}</strong>
                </button>
              );
            })}
          </div>

          <div className="admin-audit-table">
            <div className="admin-audit-caption">
              <ShieldCheck size={16} />
              <span>{summary.visible} preuve(s) affichee(s). Les flux stock, demandes et inventaires operationnels ne sont pas inclus ici.</span>
            </div>
            <div className="admin-audit-head">
              <div>Quand</div>
              <div>Action</div>
              <div>Cible</div>
              <div>Acteur</div>
              <div>Resultat</div>
              <div>Preuve</div>
            </div>
            {filtered.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`admin-audit-row severity-${r.severity}`}
                onClick={() => setSelectedRow(r)}
              >
                <div className="mono audit-date"><Clock size={12} />{formatDateTime(r.date)}</div>
                <div>
                  <span className={`audit-badge category-${r.category}`}>{r.action}</span>
                  <small>{categoryLabel(r.category)}</small>
                </div>
                <div className="audit-main-text">{r.target}</div>
                <div className="audit-main-text">{r.actor}</div>
                <div>
                  {r.success ? (
                    <span className="audit-result ok"><CheckCircle size={12} /> OK</span>
                  ) : (
                    <span className="audit-result fail"><XCircle size={12} /> Echec</span>
                  )}
                </div>
                <div className="details" title={r.details}>{r.details}</div>
              </button>
            ))}
            {!filtered.length ? <div className="admin-audit-empty">Aucune preuve pour ce filtre.</div> : null}
          </div>
        </div>
      </div>

      {selectedRow ? (
        <div className="audit-drawer-backdrop" onClick={() => setSelectedRow(null)}>
          <aside className="audit-drawer" onClick={(e) => e.stopPropagation()} aria-label="Detail audit">
            <div className="audit-drawer-head">
              <div>
                <span className={`audit-badge category-${selectedRow.category}`}>{selectedRow.action}</span>
                <h2>Preuve d'audit</h2>
                <p>{formatDateTime(selectedRow.date)}</p>
              </div>
              <button type="button" className="audit-drawer-close" onClick={() => setSelectedRow(null)} aria-label="Fermer">
                <X size={18} />
              </button>
            </div>

            <div className="audit-drawer-body">
              <div className="audit-proof-grid">
                <div><span>Acteur</span><strong>{selectedRow.actor}</strong></div>
                <div><span>Cible</span><strong>{selectedRow.target}</strong></div>
                <div><span>Resultat</span><strong>{selectedRow.reason}</strong></div>
                <div><span>Source</span><strong>{selectedRow.source}</strong></div>
                <div><span>IP</span><strong>{selectedRow.ip || '-'}</strong></div>
                <div><span>Categorie</span><strong>{categoryLabel(selectedRow.category)}</strong></div>
              </div>

              <div className="audit-drawer-section">
                <h3>Details</h3>
                <p>{selectedRow.details}</p>
              </div>

              <div className="audit-timeline">
                <div className="audit-timeline-item">
                  <span className="audit-timeline-dot" />
                  <div>
                    <strong>Avant</strong>
                    <pre>{selectedBefore || 'Aucun etat avant enregistre.'}</pre>
                  </div>
                </div>
                <div className="audit-timeline-item">
                  <span className="audit-timeline-dot active" />
                  <div>
                    <strong>Apres / contexte</strong>
                    <pre>{selectedAfter || 'Aucun contexte structure enregistre.'}</pre>
                  </div>
                </div>
              </div>

              {selectedRow.userAgent ? (
                <div className="audit-drawer-section">
                  <h3>Appareil</h3>
                  <p>{selectedRow.userAgent}</p>
                </div>
              ) : null}

              {selectedRow.category === 'config' ? (
                <div className="audit-drawer-note">
                  <Bot size={15} />
                  <span>Revue recommandee : cette action modifie le comportement global de SENTINEL.</span>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
