// BLOC 1 - Role du fichier.
// Ce fichier participe au fonctionnement du module update-email.
// Point de vigilance: modifier avec prudence car ce fichier peut etre importe par plusieurs modules.

require("dotenv").config();
require("./db");
const User = require("./models/User");

(async () => {
  await User.updateOne(
    { username: "demandeur1" },
    { $set: { email: "chahirabouani9@gmail.com", role: "demandeur", status: "active" } }
  );
  console.log("EMAIL_UPDATED");
  process.exit(0);
})();
