 import { useState, useRef, useEffect } from 'react';
 import { Send, User, Search } from 'lucide-react';
 import SidebarResp from '../../components/responsable/SidebarResp';
 import HeaderPage from '../../components/shared/HeaderPage';
 import './ChatResp.css';

 const mockMagasiniers = [
   { id: 1, nom: 'Ahmed Ben Ali', online: true, lastMessage: 'Je vous en prie.', time: '09:25' },
   { id: 2, nom: 'Mohamed Sassi', online: false, lastMessage: 'Entree effectuee.', time: 'Hier' },
 ];

 const mockMessages = {
   1: [
     { id: 1, sender: 'responsable', text: 'Bonjour, avez-vous recu le stock de cables?', time: '09:15' },
     { id: 2, sender: 'magasinier', text: 'Oui, je viens de faire l\'entree. 100 unites.', time: '09:20' },
     { id: 3, sender: 'responsable', text: 'Parfait, merci pour la rapidite.', time: '09:22' },
     { id: 4, sender: 'magasinier', text: 'Je vous en prie.', time: '09:25' },
   ],
   2: [
     { id: 1, sender: 'magasinier', text: 'Entree effectuee.', time: 'Hier' },
   ],
 };

 const ChatResp = ({ userName, onLogout }) => {
   const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
   const [selectedContact, setSelectedContact] = useState(mockMagasiniers[0]);
   const [messages, setMessages] = useState(mockMessages);
   const [newMessage, setNewMessage] = useState('');
   const [searchQuery, setSearchQuery] = useState('');
   const messagesEndRef = useRef(null);

   const scrollToBottom = () => {
     messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
   };

   useEffect(() => {
     scrollToBottom();
   }, [messages, selectedContact]);

   const handleSendMessage = (e) => {
     e.preventDefault();
     if (!newMessage.trim()) return;

     const message = {
       id: Date.now(),
       sender: 'responsable',
       text: newMessage,
       time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
     };

     setMessages(prev => ({
       ...prev,
       [selectedContact.id]: [...(prev[selectedContact.id] || []), message]
     }));
     setNewMessage('');
   };

   const filteredMagasiniers = mockMagasiniers.filter(m =>
     m.nom.toLowerCase().includes(searchQuery.toLowerCase())
   );

   return (
     <div className="app-layout">
       <SidebarResp 
         collapsed={sidebarCollapsed} 
         onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
         onLogout={onLogout}
       />
       
       <div className="main-container">
         <HeaderPage 
           userName={userName}
           title="Chat Magasiniers"
           showSearch={false}
         />
         
         <main className="main-content chat-main">
           <div className="chat-container resp">
             {/* Contacts sidebar */}
             <div className="chat-contacts">
               <div className="contacts-header">
                 <h3>Magasiniers</h3>
               </div>
               <div className="contacts-search">
                 <div className="contacts-search-input">
                   <Search size={16} />
                   <input
                     type="text"
                     placeholder="Rechercher..."
                     value={searchQuery}
                     onChange={(e) => setSearchQuery(e.target.value)}
                   />
                 </div>
               </div>
               <div className="contacts-list">
                 {filteredMagasiniers.map(contact => (
                   <div
                     key={contact.id}
                     className={`contact-item ${selectedContact?.id === contact.id ? 'active' : ''}`}
                     onClick={() => setSelectedContact(contact)}
                   >
                     <div className="contact-avatar mag">
                       <User size={20} />
                       {contact.online && <span className="online-indicator"></span>}
                     </div>
                     <div className="contact-info">
                       <span className="contact-name">{contact.nom}</span>
                       <span className="contact-last-message">{contact.lastMessage}</span>
                     </div>
                     <span className="contact-time">{contact.time}</span>
                   </div>
                 ))}
               </div>
             </div>

             {/* Chat area */}
             <div className="chat-area">
               {selectedContact ? (
                 <>
                   <div className="chat-header">
                     <div className="chat-contact-info">
                       <div className="contact-avatar mag">
                         <User size={20} />
                       </div>
                       <div>
                         <span className="contact-name">{selectedContact.nom}</span>
                         <span className="contact-status">
                           {selectedContact.online ? 'En ligne' : 'Hors ligne'}
                         </span>
                       </div>
                     </div>
                   </div>

                   <div className="chat-messages">
                     {(messages[selectedContact.id] || []).map(msg => (
                       <div 
                         key={msg.id} 
                         className={`message ${msg.sender === 'responsable' ? 'sent' : 'received'}`}
                       >
                         <div className="message-bubble">
                           <p>{msg.text}</p>
                           <span className="message-time">{msg.time}</span>
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
                       placeholder="Ecrire un message..."
                     />
                     <button type="submit" className="resp" disabled={!newMessage.trim()}>
                       <Send size={20} />
                     </button>
                   </form>
                 </>
               ) : (
                 <div className="chat-empty">
                   <p>Selectionnez un magasinier</p>
                 </div>
               )}
             </div>
           </div>
         </main>
       </div>
     </div>
   );
 };

 export default ChatResp;