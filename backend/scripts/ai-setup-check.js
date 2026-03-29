require('../loadEnv');

const { isGeminiConfigured } = require('../services/geminiService');
const { getPythonRuntimeStatus } = require('../services/aiModelService');

function line(label, value) {
  // eslint-disable-next-line no-console
  console.log(`${label}: ${value}`);
}

function main() {
  const geminiOk = isGeminiConfigured();
  const python = getPythonRuntimeStatus();

  line('Gemini', geminiOk ? 'OK (clé configurée)' : 'NON (GEMINI_API_KEY manquante)');
  line('Moteur IA local (Python)', python?.ok ? 'OK' : 'Indisponible (optionnel)');

  if (!geminiOk) {
    // eslint-disable-next-line no-console
    console.log('\nÀ faire pour activer le chatbot (Gemini):');
    // eslint-disable-next-line no-console
    console.log('- Crée une clé Gemini API, puis ajoute-la dans `backend/.env` -> GEMINI_API_KEY=');
    // eslint-disable-next-line no-console
    console.log('- Redémarre le backend (`npm start`).');
  }

  // eslint-disable-next-line no-console
  console.log('\nEndpoints utiles (une fois connecté en "responsable"):');
  // eslint-disable-next-line no-console
  console.log('- GET  /api/ai/assistant/status');
  // eslint-disable-next-line no-console
  console.log('- POST /api/ai/assistant/ask   { question, history: [], mode: \"chat\" }');
  // eslint-disable-next-line no-console
  console.log('- GET  /api/ai/gemini/status');
  // eslint-disable-next-line no-console
  console.log('- GET  /api/ai/python/status');

  // Some models import the Mongo connection at require-time. Exit cleanly.
  setTimeout(() => process.exit(0), 0);
}

main();
