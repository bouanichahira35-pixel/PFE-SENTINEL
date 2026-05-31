import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, RefreshCw, Save, Search } from 'lucide-react';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { get, patch } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import { getUiErrorMessage } from '../../services/uiError';
import './AdminDashboard.css';
import './AdminRbac.css';

const ROLE_LABELS = Object.freeze({
  admin: 'Admin',
  responsable: 'Responsable',
  magasinier: 'Magasinier',
  demandeur: 'Demandeur',
});

const AREA_LABELS = Object.freeze({
  admin_it: 'Admin / IT',
  utilisateurs: 'Utilisateurs',
  audit: 'Audit',
  produits: 'Produits',
  catalogue: 'Catalogue',
  stock: 'Stock',
  demandes: 'Demandes',
  fournisseurs: 'Fournisseurs',
  fichiers: 'Fichiers',
  inventaire: 'Inventaire',
  autre: 'Autres',
});

function safeText(value) {
  return String(value || '').trim();
}

function normalizeQuery(value) {
  return safeText(value).toLowerCase();
}

function initialsFromUser(user) {
  const username = safeText(user?.username);
  if (username) {
    const parts = username.split(/[\s._-]+/).filter(Boolean);
    const initials = parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
    if (initials) return initials.slice(0, 2);
  }
  const email = safeText(user?.email);
  return email ? email.slice(0, 2).toUpperCase() : 'U';
}

function groupPermissions(permissions, permissionMeta) {
  const groups = new Map();
  for (const id of permissions || []) {
    const meta = permissionMeta?.[id] || {};
    const area = safeText(meta.area) || 'autre';
    const label = safeText(meta.label) || id;
    if (!groups.has(area)) groups.set(area, []);
    groups.get(area).push({ id, label, area });
  }
  for (const [area, list] of groups.entries()) {
    list.sort((a, b) => a.label.localeCompare(b.label));
    groups.set(area, list);
  }
  return Array.from(groups.entries())
    .map(([area, list]) => ({ area, areaLabel: AREA_LABELS[area] || area, items: list }))
    .sort((a, b) => a.areaLabel.localeCompare(b.areaLabel));
}

function arraysEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

const AdminRbac = ({ userName, onLogout }) => {
  const toastApi = useToast();
  const [toastRef] = useState(() => ({ current: toastApi }));
  useEffect(() => {
    toastRef.current = toastApi;
  }, [toastApi, toastRef]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));

  const [roles, setRoles] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState(null);

  const [availableByRole, setAvailableByRole] = useState({});
  const [availableLoading, setAvailableLoading] = useState(false);

  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [permOriginal, setPermOriginal] = useState(null);
  const [permChecked, setPermChecked] = useState(null);

  const [confirmLeave, setConfirmLeave] = useState({ open: false, nextRoleId: null, nextUserId: null });

  const isDirty = useMemo(() => {
    if (!Array.isArray(permOriginal) || !Array.isArray(permChecked)) return false;
    return !arraysEqual(permOriginal, permChecked);
  }, [permChecked, permOriginal]);

  const loadRoles = useCallback(async () => {
    setRolesLoading(true);
    try {
      try {
        const res = await get('/admin/rbac/roles');
        const list = Array.isArray(res?.roles) ? res.roles : [];
        setRoles(list);
      } catch (err) {
        if (Number(err?.status || 0) === 404) {
          const legacy = await get('/admin/rbac');
          const mapping = legacy?.policy?.role_permissions && typeof legacy.policy.role_permissions === 'object'
            ? legacy.policy.role_permissions
            : {};
          const roleIds = Object.keys(mapping).sort();
          setRoles(roleIds.map((id) => ({ id, label: ROLE_LABELS[id] || id, users_count: 0 })));
        } else {
          throw err;
        }
      }
    } catch (err) {
      toastRef.current.error(getUiErrorMessage(err, 'Chargement rôles échoué'));
    } finally {
      setRolesLoading(false);
    }
  }, [toastRef]);

  const loadUsersForRole = useCallback(async (roleId) => {
    if (!roleId) {
      setUsers([]);
      return;
    }
    setUsersLoading(true);
    try {
      const res = await get(`/users?role=${encodeURIComponent(roleId)}`);
      const list = Array.isArray(res?.users) ? res.users : [];
      setUsers(list);
    } catch (err) {
      toastRef.current.error(getUiErrorMessage(err, 'Chargement utilisateurs échoué'));
    } finally {
      setUsersLoading(false);
    }
  }, [toastRef]);

  const ensureAvailableForRole = useCallback(async (roleId) => {
    if (!roleId) return null;
    if (availableByRole?.[roleId]) return availableByRole[roleId];
    setAvailableLoading(true);
    try {
      try {
        const res = await get(`/admin/rbac/roles/${encodeURIComponent(roleId)}/available-permissions`);
        const item = {
          permissions: Array.isArray(res?.permissions) ? res.permissions : [],
          permission_meta: res?.permission_meta && typeof res.permission_meta === 'object' ? res.permission_meta : {},
        };
        setAvailableByRole((prev) => ({ ...(prev || {}), [roleId]: item }));
        return item;
      } catch (err) {
        if (Number(err?.status || 0) === 404) {
          const legacy = await get('/admin/rbac');
          const mapping = legacy?.policy?.role_permissions && typeof legacy.policy.role_permissions === 'object'
            ? legacy.policy.role_permissions
            : {};
          const list = Array.isArray(mapping?.[roleId]) ? mapping[roleId] : [];
          const item = {
            permissions: list.slice().sort(),
            permission_meta: legacy?.permission_meta && typeof legacy.permission_meta === 'object' ? legacy.permission_meta : {},
          };
          setAvailableByRole((prev) => ({ ...(prev || {}), [roleId]: item }));
          return item;
        }
        throw err;
      }
    } catch (err) {
      toastRef.current.error(getUiErrorMessage(err, 'Chargement permissions (rôle) échoué'));
      return null;
    } finally {
      setAvailableLoading(false);
    }
  }, [availableByRole, toastRef]);

  const loadUserPermissions = useCallback(async (userId) => {
    if (!userId) {
      setPermOriginal(null);
      setPermChecked(null);
      return;
    }
    setPermLoading(true);
    try {
      try {
        const res = await get(`/users/${encodeURIComponent(userId)}/permissions`);
        const perms = Array.isArray(res?.permissions) ? res.permissions.slice().sort() : [];
        setPermOriginal(perms);
        setPermChecked(perms);
      } catch (err) {
        if (Number(err?.status || 0) === 404) {
          const roleId = selectedRoleId;
          const roleAvailable = roleId ? (availableByRole?.[roleId]?.permissions || null) : null;
          const perms = Array.isArray(roleAvailable) ? roleAvailable.slice().sort() : [];
          setPermOriginal(perms);
          setPermChecked(perms);
          return;
        }
        throw err;
      }
    } catch (err) {
      toastRef.current.error(getUiErrorMessage(err, 'Chargement permissions (utilisateur) échoué'));
      setPermOriginal(null);
      setPermChecked(null);
    } finally {
      setPermLoading(false);
    }
  }, [availableByRole, selectedRoleId, toastRef]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const filteredUsers = useMemo(() => {
    const q = normalizeQuery(userQuery);
    const list = Array.isArray(users) ? users : [];
    if (!q) return list;
    return list.filter((u) => {
      const hay = `${safeText(u?.username)} ${safeText(u?.email)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [userQuery, users]);

  const available = useMemo(() => (selectedRoleId ? availableByRole?.[selectedRoleId] : null), [availableByRole, selectedRoleId]);
  const sections = useMemo(() => groupPermissions(available?.permissions || [], available?.permission_meta || {}), [available?.permission_meta, available?.permissions]);

  const requestRoleSelect = useCallback((roleId) => {
    if (isDirty) {
      setConfirmLeave({ open: true, nextRoleId: roleId, nextUserId: null });
      return;
    }
    setSelectedRoleId(roleId);
    setSelectedUserId(null);
    loadUsersForRole(roleId);
    ensureAvailableForRole(roleId);
  }, [ensureAvailableForRole, isDirty, loadUsersForRole]);

  const requestUserSelect = useCallback((userId) => {
    if (!selectedRoleId) return;
    if (isDirty) {
      setConfirmLeave({ open: true, nextRoleId: selectedRoleId, nextUserId: userId });
      return;
    }
    setSelectedUserId(userId);
    ensureAvailableForRole(selectedRoleId).then(() => loadUserPermissions(userId));
  }, [ensureAvailableForRole, isDirty, loadUserPermissions, selectedRoleId]);

  const closeConfirm = useCallback(() => setConfirmLeave({ open: false, nextRoleId: null, nextUserId: null }), []);

  const confirmDiscard = useCallback(() => {
    const nextRoleId = confirmLeave.nextRoleId;
    const nextUserId = confirmLeave.nextUserId;
    closeConfirm();

    if (nextRoleId && nextRoleId !== selectedRoleId) {
      setSelectedRoleId(nextRoleId);
      setSelectedUserId(nextUserId || null);
      setPermOriginal(null);
      setPermChecked(null);
      loadUsersForRole(nextRoleId);
      ensureAvailableForRole(nextRoleId).then(() => {
        if (nextUserId) loadUserPermissions(nextUserId);
      });
      return;
    }

    if (nextUserId) {
      setSelectedUserId(nextUserId);
      setPermOriginal(null);
      setPermChecked(null);
      ensureAvailableForRole(selectedRoleId).then(() => loadUserPermissions(nextUserId));
    }
  }, [closeConfirm, confirmLeave.nextRoleId, confirmLeave.nextUserId, ensureAvailableForRole, loadUserPermissions, loadUsersForRole, selectedRoleId]);

  const togglePermission = useCallback((permId) => {
    setPermChecked((prev) => {
      const list = Array.isArray(prev) ? prev.slice() : [];
      const has = list.includes(permId);
      const next = has ? list.filter((x) => x !== permId) : [...list, permId];
      next.sort();
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    if (!selectedUserId || !Array.isArray(permChecked)) return;
    setPermSaving(true);
    try {
      await patch(`/users/${encodeURIComponent(selectedUserId)}/permissions`, { permissions: permChecked });
      toastRef.current.success('Permissions enregistrées.');
      setPermOriginal(permChecked.slice().sort());
    } catch (err) {
      toastRef.current.error(getUiErrorMessage(err, 'Enregistrement permissions échoué'));
    } finally {
      setPermSaving(false);
    }
  }, [permChecked, selectedUserId, toastRef]);

  const refresh = useCallback(async () => {
    await loadRoles();
    if (selectedRoleId) {
      await loadUsersForRole(selectedRoleId);
      await ensureAvailableForRole(selectedRoleId);
    }
    if (selectedUserId) {
      await loadUserPermissions(selectedUserId);
    }
  }, [ensureAvailableForRole, loadRoles, loadUserPermissions, loadUsersForRole, selectedRoleId, selectedUserId]);

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
          title="Rôles & permissions"
          subtitle="Ajuster les permissions par utilisateur (sous-ensemble du rôle)"
          icon={<KeyRound size={24} />}
        />
        {(rolesLoading || usersLoading || availableLoading || permLoading || permSaving) && (
          <LoadingSpinner
            overlay
            text={permSaving ? 'Enregistrement...' : 'Chargement...'}
          />
        )}
        <div className="admin-page">
          {/* Toolbar : Actualiser uniquement — bouton Enregistrer retiré du haut */}
          <div className="admin-toolbar">
            <button
              className="admin-btn"
              type="button"
              onClick={refresh}
              disabled={rolesLoading || usersLoading || permLoading || permSaving}
            >
              <RefreshCw size={16} />
              <span>Actualiser</span>
            </button>
          </div>

          <div className="rp-grid" aria-label="Rôles & permissions">
            {/* Colonne Rôles */}
            <div className="rp-panel" aria-label="Rôles">
              <div className="rp-panel-header">Rôles</div>
              <div className="rp-list">
                {roles.map((r) => {
                  const id = safeText(r?.id);
                  const label = safeText(r?.label) || ROLE_LABELS[id] || id;
                  const count = Number(r?.users_count || 0);
                  const active = id && id === selectedRoleId;
                  return (
                    <button
                      key={id || label}
                      type="button"
                      className={`rp-item ${active ? 'active' : ''}`}
                      onClick={() => requestRoleSelect(id)}
                      disabled={!id || rolesLoading || permSaving}
                    >
                      <span className="rp-item-main">{label}</span>
                      <span className="rp-badge" aria-label={`${count} utilisateurs`}>{count}</span>
                    </button>
                  );
                })}
                {!roles.length && (
                  <div className="rp-empty">Aucun rôle.</div>
                )}
              </div>
            </div>

            {/* Colonne Utilisateurs */}
            <div className="rp-panel" aria-label="Utilisateurs">
              <div className="rp-panel-header">Utilisateurs</div>
              {!selectedRoleId ? (
                <div className="rp-empty">Sélectionnez un rôle.</div>
              ) : (
                <>
                  <div className="rp-search">
                    <Search size={16} />
                    <input
                      value={userQuery}
                      onChange={(e) => setUserQuery(e.target.value)}
                      placeholder="Rechercher (nom, email)"
                      disabled={usersLoading || permSaving}
                    />
                  </div>
                  <div className="rp-list">
                    {filteredUsers.map((u) => {
                      const id = String(u?._id || u?.id || '');
                      const active = id && id === selectedUserId;
                      return (
                        <button
                          key={id}
                          type="button"
                          className={`rp-user ${active ? 'active' : ''}`}
                          onClick={() => requestUserSelect(id)}
                          disabled={!id || usersLoading || permSaving}
                        >
                          <span className="rp-avatar" aria-hidden="true">{initialsFromUser(u)}</span>
                          <span className="rp-user-body">
                            <span className="rp-user-name">{safeText(u?.username) || '-'}</span>
                            <span className="rp-user-email">{safeText(u?.email) || '-'}</span>
                          </span>
                        </button>
                      );
                    })}
                    {!filteredUsers.length && (
                      <div className="rp-empty">Aucun utilisateur.</div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Colonne Permissions */}
            <div className="rp-panel rp-panel-wide" aria-label="Permissions">
              <div className="rp-panel-header">
                <span>Permissions{isDirty ? ' *' : ''}</span>
              </div>
              {!selectedRoleId ? (
                <div className="rp-empty">Sélectionnez un rôle.</div>
              ) : !selectedUserId ? (
                <div className="rp-empty">Sélectionnez un utilisateur.</div>
              ) : (
                <>
                  <div className="rp-perm-header">
                    <div className="rp-note">
                      Permissions pour le rôle <strong>{ROLE_LABELS[selectedRoleId] || selectedRoleId}</strong>
                    </div>
                    <button
                      className="admin-btn primary"
                      type="button"
                      onClick={save}
                      disabled={!isDirty || permLoading || permSaving}
                    >
                      <Save size={16} />
                      <span>Enregistrer</span>
                    </button>
                  </div>

                  <div className="rp-sections">
                    {sections.map((sec) => {
                      const total = sec.items.length;
                      const checkedCount = sec.items.filter((p) => Array.isArray(permChecked) && permChecked.includes(p.id)).length;
                      return (
                        <div className="rp-section" key={sec.area}>
                          <div className="rp-section-title">
                            <span>{sec.areaLabel}</span>
                            <span className="rp-chip">{checkedCount}/{total}</span>
                          </div>
                          <div className="rp-perms">
                            {sec.items.map((p) => {
                              const checked = Array.isArray(permChecked) && permChecked.includes(p.id);
                              return (
                                <label className="rp-perm" key={p.id}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => togglePermission(p.id)}
                                    disabled={permLoading || permSaving}
                                  />
                                  <span className="rp-perm-text">
                                    {/* Libellé uniquement — code technique retiré */}
                                    <span className="rp-perm-label">{p.label}</span>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {!sections.length && (
                      <div className="rp-empty">Aucune permission disponible pour ce rôle.</div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirmLeave.open ? (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={closeConfirm}
        >
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <strong>Modifications non enregistrées</strong>
            </div>
            <div className="admin-note" style={{ marginTop: 10 }}>
              Vous avez des changements non sauvegardés. Voulez-vous les abandonner ?
            </div>
            <div className="admin-modal-actions">
              <button className="admin-btn" type="button" onClick={closeConfirm} disabled={permSaving}>
                Annuler
              </button>
              <button className="admin-btn primary" type="button" onClick={confirmDiscard} disabled={permSaving}>
                Abandonner
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AdminRbac;