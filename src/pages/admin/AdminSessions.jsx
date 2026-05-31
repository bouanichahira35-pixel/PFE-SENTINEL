import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Monitor, Ban, RefreshCw, X,
  Globe, Smartphone, Laptop, Clock,
  ShieldAlert, Users, Timer, AlertTriangle,
  MapPin, Activity
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { get, post } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import { getUiErrorMessage } from '../../services/uiError';
import './AdminDashboard.css';
import './AdminSessions.css';

/* ─── helpers (identiques à l'original) ─── */
function safeText(value) {
  return String(value || '').trim();
}

function shortUa(ua) {
  const s = safeText(ua);
  if (!s) return '-';
  return s.length > 64 ? `${s.slice(0, 61)}...` : s;
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('fr-FR');
}

/* ─── NOUVEAU : déterminer si une session expire bientôt (<30 min) ─── */
function isExpiringSoon(expiresAt) {
  if (!expiresAt) return false;
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() - Date.now() < 30 * 60 * 1000;
}

/* ─── NOUVEAU : icône User-Agent selon le device ─── */
function UaIcon({ ua }) {
  const s = safeText(ua).toLowerCase();
  if (!s || s === '-') return <Globe size={13} className="sess-ua-icon" />;
  if (/mobile|android|iphone|ipad/.test(s))
    return <Smartphone size={13} className="sess-ua-icon" />;
  return <Laptop size={13} className="sess-ua-icon" />;
}

/* ─── NOUVEAU : badge de rôle coloré ─── */
function RoleBadge({ role }) {
  const map = {
    Admin:       'sess-role-admin',
    Responsable: 'sess-role-responsable',
    Magasinier:  'sess-role-magasinier',
    Demandeur:   'sess-role-demandeur',
  };
  return (
    <span className={`sess-role-badge ${map[role] || 'sess-role-demandeur'}`}>
      {role || '-'}
    </span>
  );
}

/* ─── NOUVEAU : badge statut session ─── */
function SessionStatusBadge({ expires }) {
  if (!expires) return <span className="sess-status-badge sess-status-active">Actif</span>;
  const d = new Date(expires);
  if (Number.isNaN(d.getTime()))
    return <span className="sess-status-badge sess-status-active">Actif</span>;
  if (d.getTime() < Date.now())
    return <span className="sess-status-badge sess-status-expired">Expirée</span>;
  if (isExpiringSoon(expires))
    return <span className="sess-status-badge sess-status-expiring">Expire bientôt</span>;
  return <span className="sess-status-badge sess-status-active">Actif</span>;
}

/* ══════════════════════════════════════════════════
   COMPOSANT PRINCIPAL — même props, même flux API
══════════════════════════════════════════════════ */
const AdminSessions = ({ userName, onLogout }) => {
  const toast = useToast();
  const [searchParams] = useSearchParams();

  /* ── états identiques à l'original ── */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false)
  );
  const [loading, setLoading]       = useState(false);
  const [items, setItems]           = useState([]);
  const [revokeDialog, setRevokeDialog] = useState({ open: false, session: null });
  const [revokeReason, setRevokeReason] = useState('');

  /* ── NOUVEAU : filtre local par rôle ── */
  const [filterRole, setFilterRole] = useState('Tous');

  /* ── load : identique à l'original ── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await get('/admin/sessions?limit=80');
      setItems(Array.isArray(res?.items) ? res.items : []);
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Chargement sessions échoué'));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  /* ── openRevokeDialog : identique ── */
  const openRevokeDialog = useCallback((session) => {
    setRevokeDialog({ open: true, session });
    setRevokeReason('');
  }, []);

  /* ── closeRevokeDialog : identique ── */
  const closeRevokeDialog = useCallback(() => {
    if (loading) return;
    setRevokeDialog({ open: false, session: null });
    setRevokeReason('');
  }, [loading]);

  /* ── confirmRevoke : identique, même endpoint ── */
  const confirmRevoke = useCallback(async () => {
    const sessionId = revokeDialog.session?.id;
    const reason    = safeText(revokeReason);

    if (!sessionId) return;
    if (reason.length < 5) {
      toast.warning('Le motif de révocation est obligatoire (min 5 caractères).');
      return;
    }

    try {
      setLoading(true);
      await post(
        `/admin/sessions/${encodeURIComponent(sessionId)}/revoke`,
        { reason }
      );
      toast.success('Session révoquée.');
      setRevokeDialog({ open: false, session: null });
      setRevokeReason('');
      await load();
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Révocation échouée'));
    } finally {
      setLoading(false);
    }
  }, [load, revokeDialog.session, revokeReason, toast]);

  /* ── rows : mapping identique + filtre rôle ── */
  const rows = useMemo(() => {
    const userFilterId = safeText(searchParams.get('user') || '');
    const filtered = userFilterId
      ? (items || []).filter((s) => String(s?.user?._id || '') === userFilterId)
      : (items || []);

    const mapped = filtered.map((s) => ({
      id:      s?._id,
      user:    s?.user?.username || '-',
      email:   s?.user?.email    || '-',
      role:    s?.user?.role     || '-',
      ip:      s?.ip_address     || '-',
      last:    s?.last_activity_at || s?.updatedAt || null,
      login:   s?.login_time     || null,              /* ← existait déjà dans rows */
      expires: s?.expires_at     || null,
      ua:      s?.user_agent     || '',
    }));

    if (filterRole === 'Tous') return mapped;
    return mapped.filter((r) => r.role === filterRole);
  }, [items, searchParams, filterRole]);

  /* ── NOUVEAU : KPIs calculés depuis rows (pas d'appel API supplémentaire) ── */
  const kpis = useMemo(() => {
    const total       = rows.length;
    const uniqueUsers = new Set(rows.map((r) => r.email)).size;
    const expiringSoon = rows.filter((r) => isExpiringSoon(r.expires)).length;
    const roles = [...new Set(rows.map((r) => r.role).filter(Boolean))];
    return { total, uniqueUsers, expiringSoon, roles };
  }, [rows]);

  /* ── NOUVEAU : liste de rôles uniques pour le filtre ── */
  const allRoles = useMemo(() => {
    const set = new Set(
      (items || []).map((s) => s?.user?.role).filter(Boolean)
    );
    return ['Tous', ...set];
  }, [items]);

  /* ── rendu ── */
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
          title="Sessions"
          subtitle="Surveillance & révocation"
          icon={<Monitor size={24} />}
        />

        {loading && <LoadingSpinner overlay text="Chargement..." />}

        <div className="admin-page">

          {/* ── TOOLBAR : même bouton Actualiser qu'avant ── */}
          <div className="admin-toolbar">
            <button
              className="admin-btn"
              type="button"
              onClick={load}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? 'sess-spin' : ''} />
              <span>Actualiser</span>
            </button>

            {/* NOUVEAU : filtre rôle rapide */}
            <div className="sess-role-filter">
              {allRoles.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`sess-role-filter-btn ${filterRole === r ? 'active' : ''}`}
                  onClick={() => setFilterRole(r)}
                >
                  {r}
                </button>
              ))}
            </div>

            {/* NOUVEAU : indication filtre user actif */}
            {searchParams.get('user') && (
              <span className="sess-user-filter-tag">
                <Users size={13} />
                Filtré par utilisateur
              </span>
            )}
          </div>

          {/* ══ NOUVEAU : KPI CARDS (calculées depuis les données déjà chargées) ══ */}
          <div className="sess-kpi-row">
            <div className="sess-kpi-card">
              <div className="sess-kpi-icon sess-kpi-icon--blue">
                <Activity size={18} />
              </div>
              <div>
                <div className="sess-kpi-value">{kpis.total}</div>
                <div className="sess-kpi-label">Sessions actives</div>
              </div>
            </div>

            <div className="sess-kpi-card">
              <div className="sess-kpi-icon sess-kpi-icon--green">
                <Users size={18} />
              </div>
              <div>
                <div className="sess-kpi-value">{kpis.uniqueUsers}</div>
                <div className="sess-kpi-label">Utilisateurs connectés</div>
              </div>
            </div>

            <div className={`sess-kpi-card ${kpis.expiringSoon > 0 ? 'sess-kpi-card--warn' : ''}`}>
              <div className={`sess-kpi-icon ${kpis.expiringSoon > 0 ? 'sess-kpi-icon--amber' : 'sess-kpi-icon--slate'}`}>
                <Timer size={18} />
              </div>
              <div>
                <div className={`sess-kpi-value ${kpis.expiringSoon > 0 ? 'sess-kpi-value--amber' : ''}`}>
                  {kpis.expiringSoon}
                </div>
                <div className="sess-kpi-label">Expirent dans &lt; 30 min</div>
              </div>
            </div>

            <div className="sess-kpi-card">
              <div className="sess-kpi-icon sess-kpi-icon--purple">
                <ShieldAlert size={18} />
              </div>
              <div>
                <div className="sess-kpi-value">{kpis.roles.length}</div>
                <div className="sess-kpi-label">Rôles représentés</div>
              </div>
            </div>
          </div>

          {/* ══ TABLEAU ══ */}
          <div className="admin-card">
            <div className="admin-card-title">
              <Monitor size={18} /> Sessions actives
              {rows.length > 0 && (
                <span className="sess-table-count">{rows.length}</span>
              )}
            </div>
            <div className="admin-note">
              Révoquer une session force l'utilisateur à se reconnecter (à la prochaine requête).
              Le motif est obligatoire et conservé dans l'audit de sécurité.
            </div>

            <div className="admin-sessions-table">
              <table>
                <thead>
                  <tr>
                    <th>Utilisateur</th>
                    <th>Rôle</th>
                    <th>Statut</th>
                    <th>IP</th>
                    <th>Connexion</th>       {/* ← login_time affiché (existait déjà dans rows) */}
                    <th>Dernière activité</th>
                    <th>Expiration</th>
                    <th>Appareil</th>        {/* ← User-Agent avec icône */}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className={isExpiringSoon(r.expires) ? 'sess-row-expiring' : ''}
                    >
                      {/* Utilisateur */}
                      <td>
                        <div className="cell-main">{r.user}</div>
                        <div className="cell-sub">{r.email}</div>
                      </td>

                      {/* Rôle — badge coloré */}
                      <td>
                        <RoleBadge role={r.role} />
                      </td>

                      {/* Statut — NOUVEAU */}
                      <td>
                        <SessionStatusBadge expires={r.expires} />
                      </td>

                      {/* IP */}
                      <td className="muted">
                        <div className="sess-ip-wrap">
                          <MapPin size={12} className="sess-ip-icon" />
                          {r.ip}
                        </div>
                      </td>

                      {/* Connexion — login_time existait déjà dans rows mais non affiché */}
                      <td className="muted">
                        <div className="sess-time-wrap">
                          <Clock size={12} className="sess-time-icon" />
                          {formatDateTime(r.login)}
                        </div>
                      </td>

                      {/* Dernière activité */}
                      <td className="muted">{formatDateTime(r.last)}</td>

                      {/* Expiration */}
                      <td className="muted">
                        {isExpiringSoon(r.expires) ? (
                          <span className="sess-expires-warn">
                            <AlertTriangle size={12} />
                            {formatDateTime(r.expires)}
                          </span>
                        ) : (
                          formatDateTime(r.expires)
                        )}
                      </td>

                      {/* Appareil (User-Agent avec icône) */}
                      <td
                        className="muted sess-ua-cell"
                        title={safeText(r.ua) || ''}
                      >
                        <UaIcon ua={r.ua} />
                        {shortUa(r.ua)}
                      </td>

                      {/* Action Révoquer — identique à l'original */}
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="admin-btn danger"
                          type="button"
                          onClick={() => openRevokeDialog(r)}
                          disabled={loading}
                        >
                          <Ban size={16} />
                          <span>Révoquer</span>
                        </button>
                      </td>
                    </tr>
                  ))}

                  {!rows.length && (
                    <tr>
                      <td colSpan={9} className="empty">
                        <div className="sess-empty-state">
                          <Monitor size={32} className="sess-empty-icon" />
                          <p>Aucune session active.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ══ MODAL RÉVOCATION — même flux, même validation, UI enrichie ══ */}
          {revokeDialog.open && (
            <div
              className="admin-session-modal-backdrop"
              role="dialog"
              aria-modal="true"
              onClick={closeRevokeDialog}
            >
              <div
                className="admin-session-modal"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="admin-session-modal-head">
                  <div className="sess-modal-head-content">
                    {/* Icône */}
                    <div className="sess-modal-icon">
                      <Ban size={20} />
                    </div>
                    <div>
                      <strong>Révoquer la session</strong>
                      <span>
                        {revokeDialog.session?.user || 'Utilisateur'}
                        {' · '}
                        <RoleBadge role={revokeDialog.session?.role} />
                      </span>
                    </div>
                  </div>
                  <button
                    className="admin-session-icon-btn"
                    type="button"
                    onClick={closeRevokeDialog}
                    disabled={loading}
                    aria-label="Fermer"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Body */}
                <div className="admin-session-modal-body">
                  {/* Infos session — récapitulatif visuel */}
                  <div className="sess-modal-info-grid">
                    <div className="sess-modal-info-item">
                      <span className="sess-modal-info-label">IP</span>
                      <span className="sess-modal-info-value">
                        {revokeDialog.session?.ip || '-'}
                      </span>
                    </div>
                    <div className="sess-modal-info-item">
                      <span className="sess-modal-info-label">Dernière activité</span>
                      <span className="sess-modal-info-value">
                        {formatDateTime(revokeDialog.session?.last)}
                      </span>
                    </div>
                    <div className="sess-modal-info-item">
                      <span className="sess-modal-info-label">Connexion</span>
                      <span className="sess-modal-info-value">
                        {formatDateTime(revokeDialog.session?.login)}
                      </span>
                    </div>
                    <div className="sess-modal-info-item">
                      <span className="sess-modal-info-label">Expiration</span>
                      <span className="sess-modal-info-value">
                        {formatDateTime(revokeDialog.session?.expires)}
                      </span>
                    </div>
                  </div>

                  {/* Avertissement */}
                  <div className="sess-modal-warning">
                    <AlertTriangle size={14} />
                    <p>
                      L'utilisateur sera déconnecté à sa prochaine requête.
                      Cette action est enregistrée dans l'audit de sécurité.
                    </p>
                  </div>

                  {/* Motif — validation identique à l'original */}
                  <label className="admin-session-reason-label">
                    Motif de révocation
                    <span className="sess-required">*</span>
                    <span className="sess-hint"> (min 5 caractères, obligatoire)</span>
                    <textarea
                      value={revokeReason}
                      onChange={(e) => setRevokeReason(e.target.value)}
                      placeholder="Exemple : appareil perdu, activité suspecte, demande utilisateur..."
                      rows={4}
                      maxLength={140}
                      disabled={loading}
                      autoFocus
                      className={safeText(revokeReason).length > 0 && safeText(revokeReason).length < 5
                        ? 'sess-textarea-error'
                        : ''}
                    />
                  </label>

                  {/* Compteur + feedback validation */}
                  <div className="sess-reason-footer">
                    {safeText(revokeReason).length > 0 && safeText(revokeReason).length < 5 && (
                      <span className="sess-reason-error">
                        <AlertTriangle size={12} />
                        Motif trop court
                      </span>
                    )}
                    <div className="admin-session-reason-count" style={{ marginLeft: 'auto' }}>
                      {safeText(revokeReason).length}/140
                    </div>
                  </div>
                </div>

                {/* Actions — même boutons, même handlers qu'avant */}
                <div className="admin-session-modal-actions">
                  <button
                    className="admin-btn"
                    type="button"
                    onClick={closeRevokeDialog}
                    disabled={loading}
                  >
                    Annuler
                  </button>
                  <button
                    className="admin-btn danger"
                    type="button"
                    onClick={confirmRevoke}
                    disabled={loading || safeText(revokeReason).length < 5}
                  >
                    <Ban size={16} />
                    <span>Confirmer la révocation</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default AdminSessions;
