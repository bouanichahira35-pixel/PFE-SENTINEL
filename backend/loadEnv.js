const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

const envPath = path.join(__dirname, '.env');
const envLocalPath = path.join(__dirname, '.env.local');

const keysFromParentProcess = new Set(Object.keys(process.env));
dotenv.config({ path: envPath });

// Optional local overrides for secrets (should not be committed)
if (fs.existsSync(envLocalPath)) {
  // Do NOT override variables already provided by the parent process (tests/CI/runtime).
  // Local files override base `.env` values, but never explicit runtime variables.
  const parsed = dotenv.parse(fs.readFileSync(envLocalPath));
  for (const [key, value] of Object.entries(parsed || {})) {
    const parentProvided = keysFromParentProcess.has(key);

    // Respect explicit env vars passed by the parent process (even if empty string).
    // This is critical for tests that intentionally disable services (ex: GEMINI_API_KEY="").
    if (!parentProvided) {
      process.env[key] = value;
    }
  }
}
