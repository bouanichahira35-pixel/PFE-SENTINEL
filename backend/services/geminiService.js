const axios = require('axios');

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((x) => x && typeof x.text === 'string' && x.text.trim())
    .slice(-20)
    .map((x) => ({
      role: x.role === 'model' ? 'model' : 'user',
      parts: [{ text: String(x.text).slice(0, 4000) }],
    }));
}

async function generateGeminiContent(options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY manquant');
  }

  const model = String(options.model || process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim();
  const prompt = String(options.prompt || '').trim();
  if (!prompt) throw new Error('prompt obligatoire');

  const temperature = Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : 0.4;
  const maxOutputTokens = Number.isFinite(Number(options.max_output_tokens))
    ? Math.max(64, Math.min(4096, Math.floor(Number(options.max_output_tokens))))
    : 1024;

  const history = normalizeHistory(options.history);
  const systemInstruction = String(options.system_instruction || '').trim();

  const url = `${GEMINI_BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const payload = {
    contents: [
      ...history,
      { role: 'user', parts: [{ text: prompt.slice(0, 8000) }] },
    ],
    generationConfig: {
      temperature,
      maxOutputTokens,
    },
  };
  if (systemInstruction) {
    payload.systemInstruction = { parts: [{ text: systemInstruction.slice(0, 4000) }] };
  }

  const response = await axios.post(url, payload, {
    timeout: Number(process.env.GEMINI_TIMEOUT_MS || 30000),
    headers: { 'Content-Type': 'application/json' },
  });

  const data = response.data || {};
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('\n').trim()
    || '';

  return {
    model,
    text,
    usage: data?.usageMetadata || null,
    finish_reason: data?.candidates?.[0]?.finishReason || null,
    raw: data,
  };
}

function normalizeBase64Audio(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  const commaIndex = value.indexOf(',');
  if (value.startsWith('data:') && commaIndex > 0) return value.slice(commaIndex + 1);
  return value;
}

async function transcribeGeminiAudio(options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY manquant');
  }

  const model = String(
    options.model || process.env.GEMINI_AUDIO_MODEL || process.env.GEMINI_MODEL || 'gemini-2.0-flash'
  ).trim();
  const mimeType = String(options.mime_type || 'audio/webm').trim() || 'audio/webm';
  const language = String(options.language || 'fr-FR').trim() || 'fr-FR';
  const audioBase64 = normalizeBase64Audio(options.audio_base64);
  if (!audioBase64) throw new Error('audio_base64 obligatoire');

  const url = `${GEMINI_BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Transcris cet audio en ${language}. Reponds uniquement avec le texte transcrit sans commentaire.`,
          },
          {
            inlineData: {
              mimeType,
              data: audioBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 800,
    },
  };

  const response = await axios.post(url, payload, {
    timeout: Number(process.env.GEMINI_TIMEOUT_MS || 30000),
    headers: { 'Content-Type': 'application/json' },
  });

  const data = response.data || {};
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('\n').trim()
    || '';

  return {
    model,
    text,
    usage: data?.usageMetadata || null,
    finish_reason: data?.candidates?.[0]?.finishReason || null,
    raw: data,
  };
}

module.exports = {
  isGeminiConfigured,
  generateGeminiContent,
  transcribeGeminiAudio,
};
