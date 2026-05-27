 import { useState, useRef, useEffect } from 'react';
 import { Send, User, Search } from 'lucide-react';
 import SidebarMag from '../../components/magasinier/SidebarMag';
 import HeaderPage from '../../components/shared/HeaderPage';
 import './ChatMag.css';

 const mockResponsables = [
   { id: 1, nom: 'Mohamed Responsable', online: true, lastMessage: 'D\'accord, je valide', time: '10:30' },
 ];

 const mockMessages = {
   1: [
     { id: 1, sender: 'responsable', text: 'Bonjour, avez-vous recu le stock de cables?', time: '09:15' },
     { id: 2, sender: 'magasinier', text: 'Oui, je viens de faire l\'entree. 100 unites.', time: '09:20' },
     { id: 3, sender: 'responsable', text: 'Parfait, merci pour la rapidite.', time: '09:22' },
     { id: 4, sender: 'magasinier', text: 'Je vous en prie. Y a-t-il autre chose?', time: '09:25' },
     { id: 5, sender: 'responsable', text: 'D\'accord, je valide', time: '10:30' },
   ],
 };

 const ChatMag = ({ userName, onLogout }) => {
   const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
   const [selectedContact, setSelectedContact] = useState(mockResponsables[0]);
   const [messages, setMessages] = useState(mockMessages);
   const [newMessage, setNewMessage] = useState('');
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
       sender: 'magasinier',
       text: newMessage,
       time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
     };

     setMessages(prev => ({
       ...prev,
       [selectedContact.id]: [...(prev[selectedContact.id] || []), message]
     }));
     setNewMessage('');
   };

   return (
     <div className="app-layout">
       <SidebarMag 
         collapsed={sidebarCollapsed} 
         onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
         onLogout={onLogout}
       />
       
       <div className="main-container">
         <HeaderPage 
           userName={userName}
           title="Chat"
           showSearch={false}
         />
         
         <main className="main-content chat-main">
           <div className="chat-container">
             {/* Contacts sidebar */}
             <div className="chat-contacts">
               <div className="contacts-header">
                 <h3>Responsable</h3>
               </div>
               <div className="contacts-list">
                 {mockResponsables.map(contact => (
                   <div
                     key={contact.id}
                     className={`contact-item ${selectedContact?.id === contact.id ? 'active' : ''}`}
                     onClick={() => setSelectedContact(contact)}
                   >
                     <div className="contact-avatar">
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
                       <div className="contact-avatar">
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
                         className={`message ${msg.sender === 'magasinier' ? 'sent' : 'received'}`}
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
                     <button type="submit" disabled={!newMessage.trim()}>
                       <Send size={20} />
                     </button>
                   </form>
                 </>
               ) : (
                 <div className="chat-empty">
                   <p>Selectionnez une conversation</p>
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