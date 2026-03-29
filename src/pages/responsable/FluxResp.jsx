import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Activity, AlertTriangle, Info, Send, Search, MessageSquareText } from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import { get, post } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import { useUiLanguage } from '../../utils/uiLanguage';
import './FluxResp.css';

function useQueryParam(name) {
  const location = useLocation();
  return useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    return params.get(name);
  }, [location.search, name]);
}

function severityIcon(sev) {
  if (sev === 'critical') return AlertTriangle;
  if (sev === 'warning') return AlertTriangle;
  return Info;
}

const FluxResp = ({ userName, onLogout }) => {
  const lang = useUiLanguage();
  const toast = useToast();
  const openHistoryId = useQueryParam('h');

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState('');
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef(null);

  const i18n = {
    fr: {
      title: 'Flux Opérationnel',
      subtitle: 'Fil d’activité + discussions décisionnelles (threads)',
      feed: 'Événements',
      thread: 'Discussion',
      empty: 'Aucun événement récent.',
      select: 'Sélectionnez un événement pour démarrer une discussion.',
      search: 'Rechercher...',
      write: 'Écrire un message...',
      failFeed: 'Chargement du flux échoué',
      failThread: 'Ouverture du thread échouée',
      failMessages: 'Chargement des messages échoué',
      failSend: 'Envoi du message échoué',
      startThread: 'Ouvrir le thread',
    },
    en: {
      title: 'Operational Feed',
      subtitle: 'Activity feed + decision threads',
      feed: 'Events',
      thread: 'Thread',
      empty: 'No recent events.',
      select: 'Select an event to start a discussion.',
      search: 'Search...',
      write: 'Write a message...',
      failFeed: 'Failed to load feed',
      failThread: 'Failed to open thread',
      failMessages: 'Failed to load messages',
      failSend: 'Failed to send message',
      startThread: 'Open thread',
    },
    ar: {
      title: 'Flux Opérationnel',
      subtitle: 'Fil d’activité + discussions décisionnelles',
      feed: 'Événements',
      thread: 'Discussion',
      empty: 'Aucun événement récent.',
      select: 'Sélectionnez un événement.',
      search: 'Rechercher...',
      write: 'Écrire un message...',
      failFeed: 'Chargement du flux échoué',
      failThread: 'Ouverture du thread échouée',
      failMessages: 'Chargement des messages échoué',
      failSend: 'Envoi du message échoué',
      startThread: 'Ouvrir le thread',
    },
  }[lang];

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      const res = await get('/feed?limit=80');
      setItems(Array.isArray(res?.items) ? res.items : []);
    } catch (err) {
      toast.error(err.message || i18n.failFeed);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [toast, i18n.failFeed]);

  const ensureThreadConversation = useCallback(async (historyId) => {
    if (!historyId) return '';
    try {
      const conv = await post('/chat/conversations/thread', { history_id: historyId });
      const id = conv?._id || '';
      setConversationId(id);
      return id;
    } catch (err) {
      toast.error(err.message || i18n.failThread);
      return '';
    }
  }, [toast, i18n.failThread]);

  const loadMessages = useCallback(async (convId) => {
    if (!convId) return;
    try {
      const list = await get(`/chat/messages/${convId}`);
      setMessages(Array.isArray(list) ? list : []);
    } catch (err) {
      toast.error(err.message || i18n.failMessages);
      setMessages([]);
    }
  }, [toast, i18n.failMessages]);

  const openThreadFor = useCallback(async (historyId) => {
    setSelectedHistoryId(historyId);
    const convId = await ensureThreadConversation(historyId);
    if (convId) await loadMessages(convId);
  }, [ensureThreadConversation, loadMessages]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    if (openHistoryId) {
      openThreadFor(openHistoryId);
    }
  }, [openHistoryId, openThreadFor]);

  useEffect(() => {
    if (!conversationId) return undefined;
    const timer = setInterval(() => {
      loadMessages(conversationId);
    }, 5000);
    return () => clearInterval(timer);
  }, [conversationId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const filtered = useMemo(() => {
    const q = String(searchQuery || '').trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const hay = `${it.title || ''} ${it.subtitle || ''} ${it.action_type || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, searchQuery]);

  const selectedItem = useMemo(
    () => filtered.find((it) => String(it._id) === String(selectedHistoryId)) || items.find((it) => String(it._id) === String(selectedHistoryId)) || null,
    [filtered, items, selectedHistoryId]
  );

  const handleSend = useCallback(async (e) => {
    e.preventDefault();
    const text = String(newMessage || '').trim();
    if (!text || !conversationId) return;
    setNewMessage('');
    try {
      const created = await post(`/chat/messages/${conversationId}`, { message: text });
      setMessages((prev) => [...prev, created]);
    } catch (err) {
      toast.error(err.message || i18n.failSend);
    }
  }, [newMessage, conversationId, toast, i18n.failSend]);

  return (
    <div className="flux-resp-layout">
      <SidebarResp
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((prev) => !prev)}
        onLogout={onLogout}
        userName={userName}
      />
      <div className={`flux-resp-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <HeaderPage title={i18n.title} subtitle={i18n.subtitle} icon={<Activity size={24} />} />

        <div className="flux-resp-content">
          <section className="flux-feed">
            <div className="flux-feed-head">
              <div className="flux-feed-title">
                <MessageSquareText size={18} />
                <span>{i18n.feed}</span>
              </div>
              <div className="flux-feed-search">
                <Search size={16} />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={i18n.search}
                />
              </div>
            </div>

            <div className="flux-feed-body">
              {loading && <div className="flux-empty">{'Chargement...'}</div>}
              {!loading && filtered.length === 0 && <div className="flux-empty">{i18n.empty}</div>}
              {!loading && filtered.map((it) => {
                const Icon = severityIcon(it.severity);
                const active = String(selectedHistoryId) === String(it._id);
                return (
                  <button
                    key={String(it._id)}
                    className={`flux-item ${active ? 'active' : ''} sev-${it.severity || 'info'}`}
                    onClick={() => openThreadFor(String(it._id))}
                    type="button"
                  >
                    <div className="flux-item-icon" aria-hidden="true">
                      <Icon size={16} />
                    </div>
                    <div className="flux-item-text">
                      <div className="flux-item-title">{it.title}</div>
                      <div className="flux-item-sub">{it.subtitle}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="flux-thread">
            <div className="flux-thread-head">
              <div className="flux-thread-title">{i18n.thread}</div>
              {selectedItem && (
                <div className="flux-thread-meta">
                  <span className={`pill sev-${selectedItem.severity || 'info'}`}>{selectedItem.action_type}</span>
                </div>
              )}
            </div>

            {!selectedItem ? (
              <div className="flux-thread-empty">{i18n.select}</div>
            ) : (
              <>
                <div className="flux-thread-context">
                  <div className="ctx-title">{selectedItem.title}</div>
                  <div className="ctx-sub">{selectedItem.subtitle}</div>
                </div>

                <div className="flux-thread-messages" role="log" aria-live="polite">
                  {messages.map((m) => (
                    <div
                      key={String(m?._id || m?.id || Math.random())}
                      className={`thread-msg ${String(m?.sender?.username || '') === String(sessionStorage.getItem('userName') || userName || '') ? 'me' : ''}`}
                    >
                      <div className="thread-msg-head">
                        <span className="thread-msg-sender">{m?.sender?.username || 'Utilisateur'}</span>
                        <span className="thread-msg-time">
                          {m?.createdAt ? new Date(m.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                      <div className="thread-msg-body">{m?.message}</div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                <form className="flux-thread-input" onSubmit={handleSend}>
                  <input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder={i18n.write}
                    disabled={!conversationId}
                  />
                  <button type="submit" disabled={!conversationId || !newMessage.trim()}>
                    <Send size={18} />
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default FluxResp;
