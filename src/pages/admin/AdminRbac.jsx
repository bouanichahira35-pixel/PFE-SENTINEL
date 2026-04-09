import { useCallback, useEffect, useMemo, useState } from 'react';
import { Shield, Save, RefreshCw } from 'lucide-react';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { get, patch } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import './AdminRbac.css';

function groupByArea(permissionMeta, permissions) {
  const groups = new Map();
  for (const p of permissions || []) {
    const meta = permissionMeta?.[p] || {};
    const area = String(meta.area || 'autre');
    const label = String(meta.label || p);
    if (!groups.has(area)) groups.set(area, []);
    groups.get(area).push({ id: p, label });
  }
  for (const [k, list] of groups.entries()) {
    list.sort((a, b) => a.label.localeCompare(b.label));
    groups.set(k, list);
  }
  return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

const AdminRbac = ({ userName, onLogout }) => {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [permissions, setPermissions] = useState([]);
  const [permissionMeta, setPermissionMeta] = useState({});
  const [policy, setPolicy] = useState({ role_permissions: {} });
  const [adminGuard, setAdminGuard] = useState({ technical_only_permissions: [] });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await get('/admin/rbac');
      setPermissions(Array.isArray(res?.permissions) ? res.permissions : []);
      setPermissionMeta(res?.permission_meta && typeof res.permission_meta === 'object' ? res.permission_meta : {});
      setPolicy(res?.policy && typeof res.policy === 'object' ? res.policy : { role_permissions: {} });
      setAdminGuard(res?.admin_guard && typeof res.admin_guard === 'object' ? res.admin_guard : { technical_only_permissions: [] });
    } catch (err) {
      toast.error(err.message || 'Chargement RBAC échoué');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => groupByArea(permissionMeta, permissions), [permissionMeta, permissions]);
  const roles = useMemo(() => Object.keys(policy?.role_permissions || {}).sort(), [policy?.role_permissions]);

  const toggle = useCallback((role, permissionId) => {
    setPolicy((prev) => {
      const next = { ...(prev || {}), role_permissions: { ...(prev?.role_permissions || {}) } };
      const list = Array.isArray(next.role_permissions[role]) ? next.role_permissions[role].slice() : [];
      const has = list.includes(permissionId);
      const updated = has ? list.filter((x) => x !== permissionId) : [...list, permissionId];
      next.role_permissions[role] = updated.sort();
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await patch('/admin/rbac', { role_permissions: policy.role_permissions });
      toast.success('RBAC enregistré.');
      await load();
    } catch (err) {
      toast.error(err.message || 'Enregistrement RBAC échoué');
    } finally {
      setSaving(false);
    }
  }, [load, policy?.role_permissions, toast]);

  return (
    <div className="admin-layout">
      <SidebarAdmin
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((p) => !p)}
        onLogout={onLogout}
        userName={userName}
      />
      <div className={`admin-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <HeaderPage title="Rôles & Permissions" subtitle="RBAC (politique en base)" icon={<Shield size={24} />} />
        {(loading || saving) && <LoadingSpinner overlay text={saving ? 'Enregistrement...' : 'Chargement...'} />}
        <div className="admin-page">
          <div className="admin-toolbar">
            <button className="admin-btn" type="button" onClick={load} disabled={loading || saving}>
              <RefreshCw size={16} />
              <span>Actualiser</span>
            </button>
            <button className="admin-btn primary" type="button" onClick={save} disabled={loading || saving}>
              <Save size={16} />
              <span>Enregistrer</span>
            </button>
          </div>

          <div className="admin-card">
            <div className="admin-card-title"><Shield size={18} /> Matrice RBAC</div>
            <div className="admin-note">
              Par politique projet, le rôle <strong>admin</strong> reste <strong>technique uniquement</strong>.
              (Gardes actives: {Array.isArray(adminGuard.technical_only_permissions) ? adminGuard.technical_only_permissions.length : 0} permissions)
            </div>

            {!roles.length && <div className="admin-note">Aucun rôle chargé.</div>}

            {roles.map((role) => (
              <div className="rbac-role" key={role}>
                <div className="rbac-role-header">
                  <div className="rbac-role-name">{role.toUpperCase()}</div>
                  <div className="rbac-role-hint">
                    {role === 'admin' ? 'IT / sécurité / supervision' : 'Métier'}
                  </div>
                </div>

                {grouped.map(([area, perms]) => (
                  <div className="rbac-area" key={`${role}_${area}`}>
                    <div className="rbac-area-title">{area}</div>
                    <div className="rbac-grid">
                      {perms.map((p) => {
                        const checked = Array.isArray(policy?.role_permissions?.[role]) && policy.role_permissions[role].includes(p.id);
                        const disabled = role === 'admin' && Array.isArray(adminGuard.technical_only_permissions)
                          ? !adminGuard.technical_only_permissions.includes(p.id)
                          : false;
                        return (
                          <label className={`rbac-item ${disabled ? 'disabled' : ''}`} key={`${role}_${p.id}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled || loading || saving}
                              onChange={() => toggle(role, p.id)}
                            />
                            <span className="rbac-label">{p.label}</span>
                            <span className="rbac-code">{p.id}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminRbac;

