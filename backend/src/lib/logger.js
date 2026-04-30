const pino = require('pino');
const { env } = require('./config');

const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'ats-backend', env: env.NODE_ENV },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.passwordHash',
      'res.headers["set-cookie"]',
    ],
    censor: '[redacted]',
  },
  ...(env.IS_PROD
    ? {}
    : {
        transport: { target: 'pino/file', options: { destination: 1 } },
      }),
});

module.exports = { logger };
