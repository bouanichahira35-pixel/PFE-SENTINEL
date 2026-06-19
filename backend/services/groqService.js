/**
 * groqService.js
 * Service Groq — remplace Gemini pour le chatbot assistant.
 * Utilise llama-3.3-70b-versatile (gratuit, intelligent, rapide).
 */

const https = require('https');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL   = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_TIMEOUT = Number(process.env.GROQ_TIMEOUT_MS || 30000);

/* ─── Config check ──────────────────────────── */
function isGroqConfigured() {
  const key = String(process.env.GROQ_API_KEY || '').trim();
  return key.startsWith('gsk_') && key.length > 20;
}

/* ─── HTTP POST simple (sans dépendance axios) ── */
function httpPost(url, body, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const urlObj  = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            const err = new Error(parsed?.error?.message || `HTTP ${res.statusCode}`);
            err.status = res.statusCode;
            err.code   = res.statusCode === 429 ? 'QUOTA_EXCEEDED' : 'GROQ_HTTP_ERROR';
            err.groq429 = res.statusCode === 429;
            reject(err);
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Invalid JSON from Groq: ${data.slice(0, 200)}`));
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('Groq request timeout'));
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/* ─── Appel principal ───────────────────────── */
async function askGroq({ systemInstruction, history = [], question, mode = 'chat' }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY manquant');

  /* Construction des messages OpenAI-compatible */
  const messages = [];

  /* System prompt */
  if (systemInstruction) {
    messages.push({ role: 'system', content: String(systemInstruction).slice(0, 6000) });
  }

  /* Historique de conversation */
  const histNorm = (Array.isArray(history) ? history : []).slice(-16);
  for (const h of histNorm) {
    const role    = h.role === 'model' || h.role === 'assistant' ? 'assistant' : 'user';
    const content = String(h.text || h.content || '').trim();
    if (content) messages.push({ role, content: content.slice(0, 3000) });
  }

  /* Question courante */
  messages.push({ role: 'user', content: String(question).slice(0, 4000) });

  const body = {
    model:       GROQ_MODEL,
    messages,
    temperature: mode === 'report' ? 0.25 : 0.55,
    max_tokens:  mode === 'report' ? 1800  : 1200,
    stream:      false,
  };

  const data = await httpPost(
    GROQ_API_URL,
    body,
    { Authorization: `Bearer ${apiKey}` },
    GROQ_TIMEOUT,
  );

  const text = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!text) throw new Error('Groq a retourné une réponse vide');

  return {
    answer: text,
    source: 'groq',
    model:  GROQ_MODEL,
    mode,
    usage:  data?.usage || null,
  };
}

module.exports = { isGroqConfigured, askGroq };
