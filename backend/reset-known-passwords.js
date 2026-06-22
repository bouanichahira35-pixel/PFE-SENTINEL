// BLOC 1 - Role du fichier.
// Ce fichier participe au fonctionnement du module reset-known-passwords.
// Point de vigilance: modifier avec prudence car ce fichier peut etre importe par plusieurs modules.

require('./loadEnv');
const mongoose = require('./db');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

function env(name) {
  return String(process.env[name] || '').trim();
}

(async () => {
  const ready = await mongoose.waitForMongoReady({ timeoutMs: 15_000 });
  if (!ready.ok) {
    // eslint-disable-next-line no-console
    console.error('MONGO_NOT_READY', ready.reason || 'unknown');
    process.exit(1);
  }

  // IMPORTANT:
  // Do not hardcode real emails/passwords in this repository.
  // Provide them via `backend/.env.local` (not committed) or environment variables.
  //
  // Supported variables:
  // - FIX_ADMIN_EMAIL / FIX_ADMIN_PASSWORD / FIX_ADMIN_USERNAME (optional)
  // - FIX_MAGASINIER_EMAIL / FIX_MAGASINIER_PASSWORD / FIX_MAGASINIER_USERNAME (optional)
  // - FIX_RESPONSABLE_EMAIL / FIX_RESPONSABLE_PASSWORD / FIX_RESPONSABLE_USERNAME (optional)
  const updates = [
    {
      email: env('FIX_ADMIN_EMAIL'),
      role: 'admin',
      username: env('FIX_ADMIN_USERNAME') || 'Admin',
      password: env('FIX_ADMIN_PASSWORD'),
    },
    {
      email: env('FIX_MAGASINIER_EMAIL'),
      role: 'magasinier',
      username: env('FIX_MAGASINIER_USERNAME') || 'Magasinier',
      password: env('FIX_MAGASINIER_PASSWORD'),
    },
    {
      email: env('FIX_RESPONSABLE_EMAIL'),
      role: 'responsable',
      username: env('FIX_RESPONSABLE_USERNAME') || 'Responsable',
      password: env('FIX_RESPONSABLE_PASSWORD'),
    },
  ].filter((u) => u.email && u.password);

  if (!updates.length) {
    // eslint-disable-next-line no-console
    console.error('No FIX_* credentials provided. Nothing to do.');
    process.exit(1);
  }

  const rounds = 12;
  const defaultPhoneByRole = {
    admin: '+21698000010',
    responsable: '+21698000011',
    magasinier: '+21698000012',
    demandeur: '+21698000013',
  };

  for (const u of updates) {
    const hash = await bcrypt.hash(u.password, rounds);
    const email = String(u.email || '').trim().toLowerCase();

    const existing = await User.findOne({ email }).select('_id email role username telephone').lean();
    if (existing?._id) {
      await User.updateOne(
        { _id: existing._id },
        { $set: { username: u.username, role: u.role, status: 'active', password_hash: hash } }
      );
      continue;
    }

    await User.create({
      username: u.username,
      email,
      telephone: defaultPhoneByRole[u.role] || '+21698000014',
      role: u.role,
      status: 'active',
      password_hash: hash,
      ...(u.role === 'demandeur'
        ? { demandeur_profile: 'bureautique', service_direction: '' }
        : {}),
    });
  }

  // eslint-disable-next-line no-console
  console.log('PASSWORDS_RESET_OK');
  process.exit(0);
})();

