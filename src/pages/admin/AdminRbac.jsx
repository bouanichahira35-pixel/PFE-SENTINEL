// BLOC 1 - Role du fichier.
// Ce fichier affiche une page de l'espace administrateur pour AdminRbac.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

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

  const [policy, setPolicy] = useState(null);
  const [permissionCatalog, setPermissionCatalog] = useState([]);
  const [permissionMeta, setPermissionMeta] = useState({});
  const [adminGuard, setAdminGuard] = useState({});
  const [availableByRole, setAvailableByRole] = useState({});
  const [availableLoading, setAvailableLoading] = useState(false);

  const [roleOriginal, setRoleOriginal] = useState(null);
  const [roleChecked, setRoleChecked] = useState(null);
  const [roleSaving, setRoleSaving] = useState(false);

  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [permOriginal, setPermOriginal] = useState(null);
  const [permChecked, setPermChecked] = useState(null);

  const [confirmLeave, setConfirmLeave] = useState({ open: false, nextRoleId: null, nextUserId: null });

  const isUserDirty = useMemo(() => {
    if (!Array.isArray(permOriginal) || !Array.isArray(permChecked)) return false;
    return !arraysEqual(permOriginal, permChecked);
  }, [permChecked, permOriginal]);

  const isRoleDirty = useMemo(() => {
    if (!Array.isArray(roleOriginal) || !Array.isArray(roleChecked)) return false;
    return !arraysEqual(roleOriginal, roleChecked);
  }, [roleChecked, roleOriginal]);

  const isDirty = isRoleDirty || isUserDirty;

  const applyPolicyPayload = useCallback((payload) => {
    const nextPolicy = payload?.policy && typeof payload.policy === 'object' ? payload.policy : null;
    const meta = payload?.permission_meta && typeof payload.permission_meta === 'object' ? payload.permission_meta : {};
    const permissions = Array.isArray(payload?.permissions) ? payload.permissions.slice().sort() : [];
    const guard = payload?.admin_guard && typeof payload.admin_guard === 'object' ? payload.admin_guard : {};
    setPolicy(nextPolicy);
    setPermissionMeta(meta);
    setPermissionCatalog(permissions);
    setAdminGuard(guard);
    return { policy: nextPolicy, permission_meta: meta, permissions, admin_guard: guard };
  }, []);

  const loadPolicy = useCallback(async () => {
    const res = await get('/admin/rbac');
    return applyPolicyPayload(res);
  }, [applyPolicyPayload]);

  const getRolePermissionsFromPolicy = useCallback((roleId, sourcePolicy = policy) => {
    const list = sourcePolicy?.role_permissions?.[roleId];
    return Array.isArray(list) ? list.slice().sort() : [];
  }, [policy]);

  const getAssignablePermissionsForRole = useCallback((roleId) => {
    if (roleId === 'admin') {
      const guarded = Array.isArray(adminGuard?.technical_only_permissions)
        ? adminGuard.technical_only_permissions
        : [];
      return guarded.slice().sort();
    }
    return permissionCatalog.slice().sort();
  }, [adminGuard, permissionCatalog]);

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
      toastRef.current.error(getUiErrorMessage(err, 'Chargement roles echoue'));
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
      toastRef.current.error(getUiErrorMessage(err, 'Chargement utilisateurs echoue'));
    } finally {
      setUsersLoading(false);
    }
  }, [toastRef]);

  const loadRolePermissions = useCallback(async (roleId) => {
    if (!roleId) {
      setRoleOriginal(null);
      setRoleChecked(null);
      return null;
    }
    setAvailableLoading(true);
    try {
      let current = policy;
      if (!current) {
        const loaded = await loadPolicy();
        current = loaded.policy;
      }
      const perms = getRolePermissionsFromPolicy(roleId, current);
      setRoleOriginal(perms);
      setRoleChecked(perms);
      return perms;
    } catch (err) {
      toastRef.current.error(getUiErrorMessage(err, 'Chargement permissions du role echoue'));
      setRoleOriginal(null);
      setRoleChecked(null);
      return null;
    } finally {
      setAvailableLoading(false);
    }
  }, [getRolePermissionsFromPolicy, loadPolicy, policy, toastRef]);

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
      toastRef.current.error(getUiErrorMessage(err, 'Chargement permissions role echoue'));
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
      toastRef.current.error(getUiErrorMessage(err, 'Chargement permissions utilisateur echoue'));
      setPermOriginal(null);
      setPermChecked(null);
    } finally {
      setPermLoading(false);
    }
  }, [availableByRole, selectedRoleId, toastRef]);

  useEffect(() => {
    loadRoles();
    loadPolicy().catch((err) => {
      toastRef.current.error(getUiErrorMessage(err, 'Chargement politique RBAC echoue'));
    });
  }, [loadPolicy, loadRoles, toastRef]);

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
  const roleAssignablePermissions = useMemo(
    () => (selectedRoleId ? getAssignablePermissionsForRole(selectedRoleId) : []),
    [getAssignablePermissionsForRole, selectedRoleId]
  );
  const roleSections = useMemo(
    () => groupPermissions(roleAssignablePermissions, permissionMeta),
    [permissionMeta, roleAssignablePermissions]
  );
  const userSections = useMemo(() => groupPermissions(available?.permissions || [], available?.permission_meta || {}), [available?.permission_meta, available?.permissions]);

  const requestRoleSelect = useCallback((roleId) => {
    if (isDirty) {
      setConfirmLeave({ open: true, nextRoleId: roleId, nextUserId: null });
      return;
    }
    setSelectedRoleId(roleId);
    setSelectedUserId(null);
    setPermOriginal(null);
    setPermChecked(null);
    loadUsersForRole(roleId);
    ensureAvailableForRole(roleId);
    loadRolePermissions(roleId);
  }, [ensureAvailableForRole, isDirty, loadRolePermissions, loadUsersForRole]);

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
      loadRolePermissions(nextRoleId);
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
  }, [closeConfirm, confirmLeave.nextRoleId, confirmLeave.nextUserId, ensureAvailableForRole, loadRolePermissions, loadUserPermissions, loadUsersForRole, selectedRoleId]);

  const toggleRolePermission = useCallback((permId) => {
    setRoleChecked((prev) => {
      const list = Array.isArray(prev) ? prev.slice() : [];
      const has = list.includes(permId);
      const next = has ? list.filter((x) => x !== permId) : [...list, permId];
      next.sort();
      return next;
    });
  }, []);

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
      toastRef.current.success('Exception utilisateur enregistree.');
      setPermOriginal(permChecked.slice().sort());
    } catch (err) {
      toastRef.current.error(getUiErrorMessage(err, 'Enregistrement permissions utilisateur echoue'));
    } finally {
      setPermSaving(false);
    }
  }, [permChecked, selectedUserId, toastRef]);

  const saveRole = useCallback(async () => {
    if (!selectedRoleId || !Array.isArray(roleChecked) || !policy?.role_permissions) return;
    setRoleSaving(true);
    try {
      const nextRolePermissions = {
        ...(policy.role_permissions || {}),
        [selectedRoleId]: roleChecked.slice().sort(),
      };
      const res = await patch('/admin/rbac', { role_permissions: nextRolePermissions });
      const loaded = applyPolicyPayload({
        ...res,
        permission_meta: permissionMeta,
        permissions: permissionCatalog,
        admin_guard: adminGuard,
      });
      const saved = getRolePermissionsFromPolicy(selectedRoleId, loaded.policy);
      setRoleOriginal(saved);
      setRoleChecked(saved);
      setAvailableByRole((prev) => ({
        ...(prev || {}),
        [selectedRoleId]: {
          permissions: saved,
          permission_meta: permissionMeta,
        },
      }));
      if (selectedUserId) await loadUserPermissions(selectedUserId);
      toastRef.current.success('Permissions du role enregistrees.');
    } catch (err) {
      toastRef.current.error(getUiErrorMessage(err, 'Enregistrement permissions du role echoue'));
    } finally {
      setRoleSaving(false);
    }
  }, [
    adminGuard,
    applyPolicyPayload,
    getRolePermissionsFromPolicy,
    loadUserPermissions,
    permissionCatalog,
    permissionMeta,
    policy,
    roleChecked,
    selectedRoleId,
    selectedUserId,
    toastRef,
  ]);

  const refresh = useCallback(async () => {
    await loadRoles();
    await loadPolicy();
    if (selectedRoleId) {
      await loadUsersForRole(selectedRoleId);
      await loadRolePermissions(selectedRoleId);
      await ensureAvailableForRole(selectedRoleId);
    }
    if (selectedUserId) {
      await loadUserPermissions(selectedUserId);
    }
  }, [ensureAvailableForRole, loadPolicy, loadRolePermissions, loadRoles, loadUserPermissions, loadUsersForRole, selectedRoleId, selectedUserId]);

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
          title="Roles & permissions"
          subtitle="Modifier les droits du role entier, puis les exceptions par utilisateur si necessaire"
          icon={<KeyRound size={24} />}
        />
        {(rolesLoading || usersLoading || availableLoading || permLoading || permSaving || roleSaving) && (
          <LoadingSpinner
            overlay
            text={(permSaving || roleSaving) ? 'Enregistrement...' : 'Chargement...'}
          />
        )}
        <div className="admin-page">
          <div className="admin-toolbar">
            <button
              className="admin-btn"
              type="button"
              onClick={refresh}
              disabled={rolesLoading || usersLoading || availableLoading || permLoading || permSaving || roleSaving}
            >
              <RefreshCw size={16} />
              <span>Actualiser</span>
            </button>
          </div>

          <div className="rp-grid" aria-label="Roles & permissions">
            <div className="rp-panel" aria-label="Roles">
              <div className="rp-panel-header">Roles</div>
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
                      disabled={!id || rolesLoading || roleSaving || permSaving}
                    >
                      <span className="rp-item-main">{label}</span>
                      <span className="rp-badge" aria-label={`${count} utilisateurs`}>{count}</span>
                    </button>
                  );
                })}
                {!roles.length && (
                  <div className="rp-empty">Aucun role.</div>
                )}
              </div>
            </div>

            <div className="rp-panel" aria-label="Utilisateurs">
              <div className="rp-panel-header">Utilisateurs</div>
              {!selectedRoleId ? (
                <div className="rp-empty">Selectionnez un role.</div>
              ) : (
                <>
                  <div className="rp-search">
                    <Search size={16} />
                    <input
                      value={userQuery}
                      onChange={(e) => setUserQuery(e.target.value)}
                      placeholder="Rechercher (nom, email)"
                      disabled={usersLoading || permSaving || roleSaving}
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
                          disabled={!id || usersLoading || permSaving || roleSaving}
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

            <div className="rp-panel rp-panel-wide" aria-label="Permissions">
              <div className="rp-panel-header">
                <span>Permissions{isDirty ? ' *' : ''}</span>
              </div>
              {!selectedRoleId ? (
                <div className="rp-empty">Selectionnez un role.</div>
              ) : (
                <>
                  <div className="rp-perm-header">
                    <div className="rp-note">
                      Permissions appliquees a tout le role <strong>{ROLE_LABELS[selectedRoleId] || selectedRoleId}</strong>
                    </div>
                    <button
                      className="admin-btn primary"
                      type="button"
                      onClick={saveRole}
                      disabled={!isRoleDirty || availableLoading || roleSaving}
                    >
                      <Save size={16} />
                      <span>Enregistrer role</span>
                    </button>
                  </div>

                  <div className="rp-sections">
                    {roleSections.map((sec) => {
                      const total = sec.items.length;
                      const checkedCount = sec.items.filter((p) => Array.isArray(roleChecked) && roleChecked.includes(p.id)).length;
                      return (
                        <div className="rp-section" key={sec.area}>
                          <div className="rp-section-title">
                            <span>{sec.areaLabel}</span>
                            <span className="rp-chip">{checkedCount}/{total}</span>
                          </div>
                          <div className="rp-perms">
                            {sec.items.map((p) => {
                              const checked = Array.isArray(roleChecked) && roleChecked.includes(p.id);
                              return (
                                <label className="rp-perm" key={p.id}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleRolePermission(p.id)}
                                    disabled={availableLoading || roleSaving}
                                  />
                                  <span className="rp-perm-text">
                                    <span className="rp-perm-label">{p.label}</span>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {!roleSections.length && (
                      <div className="rp-empty">Aucune permission disponible pour ce role.</div>
                    )}
                  </div>

                  {selectedUserId ? (
                    <div className="rp-user-override">
                      <div className="rp-perm-header">
                        <div className="rp-note">Exception pour l'utilisateur selectionne</div>
                        <button
                          className="admin-btn primary"
                          type="button"
                          onClick={save}
                          disabled={!isUserDirty || permLoading || permSaving}
                        >
                          <Save size={16} />
                          <span>Enregistrer exception</span>
                        </button>
                      </div>
                      <div className="rp-sections rp-sections-compact">
                        {userSections.map((sec) => {
                          const total = sec.items.length;
                          const checkedCount = sec.items.filter((p) => Array.isArray(permChecked) && permChecked.includes(p.id)).length;
                          return (
                            <div className="rp-section" key={`user-${sec.area}`}>
                              <div className="rp-section-title">
                                <span>{sec.areaLabel}</span>
                                <span className="rp-chip">{checkedCount}/{total}</span>
                              </div>
                              <div className="rp-perms">
                                {sec.items.map((p) => {
                                  const checked = Array.isArray(permChecked) && permChecked.includes(p.id);
                                  return (
                                    <label className="rp-perm" key={`user-${p.id}`}>
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => togglePermission(p.id)}
                                        disabled={permLoading || permSaving}
                                      />
                                      <span className="rp-perm-text">
                                        <span className="rp-perm-label">{p.label}</span>
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                        {!userSections.length && (
                          <div className="rp-empty">Aucune permission utilisateur disponible.</div>
                        )}
                      </div>
                    </div>
                  ) : null}
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
              <strong>Modifications non enregistrees</strong>
            </div>
            <div className="admin-note" style={{ marginTop: 10 }}>
              Vous avez des changements non sauvegardes. Voulez-vous les abandonner ?
            </div>
            <div className="admin-modal-actions">
              <button className="admin-btn" type="button" onClick={closeConfirm} disabled={permSaving || roleSaving}>
                Annuler
              </button>
              <button className="admin-btn primary" type="button" onClick={confirmDiscard} disabled={permSaving || roleSaving}>
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
