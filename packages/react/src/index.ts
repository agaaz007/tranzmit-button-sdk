/**
 * @tranzmit/exit-button-react
 * React SDK for Exit Button - AI-powered churn prevention
 */

// Context
export { ExitButtonProvider, useExitButtonContext } from './context';
export type { ExitButtonProviderProps } from './context';

// Hooks
export { useCancelFlow } from './hooks/useCancelFlow';
export type { UseCancelFlowOptions, UseCancelFlowReturn } from './hooks/useCancelFlow';

export { useVoiceState } from './hooks/useVoiceState';
export type { UseVoiceStateOptions, UseVoiceStateReturn } from './hooks/useVoiceState';

export { useTranscript } from './hooks/useTranscript';
export type { UseTranscriptReturn } from './hooks/useTranscript';

export { useOffers } from './hooks/useOffers';
export type { UseOffersReturn } from './hooks/useOffers';

// Components
export { CancelModal } from './components/CancelModal';
export type { CancelModalProps } from './components/CancelModal';

// Re-export types from core
export type {
  ExitButtonConfig,
  EmbedConfig,
  ThemeConfig,
  Session,
  SessionStatus,
  TranscriptEntry,
  Offer,
  OfferType,
  FrictionSignal,
  FrictionSignalType,
  FrictionReport,
  EngineeringFix,
  FixSeverity,
  Intelligence,
  ModalState,
  VoiceState,
  ExitButtonError,
  ErrorCode,
} from '@tranzmit/exit-button-core';
