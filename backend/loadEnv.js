const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

const envPath = path.join(__dirname, '.env');
const envLocalPath = path.join(__dirname, '.env.local');

dotenv.config({ path: envPath });

// Optional local overrides for secrets (should not be committed)
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
}
