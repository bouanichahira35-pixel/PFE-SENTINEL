import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, User } from 'lucide-react';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import { get, post } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import { useUiLanguage } from '../../utils/uiLanguage';
import './ChatMag.css';

const ChatMag = ({ userName, onLogout }) => {
  const lang = useUiLanguage();
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
      write: 'Ecrire un message...',
      select: 'Selectionnez une conversation',
      failContacts: 'Chargement contacts echoue',
      failMessages: 'Chargement messages echoue',
      failSend: 'Envoi message echoue',
    },
    en: {
      title: 'Chat',
      contacts: 'Managers',
      online: 'Online',
      offline: 'Offline',
      write: 'Write a message...',
      select: 'Select a conversation',
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
      failContacts: 'فشل تحميل جهات الاتصال',
      failMessages: 'فشل تحميل الرسائل',
      failSend: 'فشل إرسال الرسالة',
    },
  }[lang];

  const loadContacts = useCallback(async () => {
    try {
      const items = await get('/chat/contacts');
      setContacts(items || []);
      if (!selectedContact && items?.length > 0) setSelectedContact(items[0]);
    } catch (err) {
      toast.error(err.message || i18n.failContacts);
    }
  }, [selectedContact, toast, i18n.failContacts]);

  const ensureConversation = useCallback(async (contactId) => {
    if (!contactId) return '';
    const conv = await post('/chat/conversations/direct', { user_id: contactId });
    const id = conv?._id || '';
    setConversationId(id);
    return id;
  }, []);

  const loadMessages = useCallback(async (convId) => {
    if (!convId) return;
    try {
      const items = await get(`/chat/messages/${convId}`);
      setMessages(items || []);
    } catch (err) {
      toast.error(err.message || i18n.failMessages);
    }
  }, [toast, i18n.failMessages]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    const run = async () => {
      if (!selectedContact?._id) return;
      const id = await ensureConversation(selectedContact._id);
      await loadMessages(id);
    };
    run();
  }, [selectedContact, ensureConversation, loadMessages]);

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

  const contactLabel = useMemo(() => selectedContact?.username || 'Responsable', [selectedContact]);

  return (
    <div className="app-layout">
      <SidebarMag
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onLogout={onLogout}
        userName={userName}
      />

      <div className="main-container">
        <HeaderPage userName={userName} title={i18n.title} showSearch={false} />

        <main className="main-content chat-main">
          <div className="chat-container">
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
                    <div className="contact-avatar">
                      <User size={20} />
                      {contact.status === 'active' && <span className="online-indicator"></span>}
                    </div>
                    <div className="contact-info">
                      <span className="contact-name">{contact.username}</span>
                      <span className="contact-last-message">{contact.email || ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="chat-area">
              {selectedContact ? (
                <>
                  <div className="chat-header">
                    <div className="chat-contact-info">
                      <div className="contact-avatar"><User size={20} /></div>
                      <div>
                        <span className="contact-name">{contactLabel}</span>
                        <span className="contact-status">{selectedContact.status === 'active' ? i18n.online : i18n.offline}</span>
                      </div>
                    </div>
                  </div>

                  <div className="chat-messages">
                    {messages.map((msg) => (
                      <div
                        key={msg._id}
                        className={`message ${msg.sender_role === 'magasinier' ? 'sent' : 'received'}`}
                      >
                        <div className="message-bubble">
                          <p>{msg.message}</p>
                          <span className="message-time">
                            {new Date(msg.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  <form className="chat-input" onSubmit={handleSendMessage}>
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder={i18n.write}
                    />
                    <button type="submit" disabled={!String(newMessage || '').trim()}>
                      <Send size={20} />
                    </button>
                  </form>
                </>
              ) : (
                <div className="chat-empty">
                  <p>{i18n.select}</p>
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
