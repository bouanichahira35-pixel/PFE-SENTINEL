import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Bot, Send, User, Sparkles, Trash2 } from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import './ChatbotResp.css';

const mockResponses = [
  "D'apres l'analyse des donnees, le produit 'Papier A4' presente une consommation anormale de +35% ce mois-ci.",
  "Il y a actuellement 3 produits a risque de rupture : Ecran 24 pouces, Clavier mecanique, et Cartouche encre noire.",
  "Je recommande de commander 50 unites supplementaires de Papier A4 pour eviter une rupture dans les 15 prochains jours.",
  "L'analyse predictive suggere que la demande de Cable HDMI va augmenter de 20% le mois prochain.",
  "Les produits informatiques representent 45% des sorties de stock ce trimestre.",
  "Le temps moyen de rotation des stocks est de 18 jours pour les fournitures de bureau.",
];

const ChatbotResp = ({ userName, onLogout }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'bot',
      content: 'Bonjour ! Je suis votre assistant IA pour la gestion de stock. Comment puis-je vous aider ?',
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isTyping) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: inputValue,
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    setTimeout(() => {
      const botResponse = {
        id: Date.now() + 1,
        type: 'bot',
        content: mockResponses[Math.floor(Math.random() * mockResponses.length)],
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, botResponse]);
      setIsTyping(false);
    }, 1500);
  }, [inputValue, isTyping]);

  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleSuggestionClick = useCallback((suggestion) => {
    setInputValue(suggestion);
    inputRef.current?.focus();
  }, []);

  const clearConversation = useCallback(() => {
    setMessages([{
      id: 1,
      type: 'bot',
      content: 'Bonjour ! Je suis votre assistant IA pour la gestion de stock. Comment puis-je vous aider ?',
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    }]);
  }, []);

  const suggestions = useMemo(() => [
    "Quels produits sont a risque ?",
    "Analyse de la consommation mensuelle",
    "Recommandations de commande",
    "Alertes en cours",
    "Produits les plus demandes",
    "Previsions pour le mois prochain"
  ], []);

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
          title="Assistant IA"
          showSearch={false}
        />
        
        <main className="main-content chatbot-main">
          <div className="chatbot-container">
            <div className="chatbot-header">
              <div className="chatbot-avatar">
                <Bot size={24} />
              </div>
              <div className="chatbot-info">
                <h2>Assistant Stock IA</h2>
                <span className="chatbot-status">
                  <Sparkles size={12} />
                  En ligne
                </span>
              </div>
              <button 
                className="clear-chat-btn"
                onClick={clearConversation}
                title="Effacer la conversation"
                aria-label="Effacer la conversation"
              >
                <Trash2 size={18} />
              </button>
            </div>

            <div className="chatbot-messages" role="log" aria-live="polite">
              {messages.map((message) => (
                <div 
                  key={message.id} 
                  className={`message ${message.type}`}
                >
                  <div className="message-avatar" aria-hidden="true">
                    {message.type === 'bot' ? <Bot size={18} /> : <User size={18} />}
                  </div>
                  <div className="message-content">
                    <p>{message.content}</p>
                    <span className="message-time">{message.time}</span>
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="message bot typing">
                  <div className="message-avatar" aria-hidden="true">
                    <Bot size={18} />
                  </div>
                  <div className="message-content">
                    <div className="typing-indicator" aria-label="L'assistant ecrit...">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="chatbot-suggestions">
              <p className="suggestions-label">Suggestions rapides :</p>
              <div className="suggestions-grid">
                {suggestions.map((suggestion, index) => (
                  <button 
                    key={index}
                    className="suggestion-btn"
                    onClick={() => handleSuggestionClick(suggestion)}
                    aria-label={`Suggerer: ${suggestion}`}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>

            <div className="chatbot-input">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Posez votre question..."
                disabled={isTyping}
                aria-label="Message pour l'assistant"
              />
              <button 
                className="send-btn"
                onClick={handleSend}
                disabled={!inputValue.trim() || isTyping}
                aria-label="Envoyer le message"
              >
                {isTyping ? <LoadingSpinner size="small" /> : <Send size={20} />}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ChatbotResp;
