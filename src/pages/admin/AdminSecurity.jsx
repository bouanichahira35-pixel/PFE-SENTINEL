import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShieldAlert, RefreshCw, Search, Download,
  Monitor, X, TrendingUp, Users, Wifi,
  AlertTriangle, MapPin, Clock,
  CheckCircle, XCircle, Lock, Activity
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { get } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import { getUiErrorMessage } from '../../services/uiError';
import './AdminDashboard.css';
import './AdminSecurity.css';

function safeStr(value) {
  return String(value || '').trim();
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return safeStr(value).slice(0, 19).replace('T', ' ');
  return d.toLocaleString('fr-FR');
}

function isLocalIp(ip) {
  const s = safeStr(ip);
  return s === '::1' || s.startsWith('127.') || s === 'localhost' || s === '::ffff:127.0.0.1';
}

function getEventStyle(eventType) {
  const t = safeStr(eventType).toLowerCase();
  if (t.includes('failed') || t.includes('fail')) return { cls: 'sec-ev-failed' };
  if (t.includes('logout'))                        return { cls: 'sec-ev-logout' };
  if (t.includes('login') || t.includes('success'))return { cls: 'sec-ev-login' };
  if (t.includes('block'))                         return { cls: 'sec-ev-blocked' };
  if (t.includes('perm') || t.includes('role'))    return { cls: 'sec-ev-perm' };
  if (t.includes('revok') || t.includes('session'))return { cls: 'sec-ev-session' };
  return { cls: 'sec-ev-other' };
}

function getStartDate(filter) {
  const now = new Date();
  if (filter === '24h') return new Date(now - 24 * 60 * 60 * 1000);
  if (filter === '7j')  return new Date(now - 7  * 24 * 60 * 60 * 1000);
  if (filter === '30j') return new Date(now - 30 * 24 * 60 * 60 * 1000);
  return null;
}

function exportCsv(rows) {
  const headers = ['Date', 'Événement', 'Utilisateur', 'Email', 'IP', 'Résultat', 'Détails'];
  const lines = rows.map((r) =>
    [r.date, r.eventType, r.user, r.email, r.ip, r.success ? 'OK' : 'FAILED', r.details]
      .map((v) => `"${safeStr(v).replace(/"/g, "'")}"`)
      .join(',')
  );
  const csv  = [headers.join(','), ...lines].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `securite_audit_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const PAGE_SIZE = 20;

const AdminSecurity = ({ userName, onLogout }) => {
  const toast    = useToast();
  const navigate = useNavigate();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false)
  );
  const [isLoading, setIsLoading]     = useState(false);
  const [items, setItems]             = useState([]);
  const [q, setQ]                     = useState('');
  const [eventType, setEventType]     = useState('');
  const [onlyFailed, setOnlyFailed]   = useState(false);
  const [timeFilter, setTimeFilter]   = useState('7j');
  const [selectedRow, setSelectedRow] = useState(null);
  const [page, setPage]               = useState(1);

  /* ── Chargement (identique à l'original) ── */
  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await get('/security-audit');
      setItems(Array.isArray(res) ? res : []);
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Erreur chargement audit sécurité'));
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  /* ── Types d'événements (identique à l'original) ── */
  const eventTypes = useMemo(() => {
    const set = new Set();
    items.forEach((x) => { const t = safeStr(x?.event_type); if (t) set.add(t); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  /* ── Normalisation des lignes ── */
  const allRows = useMemo(() =>
    items.map((x) => ({
      id:        String(x?._id || `${x?.date_event}_${x?.event_type}_${x?.ip_address}`),
      date:      x?.date_event || x?.createdAt || '',
      eventType: safeStr(x?.event_type) || '-',
      user:      x?.user?.username || x?.email || '-',
      email:     x?.user?.email    || x?.email || '-',
      role:      safeStr(x?.role   || x?.user?.role),
      ip:        safeStr(x?.ip_address) || '-',
      ua:        safeStr(x?.user_agent),
      success:   x?.success !== false,
      details:   safeStr(x?.details) || '-',
    }))
  , [items]);

  /* ── Filtrage (même logique + filtre temps) ── */
  const filtered = useMemo(() => {
    const needle    = safeStr(q).toLowerCase();
    const startDate = getStartDate(timeFilter);
    return allRows.filter((r) => {
      if (startDate) {
        const d = new Date(r.date);
        if (!Number.isNaN(d.getTime()) && d < startDate) return false;
      }
      if (onlyFailed && r.success !== false) return false;
      if (eventType && r.eventType !== eventType) return false;
      if (!needle) return true;
      return [r.eventType, r.details, r.email, r.role, r.ip, r.ua, r.user]
        .some((p) => p.toLowerCase().includes(needle));
    });
  }, [allRows, eventType, onlyFailed, q, timeFilter]);

  /* ── KPIs ── */
  const kpis = useMemo(() => ({
    total:       filtered.length,
    echecs:      filtered.filter((r) => !r.success).length,
    uniqueUsers: new Set(filtered.map((r) => r.email)).size,
    uniqueIps:   new Set(filtered.map((r) => r.ip)).size,
  }), [filtered]);

  /* ── Graphique 7 jours ── */
  const chartData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({
        key:   d.toISOString().slice(0, 10),
        label: d.toLocaleDateString('fr-FR', { weekday: 'short' }),
        ok: 0, fail: 0,
      });
    }
    allRows.forEach((r) => {
      const key = new Date(r.date).toISOString().slice(0, 10);
      const day = days.find((d) => d.key === key);
      if (day) { if (r.success) day.ok++; else day.fail++; }
    });
    const max = Math.max(...days.map((d) => d.ok + d.fail), 1);
    return days.map((d) => ({ ...d, max }));
  }, [allRows]);

  /* ── Pagination ── */
  const totalPages  = Math.ceil(filtered.length / PAGE_SIZE);
  const visibleRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [q, eventType, onlyFailed, timeFilter]);

  /* ── Navigation corrigée ── */
  const goToUsers = () => navigate('/admin/utilisateurs');

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
          title="Sécurité"
          subtitle="Journal des accès et actions sensibles"
          icon={<ShieldAlert size={24} />}
        />
        {isLoading && <LoadingSpinner overlay text="Chargement..." />}

        <div className="admin-page">

          {/* ── Bannière alerte ── */}
          {kpis.echecs >= 3 && (
            <div className="sec-alert-banner">
              <AlertTriangle size={16} />
              <span>
                <strong>{kpis.echecs} tentatives échouées</strong> détectées sur la période.
                Vérifiez les utilisateurs concernés.
              </span>
              <button className="sec-alert-banner-btn" onClick={goToUsers}>
                Voir les utilisateurs →
              </button>
            </div>
          )}

          {/* ── KPI Cards ── */}
          <div className="sec-kpi-row">
            <div className="sec-kpi-card">
              <div className="sec-kpi-icon sec-kpi-icon--blue"><Activity size={18} /></div>
              <div>
                <div className="sec-kpi-value">{kpis.total}</div>
                <div className="sec-kpi-label">Événements au total</div>
              </div>
            </div>

            <div className={`sec-kpi-card ${kpis.echecs > 0 ? 'sec-kpi-card--danger' : ''}`}>
              <div className={`sec-kpi-icon ${kpis.echecs > 0 ? 'sec-kpi-icon--red' : 'sec-kpi-icon--slate'}`}>
                <XCircle size={18} />
              </div>
              <div>
                <div className={`sec-kpi-value ${kpis.echecs > 0 ? 'sec-kpi-value--red' : ''}`}>
                  {kpis.echecs}
                </div>
                <div className="sec-kpi-label">Connexions échouées</div>
              </div>
            </div>

            <div className="sec-kpi-card">
              <div className="sec-kpi-icon sec-kpi-icon--green"><Users size={18} /></div>
              <div>
                <div className="sec-kpi-value">{kpis.uniqueUsers}</div>
                <div className="sec-kpi-label">Utilisateurs concernés</div>
              </div>
            </div>

            <div className="sec-kpi-card">
              <div className="sec-kpi-icon sec-kpi-icon--purple"><Wifi size={18} /></div>
              <div>
                <div className="sec-kpi-value">{kpis.uniqueIps}</div>
                <div className="sec-kpi-label">Adresses IP distinctes</div>
              </div>
            </div>
          </div>

          {/* ── Graphique 7 jours ── */}
          <div className="sec-chart-card">
            <div className="sec-chart-header">
              <span className="sec-chart-title">
                <TrendingUp size={15} /> Activité des 7 derniers jours
              </span>
              <div className="sec-chart-legend">
                <span className="sec-legend-item sec-legend-ok">Succès</span>
                <span className="sec-legend-item sec-legend-fail">Échecs</span>
              </div>
            </div>
            <div className="sec-chart-bars">
              {chartData.map((d) => (
                <div key={d.key} className="sec-chart-col">
                  <div className="sec-chart-bar-wrap">
                    {d.ok > 0 && (
                      <div
                        className="sec-bar sec-bar--ok"
                        style={{ height: `${Math.round((d.ok / d.max) * 100)}%` }}
                        title={`${d.ok} succès`}
                      />
                    )}
                    {d.fail > 0 && (
                      <div
                        className="sec-bar sec-bar--fail"
                        style={{ height: `${Math.round((d.fail / d.max) * 100)}%` }}
                        title={`${d.fail} échecs`}
                      />
                    )}
                    {d.ok === 0 && d.fail === 0 && (
                      <div className="sec-bar sec-bar--empty" />
                    )}
                  </div>
                  <div className="sec-chart-day">{d.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Toolbar ── */}
          <div className="admin-sec-toolbar">
            <div className="admin-sec-search">
              <Search size={16} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher (email, IP, événement, détails...)"
              />
              {q && (
                <button className="sec-clear-btn" onClick={() => setQ('')}>
                  <X size={14} />
                </button>
              )}
            </div>

            <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
              <option value="">Tous les événements</option>
              {eventTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>

            <div className="sec-time-filter">
              {['24h', '7j', '30j', 'Tout'].map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`sec-time-btn ${timeFilter === f ? 'active' : ''}`}
                  onClick={() => setTimeFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>

            <label className="admin-sec-check">
              <input
                type="checkbox"
                checked={onlyFailed}
                onChange={(e) => setOnlyFailed(e.target.checked)}
              />
              <span>Échecs seulement</span>
            </label>

            <button
              className="admin-btn sec-export-btn"
              type="button"
              onClick={() => { exportCsv(filtered); toast.success('Fichier CSV téléchargé.'); }}
              disabled={filtered.length === 0}
            >
              <Download size={15} />
              <span>Exporter</span>
            </button>

            <button className="admin-btn" type="button" onClick={load} disabled={isLoading}>
              <RefreshCw size={16} className={isLoading ? 'sec-spin' : ''} />
              <span>Actualiser</span>
            </button>
          </div>

          {/* Compteur */}
          <div className="sec-results-count">
            <span>
              <strong>{filtered.length}</strong> résultat{filtered.length !== 1 ? 's' : ''}
              {(q || eventType || onlyFailed) ? ' (filtrés)' : ''}
            </span>
            {totalPages > 1 && (
              <span className="sec-results-page">Page {page} / {totalPages}</span>
            )}
          </div>

          {/* ── Tableau ── */}
          <div className="admin-sec-table">
            <div className="admin-sec-head">
              <div>Date</div>
              <div>Événement</div>
              <div>Utilisateur</div>
              <div>Adresse IP</div>
              <div>Résultat</div>
              <div>Détails</div>
            </div>

            {visibleRows.map((r) => {
              const evStyle = getEventStyle(r.eventType);
              const local   = isLocalIp(r.ip);
              return (
                <div
                  key={r.id}
                  className={`admin-sec-row sec-row-clickable ${!r.success ? 'sec-row-failed' : ''}`}
                  onClick={() => setSelectedRow(r)}
                  title="Cliquer pour voir le détail"
                >
                  {/* Date */}
                  <div className="mono sec-date-cell">
                    <Clock size={11} className="sec-cell-icon" />
                    {formatDate(r.date)}
                  </div>

                  {/* Badge événement coloré */}
                  <div>
                    <span className={`sec-event-badge ${evStyle.cls}`}>
                      {r.eventType || '-'}
                    </span>
                  </div>

                  {/* Utilisateur */}
                  <div>
                    <div className="sec-user-name">{r.user}</div>
                    {r.role && <div className="sec-user-role">{r.role}</div>}
                  </div>

                  {/* IP */}
                  <div className="mono sec-ip-cell">
                    {local ? (
                      <span className="sec-ip-local">Local</span>
                    ) : (
                      <><MapPin size={11} className="sec-cell-icon" />{r.ip}</>
                    )}
                  </div>

                  {/* Résultat */}
                  <div>
                    {r.success ? (
                      <span className="sec-badge-ok"><CheckCircle size={11} /> OK</span>
                    ) : (
                      <span className="sec-badge-fail"><XCircle size={11} /> FAILED</span>
                    )}
                  </div>

                  {/* Détails + bouton bloquer */}
                  <div className="sec-details-cell">
                    <span className="details">{r.details}</span>
                    {!r.success && (r.email || r.user) && (
                      <button
                        className="sec-block-btn"
                        title="Aller bloquer cet utilisateur"
                        onClick={(e) => { e.stopPropagation(); goToUsers(); }}
                      >
                        <Lock size={11} /> Bloquer
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {!visibleRows.length && (
              <div className="admin-sec-empty sec-empty-state">
                <ShieldAlert size={32} className="sec-empty-icon" />
                <p>Aucun événement trouvé.</p>
                {(q || eventType || onlyFailed) && (
                  <button
                    className="sec-reset-filters"
                    onClick={() => { setQ(''); setEventType(''); setOnlyFailed(false); }}
                  >
                    Effacer les filtres
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="sec-pagination">
              <button
                className="sec-page-btn"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Précédent
              </button>
              <div className="sec-page-numbers">
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const n = page <= 3 ? i + 1
                    : page >= totalPages - 2 ? totalPages - 4 + i
                    : page - 2 + i;
                  if (n < 1 || n > totalPages) return null;
                  return (
                    <button
                      key={n}
                      className={`sec-page-num ${page === n ? 'active' : ''}`}
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              <button
                className="sec-page-btn"
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant →
              </button>
            </div>
          )}

        </div>
      </div>

      {/* ── Drawer détail ── */}
      {selectedRow && (
        <div className="sec-drawer-backdrop" onClick={() => setSelectedRow(null)}>
          <div className="sec-drawer" onClick={(e) => e.stopPropagation()}>

            <div className="sec-drawer-head">
              <div className="sec-drawer-head-left">
                <div className={`sec-drawer-icon ${!selectedRow.success ? 'sec-drawer-icon--fail' : 'sec-drawer-icon--ok'}`}>
                  {selectedRow.success ? <CheckCircle size={18} /> : <XCircle size={18} />}
                </div>
                <div>
                  <p className="sec-drawer-title">Détail de l'événement</p>
                  <p className="sec-drawer-sub">{formatDate(selectedRow.date)}</p>
                </div>
              </div>
              <button className="sec-drawer-close" onClick={() => setSelectedRow(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="sec-drawer-body">
              <div className="sec-drawer-section">
                <span className={`sec-event-badge sec-event-badge--lg ${getEventStyle(selectedRow.eventType).cls}`}>
                  {selectedRow.eventType}
                </span>
                {selectedRow.success ? (
                  <span className="sec-badge-ok" style={{ marginLeft: 8 }}>
                    <CheckCircle size={11} /> OK
                  </span>
                ) : (
                  <span className="sec-badge-fail" style={{ marginLeft: 8 }}>
                    <XCircle size={11} /> FAILED
                  </span>
                )}
              </div>

              {[
                { icon: <Users size={14} />,    label: 'Utilisateur', value: selectedRow.user },
                { icon: <Users size={14} />,    label: 'Email',       value: selectedRow.email },
                { icon: <Lock size={14} />,     label: 'Rôle',        value: selectedRow.role || '—' },
                { icon: <MapPin size={14} />,   label: 'Adresse IP',  value: selectedRow.ip },
                { icon: <Clock size={14} />,    label: 'Date exacte', value: formatDate(selectedRow.date) },
                { icon: <Monitor size={14} />,  label: 'Appareil',    value: selectedRow.ua || '—' },
                { icon: <Activity size={14} />, label: 'Détails',     value: selectedRow.details },
              ].map(({ icon, label, value }) => (
                <div key={label} className="sec-drawer-row">
                  <div className="sec-drawer-row-label">{icon} {label}</div>
                  <div className="sec-drawer-row-value">{value}</div>
                </div>
              ))}

              {/* ✅ Route corrigée */}
              {!selectedRow.success && (
                <button
                  className="sec-drawer-block-btn"
                  onClick={() => { setSelectedRow(null); goToUsers(); }}
                >
                  <Lock size={14} />
                  Aller bloquer cet utilisateur
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminSecurity;