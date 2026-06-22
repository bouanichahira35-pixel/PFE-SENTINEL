// BLOC 1 - Role du fichier.
// Ce fichier affiche une page de l'espace administrateur pour AdminSupport.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LifeBuoy, RefreshCw, Search, Send, CheckCircle2, CircleDot, Lock } from 'lucide-react';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { get, patch, post } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import { getUiErrorMessage } from '../../services/uiError';
import './AdminDashboard.css';
import './AdminSupport.css';

const CATEGORIES = [
  { value: '', label: 'Toutes' },
  { value: 'DASHBOARD', label: 'Dashboard' },
  { value: 'ALERTES', label: 'Alertes' },
  { value: 'DEMANDES', label: 'Demandes' },
  { value: 'STOCK', label: 'Stock' },
  { value: 'FOURNISSEURS', label: 'Fournisseurs' },
  { value: 'EXPORT', label: 'Export' },
  { value: 'ASSISTANT', label: 'Assistant' },
  { value: 'COMPTE', label: 'Compte' },
  { value: 'AUTRE', label: 'Autre' },
];

const PRIORITIES = [
  { value: '', label: 'Toutes' },
  { value: 'LOW', label: 'Faible' },
  { value: 'NORMAL', label: 'Normale' },
  { value: 'HIGH', label: 'Élevée' },
  { value: 'URGENT', label: 'Urgente' },
];

const STATUSES = [
  { value: '', label: 'Tous' },
  { value: 'NEW', label: 'Nouveau' },
  { value: 'IN_PROGRESS', label: 'En cours' },
  { value: 'WAITING_USER', label: 'En attente utilisateur' },
  { value: 'RESOLVED', label: 'Résolu' },
  { value: 'CLOSED', label: 'Fermé' },
];

const ROLES = [
  { value: '', label: 'Tous rôles' },
  { value: 'responsable', label: 'Responsable' },
  { value: 'magasinier', label: 'Magasinier' },
  { value: 'demandeur', label: 'Demandeur' },
];

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('fr-FR');
}

function safeText(value) {
  return String(value || '').trim();
}

function badgeClass(kind, value) {
  const v = String(value || '');
  if (kind === 'priority') {
    if (v === 'URGENT') return 'urgent';
    if (v === 'HIGH') return 'high';
    if (v === 'LOW') return 'low';
    return 'normal';
  }
  if (kind === 'status') {
    if (v === 'NEW') return 'new';
    if (v === 'IN_PROGRESS') return 'progress';
    if (v === 'WAITING_USER') return 'waiting';
    if (v === 'RESOLVED') return 'resolved';
    return 'closed';
  }
  return '';
}

export default function AdminSupport({ userName, onLogout }) {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [ticketsRes, setTicketsRes] = useState({ total: 0, tickets: [], page: { limit: 60, offset: 0 } });

  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    role: '',
    category: '',
    from: '',
    to: '',
    q: '',
  });

  const [selectedId, setSelectedId] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [ticket, setTicket] = useState(null);

  const [replyDraft, setReplyDraft] = useState('');
  const [replySending, setReplySending] = useState(false);

  const loadSummary = useCallback(async () => {
    const res = await get('/admin/support/summary');
    setSummary(res || null);
  }, []);

  const loadTickets = useCallback(async (opts = {}) => {
    const limit = Number.isFinite(Number(opts.limit)) ? Number(opts.limit) : Number(ticketsRes?.page?.limit || 60);
    const offset = Number.isFinite(Number(opts.offset)) ? Number(opts.offset) : 0;

    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.priority) params.set('priority', filters.priority);
    if (filters.role) params.set('role', filters.role);
    if (filters.category) params.set('category', filters.category);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.q) params.set('q', filters.q);
    params.set('limit', String(limit));
    params.set('offset', String(offset));

    const res = await get(`/admin/support/tickets?${params.toString()}`);
    setTicketsRes({
      total: Number(res?.total || 0),
      tickets: Array.isArray(res?.tickets) ? res.tickets : [],
      page: res?.page || { limit, offset },
    });
  }, [filters, ticketsRes?.page?.limit]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadSummary(), loadTickets({ offset: 0 })]);
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Chargement support échoué'));
    } finally {
      setLoading(false);
    }
  }, [loadSummary, loadTickets, toast]);

  const loadDetail = useCallback(async (id) => {
    const tid = String(id || '').trim();
    if (!tid) return;
    setDetailLoading(true);
    try {
      const res = await get(`/admin/support/tickets/${encodeURIComponent(tid)}`);
      setTicket(res?.ticket || null);
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Chargement ticket échoué'));
      setTicket(null);
    } finally {
      setDetailLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const kpis = summary?.kpis || {};

  const rows = useMemo(() => (ticketsRes?.tickets || []).map((t) => ({
    id: t?._id,
    when: t?.createdAt,
    user: t?.createdByUsername || '-',
    role: t?.createdByRole || '-',
    subject: t?.title || '-',
    category: t?.category || '-',
    priority: t?.priority || 'NORMAL',
    status: t?.status || 'NEW',
    lastAdminReplyAt: t?.lastAdminReplyAt || null,
    ticketNumber: t?.ticketNumber || '',
  })), [ticketsRes?.tickets]);

  const selectTicket = useCallback(async (id) => {
    const tid = String(id || '').trim();
    if (!tid) return;
    setSelectedId(tid);
    setReplyDraft('');
    await loadDetail(tid);
  }, [loadDetail]);

  const updateStatus = useCallback(async (status) => {
    if (!selectedId) return;
    try {
      await patch(`/admin/support/tickets/${encodeURIComponent(selectedId)}/status`, { status });
      toast.success('Statut mis à jour.');
      await Promise.all([loadSummary(), loadTickets({ offset: ticketsRes?.page?.offset || 0 }), loadDetail(selectedId)]);
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Mise à jour échouée'));
    }
  }, [loadDetail, loadSummary, loadTickets, selectedId, ticketsRes?.page?.offset, toast]);

  const updatePriority = useCallback(async (priority) => {
    if (!selectedId) return;
    try {
      await patch(`/admin/support/tickets/${encodeURIComponent(selectedId)}/priority`, { priority });
      toast.success('Priorité mise à jour.');
      await Promise.all([loadSummary(), loadTickets({ offset: ticketsRes?.page?.offset || 0 }), loadDetail(selectedId)]);
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Mise à jour échouée'));
    }
  }, [loadDetail, loadSummary, loadTickets, selectedId, ticketsRes?.page?.offset, toast]);

  const sendReply = useCallback(async () => {
    if (!selectedId) return;
    const message = String(replyDraft || '').trim();
    if (message.length < 2) {
      toast.warning('Message trop court.');
      return;
    }
    setReplySending(true);
    try {
      await post(`/admin/support/tickets/${encodeURIComponent(selectedId)}/reply`, { message });
      toast.success('Réponse envoyée.');
      setReplyDraft('');
      await Promise.all([loadSummary(), loadTickets({ offset: ticketsRes?.page?.offset || 0 }), loadDetail(selectedId)]);
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Réponse échouée'));
    } finally {
      setReplySending(false);
    }
  }, [loadDetail, loadSummary, loadTickets, replyDraft, selectedId, ticketsRes?.page?.offset, toast]);

  const onSearch = useCallback(async () => {
    await loadTickets({ offset: 0 });
  }, [loadTickets]);

  const detail = ticket;

  return (
    <div className="admin-layout">
      <SidebarAdmin
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((p) => !p)}
        onLogout={onLogout}
        userName={userName}
      />
      <div className={`admin-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <HeaderPage title="Support utilisateurs" subtitle="Tickets support (relation Admin ↔ Utilisateurs)" icon={<LifeBuoy size={24} />} />
        {(loading || detailLoading) && <LoadingSpinner overlay text="Chargement..." />}

        <div className="admin-page">
          <div className="admin-toolbar">
            <button className="admin-btn" type="button" onClick={loadAll} disabled={loading}>
              <RefreshCw size={16} />
              <span>Actualiser</span>
            </button>
            <div className="support-kpi-row">
              <div className="support-kpi"><span>Tickets ouverts</span><strong>{Number(kpis.open || 0)}</strong></div>
              <div className="support-kpi urgent"><span>Urgents</span><strong>{Number(kpis.urgent || 0)}</strong></div>
              <div className="support-kpi"><span>En cours</span><strong>{Number(kpis.in_progress || 0)}</strong></div>
              <div className="support-kpi"><span>Résolus aujourd’hui</span><strong>{Number(kpis.resolved_today || 0)}</strong></div>
            </div>
          </div>

          <div className="admin-card">
            <div className="admin-card-title"><Search size={18} /> Liste des tickets</div>
            <div className="support-filters">
              <label>
                Statut
                <select value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
                  {STATUSES.map((s) => <option key={s.value || 'all'} value={s.value}>{s.label}</option>)}
                </select>
              </label>
              <label>
                Priorité
                <select value={filters.priority} onChange={(e) => setFilters((p) => ({ ...p, priority: e.target.value }))}>
                  {PRIORITIES.map((p) => <option key={p.value || 'all'} value={p.value}>{p.label}</option>)}
                </select>
              </label>
              <label>
                Rôle
                <select value={filters.role} onChange={(e) => setFilters((p) => ({ ...p, role: e.target.value }))}>
                  {ROLES.map((r) => <option key={r.value || 'all'} value={r.value}>{r.label}</option>)}
                </select>
              </label>
              <label>
                Catégorie
                <select value={filters.category} onChange={(e) => setFilters((p) => ({ ...p, category: e.target.value }))}>
                  {CATEGORIES.map((c) => <option key={c.value || 'all'} value={c.value}>{c.label}</option>)}
                </select>
              </label>
              <label>
                Date (de)
                <input type="date" value={filters.from} onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))} />
              </label>
              <label>
                Date (à)
                <input type="date" value={filters.to} onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))} />
              </label>
              <label className="grow">
                Recherche
                <input
                  value={filters.q}
                  onChange={(e) => setFilters((p) => ({ ...p, q: e.target.value }))}
                  placeholder="Utilisateur / objet / message…"
                />
              </label>
              <button className="admin-btn" type="button" onClick={onSearch} disabled={loading}>
                <Search size={16} />
                <span>Rechercher</span>
              </button>
            </div>

            <div className="admin-support-table">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Utilisateur</th>
                    <th>Objet</th>
                    <th>Catégorie</th>
                    <th>Priorité</th>
                    <th>Statut</th>
                    <th>Dernière réponse</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={selectedId === r.id ? 'selected' : ''}>
                      <td className="muted">{formatDateTime(r.when)}</td>
                      <td>
                        <div className="cell-main">{r.user}</div>
                        <div className="cell-sub">{r.role}</div>
                      </td>
                      <td>
                        <div className="cell-main">{r.ticketNumber ? `${r.ticketNumber} • ` : ''}{r.subject}</div>
                        <div className="cell-sub">{safeText(r.category)}</div>
                      </td>
                      <td className="muted">{safeText(r.category)}</td>
                      <td>
                        <span className={`support-badge priority ${badgeClass('priority', r.priority)}`}>{r.priority}</span>
                      </td>
                      <td>
                        <span className={`support-badge status ${badgeClass('status', r.status)}`}>{r.status}</span>
                      </td>
                      <td className="muted">{r.lastAdminReplyAt ? formatDateTime(r.lastAdminReplyAt) : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="admin-btn" type="button" onClick={() => selectTicket(r.id)} disabled={loading}>
                          <span>Ouvrir</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td colSpan={8} className="empty">Aucun ticket.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="support-pagination">
              <div className="muted">
                Total: <strong>{Number(ticketsRes?.total || 0)}</strong>
              </div>
              <button
                className="admin-btn"
                type="button"
                onClick={() => loadTickets({ offset: Math.max(0, (ticketsRes?.page?.offset || 0) - (ticketsRes?.page?.limit || 60)) })}
                disabled={(ticketsRes?.page?.offset || 0) <= 0 || loading}
              >
                Précédent
              </button>
              <button
                className="admin-btn"
                type="button"
                onClick={() => loadTickets({ offset: (ticketsRes?.page?.offset || 0) + (ticketsRes?.page?.limit || 60) })}
                disabled={(ticketsRes?.page?.offset || 0) + (ticketsRes?.page?.limit || 60) >= (ticketsRes?.total || 0) || loading}
              >
                Suivant
              </button>
            </div>
          </div>

          <div className="admin-card" style={{ marginTop: 14 }}>
            <div className="admin-card-title"><LifeBuoy size={18} /> Détail du ticket</div>
            {!selectedId ? (
              <div className="admin-note">Sélectionnez un ticket pour afficher le détail et répondre.</div>
            ) : !detail ? (
              <div className="admin-note">Ticket introuvable.</div>
            ) : (
              <div className="support-detail">
                <div className="support-detail-grid">
                  <div>
                    <div className="support-detail-title">{detail.ticketNumber ? `${detail.ticketNumber} • ` : ''}{detail.title}</div>
                    <div className="support-detail-meta">
                      <span><strong>Utilisateur</strong>: {detail?.createdBy?.username || detail.createdByUsername || '-'}</span>
                      <span><strong>Rôle</strong>: {detail.createdByRole || '-'}</span>
                      <span><strong>Date</strong>: {formatDateTime(detail.createdAt)}</span>
                    </div>
                    <div className="support-detail-meta" style={{ marginTop: 6 }}>
                      <span><strong>Page</strong>: {detail.pageUrl || '-'}</span>
                      <span><strong>Catégorie</strong>: {detail.category || '-'}</span>
                    </div>
                    <div className="support-detail-message">{detail.message || '-'}</div>
                    {detail.attachmentUrl ? (
                      <div className="support-detail-attach">
                        Pièce jointe: <a href={detail.attachmentUrl} target="_blank" rel="noreferrer">Ouvrir</a>
                      </div>
                    ) : null}
                  </div>

                  <div className="support-actions">
                    <div className="support-action-row">
                      <label>
                        Statut
                        <select value={detail.status || 'NEW'} onChange={(e) => updateStatus(e.target.value)}>
                          {STATUSES.filter((s) => s.value).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </label>
                      <label>
                        Priorité
                        <select value={detail.priority || 'NORMAL'} onChange={(e) => updatePriority(e.target.value)}>
                          {PRIORITIES.filter((p) => p.value).map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="support-action-buttons">
                      <button className="admin-btn" type="button" onClick={() => updateStatus('IN_PROGRESS')} disabled={loading}>
                        <CircleDot size={16} /><span>Marquer en cours</span>
                      </button>
                      <button className="admin-btn" type="button" onClick={() => updateStatus('RESOLVED')} disabled={loading}>
                        <CheckCircle2 size={16} /><span>Marquer résolu</span>
                      </button>
                      <button className="admin-btn danger" type="button" onClick={() => updateStatus('CLOSED')} disabled={loading}>
                        <Lock size={16} /><span>Fermer</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="support-conv">
                  <div className="support-conv-title">Conversation</div>
                  <div className="support-conv-list">
                    {Array.isArray(detail.responses) && detail.responses.length ? detail.responses.map((r, idx) => (
                      <div key={`${r.createdAt || ''}-${idx}`} className="support-msg">
                        <div className="support-msg-head">
                          <strong>{String(r?.authorRole || '').toLowerCase() === 'admin' ? 'Admin' : 'Utilisateur'}</strong>
                          <span className="muted">{formatDateTime(r?.createdAt)}</span>
                        </div>
                        <div className="support-msg-body">{r?.message || '-'}</div>
                      </div>
                    )) : (
                      <div className="admin-note">Aucune réponse pour le moment.</div>
                    )}
                  </div>
                </div>

                <div className="support-reply">
                  <div className="support-conv-title">Répondre</div>
                  <textarea value={replyDraft} onChange={(e) => setReplyDraft(e.target.value)} rows={3} maxLength={1200} placeholder="Écrivez votre réponse…" />
                  <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button className="admin-btn" type="button" onClick={sendReply} disabled={replySending || !safeText(replyDraft)}>
                      <Send size={16} /><span>{replySending ? 'Envoi…' : 'Envoyer'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
