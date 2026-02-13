require('dotenv').config();
require('./db');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

(async () => {
  const users = [
    {
      username: 'Sarra Ben Youssef',
      email: 'chahirabouani9@gmail.com',
      telephone: '+21698123456',
      role: 'demandeur',
      password: 'Demandeur123'
    },
    {
      username: 'Ahmed Trabelsi',
      email: 'chahira772014@gmail.com',
      telephone: '+21698111111',
      role: 'magasinier',
      password: 'Magasinier123'
    },
    {
      username: 'Mohamed Gharbi',
      email: 'chahirabbyyoussef@gmail.com',
      telephone: '+21698222222',
      role: 'responsable',
      password: 'Responsable123'
    }
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 12);
    await User.updateOne(
      { email: u.email, role: u.role },
      {
        $set: {
          username: u.username,
          email: u.email,
          telephone: u.telephone,
          role: u.role,
          status: 'active',
          password_hash: hash
        }
      },
      { upsert: true }
    );
  }

  console.log('HUMAN_USERS_READY');
  process.exit(0);
})();
