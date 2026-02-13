require("dotenv").config();
require("./db");
const bcrypt = require("bcryptjs");
const User = require("./models/User");

(async () => {
  const hashMag = await bcrypt.hash("Mag123456", 10);
  const hashResp = await bcrypt.hash("Resp123456", 10);

  await User.updateOne(
    { email: "chahira772014@gmail.com" },
    {
      $set: {
        username: "magasinier1",
        email: "chahira772014@gmail.com",
        telephone: "+21698111111",
        role: "magasinier",
        status: "active",
        password_hash: hashMag
      }
    },
    { upsert: true }
  );

  await User.updateOne(
    { email: "chahirabbyyoussef@gmail.com" },
    {
      $set: {
        username: "responsable1",
        email: "chahirabbyyoussef@gmail.com",
        telephone: "+21698222222",
        role: "responsable",
        status: "active",
        password_hash: hashResp
      }
    },
    { upsert: true }
  );

  console.log("SEED_OK");
  process.exit(0);
})();
