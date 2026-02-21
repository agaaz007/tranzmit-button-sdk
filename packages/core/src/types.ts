/**
 * Exit Button SDK Types
 * AI-Native Churn Prevention System
 */

// ============ Configuration Types ============

export interface ExitButtonConfig {
  /** API key for authentication (eb_live_xxxx or eb_test_xxxx) */
  apiKey: string;
  /** Unique identifier for the user (auto-detected from PostHog, Segment, Mixpanel, Amplitude, Intercom if not provided) */
  userId?: string;
  /** Name of the user's current plan */
  planName?: string;
  /** Monthly Recurring Revenue in dollars */
  mrr?: number;
  /** How long the user has been a customer (e.g., "8 months") */
  accountAge?: string;
  /** Additional metadata about the user */
  metadata?: Record<string, unknown>;
  /** Enable PostHog session replay analysis (default: true). Set to false to skip session analysis entirely. */
  sessionAnalysis?: boolean;
  /** Analytics provider for friction detection */
  analyticsProvider?: 'posthog' | 'mixpanel' | 'amplitude' | 'segment' | 'custom';
  /** Callback when offers are generated */
  onOffer?: (offers: Offer[]) => void;
  /** Callback when session completes */
  onComplete?: (session: Session) => void;
  /** Callback on error */
  onError?: (error: ExitButtonError) => void;
  /** Callback on state change */
  onStateChange?: (state: ModalState) => void;
}

export interface EmbedConfig extends ExitButtonConfig {
  /** CSS selector for the cancel button to attach to */
  attach?: string;
  /** Theme customization */
  theme?: ThemeConfig;
  /** Locale for i18n */
  locale?: string;
}

export interface ThemeConfig {
  /** Primary brand color */
  primaryColor?: string;
  /** Primary color on hover */
  primaryHoverColor?: string;
  /** Background color */
  backgroundColor?: string;
  /** Surface/card color */
  surfaceColor?: string;
  /** Primary text color */
  textColor?: string;
  /** Secondary text color */
  textSecondaryColor?: string;
  /** Error color */
  errorColor?: string;
  /** Success color */
  successColor?: string;
  /** Border radius for buttons and cards */
  borderRadius?: string;
  /** Font family */
  fontFamily?: string;
}

// ============ Session Types ============

export type SessionStatus =
  | 'initiated'
  | 'interviewing'
  | 'completed'
  | 'retained'
  | 'churned';

export interface Session {
  /** Unique session identifier */
  id: string;
  /** User identifier (may be auto-detected) */
  userId?: string;
  /** Current session status */
  status: SessionStatus;
  /** Voice conversation transcript */
  voiceTranscript: TranscriptEntry[];
  /** Generated win-back offers */
  offers: Offer[];
  /** Offer the user accepted, if any */
  acceptedOffer?: Offer;
  /** Churn risk score (0-100) */
  churnRiskScore: number;
  /** Friction report from analytics */
  frictionReport?: FrictionReport;
  /** Timestamps */
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface TranscriptEntry {
  /** Speaker role */
  role: 'assistant' | 'user';
  /** Message content */
  content: string;
  /** ISO timestamp */
  timestamp: string;
}

// ============ Offer Types ============

export type OfferType =
  | 'discount'
  | 'pause'
  | 'downgrade'
  | 'feature_unlock'
  | 'concierge';

export interface Offer {
  /** Type of offer */
  type: OfferType;
  /** Short headline for the offer */
  headline: string;
  /** Detailed description */
  description: string;
  /** Value description (e.g., "30% off for 3 months") */
  value: string;
  /** AI confidence score (0-1) */
  confidence: number;
}

// ============ Friction Detection Types ============

export type FrictionSignalType =
  | 'rage_click'
  | 'dead_click'
  | 'rapid_navigation'
  | 'error_encountered'
  | 'long_dwell'
  | 'form_abandonment'
  | 'repeated_action';

export interface FrictionSignal {
  /** Type of friction signal detected */
  type: FrictionSignalType;
  /** Page/URL where the signal was detected */
  page: string;
  /** Number of occurrences */
  count: number;
  /** Human-readable detail */
  detail: string;
}

export interface FrictionReport {
  /** Overall friction score (0-100) */
  score: number;
  /** Detected friction signals */
  signals: FrictionSignal[];
  /** AI-generated summary */
  summary: string;
}

// ============ Intelligence Types ============

export type FixSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface EngineeringFix {
  /** Short bug/issue title */
  title: string;
  /** Detailed description from user feedback */
  description: string;
  /** Page/URL where issue was reported */
  page: string;
  /** Severity level */
  severity: FixSeverity;
  /** Number of sessions reporting this issue */
  frequency: number;
  /** Suggested engineering action */
  suggestedAction: string;
  /** First time this issue was seen */
  firstSeen: string;
  /** Most recent occurrence */
  lastSeen: string;
  /** Related session IDs */
  relatedSessions: string[];
}

export interface Intelligence {
  /** Generated win-back offers */
  offers: Offer[];
  /** Aggregated engineering fixes */
  fixes: EngineeringFix[];
  /** Churn risk score */
  churnRiskScore: number;
  /** AI reasoning for the assessment */
  reasoning: string;
}

// ============ API Response Types ============

export interface InitiateResponse {
  /** Session ID */
  sessionId: string;
  /** ElevenLabs voice agent ID */
  agentId: string;
  /** Signed URL for voice agent */
  signedUrl: string | null;
  /** ElevenLabs chat agent ID (text-only mode) */
  chatAgentId: string | null;
  /** Signed URL for chat agent */
  chatSignedUrl: string | null;
  /** AI-generated context for the agent */
  context: string;
  /** Dynamic variables for ElevenLabs agent */
  dynamicVariables: Record<string, string>;
  /** Total elapsed time in ms */
  elapsed_ms: number;
  /** Pipeline timing breakdown */
  timing: Record<string, number>;
}

export interface CompleteResponse {
  /** Success status */
  success: boolean;
  /** Session ID */
  sessionId: string;
  /** Outcome: retained or churned */
  outcome: string;
}

export interface PrefetchResponse {
  /** Whether the prefetch was started, already cached, or in progress */
  status: 'started' | 'cached' | 'in_progress';
}

// ============ Modal State Types ============

export type ModalState =
  | 'closed'
  | 'connecting'
  | 'permission'
  | 'interview'
  | 'offers'
  | 'completing'
  | 'done'
  | 'error';

// ============ Voice Types ============

export interface VoiceState {
  /** WebSocket connection status */
  isConnected: boolean;
  /** User is currently speaking */
  isSpeaking: boolean;
  /** AI is currently responding */
  isListening: boolean;
  /** Current audio volume level (0-1) */
  volume: number;
  /** Connection error, if any */
  error?: ExitButtonError;
}

// ============ WebSocket Message Types ============

export type ClientMessage =
  | { type: 'input_audio_buffer.append'; audio: string }
  | { type: 'input_audio_buffer.commit' }
  | { type: 'conversation.item.create'; item: ConversationItem };

export interface ConversationItem {
  type: 'message';
  role: 'user';
  content: Array<{ type: 'input_text'; text: string }>;
}

export type ServerMessage =
  | { type: 'audio'; audio: string }
  | { type: 'transcript'; role: 'assistant' | 'user'; content: string }
  | { type: 'interview_complete' }
  | { type: 'offers'; offers: Offer[] }
  | { type: 'error'; error: { code: string; message: string } };

// ============ Error Types ============

export class ExitButtonError extends Error {
  code: string;
  statusCode?: number;

  constructor(message: string, code: string, statusCode?: number) {
    super(message);
    this.name = 'ExitButtonError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type ErrorCode =
  | 'NETWORK_ERROR'
  | 'AUTH_ERROR'
  | 'SESSION_ERROR'
  | 'VOICE_CONNECTION_ERROR'
  | 'MICROPHONE_DENIED'
  | 'MICROPHONE_UNAVAILABLE'
  | 'UNKNOWN_ERROR';

// ============ Event Types ============

export type ExitButtonEvent =
  | { type: 'state_change'; state: ModalState }
  | { type: 'transcript_update'; entry: TranscriptEntry }
  | { type: 'offers_received'; offers: Offer[] }
  | { type: 'offer_accepted'; offer: Offer }
  | { type: 'session_complete'; session: Session }
  | { type: 'error'; error: ExitButtonError };

export type EventListener = (event: ExitButtonEvent) => void;
