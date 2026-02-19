/**
 * Rate limiting middleware for Exit Button API
 *
 * Uses express-rate-limit with the IETF draft-7 standard headers.
 * Three pre-configured limiters are exported for different route groups.
 */

import rateLimit from 'express-rate-limit';

// ---------------------------------------------------------------------------
// Shared options
// ---------------------------------------------------------------------------

const RATE_LIMIT_MESSAGE = { error: 'Too many requests, please try again later' };

// ---------------------------------------------------------------------------
// Per-route limiters
// ---------------------------------------------------------------------------

/**
 * Rate limiter for the `/cancel/initiate` endpoint.
 * 100 requests per minute, keyed by client IP.
 */
export const initiateRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
});

/**
 * Rate limiter for the `/cancel/complete` endpoint.
 * 200 requests per minute, keyed by client IP.
 */
export const completeRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
});

/**
 * Global rate limiter applied to all routes.
 * 1000 requests per minute total, keyed by client IP.
 */
export const globalRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
});
