import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, RefreshCw, Search } from 'lucide-react';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { get } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import { getUiErrorMessage } from '../../services/uiError';
import './AdminDashboard.css';
import './AdminAudit.css';

function safeStr(value) {
  return String(value || '').trim();
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR');
}

function describeAction(item) {
  const type = safeStr(item?.action_type);
  const tags = Array.isArray(item?.tags) ? item.tags : [];
  if (type === 'user_create') return 'Création utilisateur';
  if (type === 'block') return 'Blocage / Déblocage';
  if (type === 'user_update') {
    if (tags.includes('role_change')) return 'Changement de rôle';
    if (tags.includes('password_reset')) return 'Réinitialisation mot de passe';
    if (tags.includes('service_direction')) return 'Mise à jour service/direction';
    if (tags.includes('demandeur_profile')) return 'Mise à jour profil catalogue';
    return 'Mise à jour utilisateur';
  }
  return type || '—';
}

export default function AdminAudit({ userName, onLogout }) {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('user');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await get('/history?limit=200&page=1');
      const rows = Array.isArray(res?.items) ? res.items : [];
      setItems(rows);
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Erreur chargement historique'));
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = safeStr(q).toLowerCase();
    return (items || []).filter((x) => {
      const t = safeStr(x?.action_type);
      if (typeFilter === 'user' && !['user_create', 'user_update', 'block'].includes(t)) return false;
      if (typeFilter && typeFilter !== 'user' && t !== typeFilter) return false;

      if (!needle) return true;
      const ctx = x?.context && typeof x.context === 'object' ? x.context : {};
      const parts = [
        x?.description,
        x?.action_type,
        describeAction(x),
        x?.actor_role,
        x?.user?.username,
        x?.user?.email,
        ctx?.target_username,
        ctx?.target_email,
        ctx?.reason,
      ]
        .map((p) => safeStr(p).toLowerCase())
        .filter(Boolean);
      return parts.some((p) => p.includes(needle));
    });
  }, [items, q, typeFilter]);

  const rows = useMemo(() => filtered.map((x) => {
    const ctx = x?.context && typeof x.context === 'object' ? x.context : {};
    const actor = x?.user?.username || x?.user?.email || x?.actor_role || '—';
    const target = ctx?.target_username || ctx?.target_email || ctx?.target_user_id || '—';
    const reason = safeStr(ctx?.reason) || '—';
    return {
      id: String(x?._id || ''),
      date: x?.date_action || x?.createdAt || null,
      action: describeAction(x),
      target,
      actor,
      details: safeStr(x?.description) || '—',
      reason,
    };
  }), [filtered]);

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
          title="Historique / Audit"
          subtitle="Traçabilité des actions sensibles (Sprint 1)"
          icon={<FileText size={24} />}
        />
        {isLoading && <LoadingSpinner overlay text="Chargement..." />}

        <div className="admin-page">
          <div className="admin-audit-toolbar">
            <div className="admin-audit-search">
              <Search size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (acteur, cible, motif, action...)" />
            </div>

            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} disabled={isLoading}>
              <option value="user">Utilisateur (Sprint 1)</option>
              <option value="user_create">Créations</option>
              <option value="user_update">Modifications</option>
              <option value="block">Blocages / Déblocages</option>
            </select>

            <button className="admin-btn" type="button" onClick={load} disabled={isLoading}>
              <RefreshCw size={16} />
              <span>Actualiser</span>
            </button>
          </div>

          <div className="admin-audit-table">
            <div className="admin-audit-head">
              <div>Date</div>
              <div>Action</div>
              <div>Cible</div>
              <div>Acteur</div>
              <div>Détails</div>
              <div>Motif</div>
            </div>
            {rows.map((r) => (
              <div key={r.id} className="admin-audit-row">
                <div className="mono">{formatDateTime(r.date)}</div>
                <div className="strong">{r.action}</div>
                <div>{r.target}</div>
                <div>{r.actor}</div>
                <div className="details" title={r.details}>{r.details}</div>
                <div className="details" title={r.reason}>{r.reason}</div>
              </div>
            ))}
            {!rows.length ? <div className="admin-audit-empty">Aucune entrée.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
