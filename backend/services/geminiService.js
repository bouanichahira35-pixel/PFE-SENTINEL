const axios = require('axios');

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

function isGeminiConfigured() {
  const key = String(process.env.GEMINI_API_KEY || '').trim();
  if (!key) return false;
  if (key === '...' || key.toLowerCase() === 'changeme') return false;
  // Gemini API keys generally start with "AIza". Keep this strict to avoid false "configured" state.
  return /^AIza[0-9A-Za-z_-]{20,}$/.test(key);
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

function normalizeContents(contents) {
  if (!Array.isArray(contents)) return null;
  const normalized = [];
  for (const item of contents) {
    if (!item || typeof item !== 'object') continue;
    const role = item.role === 'model' ? 'model' : 'user';
    const parts = Array.isArray(item.parts) ? item.parts : [];
    if (parts.length === 0) continue;
    normalized.push({ role, parts });
  }
  return normalized.length ? normalized : null;
}

function extractFunctionCalls(candidateContent) {
  const parts = Array.isArray(candidateContent?.parts) ? candidateContent.parts : [];
  const calls = [];
  for (const part of parts) {
    const call = part?.functionCall;
    if (!call || !call.name) continue;
    calls.push({
      id: call.id || null,
      name: String(call.name),
      args: call.args && typeof call.args === 'object' ? call.args : {},
    });
  }
  return calls;
}

async function generateGeminiContent(options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY manquant');
  }

  const model = String(options.model || process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim();
  const providedContents = normalizeContents(options.contents);
  const prompt = String(options.prompt || '').trim();
  if (!providedContents && !prompt) throw new Error('prompt obligatoire');

  const temperature = Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : 0.4;
  const maxOutputTokens = Number.isFinite(Number(options.max_output_tokens))
    ? Math.max(64, Math.min(4096, Math.floor(Number(options.max_output_tokens))))
    : 1024;

  const history = normalizeHistory(options.history);
  const systemInstruction = String(options.system_instruction || '').trim();

  const url = `${GEMINI_BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const payload = {
    contents: providedContents || [
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

  if (Array.isArray(options.tools) && options.tools.length) {
    payload.tools = options.tools;
  }
  if (options.tool_config && typeof options.tool_config === 'object') {
    payload.toolConfig = options.tool_config;
  }

  const response = await axios.post(url, payload, {
    timeout: Number(process.env.GEMINI_TIMEOUT_MS || 30000),
    headers: { 'Content-Type': 'application/json' },
  });

  const data = response.data || {};
  const candidateContent = data?.candidates?.[0]?.content || null;
  const text = candidateContent?.parts?.map((p) => p?.text || '').join('\n').trim() || '';

  return {
    model,
    text,
    candidate_content: candidateContent,
    function_calls: extractFunctionCalls(candidateContent),
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
