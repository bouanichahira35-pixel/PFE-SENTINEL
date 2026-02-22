require('dotenv').config();
require('./db');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

function getTestEnv(name, fallbackForLocal) {
  const value = String(process.env[name] || '').trim();
  if (value) return value;

  const isCi = String(process.env.CI || '').toLowerCase() === 'true';
  if (isCi || fallbackForLocal === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return fallbackForLocal;
}

(async () => {
  const users = [
    {
      username: 'Sarra Ben Youssef',
      email: getTestEnv('TEST_DEMANDEUR_EMAIL', 'demandeur@example.local'),
      telephone: '+21698123456',
      role: 'demandeur',
      password: getTestEnv('TEST_DEMANDEUR_PASSWORD', 'ChangeMe_Demandeur_123')
    },
    {
      username: 'Ahmed Trabelsi',
      email: getTestEnv('TEST_MAGASINIER_EMAIL', 'magasinier@example.local'),
      telephone: '+21698111111',
      role: 'magasinier',
      password: getTestEnv('TEST_MAGASINIER_PASSWORD', 'ChangeMe_Magasinier_123')
    },
    {
      username: 'Mohamed Gharbi',
      email: getTestEnv('TEST_RESPONSABLE_EMAIL', 'responsable@example.local'),
      telephone: '+21698222222',
      role: 'responsable',
      password: getTestEnv('TEST_RESPONSABLE_PASSWORD', 'ChangeMe_Responsable_123')
    }
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 12);
    const existing = await User.findOne({
      $or: [
        { email: u.email },
        { username: u.username },
      ],
    }).select('_id');

    if (existing?._id) {
      await User.updateOne(
        { _id: existing._id },
        {
          $set: {
            username: u.username,
            email: u.email,
            telephone: u.telephone,
            role: u.role,
            status: 'active',
            password_hash: hash
          }
        }
      );
    } else {
      await User.create({
        username: u.username,
        email: u.email,
        telephone: u.telephone,
        role: u.role,
        status: 'active',
        password_hash: hash,
      });
    }
  }

  console.log('HUMAN_USERS_READY');
  process.exit(0);
})();
