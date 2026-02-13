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
