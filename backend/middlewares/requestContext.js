// BLOC 1 - Role du fichier.
// Ce fichier controle les requetes avant les routes pour le sujet requestContext.
// Point de vigilance: modifier avec prudence car ce fichier peut etre importe par plusieurs modules.

const { randomUUID } = require('crypto');

function requestContext(req, res, next) {
  const requestId = req.headers['x-request-id'] || randomUUID();
  req.requestId = String(requestId);
  res.setHeader('x-request-id', req.requestId);
  next();
}

module.exports = requestContext;
