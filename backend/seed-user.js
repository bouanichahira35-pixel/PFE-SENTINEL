require('./loadEnv');
const mongoose = require('./db');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

(async () => {
  const ready = await mongoose.waitForMongoReady({ timeoutMs: 15_000 });
  if (!ready.ok) {
    console.error('MONGO_NOT_READY', ready.reason || 'unknown');
    process.exit(1);
  }

  const hash = await bcrypt.hash(process.env.TEST_DEMANDEUR_PASSWORD || 'ChangeMe_Demandeur_123', 12);

  await User.updateOne(
    { email: 'sarra.benyoussef@etap.com.tn' },
    {
      $set: {
        username: 'Sarra Ben Youssef',
        email: 'sarra.benyoussef@etap.com.tn',
        telephone: '+216 71 285 447',
        role: 'demandeur',
        status: 'active',
        password_hash: hash
      }
    },
    { upsert: true }
  );

  console.log('HUMAN_DEMANDEUR_READY');
  process.exit(0);
})();
