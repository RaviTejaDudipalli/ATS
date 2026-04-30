const { ZodError } = require('zod');
const { ApiError } = require('../lib/errors');
const { env } = require('../lib/config');

/**
 * Consistent error envelope:
 *   { error: { code, message, details?, requestId } }
 *
 * Rules:
 *   - Zod errors → 400 + structured `details`
 *   - Known `ApiError` → respect status/code/expose
 *   - Multer / payload errors → mapped to 400/413
 *   - Anything else → 500 with a generic message; full error logged
 *
 * The exposed `requestId` lets users tell support "I got this id at this time"
 * and lets us pull every log line for that request.
 */
function errorHandler(err, req, res, _next) {
  const requestId = req.id;

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'bad_request',
        message: 'Validation failed',
        details: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
        requestId,
      },
    });
  }

  if (err instanceof ApiError) {
    if (err.status >= 500) req.log?.error({ err }, 'api error');
    else req.log?.warn({ err: { message: err.message, code: err.code } }, 'api error');
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.expose ? err.message : 'Request failed',
        ...(err.details ? { details: err.details } : {}),
        requestId,
      },
    });
  }

  // Multer & body-parser-style errors
  if (err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: { code: 'payload_too_large', message: 'File too large', requestId },
    });
  }
  if (err.code && String(err.code).startsWith('LIMIT_')) {
    return res.status(400).json({
      error: { code: 'bad_request', message: err.message, requestId },
    });
  }

  // Unknown — never leak details.
  req.log?.error({ err }, 'unhandled error');
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: env.IS_PROD ? 'Internal server error' : err.message || 'Internal server error',
      requestId,
    },
  });
}

module.exports = { errorHandler };
