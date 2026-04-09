import { useCallback, useEffect, useMemo, useState } from 'react';
import { Monitor, Ban, RefreshCw } from 'lucide-react';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { get, post } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import './AdminSessions.css';

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

const AdminSessions = ({ userName, onLogout }) => {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await get('/admin/sessions?limit=80');
      setItems(Array.isArray(res?.items) ? res.items : []);
    } catch (err) {
      toast.error(err.message || 'Chargement sessions échoué');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = useCallback(async (sessionId) => {
    try {
      await post(`/admin/sessions/${encodeURIComponent(sessionId)}/revoke`, { reason: 'admin_revoke' });
      toast.success('Session révoquée.');
      await load();
    } catch (err) {
      toast.error(err.message || 'Révocation échouée');
    }
  }, [load, toast]);

  const rows = useMemo(() => (items || []).map((s) => ({
    id: s?._id,
    user: s?.user?.username || '-',
    email: s?.user?.email || '-',
    role: s?.user?.role || '-',
    ip: s?.ip_address || '-',
    last: s?.last_activity_at || s?.updatedAt || null,
    login: s?.login_time || null,
    expires: s?.expires_at || null,
    ua: s?.user_agent || '',
  })), [items]);

  return (
    <div className="admin-layout">
      <SidebarAdmin
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((p) => !p)}
        onLogout={onLogout}
        userName={userName}
      />
      <div className={`admin-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <HeaderPage title="Sessions" subtitle="Surveillance & révocation" icon={<Monitor size={24} />} />
        {loading && <LoadingSpinner overlay text="Chargement..." />}
        <div className="admin-page">
          <div className="admin-toolbar">
            <button className="admin-btn" type="button" onClick={load} disabled={loading}>
              <RefreshCw size={16} />
              <span>Actualiser</span>
            </button>
          </div>

          <div className="admin-card">
            <div className="admin-card-title"><Monitor size={18} /> Sessions actives</div>
            <div className="admin-note">
              Révoquer une session force l’utilisateur à se reconnecter (à la prochaine requête).
            </div>
            <div className="admin-sessions-table">
              <table>
                <thead>
                  <tr>
                    <th>Utilisateur</th>
                    <th>Rôle</th>
                    <th>IP</th>
                    <th>Dernière activité</th>
                    <th>Expiration</th>
                    <th>User-Agent</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="cell-main">{r.user}</div>
                        <div className="cell-sub">{r.email}</div>
                      </td>
                      <td className="muted">{r.role}</td>
                      <td className="muted">{r.ip}</td>
                      <td className="muted">{formatDateTime(r.last)}</td>
                      <td className="muted">{formatDateTime(r.expires)}</td>
                      <td className="muted" title={safeText(r.ua) || ''}>{shortUa(r.ua)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="admin-btn danger" type="button" onClick={() => revoke(r.id)} disabled={loading}>
                          <Ban size={16} />
                          <span>Révoquer</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td colSpan={7} className="empty">Aucune session active.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminSessions;

