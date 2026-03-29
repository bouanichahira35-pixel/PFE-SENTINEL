import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, RefreshCw, Ban, CheckCircle2, Shield, KeyRound } from 'lucide-react';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { get, patch, post } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import './AdminUsers.css';

const ROLES = [
  { id: 'admin', label: 'Admin' },
  { id: 'responsable', label: 'Responsable' },
  { id: 'magasinier', label: 'Magasinier' },
  { id: 'demandeur', label: 'Demandeur' },
];

const AdminUsers = ({ userName, onLogout }) => {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [roleFilter, setRoleFilter] = useState('magasinier');
  const [statusFilter, setStatusFilter] = useState('active');
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [reasonById, setReasonById] = useState({});

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await get(`/users?role=${encodeURIComponent(roleFilter)}&status=${encodeURIComponent(statusFilter)}`);
      const users = Array.isArray(res?.users) ? res.users : [];
      setItems(users);
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
                  <th>Statut</th>
                  <th>Sessions</th>
                  <th>Motif</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u._id}>
                    <td><strong>{u.username}</strong></td>
                    <td>{u.email}</td>
                    <td><span className="role-pill"><Shield size={14} /> {u.role}</span></td>
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
                    </td>
                    <td className="actions">
                      <button className="admin-btn small" type="button" onClick={() => toggleStatus(u)} disabled={isLoading}>
                        {u.status === 'active' ? <Ban size={16} /> : <CheckCircle2 size={16} />}
                        <span>{u.status === 'active' ? 'Bloquer' : 'Activer'}</span>
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
                    <td colSpan={7} className="empty">Aucun utilisateur.</td>
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

