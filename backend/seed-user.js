require("dotenv").config();
require("./db");
const bcrypt = require("bcryptjs");
const User = require("./models/User");

(async () => {
  const hash = await bcrypt.hash("123456", 10);

  await User.updateOne(
    { email: "demandeur@test.com" },
    {
      $set: {
        username: "demandeur1",
        email: "demandeur@test.com",
        telephone: "+21698123456",
        role: "demandeur",
        status: "active",
        password_hash: hash
      }
    },
    { upsert: true }
  );

  console.log("User demandeur cree/maj");
  process.exit(0);
})();
