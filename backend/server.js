require('dotenv').config(); // Charge les variables d'environnement depuis .env
const express = require('express');
const cors = require('cors');

const mongoose = require('./db'); // Initialise la connexion Mongo (db.js)

const app = express();

// Middleware globaux
// CORS:
// - En dev, le front peut tourner sur 3000 ou 3001 (quand 3000 est dÃ©jÃ  pris).
// - On accepte une liste d'origins via FRONTEND_URLS="http://localhost:3000,http://localhost:3001".
const allowedOrigins = String(
  process.env.FRONTEND_URLS ||
  process.env.FRONTEND_URL ||
  'http://localhost:3000,http://localhost:3001'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    // allow non-browser tools (curl, Postman) without Origin header
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
})); // Autorise les appels depuis le front (CORS)
app.use(express.json()); // Parse les JSON dans les requÃªtes

app.get('/api/health', (req, res) => {
  const stateMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  const readyState = mongoose.connection.readyState;
  return res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor(process.uptime()),
    mongodb: {
      ready_state: readyState,
      status: stateMap[readyState] || 'unknown',
      db_name: mongoose.connection.name || null,
    },
  });
});

// Routes API (on les remplira ensuite)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/locations', require('./routes/locations'));
app.use('/api/laboratories', require('./routes/laboratories'));
app.use('/api/stock', require('./routes/stock'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/history', require('./routes/history'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/security-audit', require('./routes/security-audit'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/files', require('./routes/files'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/users', require('./routes/users'));

app.use((err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Fichier trop volumineux' });
  }
  return next(err);
});

// DÃ©marrage serveur
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API ready on http://localhost:${PORT}`));

