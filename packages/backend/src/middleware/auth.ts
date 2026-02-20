/**
 * Authentication middleware for Exit Button API
 *
 * Validates API key format (eb_live_ or eb_test_ prefix, min 20 chars).
 * Loads per-tenant configuration (PostHog, ElevenLabs) from DB when available.
 * Falls back to global env var defaults if no DB or tenant not found.
 */

import { config } from '../config';
import { logger } from '../lib/logger';

export interface TenantConfig {
  posthogApiKey?: string;
  posthogProjectId?: string;
  posthogHost: string;
  elevenLabsApiKey?: string;
  interventionAgentId?: string;
}

export interface Tenant {
  id: string;
  apiKeyPrefix: string;
  config: TenantConfig;
}

declare global {
  namespace Express {
    interface Request {
      tenant?: Tenant;
    }
  }
}

const VALID_PREFIXES = ['eb_live_', 'eb_test_'] as const;
const MIN_KEY_LENGTH = 20;

function isValidKeyFormat(key: string): boolean {
  if (key.length < MIN_KEY_LENGTH) return false;
  return VALID_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function getDefaultConfig(): TenantConfig {
  return {
    posthogApiKey: config.posthogApiKey,
    posthogProjectId: config.posthogProjectId,
    posthogHost: config.posthogHost,
    elevenLabsApiKey: config.elevenLabsApiKey,
    interventionAgentId: config.elevenLabsAgentId,
  };
}

/**
 * Load tenant config from DB by API key prefix.
 * Returns null if DB is unavailable or tenant not found.
 */
async function loadTenantFromDb(keyPrefix: string): Promise<{ id: string; config: TenantConfig } | null> {
  try {
    // Dynamic import to avoid circular dependency and handle missing DB gracefully
    const { db, apiKeys, tenants } = await import('../db');
    const { eq } = await import('drizzle-orm');

    if (!db) return null;

    const result = await db
      .select({
        tenantId: tenants.id,
        posthogApiKey: tenants.posthogApiKey,
        posthogProjectId: tenants.posthogProjectId,
        posthogHost: tenants.posthogHost,
        elevenLabsApiKey: tenants.elevenLabsApiKey,
        interventionAgentId: tenants.interventionAgentId,
      })
      .from(apiKeys)
      .innerJoin(tenants, eq(apiKeys.tenantId, tenants.id))
      .where(eq(apiKeys.keyPrefix, keyPrefix))
      .limit(1);

    if (result.length === 0) return null;

    const row = result[0]!;
    return {
      id: row.tenantId,
      config: {
        posthogApiKey: row.posthogApiKey || undefined,
        posthogProjectId: row.posthogProjectId || undefined,
        posthogHost: row.posthogHost || 'https://app.posthog.com',
        elevenLabsApiKey: row.elevenLabsApiKey || undefined,
        interventionAgentId: row.interventionAgentId || undefined,
      },
    };
  } catch (err) {
    logger.warn({ err }, 'Failed to load tenant from DB');
    return null;
  }
}

export function authenticate(req: any, res: any, next: any): void {
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

  const keyPrefix = key.substring(0, 12);

  // Try to load tenant config from DB, fall back to global defaults
  loadTenantFromDb(keyPrefix)
    .then((tenant) => {
      if (tenant) {
        // Merge: tenant-specific values override, fall back to global for any missing
        const defaults = getDefaultConfig();
        req.tenant = {
          id: tenant.id,
          apiKeyPrefix: keyPrefix,
          config: {
            posthogApiKey: tenant.config.posthogApiKey || defaults.posthogApiKey,
            posthogProjectId: tenant.config.posthogProjectId || defaults.posthogProjectId,
            posthogHost: tenant.config.posthogHost || defaults.posthogHost,
            elevenLabsApiKey: tenant.config.elevenLabsApiKey || defaults.elevenLabsApiKey,
            interventionAgentId: tenant.config.interventionAgentId || defaults.interventionAgentId,
          },
        };
      } else {
        req.tenant = {
          id: 'default',
          apiKeyPrefix: keyPrefix,
          config: getDefaultConfig(),
        };
      }
      next();
    })
    .catch((err: any) => {
      logger.warn({ err }, 'Tenant config lookup failed, using defaults');
      req.tenant = {
        id: 'default',
        apiKeyPrefix: keyPrefix,
        config: getDefaultConfig(),
      };
      next();
    });
}
