/**
 * Exit Button Embed Styles
 * CSS-in-JS styles for the modal
 */

export const CSS_VARIABLES = `
:root {
  --exit-button-primary: #6366f1;
  --exit-button-primary-hover: #4f46e5;
  --exit-button-background: #ffffff;
  --exit-button-surface: #f9fafb;
  --exit-button-text: #111827;
  --exit-button-text-secondary: #6b7280;
  --exit-button-error: #ef4444;
  --exit-button-success: #22c55e;
  --exit-button-radius: 12px;
  --exit-button-radius-sm: 8px;
  --exit-button-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  --exit-button-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}
`;

export const KEYFRAMES = `
@keyframes exit-button-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes exit-button-fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes exit-button-slide-up {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes exit-button-slide-down {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
}

@keyframes exit-button-pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.05);
  }
}

@keyframes exit-button-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes exit-button-wave {
  0%, 100% { height: 8px; }
  50% { height: 24px; }
}
`;

export const MODAL_STYLES = `
.exit-button-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999999;
  animation: exit-button-fade-in 0.2s ease-out;
  font-family: var(--exit-button-font);
}

.exit-button-overlay.closing {
  animation: exit-button-fade-out 0.2s ease-out forwards;
}

.exit-button-modal {
  background: var(--exit-button-background);
  border-radius: var(--exit-button-radius);
  box-shadow: var(--exit-button-shadow);
  max-width: 480px;
  width: 90%;
  max-height: 90vh;
  overflow: hidden;
  animation: exit-button-slide-up 0.3s ease-out;
}

.exit-button-overlay.closing .exit-button-modal {
  animation: exit-button-slide-down 0.2s ease-out forwards;
}

.exit-button-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--exit-button-surface);
}

.exit-button-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--exit-button-text);
  margin: 0;
}

.exit-button-close {
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  color: var(--exit-button-text-secondary);
  border-radius: var(--exit-button-radius-sm);
  transition: background 0.2s, color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.exit-button-close:hover {
  background: var(--exit-button-surface);
  color: var(--exit-button-text);
}

.exit-button-close:focus {
  outline: 2px solid var(--exit-button-primary);
  outline-offset: 2px;
}

.exit-button-content {
  padding: 24px;
  overflow-y: auto;
  max-height: calc(90vh - 140px);
}

.exit-button-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--exit-button-surface);
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

/* State: Connecting */
.exit-button-connecting {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 24px;
  text-align: center;
}

.exit-button-spinner {
  width: 48px;
  height: 48px;
  border: 3px solid var(--exit-button-surface);
  border-top-color: var(--exit-button-primary);
  border-radius: 50%;
  animation: exit-button-spin 1s linear infinite;
  margin-bottom: 16px;
}

.exit-button-connecting-text {
  color: var(--exit-button-text-secondary);
  font-size: 14px;
}

/* State: Permission */
.exit-button-permission {
  text-align: center;
  padding: 20px 0;
}

.exit-button-mic-icon {
  width: 64px;
  height: 64px;
  background: var(--exit-button-surface);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
}

.exit-button-permission-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--exit-button-text);
  margin: 0 0 8px;
}

.exit-button-permission-desc {
  font-size: 14px;
  color: var(--exit-button-text-secondary);
  margin: 0 0 24px;
  line-height: 1.5;
}

/* State: Interview */
.exit-button-interview {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.exit-button-visualizer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 48px;
  padding: 12px;
  background: var(--exit-button-surface);
  border-radius: var(--exit-button-radius-sm);
}

.exit-button-visualizer-bar {
  width: 4px;
  height: 8px;
  background: var(--exit-button-primary);
  border-radius: 2px;
  animation: exit-button-wave 0.5s ease-in-out infinite;
}

.exit-button-visualizer-bar:nth-child(2) { animation-delay: 0.1s; }
.exit-button-visualizer-bar:nth-child(3) { animation-delay: 0.2s; }
.exit-button-visualizer-bar:nth-child(4) { animation-delay: 0.3s; }
.exit-button-visualizer-bar:nth-child(5) { animation-delay: 0.4s; }

.exit-button-visualizer.idle .exit-button-visualizer-bar {
  animation: none;
  height: 8px;
  opacity: 0.5;
}

.exit-button-transcript {
  background: var(--exit-button-surface);
  border-radius: var(--exit-button-radius-sm);
  padding: 16px;
  max-height: 200px;
  overflow-y: auto;
}

.exit-button-transcript-entry {
  margin-bottom: 12px;
}

.exit-button-transcript-entry:last-child {
  margin-bottom: 0;
}

.exit-button-transcript-role {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--exit-button-text-secondary);
  margin-bottom: 4px;
}

.exit-button-transcript-role.assistant {
  color: var(--exit-button-primary);
}

.exit-button-transcript-content {
  font-size: 14px;
  color: var(--exit-button-text);
  line-height: 1.5;
}

.exit-button-text-input {
  display: flex;
  gap: 8px;
}

.exit-button-input {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid var(--exit-button-surface);
  border-radius: var(--exit-button-radius-sm);
  font-size: 14px;
  font-family: inherit;
  color: var(--exit-button-text);
  background: var(--exit-button-background);
  transition: border-color 0.2s;
}

.exit-button-input:focus {
  outline: none;
  border-color: var(--exit-button-primary);
}

/* State: Offers */
.exit-button-offers {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.exit-button-offers-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--exit-button-text);
  margin: 0;
}

.exit-button-offer-card {
  background: var(--exit-button-surface);
  border: 2px solid transparent;
  border-radius: var(--exit-button-radius-sm);
  padding: 16px;
  cursor: pointer;
  transition: border-color 0.2s, transform 0.2s;
}

.exit-button-offer-card:hover {
  border-color: var(--exit-button-primary);
  transform: translateY(-2px);
}

.exit-button-offer-card:focus {
  outline: 2px solid var(--exit-button-primary);
  outline-offset: 2px;
}

.exit-button-offer-card.selected {
  border-color: var(--exit-button-primary);
  background: rgba(99, 102, 241, 0.1);
}

.exit-button-offer-type {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--exit-button-primary);
  background: rgba(99, 102, 241, 0.1);
  padding: 4px 8px;
  border-radius: 4px;
  margin-bottom: 8px;
}

.exit-button-offer-headline {
  font-size: 15px;
  font-weight: 600;
  color: var(--exit-button-text);
  margin: 0 0 4px;
}

.exit-button-offer-description {
  font-size: 13px;
  color: var(--exit-button-text-secondary);
  margin: 0 0 8px;
  line-height: 1.4;
}

.exit-button-offer-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--exit-button-success);
}

/* State: Done */
.exit-button-done {
  text-align: center;
  padding: 20px 0;
}

.exit-button-done-icon {
  width: 64px;
  height: 64px;
  background: rgba(34, 197, 94, 0.1);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  color: var(--exit-button-success);
}

.exit-button-done-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--exit-button-text);
  margin: 0 0 8px;
}

.exit-button-done-desc {
  font-size: 14px;
  color: var(--exit-button-text-secondary);
  margin: 0;
  line-height: 1.5;
}

/* State: Error */
.exit-button-error {
  text-align: center;
  padding: 20px 0;
}

.exit-button-error-icon {
  width: 64px;
  height: 64px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  color: var(--exit-button-error);
}

.exit-button-error-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--exit-button-text);
  margin: 0 0 8px;
}

.exit-button-error-desc {
  font-size: 14px;
  color: var(--exit-button-text-secondary);
  margin: 0 0 24px;
  line-height: 1.5;
}

/* Buttons */
.exit-button-btn {
  padding: 12px 24px;
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  border-radius: var(--exit-button-radius-sm);
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
  border: none;
}

.exit-button-btn:focus {
  outline: 2px solid var(--exit-button-primary);
  outline-offset: 2px;
}

.exit-button-btn:active {
  transform: scale(0.98);
}

.exit-button-btn-primary {
  background: var(--exit-button-primary);
  color: white;
}

.exit-button-btn-primary:hover {
  background: var(--exit-button-primary-hover);
}

.exit-button-btn-secondary {
  background: var(--exit-button-surface);
  color: var(--exit-button-text);
}

.exit-button-btn-secondary:hover {
  background: #e5e7eb;
}

.exit-button-btn-danger {
  background: transparent;
  color: var(--exit-button-error);
  border: 1px solid var(--exit-button-error);
}

.exit-button-btn-danger:hover {
  background: rgba(239, 68, 68, 0.1);
}

/* Accessibility */
@media (prefers-reduced-motion: reduce) {
  .exit-button-overlay,
  .exit-button-modal,
  .exit-button-spinner,
  .exit-button-visualizer-bar {
    animation: none !important;
  }
}

/* Focus visible for keyboard navigation */
.exit-button-btn:focus-visible,
.exit-button-close:focus-visible,
.exit-button-offer-card:focus-visible {
  outline: 2px solid var(--exit-button-primary);
  outline-offset: 2px;
}
`;

export function injectStyles(): void {
  if (document.getElementById('exit-button-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'exit-button-styles';
  style.textContent = CSS_VARIABLES + KEYFRAMES + MODAL_STYLES;
  document.head.appendChild(style);
}

export function removeStyles(): void {
  const style = document.getElementById('exit-button-styles');
  if (style) {
    style.remove();
  }
}
