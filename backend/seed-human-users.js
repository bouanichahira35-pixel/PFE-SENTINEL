// BLOC 1 - Role du fichier.
// Ce fichier participe au fonctionnement du module seed-human-users.
// Point de vigilance: modifier avec prudence car ce fichier peut etre importe par plusieurs modules.

require('./loadEnv');
const mongoose = require('./db');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const { HUMANIZED_CORE_USERS, LEGACY_CORE_USER_EMAILS } = require('./data/humanizedCatalogue');

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
  const ready = await mongoose.waitForMongoReady({ timeoutMs: 15_000 });
  if (!ready.ok) {
    // eslint-disable-next-line no-console
    console.error('MONGO_NOT_READY', ready.reason || 'unknown');
    process.exit(1);
  }

  const envByRole = {
    admin: 'TEST_ADMIN_EMAIL',
    demandeur: 'TEST_DEMANDEUR_EMAIL',
    magasinier: 'TEST_MAGASINIER_EMAIL',
    responsable: 'TEST_RESPONSABLE_EMAIL',
  };

  const users = HUMANIZED_CORE_USERS.map((user) => ({
    username: user.username,
    email: getTestEnv(envByRole[user.role], user.email),
    telephone: user.telephone,
    role: user.role,
    password: getTestEnv(user.passwordEnv, user.fallbackPassword),
  }));

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

  const activeCoreEmails = new Set(users.map((u) => String(u.email || '').trim().toLowerCase()).filter(Boolean));
  const obsoleteCoreEmails = LEGACY_CORE_USER_EMAILS
    .map((email) => String(email || '').trim().toLowerCase())
    .filter((email) => email && !activeCoreEmails.has(email));

  if (obsoleteCoreEmails.length > 0) {
    await User.updateMany(
      { email: { $in: obsoleteCoreEmails } },
      { $set: { status: 'blocked' } }
    );
  }

  console.log('HUMAN_USERS_READY');
  process.exit(0);
})();
