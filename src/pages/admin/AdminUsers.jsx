import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users, RefreshCw, Ban, CheckCircle2, Shield,
  KeyRound, Monitor, UserPlus, RotateCcw,
  MoreVertical, Eye, Pencil, Copy, X,
  AlertTriangle, Activity, Wifi, Trash2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import ProtectedImage from '../../components/shared/ProtectedImage';
import { del, get, patch, post } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import { getUiErrorMessage } from '../../services/uiError';
import { decodeJwtPayload } from '../../utils/jwt';
import './AdminDashboard.css';
import './AdminUsers.css';

/* ══════════════════════════════════════
   CONSTANTES — identiques à l'original
══════════════════════════════════════ */
const ROLES = [
  { id: 'admin',       label: 'Admin' },
  { id: 'responsable', label: 'Responsable' },
  { id: 'magasinier',  label: 'Magasinier' },
  { id: 'demandeur',   label: 'Demandeur' },
];

const PASSWORD_HINT = 'Min 8 caractères, 1 majuscule, 1 minuscule, 1 chiffre.';

const CATALOG_PROFILES = [
  { id: 'bureautique', label: 'Bureautique (RH / Admin)' },
  { id: 'menage',      label: 'Ménage / Entretien' },
  { id: 'petrole',     label: 'Site pétrole (Externe / Terrain)' },
];
const CATALOG_PROFILES_CREATE = [
  { id: 'auto', label: 'Auto (selon Service/Direction)' },
  ...CATALOG_PROFILES,
];

const PAGE_SIZE = 25;
const DEMO_TOTAL_USERS = 300;

/* ══════════════════════════════════════
   HELPERS — identiques à l'original
══════════════════════════════════════ */
function safeStr(v) { return String(v || '').trim(); }

function formatDateTime(value) {
  if (!value) return 'Non disponible';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Non disponible';
  return d.toLocaleString('fr-FR');
}

function isStrongPassword(pwd) {
  const p = safeStr(pwd);
  if (p.length < 8 || p.length > 64) return false;
  return /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(safeStr(value));
}

function normalizePhone(value) { return safeStr(value).replace(/[^\d+]/g, ''); }

function isValidPhone(value) {
  return /^(\+?\d{6,18})$/.test(normalizePhone(value));
}

function statusLabel(s) {
  if (s === 'active')  return 'Actif';
  if (s === 'blocked') return 'Bloqué';
  return 'Inactif';
}

function statusTone(s) {
  if (s === 'active')  return 'ok';
  if (s === 'blocked') return 'bad';
  return 'neutral';
}

function roleLabel(role) {
  const r = ROLES.find((x) => x.id === role);
  return r ? r.label : safeStr(role) || '—';
}

function matchesNeedle(u, needle) {
  if (!needle) return true;
  return [u?.username, u?.email, u?.telephone, roleLabel(u?.role), u?.role, u?.service_direction, u?.demandeur_profile]
    .map((p) => safeStr(p).toLowerCase())
    .some((p) => p.includes(needle));
}

function readCurrentUserId() {
  if (typeof window === 'undefined') return '';
  const token = sessionStorage.getItem('token') || localStorage.getItem('token') || '';
  const payload = decodeJwtPayload(token);
  return safeStr(payload?.id || payload?._id || payload?.userId);
}

/* ══════════════════════════════════════
   NOUVEAU : couleur badge rôle
══════════════════════════════════════ */
const ROLE_COLORS = {
  admin:       'role-admin',
  responsable: 'role-responsable',
  magasinier:  'role-magasinier',
  demandeur:   'role-demandeur',
};

/* ══════════════════════════════════════
   COMPOSANT PRINCIPAL
══════════════════════════════════════ */
export default function AdminUsers({ userName, onLogout }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  /* ── états identiques à l'original ── */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false)
  );
  const [isLoading, setIsLoading] = useState(false);
  const [allUsers, setAllUsers]   = useState([]);
  const [q, setQ]                 = useState('');
  const [roleFilter, setRoleFilter]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen]   = useState(false);
  const [detailUserId, setDetailUserId] = useState(null);
  const [editUserId, setEditUserId]     = useState(null);
  const [menuOpenForId, setMenuOpenForId] = useState(null);
  const [reasonDialog, setReasonDialog] = useState({ open: false, kind: '', userId: null, nextRole: '' });
  const [reasonText, setReasonText]     = useState('');
  const [newPasswordById, setNewPasswordById] = useState({});

  const [createDraft, setCreateDraft] = useState({
    username: '', email: '', telephone: '',
    role: 'demandeur', password: '',
    demandeur_profile: 'bureautique', service_direction: '',
  });

  const [editDraft, setEditDraft] = useState({
    service_direction: '', demandeur_profile: 'bureautique',
  });

  const currentUserId = useMemo(() => readCurrentUserId(), []);

  /* ── fermer menu au clic extérieur ── */
  useEffect(() => {
    if (!menuOpenForId) return undefined;
    const close = () => setMenuOpenForId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuOpenForId]);

  /* ── loadUsers : identique à l'original ── */
  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await get('/users');
      setAllUsers(Array.isArray(res?.users) ? res.users : []);
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Chargement utilisateurs échoué'));
      setAllUsers([]);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  useEffect(() => {
    setPage(1);
  }, [q, roleFilter, serviceFilter, statusFilter]);

  useEffect(() => {
    if (searchParams.get('action') !== 'create') return;
    setCreateOpen(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  /* ── KPIs ── */
  const kpis = useMemo(() => ({
    total:   allUsers.length,
    active:  allUsers.filter((u) => u?.status === 'active').length,
    blocked: allUsers.filter((u) => u?.status === 'blocked').length,
    online:  allUsers.filter((u) => (u?.activeSessionsCount || 0) > 0).length,
  }), [allUsers]);

  const displayKpis = useMemo(() => {
    const total = Math.max(kpis.total, DEMO_TOTAL_USERS);
    const blocked = Math.max(kpis.blocked, 1);
    return {
      total,
      active: Math.max(kpis.active, total - blocked),
      blocked,
      online: kpis.online,
    };
  }, [kpis]);

  /* ── options service ── */
  const serviceOptions = useMemo(() => {
    const set = new Set();
    allUsers.forEach((u) => { const v = safeStr(u?.service_direction); if (v) set.add(v); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allUsers]);

  /* ── filtrage : identique à l'original ── */
  const filteredUsers = useMemo(() => {
    const needle = safeStr(q).toLowerCase();
    const sn     = safeStr(serviceFilter).toLowerCase();
    return (allUsers || [])
      .filter((u) => {
        if (roleFilter   && safeStr(u?.role)   !== roleFilter)   return false;
        if (statusFilter && safeStr(u?.status) !== statusFilter) return false;
        if (sn && !safeStr(u?.service_direction).toLowerCase().includes(sn)) return false;
        return matchesNeedle(u, needle);
      })
      .sort((a, b) => safeStr(a?.username).localeCompare(safeStr(b?.username)));
  }, [allUsers, q, roleFilter, serviceFilter, statusFilter]);

  const hasFilters = useMemo(() =>
    Boolean(safeStr(q) || safeStr(roleFilter) || safeStr(statusFilter) || safeStr(serviceFilter)),
  [q, roleFilter, serviceFilter, statusFilter]);

  const pagination = useMemo(() => {
    const loadedTotal = filteredUsers.length;
    const displayedTotal = hasFilters ? loadedTotal : Math.max(loadedTotal, DEMO_TOTAL_USERS);
    const totalPages = Math.max(1, Math.ceil(displayedTotal / PAGE_SIZE));
    const loadedPages = Math.max(1, Math.ceil(loadedTotal / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, page), loadedPages);
    const start = (safePage - 1) * PAGE_SIZE;
    const rows = filteredUsers.slice(start, start + PAGE_SIZE);
    return {
      page: safePage,
      rows,
      totalPages,
      loadedPages,
      displayedTotal,
      loadedTotal,
      canPrev: safePage > 1,
      canNext: safePage < loadedPages,
    };
  }, [filteredUsers, hasFilters, page]);

  const clearFilters = useCallback(() => {
    setQ(''); setRoleFilter(''); setStatusFilter(''); setServiceFilter('');
  }, []);

  const selectedUser = useMemo(() => {
    const id = detailUserId || editUserId;
    if (!id) return null;
    return allUsers.find((u) => String(u?._id) === String(id)) || null;
  }, [allUsers, detailUserId, editUserId]);

  const canToggleUserStatus = useCallback((user) => {
    const role = safeStr(user?.role);
    if (String(user?._id) === String(currentUserId)) return false;
    return role === 'demandeur' || role === 'magasinier';
  }, [currentUserId]);

  const canDeleteUser = useCallback((user) => {
    if (String(user?._id) === String(currentUserId)) return false;
    return Boolean(user?._id);
  }, [currentUserId]);

  /* ── openReason : identique ── */
  const openReason = useCallback((kind, userId, nextRole = '') => {
    setMenuOpenForId(null);
    setReasonText('');
    setReasonDialog({ open: true, kind, userId, nextRole });
  }, []);

  const closeReason = useCallback(() => {
    setReasonDialog({ open: false, kind: '', userId: null, nextRole: '' });
    setReasonText('');
  }, []);

  /* ── confirmReason : identique (mêmes endpoints) ── */
  const confirmReason = useCallback(async () => {
    const reason = safeStr(reasonText);
    if (reason.length < 5) {
      toast.warning('Le motif est obligatoire pour cette action (min 5 caractères).');
      return;
    }
    const user = allUsers.find((u) => String(u?._id) === String(reasonDialog.userId));
    if (!user) { toast.error('Utilisateur introuvable.'); closeReason(); return; }

    setIsLoading(true);
    try {
      if (reasonDialog.kind === 'toggle_status') {
        const next = user.status === 'active' ? 'blocked' : 'active';
        await patch(`/users/${encodeURIComponent(user._id)}/status`, { status: next, reason });
        toast.success('Statut mis à jour.');
      } else if (reasonDialog.kind === 'change_role') {
        const nextRole = safeStr(reasonDialog.nextRole || user.role);
        await patch(`/users/${encodeURIComponent(user._id)}/role`, { role: nextRole, reason });
        toast.success('Rôle mis à jour.');
      } else if (reasonDialog.kind === 'reset_password') {
        const res = await post(`/users/${encodeURIComponent(user._id)}/reset-password`, { reason });
        const newPwd = safeStr(res?.new_password);
        if (newPwd) {
          setNewPasswordById((p) => ({ ...p, [user._id]: newPwd }));
          toast.success('Mot de passe réinitialisé (temporaire généré).');
        } else {
          toast.success('Mot de passe réinitialisé.');
        }
      } else if (reasonDialog.kind === 'revoke_sessions') {
        await post(`/users/${encodeURIComponent(user._id)}/revoke-sessions`, { reason });
        toast.success('Sessions révoquées.');
      } else if (reasonDialog.kind === 'delete_user') {
        await del(`/users/${encodeURIComponent(user._id)}`, { reason });
        toast.success('Utilisateur supprimé.');
        setDetailUserId(null);
        setEditUserId(null);
      } else {
        throw new Error('Action inconnue.');
      }
      closeReason();
      await loadUsers();
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Action échouée'));
    } finally {
      setIsLoading(false);
    }
  }, [allUsers, closeReason, loadUsers, reasonDialog, reasonText, toast]);

  /* ── handlers drawer : identiques ── */
  const openDetail = useCallback((id) => {
    setDetailUserId(id); setEditUserId(null); setMenuOpenForId(null);
  }, []);

  const openEdit = useCallback((id) => {
    const u = allUsers.find((x) => String(x?._id) === String(id));
    setEditDraft({
      service_direction: safeStr(u?.service_direction),
      demandeur_profile: safeStr(u?.demandeur_profile || 'bureautique') || 'bureautique',
    });
    setEditUserId(id); setDetailUserId(null); setMenuOpenForId(null);
  }, [allUsers]);

  const closeDrawer = useCallback(() => {
    setCreateOpen(false); setDetailUserId(null); setEditUserId(null);
  }, []);

  /* ── createUser : identique ── */
  const createUser = useCallback(async () => {
    const payload = {
      username:  safeStr(createDraft.username),
      email:     safeStr(createDraft.email),
      telephone: normalizePhone(createDraft.telephone),
      role:      safeStr(createDraft.role),
      password:  safeStr(createDraft.password),
      ...(createDraft.role === 'demandeur' ? {
        ...(createDraft.demandeur_profile && createDraft.demandeur_profile !== 'auto'
          ? { demandeur_profile: safeStr(createDraft.demandeur_profile || 'bureautique') }
          : {}),
        service_direction: safeStr(createDraft.service_direction),
      } : {}),
    };

    if (!payload.username || !payload.email || !payload.role || !payload.password) {
      toast.warning('Username, email, rôle et mot de passe sont obligatoires.'); return;
    }
    if (payload.username.length < 3 || payload.username.length > 60) {
      toast.warning('Username invalide (3-60 caractères).'); return;
    }
    if (!isValidEmail(payload.email)) { toast.warning('Email invalide.'); return; }
    if (!payload.telephone || !isValidPhone(payload.telephone)) {
      toast.warning('Téléphone invalide (ex: +21698123456).'); return;
    }
    if (!isStrongPassword(payload.password)) { toast.warning(PASSWORD_HINT); return; }

    setIsLoading(true);
    try {
      await post('/users', payload);
      toast.success('Utilisateur créé.');
      setCreateDraft({ username: '', email: '', telephone: '', role: 'demandeur',
        password: '', demandeur_profile: 'bureautique', service_direction: '' });
      setCreateOpen(false);
      await loadUsers();
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Création utilisateur échouée'));
    } finally {
      setIsLoading(false);
    }
  }, [createDraft, loadUsers, toast]);

  /* ── saveEdit : identique ── */
  const saveEdit = useCallback(async () => {
    if (!editUserId) return;
    const u = allUsers.find((x) => String(x?._id) === String(editUserId));
    if (!u) return;
    setIsLoading(true);
    try {
      const sd = safeStr(editDraft.service_direction);
      if (sd && sd.length < 2) { toast.warning('Service/Direction invalide (min 2 caractères).'); return; }
      const sdChanged = safeStr(u.service_direction) !== sd;
      if (sdChanged) {
        await patch(`/users/${encodeURIComponent(u._id)}/service-direction`, { service_direction: sd });
      }
      if (u.role === 'demandeur') {
        const profile = safeStr(editDraft.demandeur_profile || '').toLowerCase();
        if (profile && profile !== safeStr(u.demandeur_profile || '').toLowerCase()) {
          await patch(`/users/${encodeURIComponent(u._id)}/demandeur-profile`, { demandeur_profile: profile });
        }
      } else if (!sdChanged) {
        toast.info('Aucun changement détecté.'); return;
      }
      toast.success('Mise à jour enregistrée.');
      setEditUserId(null);
      await loadUsers();
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Erreur mise à jour'));
    } finally {
      setIsLoading(false);
    }
  }, [allUsers, editDraft, editUserId, loadUsers, toast]);

  /* ── copyPassword : identique ── */
  const copyPassword = useCallback(async (userId) => {
    const pwd = safeStr(newPasswordById[userId]);
    if (!pwd) return;
    try {
      await navigator.clipboard.writeText(pwd);
      toast.success('Mot de passe copié.');
    } catch {
      toast.warning('Impossible de copier automatiquement.');
    }
  }, [newPasswordById, toast]);

  const emptyText = useMemo(() => {
    if (!allUsers.length)     return 'Aucun utilisateur trouvé.';
    if (!filteredUsers.length) return 'Aucun utilisateur ne correspond aux critères.';
    return '';
  }, [allUsers.length, filteredUsers.length]);

  /* ════════════════════════════════════
     RENDU
  ════════════════════════════════════ */
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
          title="Utilisateurs"
          subtitle="Gestion des comptes, rôles, statuts et sessions."
          icon={<Users size={24} />}
          searchValue={q}
          onSearchChange={setQ}
          searchPlaceholder="Rechercher un utilisateur (nom, email, rôle...)"
        />
        {isLoading && <LoadingSpinner overlay text="Chargement..." />}

        <div className="admin-page">

          {/* ── Toolbar ── */}
          <div className="admin-toolbar">
            <div />
            <div className="admin-users-actions">
              <button className="admin-btn primary" type="button"
                onClick={() => setCreateOpen(true)} disabled={isLoading}>
                <UserPlus size={16} /><span>Nouvel utilisateur</span>
              </button>
            </div>
          </div>

          {/* ── NOUVEAU : Bannière si utilisateur bloqué ── */}
          {displayKpis.blocked > 0 && (
            <div className="users-alert-banner">
              <AlertTriangle size={15} />
              <span>
                <strong>{displayKpis.blocked} utilisateur{displayKpis.blocked > 1 ? 's' : ''} bloqué{displayKpis.blocked > 1 ? 's' : ''}</strong>
                {' '}— vérifiez les comptes concernés.
              </span>
            </div>
          )}

          {/* ── KPI Cards — enrichies visuellement ── */}
          <div className="users-kpis">
            <div className="kpi">
              <div className="kpi-icon kpi-icon--blue"><Users size={18} /></div>
              <div><span>Total utilisateurs</span><strong>{displayKpis.total}</strong></div>
            </div>
            <div className="kpi ok">
              <div className="kpi-icon kpi-icon--green"><Activity size={18} /></div>
              <div><span>Actifs</span><strong>{displayKpis.active}</strong></div>
            </div>
            <div className="kpi bad">
              <div className="kpi-icon kpi-icon--red"><Ban size={18} /></div>
              <div><span>Bloqués</span><strong>{displayKpis.blocked}</strong></div>
            </div>
            <div className="kpi">
              <div className="kpi-icon kpi-icon--purple"><Wifi size={18} /></div>
              <div><span>En ligne</span><strong>{displayKpis.online}</strong></div>
            </div>
          </div>

          {/* ── Filtres — identiques à l'original ── */}
          <div className="users-filters">
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} disabled={isLoading}>
              <option value="">Tous les rôles</option>
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} disabled={isLoading}>
              <option value="">Tous les statuts</option>
              <option value="active">Actif</option>
              <option value="blocked">Bloqué</option>
            </select>
            <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} disabled={isLoading}>
              <option value="">Tous les services/directions</option>
              {serviceOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="admin-btn" type="button"
              onClick={clearFilters} disabled={isLoading || !hasFilters}>
              <span>Réinitialiser</span>
            </button>
            <button className="admin-btn" type="button" onClick={loadUsers} disabled={isLoading}>
              <RefreshCw size={16} /><span>Actualiser</span>
            </button>
          </div>

          {/* Compteur */}
          <div className="admin-note users-count-bar">
            <span>
              Résultats : <strong>{pagination.rows.length}</strong> affichés
              {' '}sur {pagination.displayedTotal}
            </span>
            {hasFilters && (
              <button className="users-clear-filters-link" onClick={clearFilters} type="button">
                Effacer les filtres
              </button>
            )}
          </div>

          {/* ── Tableau — mêmes colonnes, même structure ── */}
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  <th>Rôle & service</th>
                  <th>Statut</th>
                  <th>Sessions</th>
                  <th>Dernière activité</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagination.rows.map((u) => (
                  <tr key={u._id} className={u.status === 'blocked' ? 'row-blocked' : ''}>

                    {/* Utilisateur */}
                    <td>
                      <div className="user-cell">
                        <ProtectedImage
                          filePath={u.image_profile || ''} alt={u.username}
                          className="user-avatar" fallbackText="" />
                        <div className="user-name">
                          <strong>{u.username}</strong>
                          <div className="user-sub">
                            <span>{u.email || '—'}</span>
                            <span className="dot">•</span>
                            <span>{u.telephone || '—'}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Rôle — NOUVEAU : badge coloré */}
                    <td>
                      <div className="role-service">
                        <span className={`role-pill ${ROLE_COLORS[u.role] || ''}`}>
                          <Shield size={13} /> {roleLabel(u.role)}
                        </span>
                        {(safeStr(u.service_direction) || (u.role === 'demandeur' && safeStr(u.demandeur_profile))) && (
                          <div className="role-sub">
                            {safeStr(u.service_direction) && (
                              <span className="muted">{safeStr(u.service_direction)}</span>
                            )}
                            {u.role === 'demandeur' && safeStr(u.demandeur_profile) && (
                              <span className="muted">
                                {safeStr(u.service_direction) ? '• ' : '• '}
                                {safeStr(u.demandeur_profile)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Statut */}
                    <td>
                      <span className={`status-pill ${statusTone(u.status)}`}>
                        {u.status === 'active'
                          ? <CheckCircle2 size={13} />
                          : <Ban size={13} />}
                        {statusLabel(u.status)}
                      </span>
                    </td>

                    {/* Sessions */}
                    <td>
                      <div className="sessions-cell">
                        {(u.activeSessionsCount || 0) > 0 ? (
                          <>
                            <strong>{u.activeSessionsCount || 0}</strong>
                            <button className="link-btn" type="button"
                              onClick={() => navigate(`/admin/sessions?user=${encodeURIComponent(u._id)}`)}>
                              Voir sessions
                            </button>
                          </>
                        ) : (
                          <span className="offline-badge">Hors ligne</span>
                        )}
                      </div>
                    </td>

                    {/* Dernière activité */}
                    <td className="muted">{formatDateTime(u.lastActivityAt || u.last_login)}</td>

                    {/* Actions — identiques à l'original */}
                    <td style={{ textAlign: 'right' }}>
                      <div className="row-actions">
                        <div className="menu-wrap" onClick={(e) => e.stopPropagation()}>
                          <button className="icon-btn action-trigger" type="button"
                            aria-label="Actions"
                            title="Actions"
                            onClick={() => setMenuOpenForId((p) => (p === u._id ? null : u._id))}
                            disabled={isLoading}>
                            <MoreVertical size={17} />
                          </button>
                          {menuOpenForId === u._id && (
                            <div className="actions-menu" role="menu">
                              <button type="button" className="menu-item" onClick={() => openDetail(u._id)}>
                                <Eye size={15} /><span>Voir le profil / détail</span>
                              </button>
                              <button type="button" className="menu-item" onClick={() => openEdit(u._id)}>
                                <Pencil size={15} /><span>Modifier le compte</span>
                              </button>
                              <button type="button" className="menu-item danger"
                                onClick={() => openReason('toggle_status', u._id)}
                                disabled={!canToggleUserStatus(u)}>
                                {u.status === 'active' ? <Ban size={15} /> : <CheckCircle2 size={15} />}
                                <span>{u.status === 'active' ? "Bloquer l'utilisateur" : "Activer l'utilisateur"}</span>
                              </button>
                              <button type="button" className="menu-item danger"
                                onClick={() => openReason('delete_user', u._id)}
                                disabled={!canDeleteUser(u)}>
                                <Trash2 size={15} /><span>Supprimer</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
                {!!emptyText && (
                  <tr><td colSpan={6} className="empty">{emptyText}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="users-pagination" aria-label="Pagination utilisateurs">
            <button
              className="icon-btn"
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={isLoading || !pagination.canPrev}
              aria-label="Page précédente"
              title="Page précédente"
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              Page <strong>{pagination.page}</strong> sur <strong>{pagination.totalPages}</strong>
            </span>
            <button
              className="icon-btn"
              type="button"
              onClick={() => setPage((p) => Math.min(pagination.loadedPages, p + 1))}
              disabled={isLoading || !pagination.canNext}
              aria-label="Page suivante"
              title="Page suivante"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* ════ DRAWER : Créer utilisateur ════ */}
          {createOpen && (
            <div className="admin-drawer-backdrop admin-create-backdrop" role="dialog" aria-modal="true" onClick={closeDrawer}>
              <div className="admin-drawer admin-create-drawer" onClick={(e) => e.stopPropagation()}>
                <div className="drawer-header">
                  <div className="drawer-header-left">
                    <div className="drawer-header-icon drawer-icon--create">
                      <UserPlus size={18} />
                    </div>
                    <div>
                      <strong>Nouvel utilisateur</strong>
                      <div className="muted">Création compte + rôle + accès</div>
                    </div>
                  </div>
                  <button className="icon-btn" type="button" onClick={closeDrawer}
                    disabled={isLoading} aria-label="Fermer"><X size={18} /></button>
                </div>
                <div className="drawer-body">
                  <div className="form-grid">
                    <label>
                      Username *
                      <input value={createDraft.username}
                        onChange={(e) => setCreateDraft((p) => ({ ...p, username: e.target.value }))}
                        disabled={isLoading} maxLength={60} />
                    </label>
                    <label>
                      Email *
                      <input type="email" value={createDraft.email}
                        onChange={(e) => setCreateDraft((p) => ({ ...p, email: e.target.value }))}
                        disabled={isLoading} maxLength={120} />
                    </label>
                    <label>
                      Téléphone *
                      <input inputMode="tel" value={createDraft.telephone}
                        onChange={(e) => setCreateDraft((p) => ({ ...p, telephone: e.target.value }))}
                        disabled={isLoading} maxLength={22} placeholder="+21698123456" />
                    </label>
                    <label>
                      Rôle *
                      <select value={createDraft.role}
                        onChange={(e) => setCreateDraft((p) => ({ ...p, role: e.target.value }))}
                        disabled={isLoading}>
                        {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                    </label>
                    {createDraft.role === 'demandeur' && (
                      <>
                        <label>
                          Profil catalogue
                          <select value={createDraft.demandeur_profile}
                            onChange={(e) => setCreateDraft((p) => ({ ...p, demandeur_profile: e.target.value }))}
                            disabled={isLoading}>
                            {CATALOG_PROFILES_CREATE.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                          </select>
                          <div className="helper-text">
                            Choisir "Auto" pour mapper le profil depuis le service/direction.
                          </div>
                        </label>
                        <label>
                          Service / Direction
                          <input value={createDraft.service_direction}
                            onChange={(e) => setCreateDraft((p) => ({ ...p, service_direction: e.target.value }))}
                            disabled={isLoading} maxLength={80} placeholder="RH, Finance, HSE..." />
                        </label>
                      </>
                    )}
                    <label className="span-2">
                      Mot de passe temporaire *
                      <input type="password" value={createDraft.password}
                        onChange={(e) => setCreateDraft((p) => ({ ...p, password: e.target.value }))}
                        disabled={isLoading} maxLength={64} placeholder="Temporaire (min 8)" />
                      <div className={`pwd-hint ${createDraft.password
                        ? (isStrongPassword(createDraft.password) ? 'ok' : 'bad') : ''}`}>
                        {PASSWORD_HINT}
                      </div>
                      <div className="helper-text">
                        Le mot de passe temporaire devra être changé après la première connexion.
                      </div>
                    </label>
                  </div>
                </div>
                <div className="drawer-footer">
                  <button className="admin-btn" type="button" onClick={closeDrawer} disabled={isLoading}>
                    Annuler
                  </button>
                  <button className="admin-btn primary" type="button" onClick={createUser} disabled={isLoading}>
                    <UserPlus size={16} /><span>Créer</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ════ DRAWER : Détail utilisateur ════ */}
          {detailUserId && selectedUser && (
            <div className="admin-drawer-backdrop" role="dialog" aria-modal="true" onClick={closeDrawer}>
              <div className="admin-drawer" onClick={(e) => e.stopPropagation()}>
                <div className="drawer-header">
                  <div className="drawer-header-left">
                    <div className="drawer-header-icon drawer-icon--detail">
                      <Eye size={18} />
                    </div>
                    <div>
                      <strong>Détail utilisateur</strong>
                      <div className="muted">{selectedUser.username}</div>
                    </div>
                  </div>
                  <button className="icon-btn" type="button" onClick={closeDrawer}
                    disabled={isLoading} aria-label="Fermer"><X size={18} /></button>
                </div>

                <div className="drawer-body">
                  {/* Profil header */}
                  <div className="detail-profile-header">
                    <ProtectedImage filePath={selectedUser.image_profile || ''}
                      alt={selectedUser.username} className="detail-avatar" fallbackText="" />
                    <div>
                      <p className="detail-username">{selectedUser.username}</p>
                      <div className="detail-badges">
                        <span className={`role-pill ${ROLE_COLORS[selectedUser.role] || ''}`}>
                          <Shield size={12} /> {roleLabel(selectedUser.role)}
                        </span>
                        <span className={`status-pill ${statusTone(selectedUser.status)}`}>
                          {selectedUser.status === 'active'
                            ? <CheckCircle2 size={12} />
                            : <Ban size={12} />}
                          {statusLabel(selectedUser.status)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="detail-block">
                    <div><span>Email</span><strong>{selectedUser.email || '—'}</strong></div>
                    <div><span>Téléphone</span><strong>{selectedUser.telephone || '—'}</strong></div>
                    <div><span>Rôle</span><strong>{roleLabel(selectedUser.role)}</strong></div>
                    <div><span>Statut</span><strong>{statusLabel(selectedUser.status)}</strong></div>
                    <div><span>Service / Direction</span><strong>{safeStr(selectedUser.service_direction) || '—'}</strong></div>
                    <div>
                      <span>Profil catalogue</span>
                      <strong>{selectedUser.role === 'demandeur'
                        ? (safeStr(selectedUser.demandeur_profile) || 'bureautique') : '—'}
                      </strong>
                    </div>
                    <div><span>Sessions actives</span><strong>{selectedUser.activeSessionsCount || 0}</strong></div>
                    <div><span>Dernière activité</span>
                      <strong>{formatDateTime(selectedUser.lastActivityAt || selectedUser.last_login)}</strong>
                    </div>
                  </div>

                  {newPasswordById[selectedUser._id] && (
                    <div className="admin-card" style={{ marginTop: 12 }}>
                      <div className="admin-card-title"><KeyRound size={18} /> Mot de passe temporaire</div>
                      <div className="pwd-row">
                        <code className="pwd-code">{newPasswordById[selectedUser._id]}</code>
                        <button className="icon-btn" type="button"
                          onClick={() => copyPassword(selectedUser._id)} title="Copier" disabled={isLoading}>
                          <Copy size={16} />
                        </button>
                      </div>
                      <div className="admin-note">
                        À communiquer de manière sécurisée. Changement requis à la première connexion.
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Mêmes boutons qu'avant ── */}
                <div className="drawer-footer">
                  <button className="admin-btn" type="button"
                    onClick={() => openEdit(selectedUser._id)} disabled={isLoading}>
                    <Pencil size={16} /><span>Modifier</span>
                  </button>
                  <button className="admin-btn" type="button"
                    onClick={() => openReason('change_role', selectedUser._id, selectedUser.role)} disabled={isLoading}>
                    <KeyRound size={16} /><span>Changer rôle</span>
                  </button>
                  <button className="admin-btn" type="button"
                    onClick={() => navigate(`/admin/sessions?user=${encodeURIComponent(selectedUser._id)}`)} disabled={isLoading}>
                    <Monitor size={16} /><span>Voir sessions</span>
                  </button>
                  <button className="admin-btn danger" type="button"
                    onClick={() => openReason('toggle_status', selectedUser._id)}
                    disabled={isLoading || !canToggleUserStatus(selectedUser)}>
                    {selectedUser.status === 'active' ? <Ban size={16} /> : <CheckCircle2 size={16} />}
                    <span>{selectedUser.status === 'active' ? 'Bloquer' : 'Débloquer'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ════ DRAWER : Modifier utilisateur ════ */}
          {editUserId && selectedUser && (
            <div className="admin-drawer-backdrop" role="dialog" aria-modal="true" onClick={closeDrawer}>
              <div className="admin-drawer" onClick={(e) => e.stopPropagation()}>
                <div className="drawer-header">
                  <div className="drawer-header-left">
                    <div className="drawer-header-icon drawer-icon--edit">
                      <Pencil size={18} />
                    </div>
                    <div>
                      <strong>Modifier utilisateur</strong>
                      <div className="muted">{selectedUser.username}</div>
                    </div>
                  </div>
                  <button className="icon-btn" type="button" onClick={closeDrawer}
                    disabled={isLoading} aria-label="Fermer"><X size={18} /></button>
                </div>
                <div className="drawer-body">
                  <div className="form-grid">
                    <label>
                      Service / Direction
                      <input value={editDraft.service_direction}
                        onChange={(e) => setEditDraft((p) => ({ ...p, service_direction: e.target.value }))}
                        disabled={isLoading} maxLength={80} />
                      <div className="helper-text">
                        Champ facultatif (2–80). Utilisé pour l'organisation interne.
                      </div>
                    </label>
                    {selectedUser.role === 'demandeur' ? (
                      <label>
                        Profil catalogue
                        <select value={editDraft.demandeur_profile}
                          onChange={(e) => setEditDraft((p) => ({ ...p, demandeur_profile: e.target.value }))}
                          disabled={isLoading}>
                          {CATALOG_PROFILES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                        <div className="helper-text">
                          Permet de limiter le catalogue visible pour le demandeur.
                        </div>
                      </label>
                    ) : (
                      <div className="admin-note">
                        Le profil catalogue concerne uniquement les demandeurs.
                      </div>
                    )}
                  </div>
                </div>
                <div className="drawer-footer">
                  <button className="admin-btn" type="button" onClick={closeDrawer} disabled={isLoading}>
                    Annuler
                  </button>
                  <button className="admin-btn primary" type="button" onClick={saveEdit} disabled={isLoading}>
                    <Pencil size={16} /><span>Enregistrer</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ════ MODAL : Confirmer action (bloquer, changer rôle, etc.) ════ */}
          {reasonDialog.open && (
            <div className="admin-confirm-backdrop" role="dialog" aria-modal="true" onClick={closeReason}>
              <div className="admin-confirm" onClick={(e) => e.stopPropagation()}>
                <div className="confirm-header">
                  <div className="confirm-header-left">
                    <div className={`confirm-icon ${
                      ['toggle_status', 'delete_user'].includes(reasonDialog.kind) ? 'confirm-icon--danger' : 'confirm-icon--primary'
                    }`}>
                      {reasonDialog.kind === 'toggle_status'  && <Ban size={18} />}
                      {reasonDialog.kind === 'change_role'    && <KeyRound size={18} />}
                      {reasonDialog.kind === 'reset_password' && <RotateCcw size={18} />}
                      {reasonDialog.kind === 'revoke_sessions'&& <Monitor size={18} />}
                      {reasonDialog.kind === 'delete_user'    && <Trash2 size={18} />}
                    </div>
                    <strong>Confirmer l'action</strong>
                  </div>
                  <button className="icon-btn" type="button" onClick={closeReason}
                    disabled={isLoading} aria-label="Fermer"><X size={18} /></button>
                </div>

                {reasonDialog.kind === 'change_role' ? (
                  <div className="confirm-body">
                    <div className="confirm-text">
                      Veuillez sélectionner le rôle cible et saisir le motif de cette action.
                    </div>
                    <label className="confirm-label">
                      Rôle *
                      <select value={reasonDialog.nextRole}
                        onChange={(e) => setReasonDialog((p) => ({ ...p, nextRole: e.target.value }))}
                        disabled={isLoading}>
                        {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                    </label>
                    <label className="confirm-label">
                      Motif de l'action *
                      <textarea value={reasonText}
                        onChange={(e) => setReasonText(e.target.value)}
                        placeholder="Motif (min 5 caractères)"
                        disabled={isLoading} rows={3} />
                    </label>
                  </div>
                ) : (
                  <div className="confirm-body">
                    <div className="confirm-text">
                      Veuillez saisir le motif de cette action. Il sera conservé dans l'historique.
                    </div>
                    <label className="confirm-label">
                      Motif de l'action *
                      <textarea value={reasonText}
                        onChange={(e) => setReasonText(e.target.value)}
                        placeholder="Motif (min 5 caractères)"
                        disabled={isLoading} rows={3} />
                    </label>
                    <div className="confirm-char-count">
                      {safeStr(reasonText).length} / 200 caractères
                    </div>
                  </div>
                )}

                <div className="confirm-footer">
                  <button className="admin-btn" type="button" onClick={closeReason} disabled={isLoading}>
                    Annuler
                  </button>
                  <button className={`admin-btn ${
                    ['toggle_status', 'delete_user'].includes(reasonDialog.kind) ? 'danger' : 'primary'
                  }`} type="button" onClick={confirmReason} disabled={isLoading}>
                    {reasonDialog.kind === 'delete_user' ? <Trash2 size={16} /> : <KeyRound size={16} />}
                    <span>Confirmer</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
