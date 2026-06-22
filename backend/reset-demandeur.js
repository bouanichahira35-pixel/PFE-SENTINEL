// BLOC 1 - Role du fichier.
// Ce fichier participe au fonctionnement du module reset-demandeur.
// Point de vigilance: modifier avec prudence car ce fichier peut etre importe par plusieurs modules.

require("dotenv").config();
require("./db");
const bcrypt = require("bcryptjs");
const User = require("./models/User");

(async () => {
  const hash = await bcrypt.hash("NouveauPass123", 10);
  await User.updateOne(
    { email: "chahirabouani9@gmail.com" },
    {
      $set: {
        username: "demandeur1",
        email: "chahirabouani9@gmail.com",
        telephone: "+21698123456",
        role: "demandeur",
        status: "active",
        password_hash: hash
      }
    },
    { upsert: true }
  );
  console.log("DEMANDEUR_READY");
  process.exit(0);
})();
