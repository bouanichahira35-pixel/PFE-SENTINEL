// BLOC 1 - Role du fichier.
// Ce fichier controle les requetes avant les routes pour le sujet strictBody.
// Point de vigilance: modifier avec prudence car ce fichier peut etre importe par plusieurs modules.

function strictBody(allowedKeys = []) {
  const allowed = new Set(allowedKeys);

  return (req, res, next) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return next();
    const unknownKeys = Object.keys(req.body).filter((k) => !allowed.has(k));
    if (unknownKeys.length > 0) {
      return res.status(400).json({
        error: 'Champs non autorises',
        details: unknownKeys,
      });
    }
    return next();
  };
}

module.exports = strictBody;
