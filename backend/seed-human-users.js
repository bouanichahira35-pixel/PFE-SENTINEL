require('./loadEnv');
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
  try {
    await User.db?.asPromise?.();
  } catch {
    // best-effort: mongoose connection is initialized by ./db
  }

  const users = [
    {
      username: 'Admin Informatique',
      email: getTestEnv('TEST_ADMIN_EMAIL', 'admin@example.local'),
      telephone: '+21698000000',
      role: 'admin',
      password: getTestEnv('TEST_ADMIN_PASSWORD', 'ChangeMe_Admin_123'),
    },
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
    const normalizedEmail = String(u.email || '').trim().toLowerCase();
    const normalizedUsername = String(u.username || '').trim();

    let existing = null;
    if (normalizedEmail) {
      existing = await User.findOne({ email: normalizedEmail }).select('_id email username');
    }
    if (!existing && normalizedUsername) {
      existing = await User.findOne({ username: normalizedUsername }).select('_id email username');
    }

    if (existing?._id) {
      const patch = {
        telephone: u.telephone,
        role: u.role,
        status: 'active',
        password_hash: hash,
      };

      // Email is unique: only set it if it is either unchanged or unused.
      if (normalizedEmail && String(existing.email || '').toLowerCase() === normalizedEmail) {
        patch.email = normalizedEmail;
      } else if (normalizedEmail) {
        const emailTaken = await User.findOne({ email: normalizedEmail }).select('_id');
        if (!emailTaken?._id) {
          patch.email = normalizedEmail;
        }
      }

      if (normalizedUsername) {
        const currentUsername = String(existing.username || '').trim();
        if (currentUsername === normalizedUsername) {
          patch.username = normalizedUsername;
        } else {
          const usernameTaken = await User.findOne({ username: normalizedUsername }).select('_id');
          if (!usernameTaken?._id || String(usernameTaken._id) === String(existing._id)) {
            patch.username = normalizedUsername;
          }
        }
      }

      await User.updateOne({ _id: existing._id }, { $set: patch });
    } else {
      let createUsername = normalizedUsername || 'Utilisateur';
      if (createUsername) {
        const taken = await User.findOne({ username: createUsername }).select('_id');
        if (taken?._id) {
          createUsername = `${createUsername} ${String(Date.now()).slice(-5)}`;
        }
      }

      await User.create({
        username: createUsername,
        email: normalizedEmail,
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
