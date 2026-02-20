import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Bot, 
  Send, 
  User, 
  Sparkles, 
  Trash2,
  Mic,
  MicOff, 
  Volume2, 
  PhoneCall, 
  FileText, 
  Circle, 
  Square, 
  Upload,
  X,
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get, post } from '../../services/api';
import './ChatbotResp.css';

const VOICE_LOCALE = 'fr-FR';

function nowLabel() {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function makeBotMessage(content, extra = {}) {
  return {
    id: Date.now() + Math.floor(Math.random() * 10000),
    type: 'bot',
    content: String(content || ''),
    time: nowLabel(),
    source: extra.source || '',
    mode: extra.mode || 'chat',
  };
}

function makeUserMessage(content) {
  return {
    id: Date.now() + Math.floor(Math.random() * 10000),
    type: 'user',
    content: String(content || ''),
    time: nowLabel(),
  };
}

const INITIAL_BOT_TEXT =
  "Bonjour. Je suis votre assistant stock. Posez-moi une question, dictez un message vocal, ou demandez un mini-rapport.";

const ChatbotResp = ({ userName, onLogout }) => {
  const location = useLocation();
  const toast = useToast();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [messages, setMessages] = useState([makeBotMessage(INITIAL_BOT_TEXT, { source: 'local', mode: 'chat' })]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [mediaRecorderSupported, setMediaRecorderSupported] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [callMode, setCallMode] = useState(false);
  const [copilotTopRisk, setCopilotTopRisk] = useState([]);
  const [geminiConfigured, setGeminiConfigured] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceBlob, setVoiceBlob] = useState(null);
  const [voiceUrl, setVoiceUrl] = useState('');
  const [isSendingVoice, setIsSendingVoice] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const messagesRef = useRef(messages);
  const recognitionRef = useRef(null);
  const sendQuestionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const voiceUrlRef = useRef('');

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    voiceUrlRef.current = voiceUrl;
  }, [voiceUrl]);

  const stopSpeaking = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
  }, []);

  const normalizeForSpeech = useCallback((text) => (
    String(text || '')
      .replace(/[#*_`>|]/g, ' ')
      .replace(/\n+/g, '. ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  ), []);

  const speakText = useCallback((text) => {
    if (!ttsSupported || typeof window === 'undefined' || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    const cleaned = normalizeForSpeech(text).slice(0, 1200);
    if (!cleaned) return;

    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(cleaned);
    utterance.lang = VOICE_LOCALE;
    utterance.rate = 1;
    utterance.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find((v) => String(v.lang || '').toLowerCase().startsWith('fr'));
    if (preferred) utterance.voice = preferred;
    window.speechSynthesis.speak(utterance);
  }, [normalizeForSpeech, ttsSupported]);

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch (_) {
      // noop
    }
  }, []);

  const startListening = useCallback(() => {
    if (!speechSupported || isTyping) return;
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.lang = VOICE_LOCALE;
      recognition.continuous = Boolean(callMode);
      recognition.start();
    } catch (_) {
      // noop
    }
  }, [callMode, isTyping, speechSupported]);

  const buildHistoryPayload = useCallback((snapshot) => {
    const base = Array.isArray(snapshot) ? snapshot : messagesRef.current;
    return base
      .slice(-16)
      .map((m) => ({
        role: m.type === 'bot' ? 'model' : 'user',
        text: String(m.content || ''),
      }));
  }, []);

  const downloadReport = useCallback((reportText) => {
    const content = String(reportText || '').trim();
    if (!content) return;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mini_rapport_stock_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  const blobToBase64 = useCallback((blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const raw = String(reader.result || '');
      const commaIdx = raw.indexOf(',');
      resolve(commaIdx >= 0 ? raw.slice(commaIdx + 1) : raw);
    };
    reader.onerror = () => reject(new Error('Impossible de lire le fichier vocal'));
    reader.readAsDataURL(blob);
  }), []);

  const sendQuestion = useCallback(async (questionRaw, options = {}) => {
    const question = String(questionRaw || '').trim();
    if (!question || isTyping) return null;

    const mode = options.mode === 'report' ? 'report' : 'chat';
    const includeUserMessage = options.includeUserMessage !== false;
    const userLabel = options.userLabel || question;

    if (isListening) stopListening();

    let historySnapshot = messagesRef.current;
    if (includeUserMessage) {
      const userMessage = makeUserMessage(userLabel);
      historySnapshot = [...historySnapshot, userMessage];
      setMessages((prev) => [...prev, userMessage]);
    }

    setIsTyping(true);
    try {
      const result = await post('/ai/assistant/ask', {
        question,
        history: buildHistoryPayload(historySnapshot),
        mode,
      });
      const answer = String(result?.answer || "Je n'ai pas pu generer une reponse.");
      const source = String(result?.source || 'fallback');
      setMessages((prev) => [...prev, makeBotMessage(answer, { source, mode })]);

      if (mode === 'report') {
        downloadReport(answer);
        toast.success('Mini-rapport genere et exporte.');
      } else if (autoSpeak) {
        speakText(answer);
      }

      return result;
    } catch (err) {
      toast.error(err.message || 'Erreur assistant');
      const fallback =
        "Je ne peux pas repondre pour le moment. Verifiez la connexion du service LLM et reessayez.";
      setMessages((prev) => [...prev, makeBotMessage(fallback, { source: 'local', mode })]);
      return null;
    } finally {
      setIsTyping(false);
      if (callMode && mode === 'chat') {
        setTimeout(() => startListening(), 450);
      }
    }
  }, [
    autoSpeak,
    buildHistoryPayload,
    callMode,
    downloadReport,
    isListening,
    isTyping,
    speakText,
    startListening,
    stopListening,
    toast,
  ]);

  const releaseMediaStream = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const clearVoiceDraft = useCallback(() => {
    setVoiceBlob(null);
    setIsSendingVoice(false);
    setVoiceUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
  }, []);

  const startVoiceRecording = useCallback(async () => {
    if (!mediaRecorderSupported) {
      toast.warning("L'enregistrement vocal n'est pas supporte sur ce navigateur.");
      return;
    }
    if (isRecording || isTyping || isSendingVoice) return;

    try {
      if (callMode) setCallMode(false);
      if (isListening) stopListening();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const preferred = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
      ];
      const mimeType = preferred.find((m) => window.MediaRecorder.isTypeSupported?.(m)) || '';
      const recorder = mimeType ? new window.MediaRecorder(stream, { mimeType }) : new window.MediaRecorder(stream);
      recordedChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event?.data?.size) recordedChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const chunks = recordedChunksRef.current || [];
        recordedChunksRef.current = [];
        const nextBlob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (nextBlob.size > 0) {
          setVoiceBlob(nextBlob);
          setVoiceUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(nextBlob);
          });
        }
        setIsRecording(false);
        releaseMediaStream();
      };
      recorder.onerror = () => {
        setIsRecording(false);
        releaseMediaStream();
        toast.error("Echec de l'enregistrement vocal.");
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
    } catch (err) {
      releaseMediaStream();
      toast.error(err.message || "Impossible d'acceder au microphone.");
    }
  }, [
    callMode,
    isListening,
    isRecording,
    isSendingVoice,
    isTyping,
    mediaRecorderSupported,
    releaseMediaStream,
    stopListening,
    toast,
  ]);

  const stopVoiceRecording = useCallback(() => {
    if (!isRecording) return;
    try {
      mediaRecorderRef.current?.stop();
    } catch (_) {
      setIsRecording(false);
      releaseMediaStream();
    }
  }, [isRecording, releaseMediaStream]);

  const sendVoiceMessage = useCallback(async () => {
    if (!voiceBlob || isTyping || isSendingVoice) return;
    setIsSendingVoice(true);
    setIsTyping(true);
    try {
      const base64Audio = await blobToBase64(voiceBlob);
      const historySnapshot = messagesRef.current;
      const result = await post('/ai/assistant/voice-ask', {
        audio_base64: base64Audio,
        mime_type: voiceBlob.type || 'audio/webm',
        language: VOICE_LOCALE,
        history: buildHistoryPayload(historySnapshot),
        mode: 'chat',
      });

      const transcript = String(result?.transcript || '').trim() || 'Message vocal (non transcrit)';
      const answer = String(result?.answer || "Je n'ai pas pu generer une reponse.");
      const source = String(result?.source || 'fallback');

      setMessages((prev) => [
        ...prev,
        makeUserMessage(`Vocal: ${transcript}`),
        makeBotMessage(answer, { source, mode: 'chat' }),
      ]);

      if (autoSpeak) speakText(answer);
      clearVoiceDraft();
    } catch (err) {
      toast.error(err.message || 'Erreur traitement vocal');
      setMessages((prev) => [
        ...prev,
        makeBotMessage("Le message vocal n'a pas pu etre traite. Reessayez.", { source: 'local', mode: 'chat' }),
      ]);
    } finally {
      setIsSendingVoice(false);
      setIsTyping(false);
    }
  }, [
    autoSpeak,
    blobToBase64,
    buildHistoryPayload,
    clearVoiceDraft,
    isSendingVoice,
    isTyping,
    speakText,
    toast,
    voiceBlob,
  ]);

  useEffect(() => {
    sendQuestionRef.current = sendQuestion;
  }, [sendQuestion]);

  useEffect(() => {
    const prefill = location?.state?.prefill;
    if (prefill && typeof prefill === 'string') {
      setInputValue(prefill);
      inputRef.current?.focus();
    }
  }, [location]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const supported = Boolean(window.MediaRecorder && navigator.mediaDevices?.getUserMedia);
    setMediaRecorderSupported(supported);
    return undefined;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSpeechSupported(Boolean(SpeechRecognitionClass));
    setTtsSupported(Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance));
    if (!SpeechRecognitionClass) return undefined;

    const recognition = new SpeechRecognitionClass();
    recognition.lang = VOICE_LOCALE;
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      toast.warning("Le micro n'est pas disponible pour le moment.");
    };
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results || [])
        .map((r) => r?.[0]?.transcript || '')
        .join(' ')
        .trim();
      if (!transcript) return;

      if (callMode && sendQuestionRef.current) {
        sendQuestionRef.current(transcript, { mode: 'chat', includeUserMessage: true });
        return;
      }
      setInputValue((prev) => (prev ? `${prev} ${transcript}`.trim() : transcript));
      inputRef.current?.focus();
    };

    recognitionRef.current = recognition;
    return () => {
      try {
        recognition.stop();
      } catch (_) {
        // noop
      }
      recognitionRef.current = null;
    };
  }, [callMode, toast]);

  useEffect(() => {
    if (callMode && speechSupported && !isTyping) {
      startListening();
      return;
    }
    if (!callMode && isListening) {
      stopListening();
    }
  }, [callMode, isListening, isTyping, speechSupported, startListening, stopListening]);

  const loadCopilot = useCallback(async () => {
    try {
      const [result, gemini] = await Promise.all([
        post('/ai/copilot/recommendations', { horizon_days: 14, top_n: 5, simulations: [] }),
        get('/ai/gemini/status').catch(() => ({ configured: false })),
      ]);
      setCopilotTopRisk(Array.isArray(result?.top_risk_products) ? result.top_risk_products : []);
      setGeminiConfigured(Boolean(gemini?.configured));
    } catch (_) {
      setCopilotTopRisk([]);
      setGeminiConfigured(false);
    }
  }, []);

  useEffect(() => {
    loadCopilot();
  }, [loadCopilot]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hidden) return;
      loadCopilot();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadCopilot]);

  useEffect(() => () => {
    stopListening();
    stopSpeaking();
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } catch (_) {
      // noop
    }
    releaseMediaStream();
    if (voiceUrlRef.current) URL.revokeObjectURL(voiceUrlRef.current);
  }, [releaseMediaStream, stopListening, stopSpeaking]);

  const handleSend = useCallback(() => {
    const question = inputValue.trim();
    if (!question) return;
    setInputValue('');
    sendQuestion(question, { mode: 'chat', includeUserMessage: true });
  }, [inputValue, sendQuestion]);

  const handleGenerateReport = useCallback(() => {
    const question = inputValue.trim() || 'Genere un mini-rapport executif sur les risques stock et les actions 24h.';
    setInputValue('');
    sendQuestion(question, { mode: 'report', includeUserMessage: true });
  }, [inputValue, sendQuestion]);

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
    stopVoiceRecording();
    stopListening();
    stopSpeaking();
    clearVoiceDraft();
    setMessages([makeBotMessage(INITIAL_BOT_TEXT, { source: 'local', mode: 'chat' })]);
  }, [clearVoiceDraft, stopListening, stopSpeaking, stopVoiceRecording]);

  const toggleMicro = useCallback(() => {
    if (!speechSupported) {
      toast.warning("La reconnaissance vocale n'est pas supportee par ce navigateur.");
      return;
    }
    if (isListening) stopListening();
    else startListening();
  }, [isListening, speechSupported, startListening, stopListening, toast]);

  const suggestions = useMemo(() => [
    'Quels produits sont les plus critiques cette semaine ?',
    'Pourquoi ce produit est en risque de rupture ?',
    'Donne moi un plan de commande priorise.',
    'Resume la situation en 5 lignes.',
    'Genere un mini-rapport executif.',
  ], []);

  const dynamicSuggestions = useMemo(() => {
    if (!copilotTopRisk.length) return suggestions;
    const top = copilotTopRisk
      .slice(0, 2)
      .map((p) => `Pourquoi ${p.product_name} est en alerte ?`);
    return [...top, ...suggestions].slice(0, 8);
  }, [copilotTopRisk, suggestions]);

  return (
    <div className="app-layout">
      <SidebarResp
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onLogout={onLogout}
        userName={userName}
      />

      <div className="main-container">
        <HeaderPage
          userName={userName}
          title="Assistant"
          showSearch={false}
        />

        <main className="main-content chatbot-main">
          <div className="chatbot-container">
            <div className="chatbot-header">
              <div className="chatbot-avatar">
                <Bot size={24} />
              </div>
              <div className="chatbot-info">
                <h2>Assistant Stock</h2>
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

            <div className="chatbot-capabilities"> 
              <span className={`cap-pill ${geminiConfigured ? 'ok' : 'warn'}`}> 
                {geminiConfigured ? 'Gemini actif' : 'Mode local'} 
              </span> 
              <span className={`cap-pill ${speechSupported ? 'ok' : 'off'}`}>
                Micro {speechSupported ? 'disponible' : 'non supporte'}
              </span>
              <span className={`cap-pill ${ttsSupported ? 'ok' : 'off'}`}>
                Vocal {ttsSupported ? 'disponible' : 'non supporte'}
              </span>
              <span className={`cap-pill ${mediaRecorderSupported ? 'ok' : 'off'}`}> 
                Envoi vocal {mediaRecorderSupported ? 'disponible' : 'non supporte'} 
              </span> 
              <button
                className={`cap-pill cap-toggle ${autoSpeak ? 'ok' : 'off'}`}
                type="button"
                onClick={() => setAutoSpeak((prev) => !prev)}
                disabled={!ttsSupported}
              >
                <Volume2 size={13} />
                Lecture auto {autoSpeak ? 'ON' : 'OFF'}
              </button>
            </div> 

            {copilotTopRisk.length > 0 && ( 
              <div className="chatbot-ai-hint"> 
                <strong>Priorite:</strong>{' '}
                {copilotTopRisk[0].product_name} ({Number(copilotTopRisk[0].risk_probability || 0).toFixed(1)}%)
              </div>
            )}

            <div className="chatbot-toolbar">
              <button
                className={`tool-btn ${isListening ? 'active' : ''}`}
                onClick={toggleMicro}
                disabled={isTyping || isSendingVoice || isRecording || !speechSupported}
              >
                {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                <span>{isListening ? 'Arreter micro' : 'Dicter'}</span>
              </button>

              <button
                className={`tool-btn ${isRecording ? 'active record' : ''}`}
                onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                disabled={isTyping || isSendingVoice || !mediaRecorderSupported}
              >
                {isRecording ? <Square size={16} /> : <Circle size={16} />}
                <span>{isRecording ? 'Stop enregistrement' : 'Enregistrer vocal'}</span>
              </button>

              <button 
                className={`tool-btn ${callMode ? 'active' : ''}`} 
                onClick={() => setCallMode((prev) => !prev)} 
                disabled={!speechSupported || isTyping || isRecording || isSendingVoice} 
              >
                <PhoneCall size={16} />
                <span>{callMode ? 'Mode appel ON' : 'Mode appel OFF'}</span> 
              </button> 

              <button 
                className="tool-btn primary" 
                onClick={handleGenerateReport} 
                disabled={isTyping || isSendingVoice || isRecording}
              >
                <FileText size={16} />
                <span>Mini-rapport</span>
              </button>
            </div>

            {(voiceBlob || isRecording) && (
              <div className="voice-draft-card">
                <div className="voice-draft-head">
                  <strong>{isRecording ? 'Enregistrement en cours...' : 'Brouillon vocal pret'}</strong>
                </div>
                {!isRecording && voiceUrl && (
                  <audio controls src={voiceUrl} className="voice-player">
                    <track kind="captions" />
                  </audio>
                )}
                <div className="voice-draft-actions">
                  <button
                    className="tool-btn primary"
                    onClick={sendVoiceMessage}
                    disabled={!voiceBlob || isTyping || isSendingVoice}
                  >
                    <Upload size={16} />
                    <span>{isSendingVoice ? 'Envoi vocal...' : 'Envoyer le vocal'}</span>
                  </button>
                  <button
                    className="tool-btn"
                    onClick={clearVoiceDraft}
                    disabled={isSendingVoice}
                  >
                    <X size={16} />
                    <span>Supprimer</span>
                  </button>
                </div>
              </div>
            )}

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
                    <p className="message-text">{message.content}</p>
                    <div className="message-meta">
                      <span className="message-time">{message.time}</span>
                      {message.type === 'bot' && message.source && (
                        <span className={`source-badge ${message.source === 'gemini' ? 'gemini' : 'local'}`}>
                          {message.source === 'gemini' ? 'Gemini' : 'Local'}
                        </span>
                      )}
                    </div>
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
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="chatbot-suggestions">
              <p className="suggestions-label">Suggestions rapides:</p>
              <div className="suggestions-grid">
                {dynamicSuggestions.map((suggestion, index) => (
                  <button
                    key={`${suggestion}-${index}`}
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
                onKeyDown={handleKeyPress}
                placeholder="Posez votre question ou dictez..."
                disabled={isTyping || isSendingVoice || isRecording}
                aria-label="Message pour l'assistant"
              />
              <button
                className="send-btn"
                onClick={handleSend}
                disabled={!inputValue.trim() || isTyping || isSendingVoice || isRecording}
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
