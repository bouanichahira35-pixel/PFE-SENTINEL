const { randomUUID } = require('crypto');

function requestContext(req, res, next) {
  const requestId = req.headers['x-request-id'] || randomUUID();
  req.requestId = String(requestId);
  res.setHeader('x-request-id', req.requestId);
  next();
}

module.exports = requestContext;
