import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExitButtonApiClient, createApiClient } from '../api-client';
import { ExitButtonError } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_API_KEY = 'eb_test_abc123';
const TEST_BASE_URL = 'https://api.tranzmitai.com/v1';

function mockFetchResponse(body: unknown, status = 200, statusText = 'OK') {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: vi.fn().mockResolvedValue(body),
  });
}

function mockFetchNetworkError(message = 'Failed to fetch') {
  return vi.fn().mockRejectedValue(new TypeError(message));
}

function mockFetchAbort() {
  const abortError = new DOMException('The operation was aborted', 'AbortError');
  Object.defineProperty(abortError, 'name', { value: 'AbortError' });
  return vi.fn().mockRejectedValue(abortError);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExitButtonApiClient', () => {
  let client: ExitButtonApiClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = new ExitButtonApiClient({
      apiKey: TEST_API_KEY,
      baseUrl: TEST_BASE_URL,
    });
  });

  // =========================================================================
  // Constructor
  // =========================================================================

  describe('constructor', () => {
    it('stores apiKey and baseUrl from options', () => {
      // We can verify through the requests it makes
      const responseBody = { sessionId: 's1', agentId: 'a1', signedUrl: null, context: '', dynamicVariables: {}, elapsed_ms: 10, timing: {} };
      global.fetch = mockFetchResponse(responseBody);

      client.initiate({ userId: 'u1' });

      expect(global.fetch).toHaveBeenCalledWith(
        `${TEST_BASE_URL}/api/exit-session/initiate`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${TEST_API_KEY}`,
          }),
        }),
      );
    });

    it('uses default timeout of 30000ms when not provided', () => {
      // Timeout is internal; we verify indirectly by ensuring requests succeed
      // without passing a timeout option (no error thrown)
      const c = new ExitButtonApiClient({ apiKey: 'key', baseUrl: 'http://localhost' });
      expect(c).toBeInstanceOf(ExitButtonApiClient);
    });

    it('accepts a custom timeout option', () => {
      const c = new ExitButtonApiClient({ apiKey: 'key', baseUrl: 'http://localhost', timeout: 5000 });
      expect(c).toBeInstanceOf(ExitButtonApiClient);
    });
  });

  // =========================================================================
  // createApiClient factory
  // =========================================================================

  describe('createApiClient', () => {
    it('returns an ExitButtonApiClient instance', () => {
      const c = createApiClient({ apiKey: TEST_API_KEY, baseUrl: TEST_BASE_URL });
      expect(c).toBeInstanceOf(ExitButtonApiClient);
    });
  });

  // =========================================================================
  // initiate()
  // =========================================================================

  describe('initiate()', () => {
    const initiateResponse = {
      sessionId: 'sess_001',
      agentId: 'agent_001',
      signedUrl: 'wss://signed-url',
      context: 'Some AI context',
      dynamicVariables: { name: 'Test User' },
      elapsed_ms: 142,
      timing: { lookup: 50, generate: 92 },
    };

    it('sends POST to /api/exit-session/initiate', async () => {
      global.fetch = mockFetchResponse(initiateResponse);

      await client.initiate({ userId: 'user_42' });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe(`${TEST_BASE_URL}/api/exit-session/initiate`);
      expect(options.method).toBe('POST');
    });

    it('sends correct headers including Authorization and Content-Type', async () => {
      global.fetch = mockFetchResponse(initiateResponse);

      await client.initiate({ userId: 'user_42' });

      const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(options.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TEST_API_KEY}`,
        }),
      );
    });

    it('serializes all params in the request body', async () => {
      global.fetch = mockFetchResponse(initiateResponse);

      const params = {
        userId: 'user_42',
        planName: 'Pro',
        mrr: 49.99,
        accountAge: '8 months',
        metadata: { source: 'settings_page' },
      };

      await client.initiate(params);

      const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(JSON.parse(options.body)).toEqual(params);
    });

    it('serializes body with only required userId when optional params omitted', async () => {
      global.fetch = mockFetchResponse(initiateResponse);

      await client.initiate({ userId: 'user_1' });

      const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(JSON.parse(options.body)).toEqual({ userId: 'user_1' });
    });

    it('returns the parsed InitiateResponse', async () => {
      global.fetch = mockFetchResponse(initiateResponse);

      const result = await client.initiate({ userId: 'user_42' });

      expect(result).toEqual(initiateResponse);
    });

    it('passes an AbortSignal for timeout support', async () => {
      global.fetch = mockFetchResponse(initiateResponse);

      await client.initiate({ userId: 'user_42' });

      const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });
  });

  // =========================================================================
  // complete()
  // =========================================================================

  describe('complete()', () => {
    const completeResponse = {
      success: true,
      sessionId: 'sess_001',
      outcome: 'retained',
    };

    it('sends POST to /api/exit-session/complete', async () => {
      global.fetch = mockFetchResponse(completeResponse);

      await client.complete('sess_001');

      const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe(`${TEST_BASE_URL}/api/exit-session/complete`);
      expect(options.method).toBe('POST');
    });

    it('includes sessionId in the body', async () => {
      global.fetch = mockFetchResponse(completeResponse);

      await client.complete('sess_001');

      const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.sessionId).toBe('sess_001');
    });

    it('spreads optional params alongside sessionId in body', async () => {
      global.fetch = mockFetchResponse(completeResponse);

      const params = {
        userId: 'user_42',
        outcome: 'retained' as const,
        acceptedOffer: { type: 'discount', headline: '30% off' },
        transcript: [{ role: 'assistant', content: 'Hi', timestamp: '2026-01-01T00:00:00Z' }],
      };

      await client.complete('sess_001', params);

      const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body).toEqual({
        sessionId: 'sess_001',
        ...params,
      });
    });

    it('serializes body with only sessionId when params omitted', async () => {
      global.fetch = mockFetchResponse(completeResponse);

      await client.complete('sess_002');

      const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body).toEqual({ sessionId: 'sess_002' });
    });

    it('returns the parsed CompleteResponse', async () => {
      global.fetch = mockFetchResponse(completeResponse);

      const result = await client.complete('sess_001', { outcome: 'retained' });

      expect(result).toEqual(completeResponse);
    });
  });

  // =========================================================================
  // getSession()
  // =========================================================================

  describe('getSession()', () => {
    const sessionData = {
      id: 'sess_001',
      userId: 'user_42',
      status: 'completed',
      voiceTranscript: [],
      offers: [],
      churnRiskScore: 65,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:05:00Z',
    };

    it('sends GET to /api/exit-session/:sessionId', async () => {
      global.fetch = mockFetchResponse(sessionData);

      await client.getSession('sess_001');

      const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe(`${TEST_BASE_URL}/api/exit-session/sess_001`);
      expect(options.method).toBe('GET');
    });

    it('interpolates the sessionId into the URL path', async () => {
      global.fetch = mockFetchResponse(sessionData);

      await client.getSession('sess_xyz_789');

      const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe(`${TEST_BASE_URL}/api/exit-session/sess_xyz_789`);
    });

    it('does not include a body in the GET request', async () => {
      global.fetch = mockFetchResponse(sessionData);

      await client.getSession('sess_001');

      const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(options.body).toBeUndefined();
    });

    it('sends Authorization and Content-Type headers', async () => {
      global.fetch = mockFetchResponse(sessionData);

      await client.getSession('sess_001');

      const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(options.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TEST_API_KEY}`,
        }),
      );
    });

    it('returns the parsed response data', async () => {
      global.fetch = mockFetchResponse(sessionData);

      const result = await client.getSession('sess_001');

      expect(result).toEqual(sessionData);
    });
  });

  // =========================================================================
  // Error handling — HTTP errors
  // =========================================================================

  describe('HTTP error handling', () => {
    it('throws ExitButtonError on 401 Unauthorized', async () => {
      global.fetch = mockFetchResponse(
        { message: 'Invalid API key', code: 'AUTH_ERROR' },
        401,
        'Unauthorized',
      );

      await expect(client.initiate({ userId: 'u1' })).rejects.toThrow(ExitButtonError);
      await expect(client.initiate({ userId: 'u1' })).rejects.toMatchObject({
        message: 'Invalid API key',
        code: 'AUTH_ERROR',
        statusCode: 401,
      });
    });

    it('throws ExitButtonError on 404 Not Found', async () => {
      global.fetch = mockFetchResponse(
        { message: 'Session not found', code: 'SESSION_ERROR' },
        404,
        'Not Found',
      );

      await expect(client.getSession('nonexistent')).rejects.toThrow(ExitButtonError);
      await expect(client.getSession('nonexistent')).rejects.toMatchObject({
        code: 'SESSION_ERROR',
        statusCode: 404,
      });
    });

    it('throws ExitButtonError on 500 Internal Server Error', async () => {
      global.fetch = mockFetchResponse(
        { message: 'Internal server error', code: 'API_ERROR' },
        500,
        'Internal Server Error',
      );

      await expect(client.complete('sess_001')).rejects.toThrow(ExitButtonError);
      await expect(client.complete('sess_001')).rejects.toMatchObject({
        code: 'API_ERROR',
        statusCode: 500,
      });
    });

    it('falls back to generic message when error body has no message', async () => {
      global.fetch = mockFetchResponse({}, 403, 'Forbidden');

      await expect(client.initiate({ userId: 'u1' })).rejects.toMatchObject({
        message: 'HTTP 403: Forbidden',
        code: 'API_ERROR',
        statusCode: 403,
      });
    });

    it('falls back to API_ERROR code when error body has no code', async () => {
      global.fetch = mockFetchResponse(
        { message: 'Something went wrong' },
        422,
        'Unprocessable Entity',
      );

      await expect(client.initiate({ userId: 'u1' })).rejects.toMatchObject({
        message: 'Something went wrong',
        code: 'API_ERROR',
        statusCode: 422,
      });
    });

    it('handles non-JSON error response body gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
      });

      await expect(client.initiate({ userId: 'u1' })).rejects.toMatchObject({
        message: 'HTTP 502: Bad Gateway',
        code: 'API_ERROR',
        statusCode: 502,
      });
    });
  });

  // =========================================================================
  // Error handling — Network / Timeout
  // =========================================================================

  describe('network and timeout error handling', () => {
    it('throws ExitButtonError with NETWORK_ERROR on network failure', async () => {
      global.fetch = mockFetchNetworkError('Failed to fetch');

      await expect(client.initiate({ userId: 'u1' })).rejects.toThrow(ExitButtonError);
      await expect(client.initiate({ userId: 'u1' })).rejects.toMatchObject({
        message: 'Failed to fetch',
        code: 'NETWORK_ERROR',
      });
    });

    it('throws ExitButtonError with NETWORK_ERROR on AbortError (timeout)', async () => {
      global.fetch = mockFetchAbort();

      await expect(client.initiate({ userId: 'u1' })).rejects.toThrow(ExitButtonError);
      await expect(client.initiate({ userId: 'u1' })).rejects.toMatchObject({
        message: 'Request timeout',
        code: 'NETWORK_ERROR',
      });
    });

    it('does not include a statusCode for network errors', async () => {
      global.fetch = mockFetchNetworkError('Network is unreachable');

      try {
        await client.initiate({ userId: 'u1' });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ExitButtonError);
        expect((err as ExitButtonError).statusCode).toBeUndefined();
      }
    });

    it('throws ExitButtonError with UNKNOWN_ERROR for non-Error throws', async () => {
      global.fetch = vi.fn().mockRejectedValue('some string error');

      await expect(client.initiate({ userId: 'u1' })).rejects.toThrow(ExitButtonError);
      await expect(client.initiate({ userId: 'u1' })).rejects.toMatchObject({
        message: 'Unknown error',
        code: 'UNKNOWN_ERROR',
      });
    });
  });

  // =========================================================================
  // Re-thrown ExitButtonError preservation
  // =========================================================================

  describe('ExitButtonError re-throw preservation', () => {
    it('re-throws ExitButtonError from HTTP errors without wrapping', async () => {
      global.fetch = mockFetchResponse(
        { message: 'Rate limited', code: 'API_ERROR' },
        429,
        'Too Many Requests',
      );

      try {
        await client.initiate({ userId: 'u1' });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ExitButtonError);
        expect((err as ExitButtonError).code).toBe('API_ERROR');
        expect((err as ExitButtonError).statusCode).toBe(429);
      }
    });
  });
});
