const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'authorization',
      'cookie',
      'token',
      '*.token',
      '*.refreshToken',
      '*.refresh_token',
      '*.password',
      '*.new_password',
      '*.password_hash',
      '*.mail_pass',
      '*.mailPass',
      '*.otp',
      '*.code',
    ],
    censor: '[REDACTED]',
  },
});

module.exports = logger;
