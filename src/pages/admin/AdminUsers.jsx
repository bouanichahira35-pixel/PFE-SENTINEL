import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, RefreshCw, Ban, CheckCircle2, Shield, KeyRound, UserPlus, RotateCcw, Copy, User } from 'lucide-react';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import ProtectedImage from '../../components/shared/ProtectedImage';
import { get, patch, post } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
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

function isStrongPassword(pwd) {
  const p = String(pwd || '');
  if (p.length < 8 || p.length > 64) return false;
  return /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
}

function normalizePhone(value) {
  return String(value || '').trim().replace(/[^\d+]/g, '');
}

function isValidPhone(value) {
  return /^(\+?\d{6,18})$/.test(normalizePhone(value));
}

const AdminUsers = ({ userName, onLogout }) => {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [roleFilter, setRoleFilter] = useState('magasinier');
  const [statusFilter, setStatusFilter] = useState('active');
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [reasonById, setReasonById] = useState({});
  const [roleDraftById, setRoleDraftById] = useState({});
  const [newPasswordById, setNewPasswordById] = useState({});
  const [demandeurProfileDraftById, setDemandeurProfileDraftById] = useState({});
  const [serviceDraftById, setServiceDraftById] = useState({});

  const [createDraft, setCreateDraft] = useState({
    username: '',
    email: '',
    telephone: '',
    role: 'demandeur',
    password: '',
    demandeur_profile: 'bureautique',
    service_direction: '',
  });

  const passwordHint = PASSWORD_HINT;

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await get(`/users?role=${encodeURIComponent(roleFilter)}&status=${encodeURIComponent(statusFilter)}`);
      const users = Array.isArray(res?.users) ? res.users : [];
      setItems(users);
      setRoleDraftById((prev) => {
        const next = { ...prev };
        users.forEach((u) => {
          if (u?._id && !next[u._id]) next[u._id] = u.role;
        });
        return next;
      });
      setDemandeurProfileDraftById((prev) => {
        const next = { ...prev };
        users.forEach((u) => {
          if (u?._id && !next[u._id]) next[u._id] = u.demandeur_profile || 'bureautique';
        });
        return next;
      });
      setServiceDraftById((prev) => {
        const next = { ...prev };
        users.forEach((u) => {
          if (u?._id && next[u._id] === undefined) next[u._id] = u.service_direction || '';
        });
        return next;
      });
    } catch (err) {
      toast.error(err.message || 'Chargement utilisateurs échoué');
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [roleFilter, statusFilter, toast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const toggleStatus = useCallback(async (u) => {
    const id = u?._id;
    if (!id) return;
    const nextStatus = u.status === 'active' ? 'blocked' : 'active';
    const reason = String(reasonById[id] || '').trim();
    if (reason.length < 5) {
      toast.warning('Motif obligatoire (min 5 caractères).');
      return;
    }
    setIsLoading(true);
    try {
      await patch(`/users/${id}/status`, { status: nextStatus, reason });
      toast.success('Statut mis à jour.');
      await loadUsers();
    } catch (err) {
      toast.error(err.message || 'Mise à jour statut échouée');
    } finally {
      setIsLoading(false);
    }
  }, [loadUsers, reasonById, toast]);

  const revokeSessions = useCallback(async (u) => {
    const id = u?._id;
    if (!id) return;
    setIsLoading(true);
    try {
      await post(`/users/${id}/revoke-sessions`, { reason: 'revoked_by_admin' });
      toast.success('Sessions révoquées.');
      await loadUsers();
    } catch (err) {
      toast.error(err.message || 'Révocation sessions échouée');
    } finally {
      setIsLoading(false);
    }
  }, [loadUsers, toast]);

  const createUser = useCallback(async () => {
    const payload = {
      username: String(createDraft.username || '').trim(),
      email: String(createDraft.email || '').trim(),
      telephone: normalizePhone(createDraft.telephone),
      role: String(createDraft.role || '').trim(),
      password: String(createDraft.password || ''),
      ...(createDraft.role === 'demandeur'
        ? {
          ...(createDraft.demandeur_profile && createDraft.demandeur_profile !== 'auto'
            ? { demandeur_profile: String(createDraft.demandeur_profile || 'bureautique') }
            : {}),
          service_direction: String(createDraft.service_direction || '').trim(),
        }
        : {}),
    };
    if (!payload.username || !payload.email || !payload.telephone || !payload.password) {
      toast.warning('Remplis username/email/telephone/mot de passe.');
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
    if (!isValidPhone(payload.telephone)) {
      toast.warning('Téléphone invalide (ex: +21698123456).');
      return;
    }
    if (!isStrongPassword(payload.password)) {
      toast.warning(passwordHint);
      return;
    }
    setIsLoading(true);
    try {
      await post('/users', payload);
      toast.success('Utilisateur créé.');
      setCreateDraft({ username: '', email: '', telephone: '', role: 'demandeur', password: '', demandeur_profile: 'bureautique', service_direction: '' });
      await loadUsers();
    } catch (err) {
      toast.error(err.message || 'Création utilisateur échouée');
    } finally {
      setIsLoading(false);
    }
  }, [createDraft, loadUsers, toast, passwordHint]);

  const updateRole = useCallback(async (u) => {
    const id = u?._id;
    if (!id) return;
    const nextRole = String(roleDraftById[id] || u.role || '').trim();
    const reason = String(reasonById[id] || '').trim();
    if (!nextRole) return;
    if (reason.length < 5) {
      toast.warning('Motif obligatoire (min 5 caractères).');
      return;
    }
    setIsLoading(true);
    try {
      await patch(`/users/${id}/role`, { role: nextRole, reason });
      toast.success('Rôle mis à jour.');
      await loadUsers();
    } catch (err) {
      toast.error(err.message || 'Mise à jour rôle échouée');
    } finally {
      setIsLoading(false);
    }
  }, [loadUsers, reasonById, roleDraftById, toast]);

  const resetPassword = useCallback(async (u) => {
    const id = u?._id;
    if (!id) return;
    const reason = String(reasonById[id] || '').trim();
    if (reason.length < 5) {
      toast.warning('Motif obligatoire (min 5 caractères).');
      return;
    }
    setIsLoading(true);
    try {
      const res = await post(`/users/${id}/reset-password`, { reason });
      const newPwd = String(res?.new_password || '').trim();
      if (newPwd) {
        setNewPasswordById((p) => ({ ...p, [id]: newPwd }));
        toast.success('Mot de passe réinitialisé (copie-le).');
      } else {
        toast.success('Mot de passe réinitialisé.');
      }
      await loadUsers();
    } catch (err) {
      toast.error(err.message || 'Reset mot de passe échoué');
    } finally {
      setIsLoading(false);
    }
  }, [loadUsers, reasonById, toast]);

  const saveDemandeurProfile = useCallback(async (u) => {
    const id = u?._id;
    if (!id) return;
    const draft = String(demandeurProfileDraftById[id] || '').trim().toLowerCase();
    if (!['bureautique', 'menage', 'petrole'].includes(draft)) {
      toast.warning('Profil catalogue invalide.');
      return;
    }
    setIsLoading(true);
    try {
      await patch(`/users/${id}/demandeur-profile`, { demandeur_profile: draft });
      toast.success('Profil catalogue mis à jour.');
      await loadUsers();
    } catch (err) {
      toast.error(err.message || 'Erreur mise à jour profil');
    } finally {
      setIsLoading(false);
    }
  }, [demandeurProfileDraftById, loadUsers, toast]);

  const saveServiceDirection = useCallback(async (u) => {
    const id = u?._id;
    if (!id) return;
    const draft = String(serviceDraftById[id] || '').trim();
    if (draft && draft.length < 2) {
      toast.warning('Service/Direction invalide (min 2 caractÃ¨res).');
      return;
    }
    setIsLoading(true);
    try {
      const res = await patch(`/users/${id}/service-direction`, { service_direction: draft });
      if (res?.user?.demandeur_profile) {
        setDemandeurProfileDraftById((p) => ({ ...p, [id]: res.user.demandeur_profile }));
      }
      toast.success('Service/Direction mis Ã  jour.');
      await loadUsers();
    } catch (err) {
      toast.error(err.message || 'Erreur mise Ã  jour service');
    } finally {
      setIsLoading(false);
    }
  }, [serviceDraftById, loadUsers, toast]);

  const copyPassword = useCallback(async (userId) => {
    const pwd = String(newPasswordById[userId] || '').trim();
    if (!pwd) return;
    try {
      await navigator.clipboard.writeText(pwd);
      toast.success('Mot de passe copié.');
    } catch {
      toast.warning('Impossible de copier automatiquement.');
    }
  }, [newPasswordById, toast]);

  const stats = useMemo(() => {
    const total = items.length;
    const online = items.filter((u) => (u.activeSessionsCount || 0) > 0).length;
    const blocked = items.filter((u) => u.status === 'blocked').length;
    return { total, online, blocked };
  }, [items]);

  return (
    <div className="admin-layout">
      <SidebarAdmin
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((p) => !p)}
        onLogout={onLogout}
        userName={userName}
      />
      <div className={`admin-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <HeaderPage title="Utilisateurs" subtitle="Gestion des acteurs + sessions" icon={<Users size={24} />} />
        {isLoading && <LoadingSpinner overlay text="Chargement..." />}

        <div className="admin-page">
          <div className="admin-card">
            <div className="admin-card-title"><UserPlus size={18} /> Créer un utilisateur</div>
            <div className="create-grid">
              <label>
                Username
                <input
                  value={createDraft.username}
                  onChange={(e) => setCreateDraft((p) => ({ ...p, username: e.target.value }))}
                  disabled={isLoading}
                  maxLength={60}
                  placeholder="Ex: ahmed.trabelsi"
                  autoComplete="off"
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={createDraft.email}
                  onChange={(e) => setCreateDraft((p) => ({ ...p, email: e.target.value }))}
                  disabled={isLoading}
                  maxLength={120}
                  placeholder="nom.prenom@etap.tn"
                  autoComplete="off"
                />
              </label>
              <label>
                Telephone
                <input
                  inputMode="tel"
                  value={createDraft.telephone}
                  onChange={(e) => setCreateDraft((p) => ({ ...p, telephone: e.target.value }))}
                  disabled={isLoading}
                  maxLength={22}
                  placeholder="Ex: +21698123456"
                  autoComplete="off"
                />
              </label>
              <label>
                Rôle
                <select value={createDraft.role} onChange={(e) => setCreateDraft((p) => ({ ...p, role: e.target.value }))} disabled={isLoading}>
                  {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </label>
              {createDraft.role === 'demandeur' && (
                <label>
                  Profil catalogue
                  <select value={createDraft.demandeur_profile} onChange={(e) => setCreateDraft((p) => ({ ...p, demandeur_profile: e.target.value }))} disabled={isLoading}>
                    {CATALOG_PROFILES_CREATE.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                  <div className="helper-text">Choisis “Auto” pour mapper le profil depuis le service/direction.</div>
                </label>
              )}
              {createDraft.role === 'demandeur' && (
                <label>
                  Service / Direction
                  <input
                    value={createDraft.service_direction}
                    onChange={(e) => setCreateDraft((p) => ({ ...p, service_direction: e.target.value }))}
                    disabled={isLoading}
                    maxLength={80}
                    placeholder="Ex: RH, Finance, HSE, Entretien, Site"
                    autoComplete="off"
                  />
                  <div className="helper-text">Le service auto-map le profil catalogue si aucun profil n’est choisi.</div>
                </label>
              )}
              <label>
                Mot de passe
                <input
                  type="password"
                  value={createDraft.password}
                  onChange={(e) => setCreateDraft((p) => ({ ...p, password: e.target.value }))}
                  disabled={isLoading}
                  maxLength={64}
                  placeholder="Mot de passe temporaire"
                  autoComplete="new-password"
                />
                <div className={`pwd-hint ${createDraft.password ? (isStrongPassword(createDraft.password) ? 'ok' : 'bad') : ''}`}>
                  {passwordHint}
                </div>
              </label>
            </div>
            <button className="admin-btn primary" type="button" onClick={createUser} disabled={isLoading}>
              <UserPlus size={16} />
              <span>Créer</span>
            </button>
          </div>
          <div className="users-toolbar">
            <div className="filters">
              <label>
                Rôle
                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} disabled={isLoading}>
                  {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </label>
              <label>
                Statut
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} disabled={isLoading}>
                  <option value="active">Active</option>
                  <option value="blocked">Blocked</option>
                </select>
              </label>
            </div>
            <button className="admin-btn" type="button" onClick={loadUsers} disabled={isLoading}>
              <RefreshCw size={16} />
              <span>Actualiser</span>
            </button>
          </div>

          <div className="users-stats">
            <div className="chip"><span>Total</span><strong>{stats.total}</strong></div>
            <div className="chip"><span>En ligne</span><strong>{stats.online}</strong></div>
            <div className="chip"><span>Bloqués</span><strong>{stats.blocked}</strong></div>
          </div>

          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  <th>Email</th>
                  <th>Rôle</th>
                  <th>Profil catalogue</th>
                  <th>Service / Direction</th>
                  <th>Statut</th>
                  <th>Sessions</th>
                  <th>Motif</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u._id}>
                    <td>
                      <div className="user-cell">
                        <ProtectedImage
                          filePath={u.image_profile || ''}
                          alt={u.username}
                          className="user-avatar"
                          fallbackText=""
                        />
                        <div className="user-name">
                          <strong>{u.username}</strong>
                          <span className="user-sub">{u.telephone || '-'}</span>
                        </div>
                      </div>
                    </td>
                    <td>{u.email}</td>
                    <td><span className="role-pill"><Shield size={14} /> {u.role}</span></td>
                    <td>
                      {u.role === 'demandeur' ? (
                        <div className="profile-edit">
                          <select
                            value={demandeurProfileDraftById[u._id] || u.demandeur_profile || 'bureautique'}
                            onChange={(e) => setDemandeurProfileDraftById((p) => ({ ...p, [u._id]: e.target.value }))}
                            disabled={isLoading}
                          >
                            {CATALOG_PROFILES.map((p) => (
                              <option key={p.id} value={p.id}>{p.label}</option>
                            ))}
                          </select>
                          <button className="icon-btn" type="button" onClick={() => saveDemandeurProfile(u)} title="Enregistrer profil" disabled={isLoading}>
                            <RotateCcw size={16} />
                          </button>
                        </div>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                    <td>
                      {u.role === 'demandeur' ? (
                        <div className="service-edit">
                          <input
                            value={serviceDraftById[u._id] || ''}
                            onChange={(e) => setServiceDraftById((p) => ({ ...p, [u._id]: e.target.value }))}
                            placeholder="RH, Finance, HSE..."
                            disabled={isLoading}
                            maxLength={80}
                          />
                          <button className="icon-btn" type="button" onClick={() => saveServiceDirection(u)} title="Enregistrer service" disabled={isLoading}>
                            <RotateCcw size={16} />
                          </button>
                        </div>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                    <td>
                      <span className={`status-pill ${u.status === 'active' ? 'ok' : 'bad'}`}>
                        {u.status === 'active' ? <CheckCircle2 size={14} /> : <Ban size={14} />}
                        {u.status}
                      </span>
                    </td>
                    <td>{u.activeSessionsCount || 0}</td>
                    <td>
                      <input
                        value={reasonById[u._id] || ''}
                        onChange={(e) => setReasonById((p) => ({ ...p, [u._id]: e.target.value }))}
                        placeholder="Motif (min 5)"
                        disabled={isLoading}
                      />
                      {newPasswordById[u._id] ? (
                        <div className="pwd-row">
                          <code className="pwd-code">{newPasswordById[u._id]}</code>
                          <button className="icon-btn" type="button" onClick={() => copyPassword(u._id)} title="Copier" disabled={isLoading}>
                            <Copy size={16} />
                          </button>
                        </div>
                      ) : null}
                    </td>
                    <td className="actions">
                      <button className="admin-btn small" type="button" onClick={() => toggleStatus(u)} disabled={isLoading}>
                        {u.status === 'active' ? <Ban size={16} /> : <CheckCircle2 size={16} />}
                        <span>{u.status === 'active' ? 'Bloquer' : 'Activer'}</span>
                      </button>
                      <div className="role-edit">
                        <select
                          value={roleDraftById[u._id] || u.role}
                          onChange={(e) => setRoleDraftById((p) => ({ ...p, [u._id]: e.target.value }))}
                          disabled={isLoading}
                        >
                          {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                        </select>
                        <button className="icon-btn" type="button" onClick={() => updateRole(u)} title="Appliquer rôle" disabled={isLoading}>
                          <RotateCcw size={16} />
                        </button>
                      </div>
                      <button className="admin-btn small" type="button" onClick={() => resetPassword(u)} disabled={isLoading}>
                        <RotateCcw size={16} />
                        <span>Reset MDP</span>
                      </button>
                      <button className="admin-btn small" type="button" onClick={() => revokeSessions(u)} disabled={isLoading}>
                        <KeyRound size={16} />
                        <span>Révoquer</span>
                      </button>
                    </td>
                  </tr>
                ))}
                {!items.length && (
                  <tr>
                    <td colSpan={9} className="empty">Aucun utilisateur.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminUsers;
