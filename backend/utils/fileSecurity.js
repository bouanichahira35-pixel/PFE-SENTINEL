const path = require('path');
const { spawn } = require('child_process');

const ALLOWED_MIME_TYPES = new Set([ 
  'application/pdf', 
  'image/png', 
  'image/jpeg', 
  'image/jpg', 
  'image/webp', 
  'image/heic', 
  'image/heif', 
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.jfif',
  '.webp',
  '.heic',
  '.heif',
  '.txt',
  '.docx',
  '.xlsx',
]);

const FORBIDDEN_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.ps1',
  '.scr',
  '.vbs',
  '.js',
  '.jar',
  '.msi',
  '.dll',
]);

const EICAR_SIGNATURE = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

function getExtension(fileName = '') {
  return path.extname(String(fileName || '')).toLowerCase();
}

function validateFileType({ originalname, mimetype }) {
  const ext = getExtension(originalname);
  if (FORBIDDEN_EXTENSIONS.has(ext)) {
    return { ok: false, reason: `Extension interdite: ${ext}` };
  }
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, reason: `Extension non autorisee: ${ext}` };
  }
  if (!ALLOWED_MIME_TYPES.has(String(mimetype || '').toLowerCase())) {
    return { ok: false, reason: `Type MIME non autorise: ${mimetype}` };
  }
  return { ok: true, ext };
}

function hasBasicMalwareSignature(buffer) {
  if (!buffer || !buffer.length) return false;
  const content = buffer.toString('latin1');
  return content.includes(EICAR_SIGNATURE);
}

function scanFileWithOptionalAntivirus(filePath) {
  return new Promise((resolve) => {
    const enabled = String(process.env.CLAMAV_ENABLED || 'false') === 'true';
    if (!enabled) {
      return resolve({ ok: true, scanned: false, reason: 'antivirus_disabled' });
    }

    const binary = process.env.CLAMAV_BIN || 'clamscan';
    const args = ['--no-summary', filePath];
    const proc = spawn(binary, args, { stdio: 'ignore' });

    proc.on('error', () => {
      resolve({ ok: true, scanned: false, reason: 'antivirus_unavailable' });
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true, scanned: true });
      } else if (code === 1) {
        resolve({ ok: false, scanned: true, reason: 'virus_detected' });
      } else {
        resolve({ ok: true, scanned: false, reason: 'scanner_error' });
      }
    });
  });
}

module.exports = {
  validateFileType,
  hasBasicMalwareSignature,
  scanFileWithOptionalAntivirus,
};
