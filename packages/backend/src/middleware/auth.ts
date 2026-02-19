/**
 * Authentication middleware for Exit Button API
 *
 * Phase 1 (current): Validates API key format and attaches a basic tenant object.
 * Phase 2 (full):    Lookup by key_prefix (first 12 chars), verify sha256(full_key)
 *                    against key_hash in the database, and check revoked_at is null.
 */

import { Request, Response, NextFunction } from 'express';

// ---------------------------------------------------------------------------
// Tenant type & Express module augmentation
// ---------------------------------------------------------------------------

export interface Tenant {
  /** Tenant / organization ID */
  id: string;
  /** First 12 characters of the API key (safe to log) */
  apiKeyPrefix: string;
}

declare global {
  namespace Express {
    interface Request {
      tenant?: Tenant;
    }
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Accepted key prefixes */
const VALID_PREFIXES = ['eb_live_', 'eb_test_'] as const;

/** Minimum total length of a valid API key */
const MIN_KEY_LENGTH = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when `key` matches the expected API key format:
 *   - starts with `eb_live_` or `eb_test_`
 *   - is at least 20 characters long
 */
function isValidKeyFormat(key: string): boolean {
  if (key.length < MIN_KEY_LENGTH) {
    return false;
  }
  return VALID_PREFIXES.some((prefix) => key.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Express middleware that authenticates incoming requests via Bearer token.
 *
 * Expects the `Authorization` header in the form:
 *   Authorization: Bearer eb_live_xxxxxxxx   (or eb_test_xxxxxxxx)
 *
 * On success, attaches `req.tenant` with the tenant metadata.
 * On failure, responds with 401.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid API key' });
    return;
  }

  const key = authHeader.slice('Bearer '.length).trim();

  if (!isValidKeyFormat(key)) {
    res.status(401).json({ error: 'Missing or invalid API key' });
    return;
  }

  // ------------------------------------------------------------------
  // Phase 1 (pre-database): accept any correctly-formatted key.
  // Phase 2 TODO:
  //   1. Extract key_prefix = key.substring(0, 12)
  //   2. SELECT * FROM api_keys WHERE key_prefix = $1
  //   3. Verify crypto.createHash('sha256').update(key).digest('hex') === row.key_hash
  //   4. Check row.revoked_at IS NULL
  //   5. Attach full tenant record from the tenants table
  // ------------------------------------------------------------------

  req.tenant = {
    id: 'default',
    apiKeyPrefix: key.substring(0, 12),
  };

  next();
}
