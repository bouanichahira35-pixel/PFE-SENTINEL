const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pfe_sentinel';

// Prevent request handlers from hanging when MongoDB is down:
// - disable buffering so operations fail fast
// - set sane connection timeouts so connect() doesn't stall indefinitely
const bufferTimeoutMsRaw = Number(process.env.MONGOOSE_BUFFER_TIMEOUT_MS || '');
const bufferTimeoutMs = Number.isFinite(bufferTimeoutMsRaw) && bufferTimeoutMsRaw > 0
  ? Math.min(Math.max(bufferTimeoutMsRaw, 1000), 60_000)
  : 10_000;

mongoose.set('bufferCommands', false);
mongoose.set('bufferTimeoutMS', bufferTimeoutMs);

let connectPromise = null;

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

// Kick off the initial connection attempt eagerly for the server runtime.
connectMongo();

// Backward compatible exports: existing code expects `require('./db')` to be the mongoose singleton.
mongoose.connectMongo = connectMongo;
mongoose.waitForMongoReady = waitForMongoReady;

module.exports = mongoose;
