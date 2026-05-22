const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

const envPath = path.join(__dirname, '.env');
const envLocalPath = path.join(__dirname, '.env.local');

dotenv.config({ path: envPath });

// Optional local overrides for secrets (should not be committed)
if (fs.existsSync(envLocalPath)) {
  // Do NOT override variables already provided by the parent process (tests/CI/runtime).
  // Only fill missing keys from `.env.local`.
  const parsed = dotenv.parse(fs.readFileSync(envLocalPath));
  for (const [key, value] of Object.entries(parsed || {})) {
    // Respect explicit env vars passed by the parent process (even if empty string).
    // This is critical for tests that intentionally disable services (ex: GEMINI_API_KEY="").
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
