const pinoHttp = require('pino-http');
const { nanoid } = require('nanoid');
const { logger } = require('../lib/logger');

/**
 * Attach a per-request id and a child logger. Honours `x-request-id` from
 * an upstream load balancer when present so logs can be correlated end-to-end.
 */
const requestContext = pinoHttp({
  logger,
  genReqId: (req) => req.headers['x-request-id'] || nanoid(12),
  customLogLevel: (_req, res, err) => {
    if (err) return 'error';
    if (res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res, err) =>
    `${req.method} ${req.url} ${res.statusCode} ${err.message}`,
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url, ip: req.ip }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});

module.exports = { requestContext };
