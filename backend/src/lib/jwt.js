const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { env } = require('./config');

const ACCESS_AUD = 'ats.access';
const REFRESH_BYTES = 48; // 384 bits → ~64 base64url chars

function signAccessToken(payload) {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
    audience: ACCESS_AUD,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET, { audience: ACCESS_AUD });
}

/**
 * Refresh tokens are opaque random strings — NOT JWTs. We store only their
 * SHA-256 hash; if the DB leaks, an attacker can't replay tokens.
 */
function generateRefreshToken() {
  const raw = crypto.randomBytes(REFRESH_BYTES).toString('base64url');
  const hash = hashRefreshToken(raw);
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 86_400_000);
  return { raw, hash, expiresAt };
}

function hashRefreshToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
};
