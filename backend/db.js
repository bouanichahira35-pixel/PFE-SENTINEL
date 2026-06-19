// BLOC 1 - Importation de Mongoose.
// Mongoose est l'outil qui permet a Node.js de parler avec MongoDB.
const mongoose = require('mongoose');

// BLOC 2 - Adresse de la base de donnees.
// Si MONGODB_URI existe dans .env, on l'utilise. Sinon on utilise MongoDB local.
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pfe_sentinel';

// BLOC 3 - Reglage des delais MongoDB.
// Si MongoDB est eteint, le backend doit echouer vite au lieu de rester bloque.
const bufferTimeoutMsRaw = Number(process.env.MONGOOSE_BUFFER_TIMEOUT_MS || '');
const bufferTimeoutMs = Number.isFinite(bufferTimeoutMsRaw) && bufferTimeoutMsRaw > 0
  ? Math.min(Math.max(bufferTimeoutMsRaw, 1000), 60_000)
  : 10_000;

mongoose.set('bufferCommands', false);
mongoose.set('bufferTimeoutMS', bufferTimeoutMs);

// BLOC 4 - Memoire de connexion.
// Cette variable evite d'ouvrir plusieurs connexions MongoDB en meme temps.
let connectPromise = null;

// BLOC 5 - Connexion a MongoDB.
// Cette fonction ouvre la connexion et garde la promesse pour la reutiliser.
function connectMongo() {
  if (connectPromise) return connectPromise;

  connectPromise = mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 5000),
    connectTimeoutMS: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 10_000),
  })
    .then(() => {
      console.log('Mongo connected');
      return mongoose;
    })
    .catch((err) => {
      console.error('Mongo connection error:', err?.message || err);
      throw err;
    });

  return connectPromise;
}

// BLOC 6 - Attente que MongoDB soit pret.
// Le serveur utilise cette fonction au demarrage pour savoir si la base repond.
async function waitForMongoReady({ timeoutMs } = {}) {
  const timeout = Number.isFinite(Number(timeoutMs)) ? Number(timeoutMs) : 15_000;

  connectMongo();

  const readyPromise = typeof mongoose.connection?.asPromise === 'function'
    ? mongoose.connection.asPromise()
    : connectPromise;

  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('mongo_connect_timeout')), timeout);
  });

  try {
    await Promise.race([readyPromise, timeoutPromise]);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message || 'mongo_connect_failed' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// BLOC 7 - Lancement direct de la connexion.
// Des que ce fichier est importe, il commence a se connecter a MongoDB.
connectMongo();

// BLOC 8 - Export de Mongoose avec fonctions utiles.
// Les autres fichiers peuvent utiliser mongoose, connectMongo et waitForMongoReady.
mongoose.connectMongo = connectMongo;
mongoose.waitForMongoReady = waitForMongoReady;

module.exports = mongoose;
