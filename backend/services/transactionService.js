const mongoose = require('../db');

async function runInTransaction(operation) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    return result;
  } catch (err) {
    const msg = String(err?.message || '');
    const isStandaloneMongo =
      msg.includes('Transaction numbers are only allowed on a replica set member or mongos');

    if (!isStandaloneMongo) throw err;
    // Fallback for local standalone Mongo. Keep application running in dev mode.
    return operation(null);
  } finally {
    await session.endSession();
  }
}

module.exports = { runInTransaction };
