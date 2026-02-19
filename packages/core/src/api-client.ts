/**
 * Exit Button API Client
 * Handles all HTTP communication with the Exit Button API
 */

import {
  InitiateResponse,
  CompleteResponse,
  ExitButtonError,
} from './types';

const DEFAULT_TIMEOUT = 30000;

export interface ApiClientOptions {
  /** API key for authentication */
  apiKey: string;
  /** Base URL for the API (required — no default) */
  baseUrl: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

export class ExitButtonApiClient {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor(options: ApiClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl;
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
  }

  /**
   * Initiate a new cancellation session
   */
  async initiate(params: {
    userId: string;
    planName?: string;
    mrr?: number;
    accountAge?: string;
    metadata?: Record<string, unknown>;
  }): Promise<InitiateResponse> {
    return this.request<InitiateResponse>('/api/exit-session/initiate', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Complete a cancellation session
   */
  async complete(sessionId: string, params?: {
    userId?: string;
    outcome?: 'retained' | 'churned';
    acceptedOffer?: unknown;
    transcript?: unknown[];
  }): Promise<CompleteResponse> {
    return this.request<CompleteResponse>('/api/exit-session/complete', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        ...params,
      }),
    });
  }

  /**
   * Get session details
   */
  async getSession(sessionId: string): Promise<unknown> {
    return this.request(`/api/exit-session/${sessionId}`, {
      method: 'GET',
    });
  }

  /**
   * Make an authenticated API request
   */
  private async request<T>(endpoint: string, options: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new ExitButtonError(
          errorBody.message || `HTTP ${response.status}: ${response.statusText}`,
          errorBody.code || 'API_ERROR',
          response.status
        );
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ExitButtonError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new ExitButtonError('Request timeout', 'NETWORK_ERROR');
        }
        throw new ExitButtonError(error.message, 'NETWORK_ERROR');
      }

      throw new ExitButtonError('Unknown error', 'UNKNOWN_ERROR');
    }
  }
}

/**
 * Create an API client instance
 */
export function createApiClient(options: ApiClientOptions): ExitButtonApiClient {
  return new ExitButtonApiClient(options);
}
