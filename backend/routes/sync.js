// BLOC 1 - Role du fichier.
// Ce fichier expose les endpoints REST du domaine sync et controle les regles d'acces cote API.
// Point de vigilance: verifier l'authentification, les roles et les validations avant toute modification.

const router = require('express').Router();

const requireAuth = require('../middlewares/requireAuth');
const strictBody = require('../middlewares/strictBody');
const { processMobileSyncBatch, SyncBusinessError } = require('../services/mobileSyncService');

router.use(requireAuth);

router.post('/push', strictBody(['events', 'device', 'client_version']), async (req, res) => {
  try {
    const result = await processMobileSyncBatch({
      user: req.user,
      events: req.body?.events,
    });

    return res.json({
      ok: true,
      accepted: result.accepted,
      rejected: result.rejected,
    });
  } catch (err) {
    const status = err instanceof SyncBusinessError ? err.status || 400 : 500;
    return res.status(status).json({
      error: err.message || 'Synchronisation impossible',
      code: err.code || 'sync_failed',
      request_id: req.requestId,
    });
  }
});

module.exports = router;
