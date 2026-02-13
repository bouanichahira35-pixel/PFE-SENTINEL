require('dotenv').config(); // Charge les variables d'environnement depuis .env
const express = require('express');
const cors = require('cors');

require('./db'); // Initialise la connexion Mongo (db.js)

const app = express();

// Middleware globaux
app.use(cors()); // Autorise les appels depuis le front (CORS)
app.use(express.json()); // Parse les JSON dans les requêtes

// Routes API (on les remplira ensuite)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/stock', require('./routes/stock'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/history', require('./routes/history'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/settings', require('./routes/settings'));

// Démarrage serveur
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API ready on http://localhost:${PORT}`));
