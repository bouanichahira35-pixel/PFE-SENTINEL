require('dotenv').config();
require('./db');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

(async () => {
  const rounds = 12;
  const updates = [
    { email: 'chahirabouani9@gmail.com', role: 'demandeur', username: 'Sarra Ben Youssef', password: 'Dem123456' },
    { email: 'chahira772014@gmail.com', role: 'magasinier', username: 'Ahmed Trabelsi', password: 'Mag123456' },
    { email: 'chahirabbyyoussef@gmail.com', role: 'responsable', username: 'Mohamed Gharbi', password: 'Resp123456' },
  ];

  for (const u of updates) {
    const hash = await bcrypt.hash(u.password, rounds);
    await User.updateOne(
      { email: u.email, role: u.role },
      { $set: { username: u.username, status: 'active', password_hash: hash } }
    );
  }

  console.log('PASSWORDS_RESET_OK');
  process.exit(0);
})();
