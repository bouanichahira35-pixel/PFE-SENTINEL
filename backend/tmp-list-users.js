require('./loadEnv');
require('./db');
const User=require('./models/User');
(async()=>{
 const users=await User.find({},'username email role status').lean();
 console.log(users);
 process.exit(0);
})();
