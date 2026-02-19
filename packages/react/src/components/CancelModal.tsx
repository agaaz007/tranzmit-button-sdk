/**
 * CancelModal Component
 * The main modal UI for the cancellation flow
 */

import React, { useEffect, useRef } from 'react';
import type { ModalState, TranscriptEntry, Offer, VoiceState } from '@tranzmit/exit-button-core';

export interface CancelModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Current modal state */
  status: ModalState;
  /** Conversation transcript */
  transcript: TranscriptEntry[];
  /** Available offers */
  offers: Offer[];
  /** Voice state */
  voiceState?: VoiceState;
  /** Selected offer index */
  selectedOfferIndex?: number | null;
  /** Whether using text fallback */
  useFallback?: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Callback to request mic permission */
  onRequestPermission?: () => void;
  /** Callback to use text fallback */
  onUseFallback?: () => void;
  /** Callback when offer is selected */
  onOfferSelect?: (index: number) => void;
  /** Callback to accept selected offer */
  onAcceptOffer?: () => void;
  /** Callback to proceed with cancellation */
  onProceedCancel?: () => void;
  /** Callback when text is submitted */
  onTextSubmit?: (text: string) => void;
  /** Callback to retry */
  onRetry?: () => void;
  /** Custom class name */
  className?: string;
}

export function CancelModal({
  isOpen,
  status,
  transcript,
  offers,
  voiceState,
  selectedOfferIndex,
  useFallback,
  onClose,
  onRequestPermission,
  onUseFallback,
  onOfferSelect,
  onAcceptOffer,
  onProceedCancel,
  onTextSubmit,
  onRetry,
  className = '',
}: CancelModalProps): JSX.Element | null {
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTextSubmit = () => {
    if (inputRef.current?.value.trim()) {
      onTextSubmit?.(inputRef.current.value.trim());
      inputRef.current.value = '';
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTextSubmit();
    }
  };

  const renderContent = () => {
    switch (status) {
      case 'connecting':
      case 'completing':
        return (
          <div className="eb-connecting">
            <div className="eb-spinner" />
            <p className="eb-connecting-text">
              {status === 'connecting' ? 'Setting up your session...' : 'Processing...'}
            </p>
          </div>
        );

      case 'permission':
        return (
          <div className="eb-permission">
            <div className="eb-mic-icon">
              <MicrophoneIcon />
            </div>
            <h3 className="eb-permission-title">Enable microphone for voice chat</h3>
            <p className="eb-permission-desc">
              We'd like to have a quick conversation to understand how we can improve.
            </p>
            <div className="eb-permission-actions">
              <button className="eb-btn eb-btn-primary" onClick={onRequestPermission}>
                Allow Microphone
              </button>
              <button className="eb-btn eb-btn-secondary" onClick={onUseFallback}>
                Use Text Instead
              </button>
            </div>
          </div>
        );

      case 'interview':
        return (
          <div className="eb-interview">
            <VoiceVisualizer
              isSpeaking={voiceState?.isSpeaking}
              isListening={voiceState?.isListening}
              volume={voiceState?.volume}
            />
            <div className="eb-transcript" ref={transcriptRef}>
              {transcript.length === 0 ? (
                <p className="eb-transcript-empty">Waiting for conversation to start...</p>
              ) : (
                transcript.map((entry, index) => (
                  <div key={index} className="eb-transcript-entry">
                    <div className={`eb-transcript-role ${entry.role}`}>
                      {entry.role === 'assistant' ? 'AI' : 'You'}
                    </div>
                    <div className="eb-transcript-content">{entry.content}</div>
                  </div>
                ))
              )}
            </div>
            {useFallback && (
              <div className="eb-text-input">
                <input
                  ref={inputRef}
                  type="text"
                  className="eb-input"
                  placeholder="Type your response..."
                  onKeyPress={handleKeyPress}
                />
                <button className="eb-btn eb-btn-primary eb-btn-icon" onClick={handleTextSubmit}>
                  <SendIcon />
                </button>
              </div>
            )}
          </div>
        );

      case 'offers':
        return (
          <div className="eb-offers">
            <p className="eb-offers-title">
              We'd love to keep you as a customer. Here are some options:
            </p>
            {offers.map((offer, index) => (
              <OfferCard
                key={index}
                offer={offer}
                isSelected={selectedOfferIndex === index}
                onClick={() => onOfferSelect?.(index)}
              />
            ))}
          </div>
        );

      case 'done':
        return (
          <div className="eb-done">
            <div className="eb-done-icon">
              <CheckIcon />
            </div>
            <h3 className="eb-done-title">Thank you for your feedback!</h3>
            <p className="eb-done-desc">
              Your input helps us improve. We appreciate you taking the time to share your thoughts.
            </p>
          </div>
        );

      case 'error':
        return (
          <div className="eb-error">
            <div className="eb-error-icon">
              <ErrorIcon />
            </div>
            <h3 className="eb-error-title">Connection Error</h3>
            <p className="eb-error-desc">
              We couldn't establish a connection. Please try again or proceed with cancellation.
            </p>
            <button className="eb-btn eb-btn-primary" onClick={onRetry}>
              Try Again
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  const renderFooter = () => {
    switch (status) {
      case 'offers':
        return (
          <div className="eb-footer">
            <button className="eb-btn eb-btn-danger" onClick={onProceedCancel}>
              Cancel Anyway
            </button>
            <button
              className="eb-btn eb-btn-primary"
              onClick={onAcceptOffer}
              disabled={selectedOfferIndex === null}
            >
              Accept Offer
            </button>
          </div>
        );

      case 'done':
        return (
          <div className="eb-footer">
            <button className="eb-btn eb-btn-primary" onClick={onClose}>
              Close
            </button>
          </div>
        );

      case 'error':
        return (
          <div className="eb-footer">
            <button className="eb-btn eb-btn-secondary" onClick={onClose}>
              Close
            </button>
            <button className="eb-btn eb-btn-danger" onClick={onProceedCancel}>
              Cancel Subscription
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  const getTitle = () => {
    switch (status) {
      case 'connecting':
        return 'Connecting...';
      case 'permission':
        return 'Microphone Access';
      case 'interview':
        return "We'd love to hear from you";
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
  };

  return (
    <div
      className={`eb-overlay ${className}`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="eb-title"
    >
      <div className="eb-modal" ref={modalRef}>
        <div className="eb-header">
          <h2 id="eb-title" className="eb-title">
            {getTitle()}
          </h2>
          <button className="eb-close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="eb-content">{renderContent()}</div>
        {renderFooter()}
      </div>

      <style>{modalStyles}</style>
    </div>
  );
}

// Sub-components
function VoiceVisualizer({
  isSpeaking,
  isListening,
  volume: _volume,
}: {
  isSpeaking?: boolean;
  isListening?: boolean;
  volume?: number;
}) {
  const isActive = isSpeaking || isListening;
  return (
    <div className={`eb-visualizer ${isActive ? '' : 'idle'}`}>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="eb-visualizer-bar" style={{ animationDelay: `${i * 0.1}s` }} />
      ))}
    </div>
  );
}

function OfferCard({
  offer,
  isSelected,
  onClick,
}: {
  offer: Offer;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={`eb-offer-card ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      onKeyPress={(e) => e.key === 'Enter' && onClick()}
      tabIndex={0}
      role="button"
    >
      <span className="eb-offer-type">{offer.type}</span>
      <h4 className="eb-offer-headline">{offer.headline}</h4>
      <p className="eb-offer-description">{offer.description}</p>
      <span className="eb-offer-value">{offer.value}</span>
    </div>
  );
}

// Icons
const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const MicrophoneIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const CheckIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ErrorIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

// Styles
const modalStyles = `
.eb-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999999;
  animation: ebFadeIn 0.2s ease-out;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.eb-modal {
  background: white;
  border-radius: 12px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  max-width: 480px;
  width: 90%;
  max-height: 90vh;
  overflow: hidden;
  animation: ebSlideUp 0.3s ease-out;
}

.eb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #f3f4f6;
}

.eb-title {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
  margin: 0;
}

.eb-close {
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  color: #6b7280;
  border-radius: 8px;
  display: flex;
  transition: background 0.2s;
}

.eb-close:hover {
  background: #f3f4f6;
  color: #111827;
}

.eb-content {
  padding: 24px;
  overflow-y: auto;
  max-height: calc(90vh - 140px);
}

.eb-footer {
  padding: 16px 24px;
  border-top: 1px solid #f3f4f6;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.eb-connecting {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 24px;
  text-align: center;
}

.eb-spinner {
  width: 48px;
  height: 48px;
  border: 3px solid #f3f4f6;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: ebSpin 1s linear infinite;
  margin-bottom: 16px;
}

.eb-connecting-text {
  color: #6b7280;
  font-size: 14px;
}

.eb-permission {
  text-align: center;
  padding: 20px 0;
}

.eb-mic-icon {
  width: 64px;
  height: 64px;
  background: #f3f4f6;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  color: #6366f1;
}

.eb-permission-title {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  margin: 0 0 8px;
}

.eb-permission-desc {
  font-size: 14px;
  color: #6b7280;
  margin: 0 0 24px;
}

.eb-permission-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.eb-interview {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.eb-visualizer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 48px;
  background: #f3f4f6;
  border-radius: 8px;
}

.eb-visualizer-bar {
  width: 4px;
  height: 8px;
  background: #6366f1;
  border-radius: 2px;
  animation: ebWave 0.5s ease-in-out infinite;
}

.eb-visualizer.idle .eb-visualizer-bar {
  animation: none;
  opacity: 0.5;
}

.eb-transcript {
  background: #f3f4f6;
  border-radius: 8px;
  padding: 16px;
  max-height: 200px;
  overflow-y: auto;
}

.eb-transcript-empty {
  color: #6b7280;
  text-align: center;
  margin: 0;
}

.eb-transcript-entry {
  margin-bottom: 12px;
}

.eb-transcript-entry:last-child {
  margin-bottom: 0;
}

.eb-transcript-role {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: #6b7280;
  margin-bottom: 4px;
}

.eb-transcript-role.assistant {
  color: #6366f1;
}

.eb-transcript-content {
  font-size: 14px;
  color: #111827;
  line-height: 1.5;
}

.eb-text-input {
  display: flex;
  gap: 8px;
}

.eb-input {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
}

.eb-input:focus {
  outline: none;
  border-color: #6366f1;
}

.eb-offers {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.eb-offers-title {
  font-size: 14px;
  color: #6b7280;
  margin: 0 0 8px;
}

.eb-offer-card {
  background: #f9fafb;
  border: 2px solid transparent;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: border-color 0.2s, transform 0.2s;
}

.eb-offer-card:hover {
  border-color: #6366f1;
  transform: translateY(-2px);
}

.eb-offer-card.selected {
  border-color: #6366f1;
  background: rgba(99, 102, 241, 0.1);
}

.eb-offer-type {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.1);
  padding: 4px 8px;
  border-radius: 4px;
  margin-bottom: 8px;
}

.eb-offer-headline {
  font-size: 15px;
  font-weight: 600;
  color: #111827;
  margin: 0 0 4px;
}

.eb-offer-description {
  font-size: 13px;
  color: #6b7280;
  margin: 0 0 8px;
}

.eb-offer-value {
  font-size: 14px;
  font-weight: 600;
  color: #22c55e;
}

.eb-done, .eb-error {
  text-align: center;
  padding: 20px 0;
}

.eb-done-icon, .eb-error-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
}

.eb-done-icon {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.eb-error-icon {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.eb-done-title, .eb-error-title {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
  margin: 0 0 8px;
}

.eb-done-desc, .eb-error-desc {
  font-size: 14px;
  color: #6b7280;
  margin: 0;
}

.eb-error-desc {
  margin-bottom: 24px;
}

.eb-btn {
  padding: 12px 24px;
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
  border: none;
}

.eb-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.eb-btn-primary {
  background: #6366f1;
  color: white;
}

.eb-btn-primary:hover:not(:disabled) {
  background: #4f46e5;
}

.eb-btn-secondary {
  background: #f3f4f6;
  color: #111827;
}

.eb-btn-secondary:hover {
  background: #e5e7eb;
}

.eb-btn-danger {
  background: transparent;
  color: #ef4444;
  border: 1px solid #ef4444;
}

.eb-btn-danger:hover {
  background: rgba(239, 68, 68, 0.1);
}

.eb-btn-icon {
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

@keyframes ebFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes ebSlideUp {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes ebSpin {
  to { transform: rotate(360deg); }
}

@keyframes ebWave {
  0%, 100% { height: 8px; }
  50% { height: 24px; }
}
`;
