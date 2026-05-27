import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  RefreshCw,
  Ban,
  CheckCircle2,
  Shield,
  KeyRound,
  Monitor,
  UserPlus,
  RotateCcw,
  Search,
  MoreVertical,
  Eye,
  Pencil,
  Copy,
  X,
} from 'lucide-react';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import ProtectedImage from '../../components/shared/ProtectedImage';
import { get, patch, post } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import { getUiErrorMessage } from '../../services/uiError';
import './AdminDashboard.css';
import './AdminUsers.css';

const ROLES = [
  { id: 'admin', label: 'Admin' },
  { id: 'responsable', label: 'Responsable' },
  { id: 'magasinier', label: 'Magasinier' },
  { id: 'demandeur', label: 'Demandeur' },
];

const PASSWORD_HINT = 'Min 8 caractères, 1 majuscule, 1 minuscule, 1 chiffre.';
const CATALOG_PROFILES = [
  { id: 'bureautique', label: 'Bureautique (RH / Admin)' },
  { id: 'menage', label: 'Ménage / Entretien' },
  { id: 'petrole', label: 'Site pétrole (Externe / Terrain)' },
];
const CATALOG_PROFILES_CREATE = [
  { id: 'auto', label: 'Auto (selon Service/Direction)' },
  ...CATALOG_PROFILES,
];

function safeStr(value) {
  return String(value || '').trim();
}

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

function normalizePhone(value) {
  return safeStr(value).replace(/[^\d+]/g, '');
}

function isValidPhone(value) {
  return /^(\+?\d{6,18})$/.test(normalizePhone(value));
}

function statusLabel(status) {
  if (status === 'active') return 'Actif';
  if (status === 'blocked') return 'Bloqué';
  return 'Inactif';
}

function statusTone(status) {
  if (status === 'active') return 'ok';
  if (status === 'blocked') return 'bad';
  return 'neutral';
}

function roleLabel(role) {
  const r = ROLES.find((x) => x.id === role);
  return r ? r.label : safeStr(role) || '—';
}

function matchesNeedle(u, needle) {
  if (!needle) return true;
  const parts = [u?.username, u?.email, u?.telephone].map((p) => safeStr(p).toLowerCase()).filter(Boolean);
  return parts.some((p) => p.includes(needle));
}

export default function AdminUsers({ userName, onLogout }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);

  const [allUsers, setAllUsers] = useState([]);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [detailUserId, setDetailUserId] = useState(null);
  const [editUserId, setEditUserId] = useState(null);

  const [menuOpenForId, setMenuOpenForId] = useState(null);

  const [reasonDialog, setReasonDialog] = useState({ open: false, kind: '', userId: null, nextRole: '' });
  const [reasonText, setReasonText] = useState('');
  const [newPasswordById, setNewPasswordById] = useState({});

  const [createDraft, setCreateDraft] = useState({
    username: '',
    email: '',
    telephone: '',
    role: 'demandeur',
    password: '',
    demandeur_profile: 'bureautique',
    service_direction: '',
  });

  const [editDraft, setEditDraft] = useState({
    service_direction: '',
    demandeur_profile: 'bureautique',
  });

  useEffect(() => {
    if (!menuOpenForId) return undefined;
    const close = () => setMenuOpenForId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuOpenForId]);

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

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const kpis = useMemo(() => {
    const total = allUsers.length;
    const active = allUsers.filter((u) => u?.status === 'active').length;
    const blocked = allUsers.filter((u) => u?.status === 'blocked').length;
    const online = allUsers.filter((u) => (u?.activeSessionsCount || 0) > 0).length;
    return { total, active, blocked, online };
  }, [allUsers]);

  const serviceOptions = useMemo(() => {
    const set = new Set();
    allUsers.forEach((u) => {
      const v = safeStr(u?.service_direction);
      if (v) set.add(v);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allUsers]);

  const filteredUsers = useMemo(() => {
    const needle = safeStr(q).toLowerCase();
    const serviceNeedle = safeStr(serviceFilter).toLowerCase();

    return (allUsers || [])
      .filter((u) => {
        if (roleFilter && safeStr(u?.role) !== roleFilter) return false;
        if (statusFilter && safeStr(u?.status) !== statusFilter) return false;
        if (serviceNeedle) {
          const service = safeStr(u?.service_direction).toLowerCase();
          if (!service.includes(serviceNeedle)) return false;
        }
        return matchesNeedle(u, needle);
      })
      .sort((a, b) => safeStr(a?.username).localeCompare(safeStr(b?.username)));
  }, [allUsers, q, roleFilter, serviceFilter, statusFilter]);

  const hasFilters = useMemo(() => (
    Boolean(safeStr(q) || safeStr(roleFilter) || safeStr(statusFilter) || safeStr(serviceFilter))
  ), [q, roleFilter, serviceFilter, statusFilter]);

  const clearFilters = useCallback(() => {
    setQ('');
    setRoleFilter('');
    setStatusFilter('');
    setServiceFilter('');
  }, []);

  const selectedUser = useMemo(() => {
    const id = detailUserId || editUserId;
    if (!id) return null;
    return allUsers.find((u) => String(u?._id) === String(id)) || null;
  }, [allUsers, detailUserId, editUserId]);

  const openReason = useCallback((kind, userId, nextRole = '') => {
    setMenuOpenForId(null);
    setReasonText('');
    setReasonDialog({ open: true, kind, userId, nextRole });
  }, []);

  const closeReason = useCallback(() => {
    setReasonDialog({ open: false, kind: '', userId: null, nextRole: '' });
    setReasonText('');
  }, []);

  const confirmReason = useCallback(async () => {
    const reason = safeStr(reasonText);
    if (reason.length < 5) {
      toast.warning('Le motif est obligatoire pour cette action (min 5 caractères).');
      return;
    }
    const user = allUsers.find((u) => String(u?._id) === String(reasonDialog.userId));
    if (!user) {
      toast.error('Utilisateur introuvable.');
      closeReason();
      return;
    }

    setIsLoading(true);
    try {
      if (reasonDialog.kind === 'toggle_status') {
        const nextStatus = user.status === 'active' ? 'blocked' : 'active';
        await patch(`/users/${encodeURIComponent(user._id)}/status`, { status: nextStatus, reason });
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

  const openDetail = useCallback((id) => {
    setDetailUserId(id);
    setEditUserId(null);
    setMenuOpenForId(null);
  }, []);

  const openEdit = useCallback((id) => {
    const u = allUsers.find((x) => String(x?._id) === String(id));
    setEditDraft({
      service_direction: safeStr(u?.service_direction),
      demandeur_profile: safeStr(u?.demandeur_profile || 'bureautique') || 'bureautique',
    });
    setEditUserId(id);
    setDetailUserId(null);
    setMenuOpenForId(null);
  }, [allUsers]);

  const closeDrawer = useCallback(() => {
    setCreateOpen(false);
    setDetailUserId(null);
    setEditUserId(null);
  }, []);

  const createUser = useCallback(async () => {
    const payload = {
      username: safeStr(createDraft.username),
      email: safeStr(createDraft.email),
      telephone: normalizePhone(createDraft.telephone),
      role: safeStr(createDraft.role),
      password: safeStr(createDraft.password),
      ...(createDraft.role === 'demandeur'
        ? {
          ...(createDraft.demandeur_profile && createDraft.demandeur_profile !== 'auto'
            ? { demandeur_profile: safeStr(createDraft.demandeur_profile || 'bureautique') }
            : {}),
          service_direction: safeStr(createDraft.service_direction),
        }
        : {}),
    };

    if (!payload.username || !payload.email || !payload.role || !payload.password) {
      toast.warning('Username, email, rôle et mot de passe sont obligatoires.');
      return;
    }
    if (payload.username.length < 3 || payload.username.length > 60) {
      toast.warning('Username invalide (3-60 caractères).');
      return;
    }
    if (!isValidEmail(payload.email)) {
      toast.warning('Email invalide.');
      return;
    }
    if (!payload.telephone || !isValidPhone(payload.telephone)) {
      toast.warning('Téléphone invalide (ex: +21698123456).');
      return;
    }
    if (!isStrongPassword(payload.password)) {
      toast.warning(PASSWORD_HINT);
      return;
    }

    setIsLoading(true);
    try {
      await post('/users', payload);
      toast.success('Utilisateur créé.');
      setCreateDraft({
        username: '',
        email: '',
        telephone: '',
        role: 'demandeur',
        password: '',
        demandeur_profile: 'bureautique',
        service_direction: '',
      });
      setCreateOpen(false);
      await loadUsers();
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Création utilisateur échouée'));
    } finally {
      setIsLoading(false);
    }
  }, [createDraft, loadUsers, toast]);

  const saveEdit = useCallback(async () => {
    if (!editUserId) return;
    const u = allUsers.find((x) => String(x?._id) === String(editUserId));
    if (!u) return;

    setIsLoading(true);
    try {
      const serviceDirection = safeStr(editDraft.service_direction);
      if (serviceDirection && serviceDirection.length < 2) {
        toast.warning('Service/Direction invalide (min 2 caractères).');
        return;
      }

      const serviceChanged = safeStr(u.service_direction) !== serviceDirection;
      if (serviceChanged) {
        await patch(`/users/${encodeURIComponent(u._id)}/service-direction`, { service_direction: serviceDirection });
      }

      if (u.role === 'demandeur') {
        const profile = safeStr(editDraft.demandeur_profile || '').toLowerCase();
        if (profile && profile !== safeStr(u.demandeur_profile || '').toLowerCase()) {
          await patch(`/users/${encodeURIComponent(u._id)}/demandeur-profile`, { demandeur_profile: profile });
        }
      } else if (!serviceChanged) {
        toast.info('Aucun changement détecté.');
        return;
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
    if (!allUsers.length) return 'Aucun utilisateur trouvé.';
    if (!filteredUsers.length) return 'Aucun utilisateur ne correspond aux critères.';
    return '';
  }, [allUsers.length, filteredUsers.length]);

  return (
    <div className="admin-layout">
      <SidebarAdmin
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((p) => !p)}
        onLogout={onLogout}
        userName={userName}
      />
      <div className={`admin-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <HeaderPage title="Utilisateurs" subtitle="Gestion des comptes, rôles, statuts et sessions." icon={<Users size={24} />} />
        {isLoading && <LoadingSpinner overlay text="Chargement..." />}

        <div className="admin-page">
          <div className="admin-toolbar">
            <div />
            <div className="admin-users-actions">
              <button className="admin-btn primary" type="button" onClick={() => setCreateOpen(true)} disabled={isLoading}>
                <UserPlus size={16} />
                <span>Nouvel utilisateur</span>
              </button>
              <button className="admin-btn" type="button" onClick={loadUsers} disabled={isLoading}>
                <RefreshCw size={16} />
                <span>Actualiser</span>
              </button>
            </div>
          </div>

          <div className="users-kpis">
            <div className="kpi">
              <span>Total utilisateurs</span>
              <strong>{kpis.total}</strong>
            </div>
            <div className="kpi ok">
              <span>Actifs</span>
              <strong>{kpis.active}</strong>
            </div>
            <div className="kpi bad">
              <span>Bloqués</span>
              <strong>{kpis.blocked}</strong>
            </div>
            <div className="kpi">
              <span>En ligne</span>
              <strong>{kpis.online}</strong>
            </div>
          </div>

          <div className="users-filters">
            <div className="users-search">
              <Search size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (nom, email, téléphone)" disabled={isLoading} />
            </div>
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
            <button className="admin-btn" type="button" onClick={clearFilters} disabled={isLoading || !hasFilters}>
              <span>Réinitialiser</span>
            </button>
            <button className="admin-btn" type="button" onClick={loadUsers} disabled={isLoading}>
              <RefreshCw size={16} />
              <span>Actualiser</span>
            </button>
          </div>

          <div className="admin-note" style={{ marginBottom: 10 }}>
            Résultats : <strong>{filteredUsers.length}</strong> / {allUsers.length}
          </div>

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
                {filteredUsers.map((u) => (
                  <tr key={u._id}>
                    <td>
                      <div className="user-cell">
                        <ProtectedImage filePath={u.image_profile || ''} alt={u.username} className="user-avatar" fallbackText="" />
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
                    <td>
                      <div className="role-service">
                        <span className="role-pill"><Shield size={14} /> {roleLabel(u.role)}</span>
                        <div className="role-sub">
                          <span className="muted">{safeStr(u.service_direction) || '—'}</span>
                          {u.role === 'demandeur' ? <span className="muted">• {safeStr(u.demandeur_profile) || 'bureautique'}</span> : null}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`status-pill ${statusTone(u.status)}`}>
                        {u.status === 'active' ? <CheckCircle2 size={14} /> : <Ban size={14} />}
                        {statusLabel(u.status)}
                      </span>
                    </td>
                    <td>
                      <div className="sessions-cell">
                        <strong>{u.activeSessionsCount || 0}</strong>
                        {(u.activeSessionsCount || 0) > 0 ? (
                          <button className="link-btn" type="button" onClick={() => navigate(`/admin/sessions?user=${encodeURIComponent(u._id)}`)}>
                            Voir sessions
                          </button>
                        ) : (
                          <span className="muted">Aucune session active</span>
                        )}
                      </div>
                    </td>
                    <td className="muted">{formatDateTime(u.lastActivityAt || u.last_login)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row-actions">
                        <button className="admin-btn small" type="button" onClick={() => openDetail(u._id)} disabled={isLoading}>
                          <Eye size={16} />
                          <span>Voir détail</span>
                        </button>
                        <div className="menu-wrap" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="admin-btn small"
                            type="button"
                            aria-label="Actions"
                            onClick={() => setMenuOpenForId((p) => (p === u._id ? null : u._id))}
                            disabled={isLoading}
                          >
                            <MoreVertical size={16} />
                            <span>Actions</span>
                          </button>
                          {menuOpenForId === u._id ? (
                            <div className="actions-menu" role="menu">
                              <button type="button" className="menu-item" onClick={() => openDetail(u._id)}>
                                <Eye size={16} />
                                <span>Voir détail</span>
                              </button>
                              <button type="button" className="menu-item" onClick={() => openEdit(u._id)}>
                                <Pencil size={16} />
                                <span>Modifier</span>
                              </button>
                              <button type="button" className="menu-item" onClick={() => openReason('change_role', u._id, u.role)}>
                                <KeyRound size={16} />
                                <span>Changer rôle</span>
                              </button>
                              <button type="button" className="menu-item" onClick={() => openReason('reset_password', u._id)}>
                                <RotateCcw size={16} />
                                <span>Réinitialiser mot de passe</span>
                              </button>
                              <button type="button" className="menu-item" onClick={() => navigate(`/admin/sessions?user=${encodeURIComponent(u._id)}`)}>
                                <Monitor size={16} />
                                <span>Voir sessions</span>
                              </button>
                              <div className="menu-sep" />
                              <button type="button" className="menu-item danger" onClick={() => openReason('revoke_sessions', u._id)}>
                                <Monitor size={16} />
                                <span>Révoquer sessions</span>
                              </button>
                              <button type="button" className="menu-item danger" onClick={() => openReason('toggle_status', u._id)}>
                                {u.status === 'active' ? <Ban size={16} /> : <CheckCircle2 size={16} />}
                                <span>{u.status === 'active' ? 'Bloquer' : 'Débloquer'}</span>
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
                {!!emptyText && (
                  <tr>
                    <td colSpan={6} className="empty">{emptyText}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {createOpen ? (
            <div className="admin-drawer-backdrop" role="dialog" aria-modal="true" onClick={closeDrawer}>
              <div className="admin-drawer" onClick={(e) => e.stopPropagation()}>
                <div className="drawer-header">
                  <div>
                    <strong>Nouvel utilisateur</strong>
                    <div className="muted">Création compte + rôle + accès</div>
                  </div>
                  <button className="icon-btn" type="button" onClick={closeDrawer} disabled={isLoading} aria-label="Fermer">
                    <X size={18} />
                  </button>
                </div>
                <div className="drawer-body">
                  <div className="form-grid">
                    <label>
                      Username *
                      <input value={createDraft.username} onChange={(e) => setCreateDraft((p) => ({ ...p, username: e.target.value }))} disabled={isLoading} maxLength={60} />
                    </label>
                    <label>
                      Email *
                      <input type="email" value={createDraft.email} onChange={(e) => setCreateDraft((p) => ({ ...p, email: e.target.value }))} disabled={isLoading} maxLength={120} />
                    </label>
                    <label>
                      Téléphone *
                      <input inputMode="tel" value={createDraft.telephone} onChange={(e) => setCreateDraft((p) => ({ ...p, telephone: e.target.value }))} disabled={isLoading} maxLength={22} placeholder="+21698123456" />
                    </label>
                    <label>
                      Rôle *
                      <select value={createDraft.role} onChange={(e) => setCreateDraft((p) => ({ ...p, role: e.target.value }))} disabled={isLoading}>
                        {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                    </label>
                    {createDraft.role === 'demandeur' ? (
                      <>
                        <label>
                          Profil catalogue
                          <select value={createDraft.demandeur_profile} onChange={(e) => setCreateDraft((p) => ({ ...p, demandeur_profile: e.target.value }))} disabled={isLoading}>
                            {CATALOG_PROFILES_CREATE.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                          </select>
                          <div className="helper-text">Choisir “Auto” pour mapper le profil depuis le service/direction.</div>
                        </label>
                        <label>
                          Service / Direction
                          <input value={createDraft.service_direction} onChange={(e) => setCreateDraft((p) => ({ ...p, service_direction: e.target.value }))} disabled={isLoading} maxLength={80} placeholder="RH, Finance, HSE..." />
                        </label>
                      </>
                    ) : null}
                    <label className="span-2">
                      Mot de passe temporaire *
                      <input type="password" value={createDraft.password} onChange={(e) => setCreateDraft((p) => ({ ...p, password: e.target.value }))} disabled={isLoading} maxLength={64} placeholder="Temporaire (min 8)" />
                      <div className={`pwd-hint ${createDraft.password ? (isStrongPassword(createDraft.password) ? 'ok' : 'bad') : ''}`}>{PASSWORD_HINT}</div>
                      <div className="helper-text">Le mot de passe temporaire devra être changé après la première connexion.</div>
                    </label>
                  </div>
                </div>
                <div className="drawer-footer">
                  <button className="admin-btn" type="button" onClick={closeDrawer} disabled={isLoading}>Annuler</button>
                  <button className="admin-btn primary" type="button" onClick={createUser} disabled={isLoading}>
                    <UserPlus size={16} />
                    <span>Créer</span>
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {detailUserId && selectedUser ? (
            <div className="admin-drawer-backdrop" role="dialog" aria-modal="true" onClick={closeDrawer}>
              <div className="admin-drawer" onClick={(e) => e.stopPropagation()}>
                <div className="drawer-header">
                  <div>
                    <strong>Détail utilisateur</strong>
                    <div className="muted">{selectedUser.username}</div>
                  </div>
                  <button className="icon-btn" type="button" onClick={closeDrawer} disabled={isLoading} aria-label="Fermer">
                    <X size={18} />
                  </button>
                </div>
                <div className="drawer-body">
                  <div className="detail-block">
                    <div><span>Email</span><strong>{selectedUser.email || '—'}</strong></div>
                    <div><span>Téléphone</span><strong>{selectedUser.telephone || '—'}</strong></div>
                    <div><span>Rôle</span><strong>{roleLabel(selectedUser.role)}</strong></div>
                    <div><span>Statut</span><strong>{statusLabel(selectedUser.status)}</strong></div>
                    <div><span>Service / Direction</span><strong>{safeStr(selectedUser.service_direction) || '—'}</strong></div>
                    <div><span>Profil catalogue</span><strong>{selectedUser.role === 'demandeur' ? (safeStr(selectedUser.demandeur_profile) || 'bureautique') : '—'}</strong></div>
                    <div><span>Sessions actives</span><strong>{selectedUser.activeSessionsCount || 0}</strong></div>
                    <div><span>Dernière activité</span><strong>{formatDateTime(selectedUser.lastActivityAt || selectedUser.last_login)}</strong></div>
                  </div>

                  {newPasswordById[selectedUser._id] ? (
                    <div className="admin-card" style={{ marginTop: 12 }}>
                      <div className="admin-card-title"><KeyRound size={18} /> Mot de passe temporaire</div>
                      <div className="pwd-row">
                        <code className="pwd-code">{newPasswordById[selectedUser._id]}</code>
                        <button className="icon-btn" type="button" onClick={() => copyPassword(selectedUser._id)} title="Copier" disabled={isLoading}>
                          <Copy size={16} />
                        </button>
                      </div>
                      <div className="admin-note">À communiquer de manière sécurisée. Changement requis à la première connexion.</div>
                    </div>
                  ) : null}
                </div>
                <div className="drawer-footer">
                  <button className="admin-btn" type="button" onClick={() => openEdit(selectedUser._id)} disabled={isLoading}>
                    <Pencil size={16} />
                    <span>Modifier</span>
                  </button>
                  <button className="admin-btn" type="button" onClick={() => openReason('change_role', selectedUser._id, selectedUser.role)} disabled={isLoading}>
                    <KeyRound size={16} />
                    <span>Changer rôle</span>
                  </button>
                  <button className="admin-btn" type="button" onClick={() => navigate(`/admin/sessions?user=${encodeURIComponent(selectedUser._id)}`)} disabled={isLoading}>
                    <Monitor size={16} />
                    <span>Voir sessions</span>
                  </button>
                  <button className="admin-btn danger" type="button" onClick={() => openReason('toggle_status', selectedUser._id)} disabled={isLoading}>
                    {selectedUser.status === 'active' ? <Ban size={16} /> : <CheckCircle2 size={16} />}
                    <span>{selectedUser.status === 'active' ? 'Bloquer' : 'Débloquer'}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {editUserId && selectedUser ? (
            <div className="admin-drawer-backdrop" role="dialog" aria-modal="true" onClick={closeDrawer}>
              <div className="admin-drawer" onClick={(e) => e.stopPropagation()}>
                <div className="drawer-header">
                  <div>
                    <strong>Modifier utilisateur</strong>
                    <div className="muted">{selectedUser.username}</div>
                  </div>
                  <button className="icon-btn" type="button" onClick={closeDrawer} disabled={isLoading} aria-label="Fermer">
                    <X size={18} />
                  </button>
                </div>
                <div className="drawer-body">
                  <div className="form-grid">
                    <label>
                      Service / Direction
                      <input value={editDraft.service_direction} onChange={(e) => setEditDraft((p) => ({ ...p, service_direction: e.target.value }))} disabled={isLoading} maxLength={80} />
                      <div className="helper-text">Champ facultatif (2–80). Utilisé pour l’organisation interne.</div>
                    </label>
                    {selectedUser.role === 'demandeur' ? (
                      <label>
                        Profil catalogue
                        <select value={editDraft.demandeur_profile} onChange={(e) => setEditDraft((p) => ({ ...p, demandeur_profile: e.target.value }))} disabled={isLoading}>
                          {CATALOG_PROFILES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                        <div className="helper-text">Permet de limiter le catalogue visible pour le demandeur.</div>
                      </label>
                    ) : (
                      <div className="admin-note">Le profil catalogue concerne uniquement les demandeurs.</div>
                    )}
                  </div>
                </div>
                <div className="drawer-footer">
                  <button className="admin-btn" type="button" onClick={closeDrawer} disabled={isLoading}>Annuler</button>
                  <button className="admin-btn primary" type="button" onClick={saveEdit} disabled={isLoading}>
                    <Pencil size={16} />
                    <span>Enregistrer</span>
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {reasonDialog.open ? (
            <div className="admin-confirm-backdrop" role="dialog" aria-modal="true" onClick={closeReason}>
              <div className="admin-confirm" onClick={(e) => e.stopPropagation()}>
                <div className="confirm-header">
                  <strong>Confirmer l’action</strong>
                  <button className="icon-btn" type="button" onClick={closeReason} disabled={isLoading} aria-label="Fermer">
                    <X size={18} />
                  </button>
                </div>
                {reasonDialog.kind === 'change_role' ? (
                  <div className="confirm-body">
                    <div className="confirm-text">Veuillez sélectionner le rôle cible et saisir le motif de cette action.</div>
                    <label className="confirm-label">
                      Rôle *
                      <select value={reasonDialog.nextRole} onChange={(e) => setReasonDialog((p) => ({ ...p, nextRole: e.target.value }))} disabled={isLoading}>
                        {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                    </label>
                    <label className="confirm-label">
                      Motif de l’action *
                      <textarea value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="Motif (min 5 caractères)" disabled={isLoading} rows={3} />
                    </label>
                  </div>
                ) : (
                  <div className="confirm-body">
                    <div className="confirm-text">Veuillez saisir le motif de cette action.</div>
                    <label className="confirm-label">
                      Motif de l’action *
                      <textarea value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="Motif (min 5 caractères)" disabled={isLoading} rows={3} />
                    </label>
                  </div>
                )}
                <div className="confirm-footer">
                  <button className="admin-btn" type="button" onClick={closeReason} disabled={isLoading}>Annuler</button>
                  <button className="admin-btn primary" type="button" onClick={confirmReason} disabled={isLoading}>
                    <KeyRound size={16} />
                    <span>Confirmer</span>
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
