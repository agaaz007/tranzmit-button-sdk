/**
 * Route tests for the Exit Button Backend
 *
 * Mocks external dependencies (config, logger, PostHog, ElevenLabs)
 * so tests run without real API keys or network calls.
 */

// ============ Mocks (MUST be before any imports) ============

// Prevent the uncaughtException / SIGTERM handlers in index.ts from calling process.exit
// by removing those listeners after the module loads.
// We also need to capture the original listeners so we can restore them.
const originalListeners = {
  uncaughtException: process.listeners('uncaughtException').slice(),
  SIGTERM: process.listeners('SIGTERM').slice(),
  SIGINT: process.listeners('SIGINT').slice(),
  unhandledRejection: process.listeners('unhandledRejection').slice(),
};

vi.mock('../config', () => ({
  config: {
    posthogApiKey: 'test',
    posthogProjectId: '123',
    posthogHost: 'https://app.posthog.com',
    elevenLabsApiKey: 'test',
    elevenLabsAgentId: 'test_agent',
    groqApiKey: 'test',
    port: 0, // Use port 0 so the OS picks a free port
    nodeEnv: 'test',
  },
}));

vi.mock('../lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

vi.mock('pino-http', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../lib/posthog-session-analysis', () => ({
  analyzeUserSessions: vi.fn().mockResolvedValue({
    recordings: [],
    analysis: null,
    aiAnalysis: null,
    contextForAgent: 'Test context for agent',
    timing: {
      personUuid_ms: 0,
      recordingsList_ms: 0,
      analyticsEvents_ms: 0,
      posthogParallel_ms: 0,
      elementExtraction_ms: 0,
      blobFetch_ms: 0,
      rrwebParse_ms: 0,
      enrichment_ms: 0,
      aiAnalysis_ms: 0,
      contextGen_ms: 0,
      total_ms: 0,
    },
  }),
}));

// Mock global fetch for ElevenLabs signed URL and PostHog capture
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ============ Imports ============

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index';

// After importing the app, remove the process handlers that index.ts registered.
// This prevents process.exit calls from interfering with vitest.
process.removeAllListeners('uncaughtException');
process.removeAllListeners('SIGTERM');
process.removeAllListeners('SIGINT');
process.removeAllListeners('unhandledRejection');

// Restore the original listeners that existed before our import
for (const listener of originalListeners.uncaughtException) {
  process.on('uncaughtException', listener as NodeJS.UncaughtExceptionListener);
}
for (const listener of originalListeners.unhandledRejection) {
  process.on('unhandledRejection', listener as NodeJS.UnhandledRejectionListener);
}

// ============ Setup ============

beforeEach(() => {
  vi.clearAllMocks();

  // Default: ElevenLabs signed URL returns successfully
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ signed_url: 'wss://test.elevenlabs.io/signed' }),
    text: async () => '',
  });
});

// ============ Tests ============

describe('GET /api/health', () => {
  it('returns status ok', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('version', '0.1.0');
    expect(res.body).toHaveProperty('timestamp');
  });
});

describe('POST /api/exit-session/initiate', () => {
  it('returns 200 with sessionId, agentId, and signedUrl for valid body', async () => {
    const res = await request(app)
      .post('/api/exit-session/initiate')
      .send({ userId: 'user_123', planName: 'Pro', mrr: 49, accountAge: '6 months' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sessionId');
    expect(res.body.sessionId).toMatch(/^exit_\d+_user_123$/);
    expect(res.body).toHaveProperty('agentId', 'test_agent');
    expect(res.body).toHaveProperty('signedUrl', 'wss://test.elevenlabs.io/signed');
  });

  it('returns 400 when userId is missing', async () => {
    const res = await request(app)
      .post('/api/exit-session/initiate')
      .send({ planName: 'Pro' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
    expect(res.body).toHaveProperty('details');
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.stringContaining('userId')])
    );
  });

  it('returns 400 when userId is an empty string', async () => {
    const res = await request(app)
      .post('/api/exit-session/initiate')
      .send({ userId: '' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
  });
});

describe('POST /api/exit-session/complete', () => {
  it('returns 200 with success for valid body', async () => {
    const res = await request(app)
      .post('/api/exit-session/complete')
      .send({
        sessionId: 'exit_123_user_456',
        userId: 'user_456',
        outcome: 'retained',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('sessionId', 'exit_123_user_456');
    expect(res.body).toHaveProperty('outcome', 'retained');
  });

  it('returns 400 when sessionId is missing', async () => {
    const res = await request(app)
      .post('/api/exit-session/complete')
      .send({ userId: 'user_456', outcome: 'churned' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
    expect(res.body).toHaveProperty('details');
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.stringContaining('sessionId')])
    );
  });

  it('returns 400 when sessionId is an empty string', async () => {
    const res = await request(app)
      .post('/api/exit-session/complete')
      .send({ sessionId: '' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
  });
});
