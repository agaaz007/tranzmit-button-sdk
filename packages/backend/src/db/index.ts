/**
 * Database connection layer
 * Optionally connects if DATABASE_URL is set — the app works without a DB
 * for backward compatibility with the in-memory/PostHog-only flow.
 */

import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { logger } from '../lib/logger';
import * as schema from './schema';

let pool: Pool | null = null;
let db: NodePgDatabase<typeof schema> | null = null;

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl) {
  try {
    pool = new Pool({ connectionString: databaseUrl });
    db = drizzle(pool, { schema });
    logger.info('Database connection pool created');
  } catch (err) {
    logger.error({ err }, 'Failed to create database connection pool');
  }
} else {
  logger.warn('DATABASE_URL not set — running without database persistence');
}

export { db, pool };
export * from './schema';
