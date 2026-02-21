/**
 * Modal Manager for Exit Button
 * Creates and manages the modal DOM elements
 */

import type {
  ModalState,
  TranscriptEntry,
  Offer,
  VoiceState,
} from '@tranzmit/exit-button-core';
import { injectStyles } from './styles';
import { icons } from './icons';

export interface ModalOptions {
  /** Callback when modal is closed */
  onClose?: () => void;
  /** Callback when offer is selected */
  onOfferSelect?: (index: number) => void;
  /** Callback to proceed with cancellation */
  onProceedCancel?: () => void;
  /** Callback when text is submitted (fallback mode) */
  onTextSubmit?: (text: string) => void;
  /** Callback to request mic permission */
  onRequestPermission?: () => void;
  /** Callback to retry on error */
  onRetry?: () => void;
}

export class ModalManager {
  private container: HTMLDivElement | null = null;
  private options: ModalOptions;
  private currentState: ModalState = 'closed';
  private transcript: TranscriptEntry[] = [];
  private offers: Offer[] = [];
  private selectedOfferIndex: number | null = null;
  private voiceState: VoiceState = {
    isConnected: false,
    isSpeaking: false,
    isListening: false,
    volume: 0,
  };
  private useFallback = false;
  private statusText: string = 'Setting up your session...';

  constructor(options: ModalOptions = {}) {
    this.options = options;
    injectStyles();
  }

  /**
   * Open the modal
   */
  open(): void {
    if (this.container) return;
    this.createModal();
    this.setState('connecting');

    // Trap focus
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      const closeBtn = this.container?.querySelector('.exit-button-close') as HTMLElement;
      closeBtn?.focus();
    }, 100);
  }

  /**
   * Close the modal
   */
  close(): void {
    if (!this.container) return;

    this.container.classList.add('closing');
    setTimeout(() => {
      this.container?.remove();
      this.container = null;
      document.body.style.overflow = '';
      this.options.onClose?.();
    }, 200);
  }

  /**
   * Set the modal state
   */
  setState(state: ModalState): void {
    this.currentState = state;
    this.render();
  }

  /**
   * Set custom status text (for connecting state)
   */
  setStatusText(text: string): void {
    this.statusText = text;
    if (this.currentState === 'connecting') {
      const textEl = this.container?.querySelector('.exit-button-connecting-text');
      if (textEl) {
        textEl.textContent = text;
      }
    }
  }

  /**
   * Update transcript
   */
  updateTranscript(entries: TranscriptEntry[]): void {
    this.transcript = entries;
    if (this.currentState === 'interview') {
      this.render();
    }
  }

  /**
   * Add transcript entry
   */
  addTranscriptEntry(entry: TranscriptEntry): void {
    this.transcript.push(entry);
    if (this.currentState === 'interview') {
      this.render();
      // Auto-scroll transcript
      const transcriptEl = this.container?.querySelector('.exit-button-transcript');
      if (transcriptEl) {
        transcriptEl.scrollTop = transcriptEl.scrollHeight;
      }
    }
  }

  /**
   * Update offers
   */
  updateOffers(offers: Offer[]): void {
    this.offers = offers;
    if (this.currentState === 'offers') {
      this.render();
    }
  }

  /**
   * Update voice state
   */
  updateVoiceState(state: VoiceState): void {
    this.voiceState = state;
    if (this.currentState === 'interview') {
      const visualizer = this.container?.querySelector('.exit-button-visualizer');
      if (visualizer) {
        visualizer.classList.toggle('idle', !state.isSpeaking && !state.isListening);
      }
    }
  }

  /**
   * Check if text fallback mode is enabled
   */
  isFallbackEnabled(): boolean {
    return this.useFallback;
  }

  /**
   * Enable text fallback mode
   */
  enableFallback(): void {
    this.useFallback = true;
    if (this.currentState === 'interview') {
      this.render();
    }
  }

  private createModal(): void {
    this.container = document.createElement('div');
    this.container.className = 'exit-button-overlay';
    this.container.setAttribute('role', 'dialog');
    this.container.setAttribute('aria-modal', 'true');
    this.container.setAttribute('aria-labelledby', 'exit-button-title');

    // Close on backdrop click
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        this.close();
      }
    });

    // Close on Escape
    document.addEventListener('keydown', this.handleKeyDown);

    document.body.appendChild(this.container);
    this.render();
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.container) {
      this.close();
    }
  };

  private render(): void {
    if (!this.container) return;

    const content = this.getStateContent();
    this.container.innerHTML = `
      <div class="exit-button-modal">
        <div class="exit-button-header">
          <h2 id="exit-button-title" class="exit-button-title">
            ${this.getTitle()}
          </h2>
          <button class="exit-button-close" aria-label="Close">
            ${icons.close}
          </button>
        </div>
        <div class="exit-button-content">
          ${content}
        </div>
        ${this.getFooter()}
      </div>
    `;

    // Attach event listeners
    this.attachEventListeners();
  }

  private getTitle(): string {
    switch (this.currentState) {
      case 'connecting':
        return 'Connecting...';
      case 'permission':
        return 'Microphone Access';
      case 'interview':
        return 'We\'d love to hear from you';
      case 'offers':
        return 'Before you go...';
      case 'completing':
        return 'Processing...';
      case 'done':
        return 'Thank you!';
      case 'error':
        return 'Something went wrong';
      default:
        return '';
    }
  }

  private getStateContent(): string {
    switch (this.currentState) {
      case 'connecting':
        return this.renderConnecting();
      case 'permission':
        return this.renderPermission();
      case 'interview':
        return this.renderInterview();
      case 'offers':
        return this.renderOffers();
      case 'completing':
        return this.renderConnecting();
      case 'done':
        return this.renderDone();
      case 'error':
        return this.renderError();
      default:
        return '';
    }
  }

  private renderConnecting(): string {
    return `
      <div class="exit-button-connecting">
        <div class="exit-button-spinner"></div>
        <p class="exit-button-connecting-text">${this.statusText}</p>
      </div>
    `;
  }

  private renderPermission(): string {
    return `
      <div class="exit-button-permission">
        <div class="exit-button-mic-icon">
          ${icons.microphone}
        </div>
        <h3 class="exit-button-permission-title">Enable microphone for voice chat</h3>
        <p class="exit-button-permission-desc">
          We'd like to have a quick conversation to understand how we can improve.
          Your feedback is valuable to us.
        </p>
        <button class="exit-button-btn exit-button-btn-primary" data-action="grant-permission">
          Allow Microphone
        </button>
        <button class="exit-button-btn exit-button-btn-secondary" data-action="use-text" style="margin-left: 8px;">
          Use Text Instead
        </button>
      </div>
    `;
  }

  private renderInterview(): string {
    const transcriptHtml = this.transcript
      .map(
        (entry) => `
        <div class="exit-button-transcript-entry">
          <div class="exit-button-transcript-role ${entry.role}">${entry.role === 'assistant' ? 'AI' : 'You'}</div>
          <div class="exit-button-transcript-content">${this.escapeHtml(entry.content)}</div>
        </div>
      `
      )
      .join('');

    const textInput = this.useFallback
      ? `
        <div class="exit-button-text-input">
          <input
            type="text"
            class="exit-button-input"
            placeholder="Type your response..."
            data-input="text"
          />
          <button class="exit-button-btn exit-button-btn-primary" data-action="send-text">
            ${icons.send}
          </button>
        </div>
      `
      : '';

    return `
      <div class="exit-button-interview">
        <div class="exit-button-visualizer ${this.voiceState.isSpeaking || this.voiceState.isListening ? '' : 'idle'}">
          <div class="exit-button-visualizer-bar"></div>
          <div class="exit-button-visualizer-bar"></div>
          <div class="exit-button-visualizer-bar"></div>
          <div class="exit-button-visualizer-bar"></div>
          <div class="exit-button-visualizer-bar"></div>
        </div>
        <div class="exit-button-transcript">
          ${transcriptHtml || '<p style="color: var(--exit-button-text-secondary); text-align: center;">Waiting for conversation to start...</p>'}
        </div>
        ${textInput}
      </div>
    `;
  }

  private renderOffers(): string {
    const offersHtml = this.offers
      .map(
        (offer, index) => `
        <div
          class="exit-button-offer-card ${this.selectedOfferIndex === index ? 'selected' : ''}"
          tabindex="0"
          role="button"
          data-action="select-offer"
          data-index="${index}"
        >
          <span class="exit-button-offer-type">${offer.type}</span>
          <h4 class="exit-button-offer-headline">${this.escapeHtml(offer.headline)}</h4>
          <p class="exit-button-offer-description">${this.escapeHtml(offer.description)}</p>
          <span class="exit-button-offer-value">${this.escapeHtml(offer.value)}</span>
        </div>
      `
      )
      .join('');

    return `
      <div class="exit-button-offers">
        <p class="exit-button-offers-title">We'd love to keep you as a customer. Here are some options:</p>
        ${offersHtml}
      </div>
    `;
  }

  private renderDone(): string {
    return `
      <div class="exit-button-done">
        <div class="exit-button-done-icon">
          ${icons.check}
        </div>
        <h3 class="exit-button-done-title">Thank you for your feedback!</h3>
        <p class="exit-button-done-desc">
          Your input helps us improve. We appreciate you taking the time to share your thoughts.
        </p>
      </div>
    `;
  }

  private renderError(): string {
    return `
      <div class="exit-button-error">
        <div class="exit-button-error-icon">
          ${icons.error}
        </div>
        <h3 class="exit-button-error-title">Connection Error</h3>
        <p class="exit-button-error-desc">
          We couldn't establish a connection. Please try again or proceed with cancellation.
        </p>
        <button class="exit-button-btn exit-button-btn-primary" data-action="retry">
          Try Again
        </button>
      </div>
    `;
  }

  private getFooter(): string {
    switch (this.currentState) {
      case 'offers':
        return `
          <div class="exit-button-footer">
            <button class="exit-button-btn exit-button-btn-danger" data-action="proceed-cancel">
              Cancel Anyway
            </button>
            <button
              class="exit-button-btn exit-button-btn-primary"
              data-action="accept-offer"
              ${this.selectedOfferIndex === null ? 'disabled' : ''}
            >
              Accept Offer
            </button>
          </div>
        `;
      case 'done':
        return `
          <div class="exit-button-footer">
            <button class="exit-button-btn exit-button-btn-primary" data-action="close">
              Close
            </button>
          </div>
        `;
      case 'error':
        return `
          <div class="exit-button-footer">
            <button class="exit-button-btn exit-button-btn-secondary" data-action="close">
              Close
            </button>
            <button class="exit-button-btn exit-button-btn-danger" data-action="proceed-cancel">
              Cancel Subscription
            </button>
          </div>
        `;
      default:
        return '';
    }
  }

  private attachEventListeners(): void {
    if (!this.container) return;

    // Close button
    const closeBtn = this.container.querySelector('.exit-button-close');
    closeBtn?.addEventListener('click', () => this.close());

    // Action buttons
    this.container.querySelectorAll('[data-action]').forEach((el) => {
      el.addEventListener('click', (e) => {
        const action = (e.currentTarget as HTMLElement).dataset.action;
        this.handleAction(action!);
      });

      // Keyboard support for offer cards
      if (el.hasAttribute('data-index')) {
        el.addEventListener('keydown', (e) => {
          if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
            e.preventDefault();
            const action = (e.currentTarget as HTMLElement).dataset.action;
            this.handleAction(action!);
          }
        });
      }
    });

    // Text input
    const textInput = this.container.querySelector('[data-input="text"]') as HTMLInputElement;
    if (textInput) {
      textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && textInput.value.trim()) {
          this.options.onTextSubmit?.(textInput.value.trim());
          textInput.value = '';
        }
      });
    }
  }

  private handleAction(action: string): void {
    switch (action) {
      case 'grant-permission':
        this.options.onRequestPermission?.();
        break;
      case 'use-text':
        this.useFallback = true;
        this.options.onRequestPermission?.();
        break;
      case 'send-text':
        const input = this.container?.querySelector('[data-input="text"]') as HTMLInputElement;
        if (input?.value.trim()) {
          this.options.onTextSubmit?.(input.value.trim());
          input.value = '';
        }
        break;
      case 'select-offer':
        const index = parseInt(
          (event?.target as HTMLElement).closest('[data-index]')?.getAttribute('data-index') || '-1'
        );
        if (index >= 0) {
          this.selectedOfferIndex = index;
          this.render();
        }
        break;
      case 'accept-offer':
        if (this.selectedOfferIndex !== null) {
          this.options.onOfferSelect?.(this.selectedOfferIndex);
        }
        break;
      case 'proceed-cancel':
        this.options.onProceedCancel?.();
        break;
      case 'retry':
        this.options.onRetry?.();
        break;
      case 'close':
        this.close();
        break;
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
    this.container?.remove();
    this.container = null;
    document.body.style.overflow = '';
  }
}
