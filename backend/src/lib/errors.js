/**
 * Typed error classes. Use these instead of `new Error('…')` + `err.status = …`
 * so the central handler can format consistently and choose what to expose.
 *
 * `expose: true` means the message is safe to send to clients (validation,
 * not-found, etc.). `expose: false` means we hide it behind a generic
 * "Internal server error" — server-side logs keep the detail.
 */

class ApiError extends Error {
  constructor(status, code, message, { expose = true, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.expose = expose;
    this.details = details;
  }
}

class BadRequestError extends ApiError {
  constructor(message, details) { super(400, 'bad_request', message, { details }); }
}
class UnauthorizedError extends ApiError {
  constructor(message = 'Authentication required') { super(401, 'unauthorized', message); }
}
class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') { super(403, 'forbidden', message); }
}
class NotFoundError extends ApiError {
  constructor(message = 'Not found') { super(404, 'not_found', message); }
}
class ConflictError extends ApiError {
  constructor(message) { super(409, 'conflict', message); }
}
class PayloadTooLargeError extends ApiError {
  constructor(message = 'Payload too large') { super(413, 'payload_too_large', message); }
}
class TooManyRequestsError extends ApiError {
  constructor(message = 'Too many requests') { super(429, 'rate_limited', message); }
}

module.exports = {
  ApiError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  PayloadTooLargeError,
  TooManyRequestsError,
};
