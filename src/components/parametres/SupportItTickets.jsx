import { useCallback, useEffect, useMemo, useState } from 'react';
import { Paperclip, RefreshCw, Send, MessageCircle, CheckCircle2, Eye } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { get, patch, post, uploadFile } from '../../services/api';
import { useToast } from '../shared/Toast';
import { getUiErrorMessage } from '../../services/uiError';
import { isSafeText } from '../../utils/formGuards';

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

const CATEGORIES = [
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
  { value: 'LOW', label: 'Faible' },
  { value: 'NORMAL', label: 'Normale' },
  { value: 'HIGH', label: 'Élevée' },
  { value: 'URGENT', label: 'Urgente' },
];

const STATUS_LABELS = {
  NEW: 'Nouveau',
  IN_PROGRESS: 'En cours',
  WAITING_USER: 'En attente utilisateur',
  RESOLVED: 'Résolu',
  CLOSED: 'Fermé',
};

function formatDateTime(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('fr-FR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '-';
  }
}

function badgeStyle(kind, value) {
  const base = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, border: '1px solid #e2e8f0', fontWeight: 900, fontSize: 12 };

  if (kind === 'status') {
    if (value === 'NEW') return { ...base, background: 'rgba(59,130,246,0.10)', borderColor: 'rgba(59,130,246,0.25)', color: '#1d4ed8' };
    if (value === 'IN_PROGRESS') return { ...base, background: 'rgba(234,88,12,0.10)', borderColor: 'rgba(234,88,12,0.25)', color: '#9a3412' };
    if (value === 'WAITING_USER') return { ...base, background: 'rgba(124,58,237,0.10)', borderColor: 'rgba(124,58,237,0.25)', color: '#6d28d9' };
    if (value === 'RESOLVED') return { ...base, background: 'rgba(22,163,74,0.10)', borderColor: 'rgba(22,163,74,0.25)', color: '#166534' };
    return { ...base, background: 'rgba(100,116,139,0.10)', borderColor: 'rgba(100,116,139,0.25)', color: '#334155' };
  }

  if (kind === 'priority') {
    if (value === 'URGENT') return { ...base, background: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.25)', color: '#b91c1c' };
    if (value === 'HIGH') return { ...base, background: 'rgba(234,88,12,0.10)', borderColor: 'rgba(234,88,12,0.25)', color: '#9a3412' };
    if (value === 'LOW') return { ...base, background: 'rgba(148,163,184,0.18)', borderColor: 'rgba(148,163,184,0.35)', color: '#334155' };
    return { ...base, background: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.18)', color: '#1e40af' };
  }

  return base;
}

function suggestionFor(category) {
  if (category === 'ALERTES') return 'Vérifiez la période sélectionnée dans le dashboard avant d’envoyer le ticket.';
  if (category === 'EXPORT') return 'Vérifiez que le rapport contient des données avant l’export.';
  if (category === 'ASSISTANT') return 'Vérifiez que le service assistant est actif.';
  if (category === 'COMPTE') return 'Vérifiez que vous êtes bien connecté et que votre profil est complet.';
  if (category === 'STOCK') return 'Vérifiez le produit concerné et la quantité affichée avant d’envoyer le ticket.';
  return '';
}

export default function SupportItTickets() {
  const toast = useToast();
  const location = useLocation();

  const [draft, setDraft] = useState({
    title: '',
    category: 'ALERTES',
    priority: 'NORMAL',
    message: '',
  });

  const [attachmentFile, setAttachmentFile] = useState(null);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [tickets, setTickets] = useState([]);

  const [openTicketId, setOpenTicketId] = useState('');
  const [openTicketLoading, setOpenTicketLoading] = useState(false);
  const [openTicket, setOpenTicket] = useState(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [replySending, setReplySending] = useState(false);

  const quickHelp = useMemo(() => suggestionFor(draft.category), [draft.category]);

  const loadMyTickets = useCallback(async () => {
    setTicketsLoading(true);
    try {
      const res = await get('/support/my-tickets?limit=12');
      setTickets(Array.isArray(res?.tickets) ? res.tickets : []);
    } catch (err) {
      setTickets([]);
      toast.error(getUiErrorMessage(err, 'Chargement tickets échoué'));
    } finally {
      setTicketsLoading(false);
    }
  }, [toast]);

  const loadTicketDetail = useCallback(async (id) => {
    const tid = String(id || '').trim();
    if (!tid) return;
    setOpenTicketLoading(true);
    try {
      const res = await get(`/support/tickets/${encodeURIComponent(tid)}`);
      setOpenTicket(res?.ticket || null);
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Chargement ticket échoué'));
      setOpenTicket(null);
    } finally {
      setOpenTicketLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadMyTickets();
  }, [loadMyTickets]);

  const handleAttachmentChange = useCallback((e) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      toast.error('Fichier trop lourd (max 10 MB).');
      return;
    }
    const mime = String(file.type || '').toLowerCase();
    const ok = mime.startsWith('image/') || mime === 'application/pdf';
    if (!ok) {
      toast.error('Format non supporté (image ou PDF).');
      return;
    }
    setAttachmentFile(file);
  }, [toast]);

  const sendTicket = useCallback(async () => {
    const title = String(draft.title || '').trim();
    const message = String(draft.message || '').trim();
    const category = String(draft.category || '').trim().toUpperCase();
    const priority = String(draft.priority || '').trim().toUpperCase();

    if (!isSafeText(title, { min: 3, max: 120 })) {
      toast.error('Objet invalide (3-120).');
      return;
    }
    if (!CATEGORIES.some((c) => c.value === category)) {
      toast.error('Catégorie invalide.');
      return;
    }
    if (!PRIORITIES.some((p) => p.value === priority)) {
      toast.error('Priorité invalide.');
      return;
    }
    if (!isSafeText(message, { min: 6, max: 2000 })) {
      toast.error('Message invalide (6-2000).');
      return;
    }

    setSending(true);
    try {
      let attachmentUrl = '';
      if (attachmentFile) {
        const uploaded = await uploadFile('/files/upload', attachmentFile);
        attachmentUrl = String(uploaded?.file_url || '').trim();
      }

      const pageUrl = `${location.pathname || ''}${location.search || ''}`.slice(0, 220);
      const browserInfo = String(navigator?.userAgent || '').slice(0, 340);

      const res = await post('/support/tickets', {
        title,
        category,
        priority,
        message,
        pageUrl,
        browserInfo,
        attachmentUrl,
      });

      const ticketNumber = res?.ticket?.ticketNumber ? ` (${res.ticket.ticketNumber})` : '';
      toast.success(`Ticket envoyé au support${ticketNumber}.`);
      setDraft({ title: '', category: draft.category || 'ALERTES', priority: 'NORMAL', message: '' });
      setAttachmentFile(null);
      setOpenTicketId('');
      setOpenTicket(null);
      setReplyDraft('');
      await loadMyTickets();
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Envoi ticket échoué'));
    } finally {
      setSending(false);
    }
  }, [attachmentFile, draft, loadMyTickets, location.pathname, location.search, toast]);

  const openDetail = useCallback(async (t) => {
    const id = String(t?._id || '').trim();
    if (!id) return;
    const next = openTicketId === id ? '' : id;
    setOpenTicketId(next);
    setReplyDraft('');
    setOpenTicket(null);
    if (next) await loadTicketDetail(next);
  }, [loadTicketDetail, openTicketId]);

  const sendReply = useCallback(async () => {
    const id = String(openTicketId || '').trim();
    if (!id) return;
    const message = String(replyDraft || '').trim();
    if (!isSafeText(message, { min: 2, max: 1200 })) {
      toast.error('Réponse invalide (2-1200).');
      return;
    }
    setReplySending(true);
    try {
      await post(`/support/tickets/${encodeURIComponent(id)}/reply`, { message });
      toast.success('Réponse envoyée.');
      setReplyDraft('');
      await Promise.all([loadMyTickets(), loadTicketDetail(id)]);
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Envoi réponse échoué'));
    } finally {
      setReplySending(false);
    }
  }, [loadMyTickets, loadTicketDetail, openTicketId, replyDraft, toast]);

  const markResolved = useCallback(async (id) => {
    const tid = String(id || '').trim();
    if (!tid) return;
    const confirmed = window.confirm('Marquer ce ticket comme résolu ?');
    if (!confirmed) return;
    try {
      await patch(`/support/tickets/${encodeURIComponent(tid)}/resolve`, {});
      toast.success('Ticket marqué comme résolu.');
      if (openTicketId === tid) {
        await loadTicketDetail(tid);
      }
      await loadMyTickets();
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Action échouée'));
    }
  }, [loadMyTickets, loadTicketDetail, openTicketId, toast]);

  const contextPreview = useMemo(() => {
    const pageUrl = `${location.pathname || ''}${location.search || ''}`.slice(0, 220);
    return {
      pageUrl,
      role: 'responsable',
      when: new Date().toLocaleString('fr-FR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
    };
  }, [location.pathname, location.search]);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="users-list" style={{ marginTop: 10 }}>
        <div className="user-item" style={{ alignItems: 'flex-start' }}>
          <div className="user-info" style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 1000, color: '#0f172a', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                <Send size={18} />
                Créer un ticket
              </div>
              <div style={{ fontWeight: 900, fontSize: 12, color: '#64748b' }}>
                Décrivez le problème rencontré. Ajoutez la page, l’heure ou une capture si possible.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
              <label style={{ fontWeight: 900, fontSize: 12, color: '#64748b' }}>
                Objet
                <input
                  style={{ marginTop: 6, width: '100%', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', fontWeight: 900 }}
                  value={draft.title}
                  onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Ex: Les alertes ne s’affichent plus"
                  maxLength={120}
                />
              </label>
              <label style={{ fontWeight: 900, fontSize: 12, color: '#64748b' }}>
                Catégorie
                <select
                  style={{ marginTop: 6, width: '100%', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', fontWeight: 900 }}
                  value={draft.category}
                  onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontWeight: 900, fontSize: 12, color: '#64748b' }}>
                Priorité
                <select
                  style={{ marginTop: 6, width: '100%', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', fontWeight: 900 }}
                  value={draft.priority}
                  onChange={(e) => setDraft((p) => ({ ...p, priority: e.target.value }))}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </label>

              <label style={{ fontWeight: 900, fontSize: 12, color: '#64748b' }}>
                Pièce jointe (optionnel)
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <label className="btn-user secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Paperclip size={16} /> Choisir un fichier
                    <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleAttachmentChange} />
                  </label>
                  {attachmentFile ? (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 900, color: '#0f172a' }}>
                      <span style={{ fontSize: 12, color: '#64748b' }}>Sélectionné:</span>
                      <span>{attachmentFile.name}</span>
                      <button className="btn-user secondary" type="button" onClick={() => setAttachmentFile(null)} disabled={sending}>
                        Retirer
                      </button>
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 900, color: '#64748b' }}>Image ou PDF</span>
                  )}
                </div>
              </label>
            </div>

            <div style={{ marginTop: 10 }}>
              <label style={{ fontWeight: 900, fontSize: 12, color: '#64748b' }}>
                Message
                <textarea
                  style={{ marginTop: 6, width: '100%', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', fontWeight: 900 }}
                  value={draft.message}
                  onChange={(e) => setDraft((p) => ({ ...p, message: e.target.value }))}
                  placeholder="Décrivez le problème (page, heure, ce que vous voyez)."
                  rows={4}
                  maxLength={2000}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              <div style={{ border: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: 12, padding: 10 }}>
                <div style={{ fontWeight: 1000, color: '#0f172a' }}>Aide rapide</div>
                <div style={{ marginTop: 6, fontWeight: 900, fontSize: 12.5, color: '#475569' }}>
                  {quickHelp || 'Astuce: précisez la page concernée, l’heure et une capture si possible.'}
                </div>
              </div>

              <div style={{ border: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: 12, padding: 10 }}>
                <div style={{ fontWeight: 1000, color: '#0f172a' }}>Contexte envoyé</div>
                <div style={{ marginTop: 6, fontWeight: 900, fontSize: 12.5, color: '#475569', lineHeight: 1.4 }}>
                  <div>Page: <span style={{ color: '#0f172a' }}>{contextPreview.pageUrl || '-'}</span></div>
                  <div>Rôle: <span style={{ color: '#0f172a' }}>{contextPreview.role}</span></div>
                  <div>Date: <span style={{ color: '#0f172a' }}>{contextPreview.when}</span></div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn-user success" type="button" onClick={sendTicket} disabled={sending}>
                {sending ? 'Envoi...' : 'Envoyer au support'}
              </button>
              <button className="btn-user secondary" type="button" onClick={loadMyTickets} disabled={ticketsLoading || sending}>
                <RefreshCw size={16} /> Actualiser mes tickets
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="users-list" style={{ marginTop: 0 }}>
        <div className="user-item" style={{ alignItems: 'flex-start' }}>
          <div className="user-info" style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 1000, color: '#0f172a', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                <MessageCircle size={18} />
                Mes tickets récents
              </div>
              {ticketsLoading && <div style={{ fontWeight: 900, color: '#64748b' }}>Chargement…</div>}
            </div>

            {!ticketsLoading && (!tickets || tickets.length === 0) ? (
              <div className="users-empty" style={{ marginTop: 10 }}>Aucun ticket envoyé pour le moment.</div>
            ) : (
              <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                {(tickets || []).map((t) => {
                  const id = String(t?._id || '');
                  const isOpen = openTicketId === id;
                  const status = String(t?.status || 'NEW');
                  const priority = String(t?.priority || 'NORMAL');
                  const categoryLabel = CATEGORIES.find((c) => c.value === t.category)?.label || t.category || '-';
                  return (
                    <div key={id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, background: '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 220 }}>
                          <div style={{ fontWeight: 1100, color: '#0f172a' }}>
                            {t.ticketNumber ? `${t.ticketNumber} • ` : ''}{t.title || '-'}
                          </div>
                          <div style={{ marginTop: 4, fontWeight: 900, fontSize: 12.5, color: '#64748b' }}>
                            {categoryLabel} • {formatDateTime(t.createdAt)}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={badgeStyle('priority', priority)}>{PRIORITIES.find((p) => p.value === priority)?.label || priority}</span>
                          <span style={badgeStyle('status', status)}>{STATUS_LABELS[status] || status}</span>
                        </div>
                      </div>

                      <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 900, fontSize: 12.5, color: '#475569' }}>
                          Dernière réponse admin: <span style={{ color: '#0f172a' }}>{t.lastAdminReplyAt ? formatDateTime(t.lastAdminReplyAt) : '—'}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button className="btn-user secondary" type="button" onClick={() => openDetail(t)} disabled={openTicketLoading && isOpen}>
                            <Eye size={16} /> {isOpen ? 'Masquer' : 'Voir détail'}
                          </button>
                          <button className="btn-user secondary" type="button" onClick={() => { if (!isOpen) openDetail(t); }} disabled={openTicketLoading && isOpen}>
                            Ajouter réponse
                          </button>
                          <button className="btn-user success" type="button" onClick={() => markResolved(id)} disabled={status === 'CLOSED'}>
                            <CheckCircle2 size={16} /> Marquer résolu
                          </button>
                        </div>
                      </div>

                      {isOpen && (
                        <div style={{ marginTop: 12, borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
                          {openTicketLoading ? (
                            <div className="users-empty">Chargement du ticket…</div>
                          ) : openTicket ? (
                            <div style={{ display: 'grid', gap: 12 }}>
                              <div style={{ display: 'grid', gap: 8 }}>
                                <div style={{ fontWeight: 1000, color: '#0f172a' }}>Détail</div>
                                <div style={{ fontWeight: 900, color: '#334155', whiteSpace: 'pre-wrap' }}>{openTicket.message || '-'}</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                  <div style={{ fontWeight: 900, fontSize: 12.5, color: '#475569' }}>
                                    Page: <span style={{ color: '#0f172a' }}>{openTicket.pageUrl || '-'}</span>
                                  </div>
                                  <div style={{ fontWeight: 900, fontSize: 12.5, color: '#475569' }}>
                                    Navigateur: <span style={{ color: '#0f172a' }}>{openTicket.browserInfo ? 'Détecté' : '-'}</span>
                                  </div>
                                </div>
                                {openTicket.attachmentUrl ? (
                                  <div style={{ fontWeight: 900, fontSize: 12.5, color: '#475569' }}>
                                    Pièce jointe: <a href={openTicket.attachmentUrl} style={{ color: '#1d4ed8', fontWeight: 1000, textDecoration: 'underline' }} target="_blank" rel="noreferrer">Ouvrir</a>
                                  </div>
                                ) : null}
                              </div>

                              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 10, background: '#f8fafc' }}>
                                <div style={{ fontWeight: 1000, color: '#0f172a' }}>Conversation</div>
                                <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                                  {Array.isArray(openTicket.responses) && openTicket.responses.length ? (
                                    openTicket.responses.map((r, idx) => (
                                      <div key={`${r.createdAt || ''}-${idx}`} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 10 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                          <div style={{ fontWeight: 1000, color: '#0f172a' }}>
                                            {String(r?.authorRole || '').toLowerCase() === 'admin' ? 'Admin' : 'Vous'}
                                          </div>
                                          <div style={{ fontWeight: 900, fontSize: 12, color: '#64748b' }}>{formatDateTime(r?.createdAt)}</div>
                                        </div>
                                        <div style={{ marginTop: 6, fontWeight: 900, color: '#334155', whiteSpace: 'pre-wrap' }}>{r?.message || '-'}</div>
                                      </div>
                                    ))
                                  ) : (
                                    <div style={{ fontWeight: 900, color: '#64748b' }}>Aucune réponse pour le moment.</div>
                                  )}
                                </div>
                              </div>

                              <div style={{ display: 'grid', gap: 8 }}>
                                <div style={{ fontWeight: 1000, color: '#0f172a' }}>Ajouter une réponse</div>
                                <textarea
                                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', fontWeight: 900 }}
                                  value={replyDraft}
                                  onChange={(e) => setReplyDraft(e.target.value)}
                                  rows={3}
                                  maxLength={1200}
                                  placeholder="Écrivez votre réponse…"
                                />
                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                  <button className="btn-user success" type="button" onClick={sendReply} disabled={replySending || !replyDraft.trim()}>
                                    {replySending ? 'Envoi…' : 'Envoyer réponse'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="users-empty">Ticket introuvable.</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
