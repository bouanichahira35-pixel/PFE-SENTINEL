import { useCallback, useEffect, useMemo, useState } from 'react';
import { Monitor, Ban, RefreshCw, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { get, post } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import { getUiErrorMessage } from '../../services/uiError';
import './AdminDashboard.css';
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
  const [searchParams] = useSearchParams();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [revokeDialog, setRevokeDialog] = useState({ open: false, session: null });
  const [revokeReason, setRevokeReason] = useState('');

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

  useEffect(() => {
    load();
  }, [load]);

  const openRevokeDialog = useCallback((session) => {
    setRevokeDialog({ open: true, session });
    setRevokeReason('');
  }, []);

  const closeRevokeDialog = useCallback(() => {
    if (loading) return;
    setRevokeDialog({ open: false, session: null });
    setRevokeReason('');
  }, [loading]);

  const confirmRevoke = useCallback(async () => {
    const sessionId = revokeDialog.session?.id;
    const reason = safeText(revokeReason);

    if (!sessionId) return;
    if (reason.length < 5) {
      toast.warning('Le motif de révocation est obligatoire (min 5 caractères).');
      return;
    }

    try {
      setLoading(true);
      await post(`/admin/sessions/${encodeURIComponent(sessionId)}/revoke`, { reason });
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

  const rows = useMemo(() => {
    const userFilterId = safeText(searchParams.get('user') || '');
    const filtered = userFilterId
      ? (items || []).filter((s) => String(s?.user?._id || '') === userFilterId)
      : (items || []);

    return filtered.map((s) => ({
      id: s?._id,
      user: s?.user?.username || '-',
      email: s?.user?.email || '-',
      role: s?.user?.role || '-',
      ip: s?.ip_address || '-',
      last: s?.last_activity_at || s?.updatedAt || null,
      login: s?.login_time || null,
      expires: s?.expires_at || null,
      ua: s?.user_agent || '',
    }));
  }, [items, searchParams]);

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
                        <button className="admin-btn danger" type="button" onClick={() => openRevokeDialog(r)} disabled={loading}>
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

          {revokeDialog.open ? (
            <div className="admin-session-modal-backdrop" role="dialog" aria-modal="true" onClick={closeRevokeDialog}>
              <div className="admin-session-modal" onClick={(e) => e.stopPropagation()}>
                <div className="admin-session-modal-head">
                  <div>
                    <strong>Révoquer la session</strong>
                    <span>{revokeDialog.session?.user || 'Utilisateur'} - {revokeDialog.session?.role || 'role'}</span>
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

                <div className="admin-session-modal-body">
                  <p>Veuillez saisir le motif de révocation. Ce motif sera conservé dans l’audit de sécurité.</p>
                  <label className="admin-session-reason-label">
                    Motif de révocation *
                    <textarea
                      value={revokeReason}
                      onChange={(e) => setRevokeReason(e.target.value)}
                      placeholder="Exemple : appareil perdu, activité suspecte, demande utilisateur..."
                      rows={4}
                      maxLength={140}
                      disabled={loading}
                      autoFocus
                    />
                  </label>
                  <div className="admin-session-reason-count">{safeText(revokeReason).length}/140</div>
                </div>

                <div className="admin-session-modal-actions">
                  <button className="admin-btn" type="button" onClick={closeRevokeDialog} disabled={loading}>Annuler</button>
                  <button className="admin-btn danger" type="button" onClick={confirmRevoke} disabled={loading || safeText(revokeReason).length < 5}>
                    <Ban size={16} />
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
};

export default AdminSessions;
