const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'authorization',
      'token',
      '*.token',
      '*.password',
      '*.password_hash',
      '*.mail_pass',
    ],
    censor: '[REDACTED]',
  },
});

module.exports = logger;
