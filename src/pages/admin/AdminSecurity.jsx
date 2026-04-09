import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldAlert, RefreshCw, Search } from 'lucide-react';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { get } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import './AdminSecurity.css';

function safeStr(value) {
  return String(value || '').trim();
}

const AdminSecurity = ({ userName, onLogout }) => {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [eventType, setEventType] = useState('');
  const [onlyFailed, setOnlyFailed] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await get('/security-audit');
      setItems(Array.isArray(res) ? res : []);
    } catch (err) {
      toast.error(err.message || 'Erreur chargement audit sécurité');
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const eventTypes = useMemo(() => {
    const set = new Set();
    items.forEach((x) => {
      const t = safeStr(x?.event_type);
      if (t) set.add(t);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filtered = useMemo(() => {
    const needle = safeStr(q).toLowerCase();
    return items.filter((x) => {
      if (onlyFailed && x?.success !== false) return false;
      if (eventType && safeStr(x?.event_type) !== eventType) return false;
      if (!needle) return true;

      const parts = [
        x?.event_type,
        x?.details,
        x?.email,
        x?.role,
        x?.ip_address,
        x?.user_agent,
        x?.user?.username,
        x?.user?.email,
      ]
        .map((p) => safeStr(p).toLowerCase())
        .filter(Boolean);

      return parts.some((p) => p.includes(needle));
    });
  }, [eventType, items, onlyFailed, q]);

  return (
    <div className="admin-layout">
      <SidebarAdmin
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((p) => !p)}
        onLogout={onLogout}
        userName={userName}
      />
      <div className={`admin-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <HeaderPage title="Sécurité" subtitle="Journal technique (audit) — authentification & actions sensibles" icon={<ShieldAlert size={24} />} />
        {isLoading && <LoadingSpinner overlay text="Chargement..." />}

        <div className="admin-page">
          <div className="admin-sec-toolbar">
            <div className="admin-sec-search">
              <Search size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (email, IP, event, details...)" />
            </div>

            <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
              <option value="">Tous les events</option>
              {eventTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <label className="admin-sec-check">
              <input type="checkbox" checked={onlyFailed} onChange={(e) => setOnlyFailed(e.target.checked)} />
              <span>Échecs uniquement</span>
            </label>

            <button className="admin-btn" type="button" onClick={load} disabled={isLoading}>
              <RefreshCw size={16} />
              <span>Actualiser</span>
            </button>
          </div>

          <div className="admin-sec-table">
            <div className="admin-sec-head">
              <div>Date</div>
              <div>Event</div>
              <div>Utilisateur</div>
              <div>IP</div>
              <div>Résultat</div>
              <div>Détails</div>
            </div>
            {filtered.map((x) => {
              const date = x?.date_event || x?.createdAt || '';
              const user = x?.user?.username || x?.email || '-';
              const success = x?.success !== false;
              return (
                <div key={String(x?._id || `${date}_${x?.event_type}_${x?.ip_address}`)} className="admin-sec-row">
                  <div className="mono">{safeStr(date).slice(0, 19).replace('T', ' ')}</div>
                  <div className="mono">{safeStr(x?.event_type) || '-'}</div>
                  <div>{user}</div>
                  <div className="mono">{safeStr(x?.ip_address) || '-'}</div>
                  <div className={success ? 'ok' : 'bad'}>{success ? 'OK' : 'FAILED'}</div>
                  <div className="details">{safeStr(x?.details) || '-'}</div>
                </div>
              );
            })}
            {!filtered.length ? <div className="admin-sec-empty">Aucune entrée.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminSecurity;

