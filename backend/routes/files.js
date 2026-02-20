const router = require('express').Router();
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const requireAuth = require('../middlewares/requireAuth');
const requirePermission = require('../middlewares/requirePermission');
const UserSession = require('../models/UserSession');
const { normalizeRole } = require('../constants/roles');
const { PERMISSIONS } = require('../constants/permissions');
const { validateFileType, hasBasicMalwareSignature, scanFileWithOptionalAntivirus } = require('../utils/fileSecurity');

const MAX_FILE_SIZE_MB = Number(process.env.UPLOAD_MAX_MB || 10);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

async function requireAuthHeaderOrQueryToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return requireAuth(req, res, next);
  }

  const token = String(req.query?.token || '');
  if (!token) return res.status(401).json({ error: 'Authentification requise' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload?.sid) return res.status(401).json({ error: 'Token session invalide' });

    const session = await UserSession.findOne({
      session_id: payload.sid,
      user: payload.id,
      is_active: true,
      expires_at: { $gt: new Date() },
    }).select('_id');

    if (!session) return res.status(401).json({ error: 'Session invalide ou expiree' });

    req.user = {
      id: payload.id,
      role: normalizeRole(payload.role),
      username: payload.username,
      sessionId: payload.sid,
    };
    return next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expire' });
  }
}

router.post(
  '/upload',
  requireAuth,
  requirePermission(PERMISSIONS.ATTACHMENT_UPLOAD),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Aucun fichier recu' });

      const validation = validateFileType(req.file);
      if (!validation.ok) {
        return res.status(400).json({ error: validation.reason });
      }

      if (hasBasicMalwareSignature(req.file.buffer)) {
        return res.status(400).json({ error: 'Signature malware detectee (scan basique)' });
      }

      const safeName = `${Date.now()}-${randomUUID()}${validation.ext}`;
      const fullPath = path.join(UPLOAD_DIR, safeName);
      await fsp.writeFile(fullPath, req.file.buffer);

      const avResult = await scanFileWithOptionalAntivirus(fullPath);
      if (!avResult.ok) {
        await fsp.unlink(fullPath).catch(() => {});
        return res.status(400).json({ error: 'Fichier rejete par antivirus' });
      }

      return res.status(201).json({
        file_name: req.file.originalname,
        stored_name: safeName,
        file_url: `/api/files/download/${safeName}`,
        mime_type: req.file.mimetype,
        size: req.file.size,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Upload failed', details: err.message });
    }
  }
);

router.get('/download/:storedName', requireAuthHeaderOrQueryToken, async (req, res) => {
  try {
    const storedName = String(req.params.storedName || '');
    if (!/^[a-zA-Z0-9._-]+$/.test(storedName)) {
      return res.status(400).json({ error: 'Nom de fichier invalide' });
    }

    const fullPath = path.join(UPLOAD_DIR, storedName);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Fichier introuvable' });

    return res.sendFile(fullPath, {
      headers: {
        'Content-Disposition': 'inline',
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Download failed' });
  }
});

module.exports = router;
