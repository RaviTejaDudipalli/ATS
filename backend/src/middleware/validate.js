const { ZodError } = require('zod');
const { BadRequestError } = require('../lib/errors');

/**
 * Validate a request against a Zod schema map: { body, params, query }.
 * The parsed (and *coerced* — query strings → numbers etc.) values replace
 * the originals so handlers always see the right types.
 */
function validate(schemas) {
  return (req, _res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) {
        // Express 5 makes req.query a getter; assign per-key to stay compatible.
        const parsed = schemas.query.parse(req.query);
        for (const k of Object.keys(parsed)) req.query[k] = parsed[k];
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        }));
        next(new BadRequestError('Validation failed', details));
      } else {
        next(err);
      }
    }
  };
}

module.exports = { validate };
