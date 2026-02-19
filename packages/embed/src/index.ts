/**
 * @tranzmit/exit-button-embed
 * Embeddable Exit Button widget for any website
 *
 * Usage:
 * <script
 *   src="https://api.tranzmitai.com/embed.js"
 *   data-api-key="eb_live_xxxx"
 *   data-user-id="{{USER_ID}}"
 *   data-plan-name="{{PLAN_NAME}}"
 *   data-mrr="{{MRR}}"
 *   data-attach="#cancel-btn"
 * ></script>
 */

import {
  createApiClient,
  ExitButtonApiClient,
  EmbedConfig,
  ModalState,
  TranscriptEntry,
  Offer,
  ExitButtonError,
} from '@tranzmit/exit-button-core';
import { ModalManager } from './modal';
import { VoiceHandler } from './voice';
import { ElevenLabsAgentHandler } from './elevenlabs-agent';
import { injectStyles, removeStyles } from './styles';

export interface ExitButtonInstance {
  /** Start the cancellation flow */
  start: () => Promise<void>;
  /** Close the modal */
  close: () => void;
  /** Destroy the instance and cleanup */
  destroy: () => void;
  /** Get current state */
  getState: () => ModalState;
}

// Mock data for testing
const MOCK_OFFERS: Offer[] = [
  {
    type: 'discount',
    headline: 'Stay with us at 30% off',
    description: "We'll apply a 30% discount for the next 3 months while we address your concerns.",
    value: '30% off for 3 months',
    confidence: 0.85,
  },
  {
    type: 'pause',
    headline: 'Take a break instead',
    description: 'Pause your subscription for up to 3 months. Resume anytime.',
    value: 'Pause up to 3 months',
    confidence: 0.72,
  },
  {
    type: 'concierge',
    headline: 'Personal support call',
    description: 'Schedule a 1:1 call with our success team to resolve any issues.',
    value: '30-min call with Customer Success',
    confidence: 0.65,
  },
];

interface ExtendedEmbedConfig extends EmbedConfig {
  /** Enable mock mode for local testing without API */
  mockMode?: boolean;
  /** ElevenLabs API key for voice synthesis (legacy TTS mode) */
  elevenLabsApiKey?: string;
  /** ElevenLabs voice ID for legacy TTS mode (defaults to Rachel) */
  elevenLabsVoiceId?: string;
  /** ElevenLabs Agent ID for full conversational AI (recommended) */
  elevenLabsAgentId?: string;
  /** Signed URL for private ElevenLabs agents */
  elevenLabsSignedUrl?: string;
  /** Backend URL for PostHog integration */
  backendUrl?: string;
  /** PostHog distinct_id for the user (explicit override — auto-detected if PostHog JS is on the page) */
  posthogDistinctId?: string;
}

/**
 * Auto-detect PostHog distinct_id from the page's PostHog JS SDK.
 * Checks window.posthog (standard) and _POSTHOG_ variants.
 * Returns null if PostHog JS is not loaded.
 */
function detectPosthogDistinctId(): string | null {
  try {
    const ph = (window as any).posthog;
    if (ph && typeof ph.get_distinct_id === 'function') {
      const id = ph.get_distinct_id();
      if (id && typeof id === 'string') return id;
    }
  } catch { /* ignore */ }
  return null;
}

class ExitButton implements ExitButtonInstance {
  private config: ExtendedEmbedConfig;
  private apiClient: ExitButtonApiClient;
  private modal: ModalManager | null = null;
  private voice: VoiceHandler | null = null;
  private elevenLabsAgent: ElevenLabsAgentHandler | null = null;
  private sessionId: string | null = null;
  private currentState: ModalState = 'closed';
  private offers: Offer[] = [];
  private transcript: TranscriptEntry[] = [];
  private attachedElement: HTMLElement | null = null;
  private boundClickHandler: ((e: Event) => void) | null = null;
  private mockMode: boolean;
  private useElevenLabsAgent: boolean;

  constructor(config: ExtendedEmbedConfig) {
    this.config = config;
    this.mockMode = config.mockMode || config.apiKey.startsWith('eb_test_') || config.apiKey === 'mock';
    this.useElevenLabsAgent = !!(config.elevenLabsAgentId || config.elevenLabsSignedUrl);

    // Use backendUrl if provided, otherwise fall back (required for non-mock mode)
    const baseUrl = config.backendUrl || 'https://api.tranzmitai.com/v1';
    this.apiClient = createApiClient({ apiKey: config.apiKey, baseUrl });

    // Auto-detect PostHog distinct_id if not explicitly provided
    if (!config.posthogDistinctId) {
      const detected = detectPosthogDistinctId();
      if (detected) {
        this.config.posthogDistinctId = detected;
        console.log('[ExitButton] Auto-detected PostHog distinct_id:', detected);
      }
    }

    // Auto-attach if selector provided
    if (config.attach) {
      this.attachToElement(config.attach);
    }

    // Apply custom theme
    if (config.theme) {
      this.applyTheme(config.theme);
    }
  }

  /**
   * Start the cancellation flow
   */
  async start(): Promise<void> {
    if (this.currentState !== 'closed') {
      return;
    }

    injectStyles();
    this.createModal();
    this.modal?.open();
    this.setState('connecting');

    // Use mock mode for testing
    if (this.mockMode) {
      await this.startMockFlow();
      return;
    }

    try {
      // Initiate session
      const response = await this.apiClient.initiate({
        userId: this.config.userId,
        planName: this.config.planName,
        mrr: this.config.mrr,
        accountAge: this.config.accountAge,
        metadata: this.config.metadata,
      });

      this.sessionId = response.sessionId;

      // Check microphone availability
      const hasMic = await VoiceHandler.isMicrophoneAvailable();

      if (hasMic) {
        this.setState('permission');
      } else {
        // Skip to text-only interview
        this.setupVoiceHandler(response.sessionId);
        this.modal?.enableFallback();
        this.setState('interview');
        await this.connectVoice();
      }
    } catch (error) {
      this.handleError(error as ExitButtonError);
    }
  }

  /**
   * Mock flow for local testing with voice
   */
  private async startMockFlow(): Promise<void> {
    this.sessionId = 'mock_session_' + Date.now();

    // Simulate connection delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    // If ElevenLabs Agent is configured, use it instead of mock
    if (this.useElevenLabsAgent) {
      await this.startElevenLabsAgentFlow();
      return;
    }

    // Setup voice handler for mock mode
    this.voice = new VoiceHandler({
      mockMode: true,
      elevenLabsApiKey: this.config.elevenLabsApiKey,
      voiceId: this.config.elevenLabsVoiceId,
      onStateChange: (state) => {
        this.modal?.updateVoiceState(state);
      },
      onTranscript: (entry) => {
        this.transcript.push(entry);
        this.modal?.addTranscriptEntry(entry);

        // If user spoke, generate AI response
        if (entry.role === 'user') {
          this.generateMockAIResponse(entry.content);
        }
      },
      onOffers: (offers) => {
        this.offers = offers;
        this.config.onOffer?.(offers);
        this.setState('offers');
        this.modal?.updateOffers(offers);
      },
      onError: (error) => {
        this.handleError(error);
      },
    });

    // Check if voice is supported
    const hasMic = await VoiceHandler.isMicrophoneAvailable();
    const hasSpeechRecognition = VoiceHandler.isSpeechRecognitionSupported();

    if (hasMic && hasSpeechRecognition) {
      // Voice mode
      this.setState('permission');
    } else {
      // Text fallback
      this.modal?.enableFallback();
      this.setState('interview');
      await this.startMockInterview();
    }
  }

  /**
   * Start flow using ElevenLabs Conversational AI Agent
   */
  private async startElevenLabsAgentFlow(): Promise<void> {
    let agentId = this.config.elevenLabsAgentId!;
    let signedUrl = this.config.elevenLabsSignedUrl;
    let posthogContext: string | undefined;
    let dynamicVariables: Record<string, string> | undefined;

    // Use the API client to initiate session (fetches PostHog analytics + signed URL)
    if (this.config.backendUrl) {
      try {
        this.modal?.setStatusText('Analyzing your usage history...');

        // Re-check for PostHog distinct_id right before the call (may have loaded late)
        const posthogDistinctId = this.config.posthogDistinctId || detectPosthogDistinctId() || this.config.userId;

        const data = await this.apiClient.initiate({
          userId: posthogDistinctId,
          planName: this.config.planName,
          mrr: this.config.mrr,
          accountAge: this.config.accountAge,
        });

        console.log('[ExitButton] Session initiated:', data.sessionId);

        // Use backend-provided agent ID and signed URL if available
        if (data.agentId) agentId = data.agentId;
        if (data.signedUrl) signedUrl = data.signedUrl;
        if (data.context) posthogContext = data.context;
        if (data.dynamicVariables) dynamicVariables = data.dynamicVariables;

        // Store session ID from backend
        this.sessionId = data.sessionId;
      } catch (error) {
        console.warn('[ExitButton] Failed to initiate session, proceeding without analytics:', error);
      }
    }

    this.elevenLabsAgent = new ElevenLabsAgentHandler({
      agentId,
      signedUrl,
      userId: this.config.userId,
      planName: this.config.planName,
      mrr: this.config.mrr,
      accountAge: this.config.accountAge,
      posthogContext,
      dynamicVariables, // Pass dynamic variables for ElevenLabs agent
      onStateChange: (state) => {
        this.modal?.updateVoiceState(state);
      },
      onTranscript: (entry) => {
        this.transcript.push(entry);
        this.modal?.addTranscriptEntry(entry);
      },
      onOffers: (offers) => {
        this.offers = offers;
        this.config.onOffer?.(offers);
        this.setState('offers');
        this.modal?.updateOffers(offers);
      },
      onInterviewComplete: (result) => {
        // Report completion to backend
        this.reportSessionComplete(result.retained, result.offer);

        const mockSession = {
          id: this.sessionId!,
          userId: this.config.userId,
          status: result.retained ? 'retained' as const : 'churned' as const,
          voiceTranscript: this.transcript,
          offers: this.offers,
          acceptedOffer: result.offer,
          churnRiskScore: result.retained ? 35 : 72,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        this.config.onComplete?.(mockSession);
        this.setState('done');
      },
      onError: (error) => {
        this.handleError(error);
      },
    });

    // Request microphone permission and start
    this.setState('permission');
  }

  /**
   * Report session completion to backend
   */
  private async reportSessionComplete(retained: boolean, acceptedOffer?: Offer): Promise<void> {
    if (!this.config.backendUrl) return;

    try {
      await fetch(`${this.config.backendUrl}/api/exit-session/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId,
          userId: this.config.userId,
          outcome: retained ? 'retained' : 'churned',
          acceptedOffer,
          transcript: this.transcript,
        }),
      });
    } catch (error) {
      console.warn('[ExitButton] Failed to report session completion:', error);
    }
  }

  /**
   * Start mock interview with voice
   */
  private async startMockInterview(): Promise<void> {
    const greeting = "I'm sorry to hear you're considering cancellation. Could you share what's prompting this decision?";

    // Add to transcript
    const entry: TranscriptEntry = {
      role: 'assistant',
      content: greeting,
      timestamp: new Date().toISOString(),
    };
    this.transcript.push(entry);
    this.modal?.addTranscriptEntry(entry);

    // Speak the greeting
    if (this.voice) {
      await this.voice.speakText(greeting);
      this.voice.startListening();
    }
  }

  /**
   * Generate mock AI response based on user input
   */
  private async generateMockAIResponse(userMessage: string): Promise<void> {
    // Simple response logic based on keywords
    let response: string;
    const lowerMessage = userMessage.toLowerCase();

    if (lowerMessage.includes('expensive') || lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('money')) {
      response = "I understand pricing is a concern. We really value you as a customer. Let me see what options we can offer to make this work for your budget.";
    } else if (lowerMessage.includes('feature') || lowerMessage.includes('missing') || lowerMessage.includes('need')) {
      response = "Thank you for that feedback about features. Your input helps us improve. I'd like to show you some options that might address your needs.";
    } else if (lowerMessage.includes('bug') || lowerMessage.includes('issue') || lowerMessage.includes('problem') || lowerMessage.includes('broken')) {
      response = "I'm really sorry you've experienced issues. That's not the experience we want for you. Let me offer some ways to make this right.";
    } else if (lowerMessage.includes('competitor') || lowerMessage.includes('alternative') || lowerMessage.includes('switch')) {
      response = "I appreciate you being honest with me. Before you go, let me show you some exclusive options that might change your mind.";
    } else {
      response = "Thank you for sharing that with me. I really appreciate your honesty. Let me show you some options we can offer to help.";
    }

    // Add to transcript
    const entry: TranscriptEntry = {
      role: 'assistant',
      content: response,
      timestamp: new Date().toISOString(),
    };
    this.transcript.push(entry);
    this.modal?.addTranscriptEntry(entry);

    // Speak the response
    if (this.voice) {
      await this.voice.speakText(response);
    }

    // After AI responds, show offers
    setTimeout(() => {
      this.offers = MOCK_OFFERS;
      this.config.onOffer?.(this.offers);
      this.setState('offers');
      this.modal?.updateOffers(this.offers);
    }, 1000);
  }

  /**
   * Handle mock text submission (for text fallback)
   */
  private handleMockTextSubmit(text: string): void {
    // Add user message
    const userEntry: TranscriptEntry = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    this.transcript.push(userEntry);
    this.modal?.addTranscriptEntry(userEntry);

    // Generate AI response
    this.generateMockAIResponse(text);
  }

  /**
   * Close the modal
   */
  close(): void {
    this.modal?.close();
    this.cleanup();
  }

  /**
   * Destroy the instance
   */
  destroy(): void {
    this.close();
    this.detachFromElement();
    removeStyles();
  }

  /**
   * Get current state
   */
  getState(): ModalState {
    return this.currentState;
  }

  private createModal(): void {
    this.modal = new ModalManager({
      onClose: () => this.cleanup(),
      onOfferSelect: (index) => this.acceptOffer(index),
      onProceedCancel: () => this.proceedWithCancellation(),
      onTextSubmit: (text) => {
        if (this.elevenLabsAgent) {
          this.elevenLabsAgent.sendText(text);
        } else if (this.mockMode) {
          this.handleMockTextSubmit(text);
        } else {
          this.voice?.sendText(text);
        }
      },
      onRequestPermission: () => this.requestPermissionAndConnect(),
      onRetry: () => this.start(),
    });
  }

  private async requestPermissionAndConnect(): Promise<void> {
    // If using ElevenLabs Agent, connect directly (SDK handles permissions)
    if (this.elevenLabsAgent) {
      try {
        this.setState('interview');
        await this.elevenLabsAgent.connect();
      } catch (error) {
        // If connection fails (e.g., mic denied), fall back to text
        this.modal?.enableFallback();
      }
      return;
    }

    // For mock mode, voice handler is already set up
    if (!this.voice) {
      this.setupVoiceHandler(this.sessionId!);
    }

    const granted = await this.voice!.requestPermission();
    if (granted) {
      this.setState('interview');

      if (this.mockMode) {
        // Start mock interview with voice
        await this.voice!.connect();
        await this.startMockInterview();
      } else {
        await this.connectVoice();
      }
    } else {
      // Fall back to text
      this.modal?.enableFallback();
      this.setState('interview');

      if (this.mockMode) {
        await this.startMockInterview();
      } else {
        await this.connectVoice();
      }
    }
  }

  private setupVoiceHandler(sessionId: string): void {
    // Voice goes through ElevenLabs directly — this handler is for legacy/mock mode only
    const voiceUrl = `wss://api.tranzmitai.com/v1/cancel/voice?sessionId=${sessionId}`;

    this.voice = new VoiceHandler({
      url: voiceUrl,
      onStateChange: (state) => {
        this.modal?.updateVoiceState(state);
      },
      onTranscript: (entry) => {
        this.transcript.push(entry);
        this.modal?.addTranscriptEntry(entry);
      },
      onInterviewComplete: () => {
        this.completeSession();
      },
      onOffers: (offers) => {
        this.offers = offers;
        this.config.onOffer?.(offers);
        this.setState('offers');
        this.modal?.updateOffers(offers);
      },
      onError: (error) => {
        this.handleError(error);
      },
    });
  }

  private async connectVoice(): Promise<void> {
    try {
      await this.voice?.connect();
    } catch (error) {
      this.handleError(error as ExitButtonError);
    }
  }

  private async acceptOffer(index: number): Promise<void> {
    this.setState('completing');

    if (this.mockMode) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const mockSession = {
        id: this.sessionId!,
        userId: this.config.userId,
        status: 'retained' as const,
        voiceTranscript: this.transcript,
        offers: this.offers,
        acceptedOffer: this.offers[index],
        churnRiskScore: 45,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.config.onComplete?.(mockSession);
      this.setState('done');
      return;
    }

    try {
      await this.apiClient.complete(this.sessionId!, {
        userId: this.config.userId,
        outcome: 'retained',
        acceptedOffer: this.offers[index],
        transcript: this.transcript,
      });
      const sessionData = {
        id: this.sessionId!,
        userId: this.config.userId,
        status: 'retained' as const,
        voiceTranscript: this.transcript,
        offers: this.offers,
        acceptedOffer: this.offers[index],
        churnRiskScore: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.config.onComplete?.(sessionData);
      this.setState('done');
    } catch (error) {
      this.handleError(error as ExitButtonError);
    }
  }

  private async proceedWithCancellation(): Promise<void> {
    this.setState('completing');

    if (this.mockMode) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const mockSession = {
        id: this.sessionId!,
        userId: this.config.userId,
        status: 'churned' as const,
        voiceTranscript: this.transcript,
        offers: this.offers,
        churnRiskScore: 72,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.config.onComplete?.(mockSession);
      this.setState('done');
      return;
    }

    try {
      await this.apiClient.complete(this.sessionId!, {
        userId: this.config.userId,
        outcome: 'churned',
        transcript: this.transcript,
      });
      const sessionData = {
        id: this.sessionId!,
        userId: this.config.userId,
        status: 'churned' as const,
        voiceTranscript: this.transcript,
        offers: this.offers,
        churnRiskScore: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.config.onComplete?.(sessionData);
      this.setState('done');
    } catch (error) {
      this.handleError(error as ExitButtonError);
    }
  }

  private async completeSession(): Promise<void> {
    // If we have offers, show them; otherwise complete
    if (this.offers.length > 0) {
      this.setState('offers');
      this.modal?.updateOffers(this.offers);
    } else {
      this.setState('completing');
      try {
        await this.apiClient.complete(this.sessionId!, {
          userId: this.config.userId,
          outcome: 'churned',
          transcript: this.transcript,
        });
        const sessionData = {
          id: this.sessionId!,
          userId: this.config.userId,
          status: 'churned' as const,
          voiceTranscript: this.transcript,
          offers: this.offers,
          churnRiskScore: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        this.config.onComplete?.(sessionData);
        this.setState('done');
      } catch (error) {
        this.handleError(error as ExitButtonError);
      }
    }
  }

  private setState(state: ModalState): void {
    this.currentState = state;
    this.modal?.setState(state);
    this.config.onStateChange?.(state);
  }

  private handleError(error: ExitButtonError | Error): void {
    console.error('ExitButton error:', error);
    this.config.onError?.(
      error instanceof Error
        ? new ExitButtonError(error.message, 'UNKNOWN_ERROR')
        : error
    );
    this.setState('error');
  }

  private cleanup(): void {
    this.voice?.disconnect();
    this.voice = null;
    this.elevenLabsAgent?.disconnect();
    this.elevenLabsAgent = null;
    this.modal?.destroy();
    this.modal = null;
    this.sessionId = null;
    this.currentState = 'closed';
    this.offers = [];
    this.transcript = [];
  }

  private attachToElement(selector: string): void {
    const element = document.querySelector(selector) as HTMLElement;
    if (!element) {
      console.warn(`ExitButton: Element "${selector}" not found`);
      return;
    }

    this.attachedElement = element;
    this.boundClickHandler = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.start();
    };

    element.addEventListener('click', this.boundClickHandler);
  }

  private detachFromElement(): void {
    if (this.attachedElement && this.boundClickHandler) {
      this.attachedElement.removeEventListener('click', this.boundClickHandler);
      this.attachedElement = null;
      this.boundClickHandler = null;
    }
  }

  private applyTheme(theme: EmbedConfig['theme']): void {
    if (!theme) return;

    const root = document.documentElement;
    if (theme.primaryColor) {
      root.style.setProperty('--exit-button-primary', theme.primaryColor);
    }
    if (theme.primaryHoverColor) {
      root.style.setProperty('--exit-button-primary-hover', theme.primaryHoverColor);
    }
    if (theme.backgroundColor) {
      root.style.setProperty('--exit-button-background', theme.backgroundColor);
    }
    if (theme.surfaceColor) {
      root.style.setProperty('--exit-button-surface', theme.surfaceColor);
    }
    if (theme.textColor) {
      root.style.setProperty('--exit-button-text', theme.textColor);
    }
    if (theme.textSecondaryColor) {
      root.style.setProperty('--exit-button-text-secondary', theme.textSecondaryColor);
    }
    if (theme.errorColor) {
      root.style.setProperty('--exit-button-error', theme.errorColor);
    }
    if (theme.successColor) {
      root.style.setProperty('--exit-button-success', theme.successColor);
    }
    if (theme.borderRadius) {
      root.style.setProperty('--exit-button-radius', theme.borderRadius);
    }
    if (theme.fontFamily) {
      root.style.setProperty('--exit-button-font', theme.fontFamily);
    }
  }
}

// ============ Public API ============

let instance: ExitButton | null = null;

/**
 * Initialize Exit Button with configuration
 */
export function init(config: EmbedConfig): ExitButtonInstance {
  if (instance) {
    instance.destroy();
  }
  instance = new ExitButton(config);
  return instance;
}

/**
 * Start the cancellation flow
 */
export function start(): Promise<void> {
  if (!instance) {
    throw new Error('ExitButton not initialized. Call init() first.');
  }
  return instance.start();
}

/**
 * Close the modal
 */
export function close(): void {
  instance?.close();
}

/**
 * Destroy the instance
 */
export function destroy(): void {
  instance?.destroy();
  instance = null;
}

/**
 * Get current state
 */
export function getState(): ModalState {
  return instance?.getState() || 'closed';
}

// ============ Auto-initialization from script tag ============

function autoInit(): void {
  const script = document.currentScript as HTMLScriptElement;
  if (!script) return;

  const apiKey = script.dataset.apiKey;
  const userId = script.dataset.userId;

  if (!apiKey || !userId) {
    console.warn('ExitButton: data-api-key and data-user-id are required');
    return;
  }

  const config: ExtendedEmbedConfig = {
    apiKey,
    userId,
    planName: script.dataset.planName,
    mrr: script.dataset.mrr ? parseFloat(script.dataset.mrr) : undefined,
    accountAge: script.dataset.accountAge,
    attach: script.dataset.attach,
    backendUrl: script.dataset.backendUrl,
    elevenLabsAgentId: script.dataset.elevenLabsAgentId,
    posthogDistinctId: script.dataset.posthogDistinctId,
  };

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init(config));
  } else {
    init(config);
  }
}

// Auto-init when script loads
autoInit();

// Export for ESM/CJS usage
export { ExitButton };
export type { EmbedConfig };
