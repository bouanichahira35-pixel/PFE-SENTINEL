// BLOC 1 - Role du fichier.
// Ce fichier affiche une page de l'espace magasinier pour ChatMag.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import { get, post } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import { useUiLanguage } from '../../utils/uiLanguage';
import './ChatMag.css';

/* Retourne les 2 premières initiales d'un nom d'utilisateur */
const getInitials = (name = '') => {
  const parts = String(name).trim().split(/[\s._@-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return String(name).slice(0, 2).toUpperCase() || '?';
};

const ChatMag = ({ userName, onLogout }) => {
  const lang = useUiLanguage();
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false)
  );
  const [contacts, setContacts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);

  const i18n = {
    fr: {
      title: 'Chat',
      contacts: 'Responsables',
      online: 'En ligne',
      offline: 'Hors ligne',
      write: 'Écrire un message...',
      select: 'Sélectionnez une conversation',
      selectHint: 'Choisissez un responsable dans la liste pour démarrer',
      failContacts: 'Chargement contacts échoué',
      failMessages: 'Chargement messages échoué',
      failSend: 'Envoi message échoué',
    },
    en: {
      title: 'Chat',
      contacts: 'Managers',
      online: 'Online',
      offline: 'Offline',
      write: 'Write a message...',
      select: 'Select a conversation',
      selectHint: 'Choose a manager from the list to start',
      failContacts: 'Failed to load contacts',
      failMessages: 'Failed to load messages',
      failSend: 'Failed to send message',
    },
    ar: {
      title: 'الدردشة',
      contacts: 'المسؤولون',
      online: 'متصل',
      offline: 'غير متصل',
      write: 'اكتب رسالة...',
      select: 'اختر محادثة',
      selectHint: 'اختر مسؤولاً من القائمة للبدء',
      failContacts: 'فشل تحميل جهات الاتصال',
      failMessages: 'فشل تحميل الرسائل',
      failSend: 'فشل إرسال الرسالة',
    },
  }[lang];

  /* ── Chargement contacts (inchangé) ── */
  const loadContacts = useCallback(async () => {
    try {
      const items = await get('/chat/contacts');
      setContacts(items || []);
      if (!selectedContact && items?.length > 0) setSelectedContact(items[0]);
    } catch (err) {
      toast.error(err.message || i18n.failContacts);
    }
  }, [selectedContact, toast, i18n.failContacts]);

  /* ── Conversation directe (inchangé) ── */
  const ensureConversation = useCallback(async (contactId) => {
    if (!contactId) return '';
    const conv = await post('/chat/conversations/direct', { user_id: contactId });
    const id = conv?._id || '';
    setConversationId(id);
    return id;
  }, []);

  /* ── Chargement messages (inchangé) ── */
  const loadMessages = useCallback(async (convId) => {
    if (!convId) return;
    try {
      const items = await get(`/chat/messages/${convId}`);
      setMessages(items || []);
    } catch (err) {
      toast.error(err.message || i18n.failMessages);
    }
  }, [toast, i18n.failMessages]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  useEffect(() => {
    const run = async () => {
      if (!selectedContact?._id) return;
      const id = await ensureConversation(selectedContact._id);
      await loadMessages(id);
    };
    run();
  }, [selectedContact, ensureConversation, loadMessages]);

  /* Polling 5 s (inchangé) */
  useEffect(() => {
    if (!conversationId) return undefined;
    const timer = setInterval(() => { loadMessages(conversationId); }, 5000);
    return () => clearInterval(timer);
  }, [conversationId, loadMessages]);

  /* Auto-scroll (inchangé) */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* ── Envoi message (inchangé) ── */
  const handleSendMessage = async (e) => {
    e.preventDefault();
    const text = String(newMessage || '').trim();
    if (!text || !conversationId) return;
    setNewMessage('');
    try {
      const created = await post(`/chat/messages/${conversationId}`, { message: text });
      setMessages((prev) => [...prev, created]);
    } catch (err) {
      toast.error(err.message || i18n.failSend);
      setNewMessage(text);
    }
  };

  const contactLabel = useMemo(
    () => selectedContact?.username || 'Responsable',
    [selectedContact]
  );

  /* ════════════════════════════════════════════════════════════
     RENDU
  ════════════════════════════════════════════════════════════ */
  return (
    <div className="app-layout">
      <div
        className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`}
        onClick={() => setSidebarCollapsed(true)}
      />
      <SidebarMag
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onLogout={onLogout}
        userName={userName}
      />

      <div className="main-container">
        <HeaderPage
          userName={userName}
          title={i18n.title}
          showSearch={false}
          onMenuClick={() => setSidebarCollapsed((prev) => !prev)}
        />

        <main className="main-content chat-main">
          <div className="chat-container">

            {/* ══ LISTE CONTACTS ══ */}
            <div className="chat-contacts">
              <div className="contacts-header">
                <h3>{i18n.contacts}</h3>
              </div>

              <div className="contacts-list">
                {contacts.map((contact) => (
                  <div
                    key={contact._id}
                    className={`contact-item ${selectedContact?._id === contact._id ? 'active' : ''}`}
                    onClick={() => setSelectedContact(contact)}
                  >
                    {/* Avatar avec initiales au lieu de l'icône générique */}
                    <div className="contact-avatar">
                      {getInitials(contact.username)}
                      {contact.status === 'active' && (
                        <span className="online-indicator" />
                      )}
                    </div>
                    <div className="contact-info">
                      <span className="contact-name">{contact.username}</span>
                      <span className="contact-last-message">
                        {contact.email || ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ══ ZONE CONVERSATION ══ */}
            <div className="chat-area">
              {selectedContact ? (
                <>
                  {/* En-tête */}
                  <div className="chat-header">
                    <div className="chat-contact-info">
                      <div className="contact-avatar">
                        {getInitials(contactLabel)}
                      </div>
                      <div>
                        <span className="contact-name">{contactLabel}</span>
                        <span className="contact-status">
                          {selectedContact.status === 'active'
                            ? i18n.online
                            : i18n.offline}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="chat-messages">
                    {messages.map((msg) => (
                      <div
                        key={msg._id}
                        className={`message ${msg.sender_role === 'magasinier' ? 'sent' : 'received'}`}
                      >
                        <div className="message-bubble">
                          <p>{msg.message}</p>
                          <span className="message-time">
                            {new Date(msg.createdAt).toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Saisie */}
                  <form className="chat-input" onSubmit={handleSendMessage}>
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder={i18n.write}
                    />
                    <button
                      type="submit"
                      disabled={!String(newMessage || '').trim()}
                      aria-label="Envoyer"
                    >
                      <Send size={18} />
                    </button>
                  </form>
                </>
              ) : (
                /* État vide amélioré */
                <div className="chat-empty">
                  <div className="chat-empty-icon">
                    <MessageSquare size={26} />
                  </div>
                  <p>{i18n.select}</p>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                    {i18n.selectHint}
                  </span>
                </div>
              )}
            </div>

          </div>
        </main>
      </div>
    </div>
  );
};

export default ChatMag;
