// BLOC 1 - Role du fichier.
// Ce fichier fournit un composant React specialise pour SupportItTickets.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Bug,
  CheckCircle2,
  Eye,
  KeyRound,
  MessageCircle,
  PackageSearch,
  Paperclip,
  Printer,
  RefreshCw,
  Send,
  Smartphone,
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { get, patch, post, uploadFile } from '../../services/api';
import { useToast } from '../shared/Toast';
import { useConfirm } from '../shared/ConfirmDialog';
import { getUiErrorMessage } from '../../services/uiError';
import { isSafeText } from '../../utils/formGuards';
import './SupportItTickets.css';

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

const BASE_CATEGORIES = [
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
  { value: 'HIGH', label: 'Elevee' },
  { value: 'URGENT', label: 'Urgente' },
];

const STATUS_LABELS = {
  NEW: 'Nouveau',
  IN_PROGRESS: 'En cours de resolution',
  WAITING_USER: 'En attente utilisateur',
  RESOLVED: 'Resolu, vous pouvez tester',
  CLOSED: 'Ferme',
};

const ROLE_PROFILES = {
  responsable: {
    role: 'responsable',
    title: 'Support IT responsable',
    intro: "Creez un ticket et transmettez automatiquement le contexte de navigation a l'administration.",
    createTitle: 'Creer un ticket',
    helper: 'Decrivez le probleme rencontre. Ajoutez la page, l heure ou une capture si possible.',
    defaultCategory: 'ALERTES',
    subjectLabel: 'Objet',
    subjectPlaceholder: "Ex: Les alertes ne s'affichent plus",
    messageLabel: 'Message',
    messagePlaceholder: 'Decrivez le probleme: page, periode, donnees attendues et resultat observe.',
    attachmentLabel: 'Piece jointe (optionnel)',
    attachmentButton: 'Choisir un fichier',
    quickTitle: 'Signaler rapidement',
    categories: ['DASHBOARD', 'ALERTES', 'DEMANDES', 'STOCK', 'FOURNISSEURS', 'EXPORT', 'ASSISTANT', 'COMPTE', 'AUTRE'],
    quickActions: [
      { icon: BarChart3, label: 'Probleme dashboard', title: 'Anomalie dashboard responsable', category: 'DASHBOARD', priority: 'HIGH', message: 'Le dashboard responsable affiche une donnee incoherente ou ne se charge pas correctement.' },
      { icon: Bug, label: 'Bug application', title: 'Bug application responsable', category: 'AUTRE', priority: 'NORMAL', message: 'Je rencontre un bug sur l espace responsable. Merci de verifier le contexte envoye.' },
      { icon: MessageCircle, label: 'Assistant IA', title: 'Assistant IA indisponible', category: 'ASSISTANT', priority: 'NORMAL', message: 'L assistant IA ne repond pas correctement ou semble indisponible.' },
    ],
    demoTicket: {
      _id: 'demo-responsable-ticket',
      ticketNumber: 'SUP-2026-01042',
      title: 'Erreur importation FDS',
      category: 'EXPORT',
      priority: 'NORMAL',
      status: 'RESOLVED',
      createdAt: new Date('2026-06-20T10:30:00').toISOString(),
      lastAdminReplyAt: new Date('2026-06-20T11:15:00').toISOString(),
      isDemo: true,
    },
  },
  magasinier: {
    role: 'magasinier',
    title: 'Besoin d aide ? Contacter le Support IT',
    intro: 'Signalez votre probleme en quelques secondes pour debloquer votre preparation.',
    createTitle: 'Ticket terrain',
    helper: "L'objectif est de signaler vite un blocage: scanner, imprimante, stock ou application.",
    defaultCategory: 'STOCK',
    subjectLabel: 'Probleme',
    subjectPlaceholder: 'Ex: Douchette ne lit plus les codes-barres',
    messageLabel: 'Ce qui bloque',
    messagePlaceholder: 'Expliquez brievement ce qui bloque la preparation.',
    attachmentLabel: 'Photo ou capture (optionnel)',
    attachmentButton: 'Ajouter une photo',
    quickTitle: 'Signaler rapidement',
    categories: ['STOCK', 'DEMANDES', 'AUTRE', 'COMPTE'],
    quickActions: [
      { icon: Smartphone, label: 'Probleme scanner', title: 'Probleme scanner / douchette', category: 'AUTRE', priority: 'URGENT', message: 'La douchette ou le scanner ne lit plus les codes-barres. La preparation est bloquee.' },
      { icon: PackageSearch, label: 'Stock obligatoire', title: 'Erreur de stock disponible', category: 'STOCK', priority: 'HIGH', message: 'Le systeme affiche un stock indisponible alors que la piece est physiquement presente.' },
      { icon: Printer, label: 'Erreur imprimante', title: 'Erreur impression etiquette ou bon', category: 'AUTRE', priority: 'HIGH', message: "L'imprimante ne sort pas les etiquettes ou les bons necessaires a la preparation." },
      { icon: Bug, label: 'Bug application', title: 'Bug application magasinier', category: 'DEMANDES', priority: 'HIGH', message: 'Une action de preparation ou de validation ne fonctionne pas dans l espace magasinier.' },
    ],
    demoTicket: {
      _id: 'demo-magasinier-ticket',
      ticketNumber: 'SUP-2026-01058',
      title: 'Probleme scanner / douchette',
      category: 'AUTRE',
      priority: 'URGENT',
      status: 'IN_PROGRESS',
      createdAt: new Date('2026-06-21T08:45:00').toISOString(),
      lastAdminReplyAt: new Date('2026-06-21T08:52:00').toISOString(),
      isDemo: true,
    },
  },
  demandeur: {
    role: 'demandeur',
    title: 'Besoin d aide avec le Catalogue ou vos Demandes ?',
    intro: 'Un probleme avec votre profil, votre catalogue ou une commande en cours ? Signalez-le a l equipe informatique.',
    createTitle: 'Ticket catalogue',
    helper: 'Le support recevra votre role, la page actuelle et votre profil catalogue quand il est disponible.',
    defaultCategory: 'COMPTE',
    subjectLabel: 'Sujet',
    subjectPlaceholder: 'Ex: Produit manquant dans mon catalogue',
    messageLabel: 'Votre message',
    messagePlaceholder: 'Expliquez le besoin, la reference produit ou la demande bloquee.',
    attachmentLabel: 'Capture (optionnel)',
    attachmentButton: 'Ajouter une capture',
    quickTitle: "Raccourcis d'assistance",
    categories: ['COMPTE', 'DEMANDES', 'STOCK', 'AUTRE'],
    quickActions: [
      { icon: KeyRound, label: 'Profil catalogue', title: 'Demande de profil catalogue elargi', category: 'COMPTE', priority: 'NORMAL', message: "Je dois commander un produit qui n'est pas visible avec mon profil catalogue actuel." },
      { icon: PackageSearch, label: 'Produit manquant', title: 'Produit manquant dans le catalogue', category: 'STOCK', priority: 'NORMAL', message: "Un article necessaire a mon travail n'existe pas dans le catalogue SENTINEL ETAP." },
      { icon: MessageCircle, label: 'Demande bloquee', title: 'Demande bloquee en validation', category: 'DEMANDES', priority: 'HIGH', message: "Ma demande reste bloquee sans explication visible dans le suivi." },
    ],
    demoTicket: {
      _id: 'demo-demandeur-ticket',
      ticketNumber: 'SUP-2026-01064',
      title: 'Produit manquant dans le catalogue',
      category: 'STOCK',
      priority: 'NORMAL',
      status: 'WAITING_USER',
      createdAt: new Date('2026-06-19T14:10:00').toISOString(),
      lastAdminReplyAt: new Date('2026-06-19T15:05:00').toISOString(),
      isDemo: true,
    },
  },
};

function formatDateTime(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}

function badgeStyle(kind, value) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 999,
    border: '1px solid #e2e8f0',
    fontWeight: 900,
    fontSize: 12,
  };

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

function suggestionFor(role, category) {
  if (role === 'magasinier') {
    if (category === 'STOCK') return 'Ajoutez la reference produit, la quantite vue physiquement et la demande concernee si possible.';
    if (category === 'DEMANDES') return 'Precisez le numero de demande et l etape qui bloque la preparation.';
    return 'Ajoutez une photo si le probleme concerne un scanner, une imprimante ou un terminal.';
  }
  if (role === 'demandeur') {
    if (category === 'COMPTE') return 'Mentionnez le profil catalogue attendu et le type de produits que vous devez demander.';
    if (category === 'DEMANDES') return 'Indiquez le numero de demande et le statut affiche dans Mes Demandes.';
    return 'Precisez le nom, la reference ou la famille du produit recherche.';
  }
  if (category === 'ALERTES') return 'Verifiez la periode selectionnee dans le dashboard avant d envoyer le ticket.';
  if (category === 'EXPORT') return 'Verifiez que le rapport contient des donnees avant l export.';
  if (category === 'ASSISTANT') return 'Verifiez que le service assistant est actif.';
  if (category === 'COMPTE') return 'Verifiez que vous etes bien connecte et que votre profil est complet.';
  if (category === 'STOCK') return 'Verifiez le produit concerne et la quantite affichee avant d envoyer le ticket.';
  return '';
}

export default function SupportItTickets({ role = 'responsable' }) {
  const toast = useToast();
  const confirmAction = useConfirm();
  const location = useLocation();
  const profile = ROLE_PROFILES[role] || ROLE_PROFILES.responsable;
  const categories = useMemo(
    () => BASE_CATEGORIES.filter((c) => profile.categories.includes(c.value)),
    [profile]
  );
  const defaultCategory = categories.some((c) => c.value === profile.defaultCategory)
    ? profile.defaultCategory
    : categories[0]?.value || 'AUTRE';

  const [draft, setDraft] = useState({
    title: '',
    category: defaultCategory,
    priority: 'NORMAL',
    message: '',
  });

  const [attachmentFile, setAttachmentFile] = useState(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState('');
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [tickets, setTickets] = useState([]);

  const [openTicketId, setOpenTicketId] = useState('');
  const [openTicketLoading, setOpenTicketLoading] = useState(false);
  const [openTicket, setOpenTicket] = useState(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [replySending, setReplySending] = useState(false);

  const quickHelp = useMemo(() => suggestionFor(profile.role, draft.category), [draft.category, profile.role]);

  useEffect(() => {
    setDraft((prev) => ({
      ...prev,
      category: categories.some((c) => c.value === prev.category) ? prev.category : defaultCategory,
    }));
  }, [categories, defaultCategory]);

  useEffect(() => () => {
    if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl);
  }, [attachmentPreviewUrl]);

  const contextPreview = useMemo(() => {
    const pageUrl = `${location.pathname || ''}${location.search || ''}`.slice(0, 220);
    const params = new URLSearchParams(location.search || '');
    const requestId = params.get('requestId') || params.get('demandeId') || params.get('id') || '';
    const demandeurProfile = typeof window !== 'undefined'
      ? String(sessionStorage.getItem('demandeurProfile') || '').trim()
      : '';

    const extra = [];
    if (profile.role === 'magasinier' && requestId) extra.push(`Demande: ${requestId}`);
    if (profile.role === 'demandeur') extra.push(`Profil catalogue: ${demandeurProfile || 'bureautique'}`);

    return {
      pageUrl,
      role: profile.role,
      when: new Date().toLocaleString('fr-FR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
      extra,
    };
  }, [location.pathname, location.search, profile.role]);

  const browserInfo = useMemo(() => {
    const userAgent = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
    return [`role=${contextPreview.role}`, ...contextPreview.extra, `ua=${userAgent}`].join(' | ').slice(0, 340);
  }, [contextPreview]);

  const loadMyTickets = useCallback(async () => {
    setTicketsLoading(true);
    try {
      const res = await get('/support/my-tickets?limit=12');
      setTickets(Array.isArray(res?.tickets) ? res.tickets : []);
    } catch (err) {
      setTickets([]);
      toast.error(getUiErrorMessage(err, 'Chargement tickets echoue'));
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
      toast.error(getUiErrorMessage(err, 'Chargement ticket echoue'));
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
      toast.error('Format non supporte (image ou PDF).');
      return;
    }
    if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl);
    setAttachmentFile(file);
    setAttachmentPreviewUrl(mime.startsWith('image/') ? URL.createObjectURL(file) : '');
  }, [attachmentPreviewUrl, toast]);

  const applyQuickAction = useCallback((action) => {
    setDraft({
      title: action.title,
      category: action.category,
      priority: action.priority,
      message: action.message,
    });
  }, []);

  const clearAttachment = useCallback(() => {
    if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl);
    setAttachmentPreviewUrl('');
    setAttachmentFile(null);
  }, [attachmentPreviewUrl]);

  const sendTicket = useCallback(async () => {
    const title = String(draft.title || '').trim();
    const message = String(draft.message || '').trim();
    const category = String(draft.category || '').trim().toUpperCase();
    const priority = String(draft.priority || '').trim().toUpperCase();

    if (!isSafeText(title, { min: 3, max: 120 })) {
      toast.error('Objet invalide (3-120).');
      return;
    }
    if (!categories.some((c) => c.value === category)) {
      toast.error('Categorie invalide.');
      return;
    }
    if (!PRIORITIES.some((p) => p.value === priority)) {
      toast.error('Priorite invalide.');
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

      const res = await post('/support/tickets', {
        title,
        category,
        priority,
        message,
        pageUrl: contextPreview.pageUrl,
        browserInfo,
        attachmentUrl,
      });

      const ticketNumber = res?.ticket?.ticketNumber ? ` (${res.ticket.ticketNumber})` : '';
      toast.success(`Ticket envoye au support${ticketNumber}.`);
      setDraft({ title: '', category: draft.category || defaultCategory, priority: 'NORMAL', message: '' });
      clearAttachment();
      setOpenTicketId('');
      setOpenTicket(null);
      setReplyDraft('');
      await loadMyTickets();
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Envoi ticket echoue'));
    } finally {
      setSending(false);
    }
  }, [attachmentFile, browserInfo, categories, clearAttachment, contextPreview.pageUrl, defaultCategory, draft, loadMyTickets, toast]);

  const openDetail = useCallback(async (t) => {
    if (t?.isDemo) return;
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
      toast.error('Reponse invalide (2-1200).');
      return;
    }
    setReplySending(true);
    try {
      await post(`/support/tickets/${encodeURIComponent(id)}/reply`, { message });
      toast.success('Reponse envoyee.');
      setReplyDraft('');
      await Promise.all([loadMyTickets(), loadTicketDetail(id)]);
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Envoi reponse echoue'));
    } finally {
      setReplySending(false);
    }
  }, [loadMyTickets, loadTicketDetail, openTicketId, replyDraft, toast]);

  const markResolved = useCallback(async (id) => {
    const tid = String(id || '').trim();
    if (!tid || tid.startsWith('demo-')) return;
    const confirmed = await confirmAction({
      title: 'Cloturer le ticket',
      badge: 'Support IT',
      message: 'Marquer ce ticket comme resolu ? Cette action conserve l historique des echanges.',
      confirmLabel: 'Marquer resolu',
      variant: 'success',
    });
    if (!confirmed) return;
    try {
      await patch(`/support/tickets/${encodeURIComponent(tid)}/resolve`, {});
      toast.success('Ticket marque comme resolu.');
      if (openTicketId === tid) {
        await loadTicketDetail(tid);
      }
      await loadMyTickets();
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Action echouee'));
    }
  }, [confirmAction, loadMyTickets, loadTicketDetail, openTicketId, toast]);

  const displayTickets = tickets.length ? tickets : profile.demoTicket ? [profile.demoTicket] : [];

  return (
    <div className="support-it" style={{ display: 'grid', gap: 12 }}>
      <div className="users-list" style={{ marginTop: 10 }}>
        <div className="user-item" style={{ alignItems: 'flex-start' }}>
          <div className="user-info" style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 1000, color: '#0f172a', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <Send size={18} />
                  {profile.createTitle}
                </div>
                <div style={{ marginTop: 4, fontWeight: 800, fontSize: 12.5, color: '#64748b' }}>
                  {profile.helper}
                </div>
              </div>
            </div>

            {profile.quickActions?.length ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 1000, color: '#0f172a', marginBottom: 8 }}>{profile.quickTitle}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {profile.quickActions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.title}
                        className="btn-user secondary"
                        type="button"
                        onClick={() => applyQuickAction(action)}
                        disabled={sending}
                      >
                        <Icon size={16} /> {action.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 12 }}>
              <label style={{ fontWeight: 900, fontSize: 12, color: '#64748b' }}>
                {profile.subjectLabel}
                <input
                  style={{ marginTop: 6, width: '100%', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', fontWeight: 900 }}
                  value={draft.title}
                  onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
                  placeholder={profile.subjectPlaceholder}
                  maxLength={120}
                />
              </label>
              <label style={{ fontWeight: 900, fontSize: 12, color: '#64748b' }}>
                Categorie
                <select
                  style={{ marginTop: 6, width: '100%', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', fontWeight: 900 }}
                  value={draft.category}
                  onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))}
                >
                  {categories.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontWeight: 900, fontSize: 12, color: '#64748b' }}>
                Priorite
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
                {profile.attachmentLabel}
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <label className="btn-user secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Paperclip size={16} /> {profile.attachmentButton}
                    <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleAttachmentChange} />
                  </label>
                  {attachmentFile ? (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 900, color: '#0f172a', flexWrap: 'wrap' }}>
                      {attachmentPreviewUrl ? (
                        <img
                          src={attachmentPreviewUrl}
                          alt="Apercu piece jointe"
                          style={{ width: 54, height: 42, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }}
                        />
                      ) : null}
                      <span style={{ fontSize: 12, color: '#64748b' }}>Selectionne:</span>
                      <span>{attachmentFile.name}</span>
                      <button className="btn-user secondary" type="button" onClick={clearAttachment} disabled={sending}>
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
                {profile.messageLabel}
                <textarea
                  style={{ marginTop: 6, width: '100%', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', fontWeight: 900 }}
                  value={draft.message}
                  onChange={(e) => setDraft((p) => ({ ...p, message: e.target.value }))}
                  placeholder={profile.messagePlaceholder}
                  rows={4}
                  maxLength={2000}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 10 }}>
              <div style={{ border: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: 12, padding: 10 }}>
                <div style={{ fontWeight: 1000, color: '#0f172a' }}>Aide rapide</div>
                <div style={{ marginTop: 6, fontWeight: 900, fontSize: 12.5, color: '#475569' }}>
                  {quickHelp || 'Astuce: precisez la page concernee, l heure et une capture si possible.'}
                </div>
              </div>

              <div style={{ border: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: 12, padding: 10 }}>
                <div style={{ fontWeight: 1000, color: '#0f172a' }}>Contexte envoye</div>
                <div style={{ marginTop: 6, fontWeight: 900, fontSize: 12.5, color: '#475569', lineHeight: 1.4 }}>
                  <div>Page: <span style={{ color: '#0f172a' }}>{contextPreview.pageUrl || '-'}</span></div>
                  <div>Role: <span style={{ color: '#0f172a' }}>{contextPreview.role}</span></div>
                  <div>Date: <span style={{ color: '#0f172a' }}>{contextPreview.when}</span></div>
                  {contextPreview.extra.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
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
                Mes tickets recents
              </div>
              {ticketsLoading && <div style={{ fontWeight: 900, color: '#64748b' }}>Chargement...</div>}
            </div>

            {!ticketsLoading && !tickets.length && profile.demoTicket ? (
              <div style={{ marginTop: 8, fontWeight: 900, color: '#64748b', fontSize: 12.5 }}>
                Exemple de suivi pour la demonstration. Les vrais tickets apparaitront ici apres envoi.
              </div>
            ) : null}

            <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
              {displayTickets.map((t) => {
                const id = String(t?._id || t?.ticketNumber || '');
                const isOpen = openTicketId === id;
                const status = String(t?.status || 'NEW');
                const priority = String(t?.priority || 'NORMAL');
                const categoryLabel = BASE_CATEGORIES.find((c) => c.value === t.category)?.label || t.category || '-';
                return (
                  <div key={id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, background: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 220 }}>
                        <div style={{ fontWeight: 1100, color: '#0f172a' }}>
                          {t.ticketNumber ? `${t.ticketNumber} - ` : ''}{t.title || '-'}
                        </div>
                        <div style={{ marginTop: 4, fontWeight: 900, fontSize: 12.5, color: '#64748b' }}>
                          {categoryLabel} - {formatDateTime(t.createdAt)}{t.isDemo ? ' - Demo' : ''}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={badgeStyle('priority', priority)}>{PRIORITIES.find((p) => p.value === priority)?.label || priority}</span>
                        <span style={badgeStyle('status', status)}>{STATUS_LABELS[status] || status}</span>
                      </div>
                    </div>

                    <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 900, fontSize: 12.5, color: '#475569' }}>
                        Derniere reponse admin: <span style={{ color: '#0f172a' }}>{t.lastAdminReplyAt ? formatDateTime(t.lastAdminReplyAt) : '-'}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="btn-user secondary" type="button" onClick={() => openDetail(t)} disabled={t.isDemo || (openTicketLoading && isOpen)}>
                          <Eye size={16} /> {isOpen ? 'Masquer' : 'Voir detail'}
                        </button>
                        <button className="btn-user secondary" type="button" onClick={() => { if (!isOpen) openDetail(t); }} disabled={t.isDemo || (openTicketLoading && isOpen)}>
                          Ajouter reponse
                        </button>
                        <button className="btn-user success" type="button" onClick={() => markResolved(id)} disabled={t.isDemo || status === 'CLOSED' || status === 'RESOLVED'}>
                          <CheckCircle2 size={16} /> Marquer resolu
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div style={{ marginTop: 12, borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
                        {openTicketLoading ? (
                          <div className="users-empty">Chargement du ticket...</div>
                        ) : openTicket ? (
                          <div style={{ display: 'grid', gap: 12 }}>
                            <div style={{ display: 'grid', gap: 8 }}>
                              <div style={{ fontWeight: 1000, color: '#0f172a' }}>Detail</div>
                              <div style={{ fontWeight: 900, color: '#334155', whiteSpace: 'pre-wrap' }}>{openTicket.message || '-'}</div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                                <div style={{ fontWeight: 900, fontSize: 12.5, color: '#475569' }}>
                                  Page: <span style={{ color: '#0f172a' }}>{openTicket.pageUrl || '-'}</span>
                                </div>
                                <div style={{ fontWeight: 900, fontSize: 12.5, color: '#475569' }}>
                                  Contexte: <span style={{ color: '#0f172a' }}>{openTicket.browserInfo ? 'Detecte' : '-'}</span>
                                </div>
                              </div>
                              {openTicket.attachmentUrl ? (
                                <div style={{ fontWeight: 900, fontSize: 12.5, color: '#475569' }}>
                                  Piece jointe: <a href={openTicket.attachmentUrl} style={{ color: '#1d4ed8', fontWeight: 1000, textDecoration: 'underline' }} target="_blank" rel="noreferrer">Ouvrir</a>
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
                                  <div style={{ fontWeight: 900, color: '#64748b' }}>Aucune reponse pour le moment.</div>
                                )}
                              </div>
                            </div>

                            <div style={{ display: 'grid', gap: 8 }}>
                              <div style={{ fontWeight: 1000, color: '#0f172a' }}>Ajouter une reponse</div>
                              <textarea
                                style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', fontWeight: 900 }}
                                value={replyDraft}
                                onChange={(e) => setReplyDraft(e.target.value)}
                                rows={3}
                                maxLength={1200}
                                placeholder="Ecrivez votre reponse..."
                              />
                              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <button className="btn-user success" type="button" onClick={sendReply} disabled={replySending || !replyDraft.trim()}>
                                  {replySending ? 'Envoi...' : 'Envoyer reponse'}
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
          </div>
        </div>
      </div>
    </div>
  );
}
