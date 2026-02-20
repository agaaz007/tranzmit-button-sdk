import { describe, it, expect, beforeEach } from 'vitest';
import {
  prefetchKey,
  prefetchGet,
  prefetchSetPending,
  prefetchDelete,
  prefetchClear,
} from '../lib/prefetch-cache';

beforeEach(() => {
  prefetchClear();
});

describe('prefetchKey', () => {
  it('produces a deterministic key from tenantId and userId', () => {
    expect(prefetchKey('t1', 'u1')).toBe('t1::u1');
    expect(prefetchKey('default', 'user_42')).toBe('default::user_42');
  });
});

describe('prefetchGet', () => {
  it('returns hit:false for unknown keys', () => {
    const result = prefetchGet('nonexistent');
    expect(result.hit).toBe(false);
    expect(result.data).toBeNull();
    expect(result.pending).toBeNull();
  });
});

describe('prefetchSetPending', () => {
  it('stores a pending promise that is visible via prefetchGet', () => {
    const promise = new Promise(() => {}); // never resolves
    prefetchSetPending('k1', promise);

    const result = prefetchGet('k1');
    expect(result.hit).toBe(true);
    expect(result.data).toBeNull();
    expect(result.pending).toBe(promise);
  });

  it('auto-populates data when promise resolves', async () => {
    const data = { recordings: [], aiAnalysis: null };
    const promise = Promise.resolve(data);
    prefetchSetPending('k2', promise);

    // Wait for microtask to flush
    await promise;
    await new Promise((r) => setTimeout(r, 0));

    const result = prefetchGet('k2');
    expect(result.hit).toBe(true);
    expect(result.data).toEqual(data);
    expect(result.pending).toBeNull();
  });

  it('removes entry when promise rejects', async () => {
    const promise = Promise.reject(new Error('boom'));
    // Silence unhandled rejection warning
    promise.catch(() => {});

    prefetchSetPending('k3', promise);

    // Wait for microtask to flush
    await new Promise((r) => setTimeout(r, 10));

    const result = prefetchGet('k3');
    expect(result.hit).toBe(false);
  });

  it('deduplicates: second set with same key replaces first', () => {
    const p1 = new Promise(() => {});
    const p2 = new Promise(() => {});

    prefetchSetPending('k4', p1);
    prefetchSetPending('k4', p2);

    const result = prefetchGet('k4');
    expect(result.pending).toBe(p2);
  });
});

describe('prefetchDelete', () => {
  it('removes a specific entry', () => {
    prefetchSetPending('k5', new Promise(() => {}));
    expect(prefetchGet('k5').hit).toBe(true);

    prefetchDelete('k5');
    expect(prefetchGet('k5').hit).toBe(false);
  });
});

describe('prefetchClear', () => {
  it('removes all entries', () => {
    prefetchSetPending('a', new Promise(() => {}));
    prefetchSetPending('b', new Promise(() => {}));

    prefetchClear();

    expect(prefetchGet('a').hit).toBe(false);
    expect(prefetchGet('b').hit).toBe(false);
  });
});

describe('cache hit → initiate flow', () => {
  it('simulates prefetch then initiate reading cached data', async () => {
    const analysisResult = {
      recordings: [{ id: 'rec_1' }],
      aiAnalysis: { churn_risk: 'high' },
      contextForAgent: 'User was frustrated',
      timing: { total_ms: 3200 },
    };

    // 1. Prefetch: start analysis
    const promise = Promise.resolve(analysisResult);
    const key = prefetchKey('tenant_1', 'user_42');
    prefetchSetPending(key, promise);

    // 2. Wait for it to complete
    await promise;
    await new Promise((r) => setTimeout(r, 0));

    // 3. Initiate: check cache
    const cached = prefetchGet(key);
    expect(cached.hit).toBe(true);
    expect(cached.data).toEqual(analysisResult);
    expect(cached.pending).toBeNull();
  });

  it('simulates initiate hitting an in-flight prefetch', async () => {
    let resolveAnalysis!: (v: unknown) => void;
    const promise = new Promise((r) => { resolveAnalysis = r; });

    const key = prefetchKey('tenant_1', 'user_99');
    prefetchSetPending(key, promise);

    // Initiate fires while prefetch is still running
    const cached = prefetchGet(key);
    expect(cached.hit).toBe(true);
    expect(cached.data).toBeNull();
    expect(cached.pending).toBe(promise);

    // Initiate awaits the same promise
    const result = { contextForAgent: 'in-flight result' };
    resolveAnalysis(result);
    const awaited = await cached.pending;
    expect(awaited).toEqual(result);
  });
});
