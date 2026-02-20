/**
 * In-memory TTL cache for prefetched PostHog session analysis results.
 *
 * Stores both completed results AND in-flight promises so that concurrent
 * `/initiate` calls can await the same work instead of duplicating it.
 */

import { logger } from './logger';

export interface PrefetchEntry {
  /** Resolved analysis data (null while still pending) */
  data: unknown | null;
  /** In-flight promise (null once resolved) */
  pending: Promise<unknown> | null;
  /** Epoch-ms when this entry was created */
  createdAt: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRIES = 500;
const EVICTION_INTERVAL_MS = 60 * 1000; // 1 minute

const cache = new Map<string, PrefetchEntry>();

// Periodic eviction of expired entries
const evictionTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (now - v.createdAt > TTL_MS) {
      cache.delete(k);
    }
  }
}, EVICTION_INTERVAL_MS);

// Allow Node to exit without waiting for the timer
if (typeof evictionTimer === 'object' && 'unref' in evictionTimer) {
  evictionTimer.unref();
}

/**
 * Build a deterministic cache key from tenant + user IDs.
 */
export function prefetchKey(tenantId: string, userId: string): string {
  return `${tenantId}::${userId}`;
}

/**
 * Look up a cached result.
 */
export function prefetchGet(key: string): { hit: boolean; data: unknown | null; pending: Promise<unknown> | null } {
  const entry = cache.get(key);
  if (!entry) return { hit: false, data: null, pending: null };

  // Expired?
  if (Date.now() - entry.createdAt > TTL_MS) {
    cache.delete(key);
    return { hit: false, data: null, pending: null };
  }

  return { hit: true, data: entry.data, pending: entry.pending };
}

/**
 * Store an in-flight promise. When it resolves the entry is auto-populated
 * with the result. If it rejects the entry is removed.
 */
export function prefetchSetPending(key: string, promise: Promise<unknown>): void {
  // Enforce max size — evict oldest entry if at capacity
  if (cache.size >= MAX_ENTRIES && !cache.has(key)) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [k, v] of cache) {
      if (v.createdAt < oldestTime) {
        oldestTime = v.createdAt;
        oldestKey = k;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }

  const entry: PrefetchEntry = {
    data: null,
    pending: promise,
    createdAt: Date.now(),
  };

  cache.set(key, entry);

  promise
    .then((result) => {
      // Only update if the entry is still ours (hasn't been evicted/replaced)
      const current = cache.get(key);
      if (current === entry) {
        entry.data = result;
        entry.pending = null;
      }
    })
    .catch((err) => {
      logger.warn({ err, key }, 'Prefetch promise rejected, removing cache entry');
      const current = cache.get(key);
      if (current === entry) {
        cache.delete(key);
      }
    });
}

/**
 * Remove a specific entry (e.g. on cleanup).
 */
export function prefetchDelete(key: string): void {
  cache.delete(key);
}

/**
 * Clear all entries (useful for tests).
 */
export function prefetchClear(): void {
  cache.clear();
}
