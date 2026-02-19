/**
 * useCancelFlow Hook
 * Main orchestration hook for the cancellation flow
 */

import { useState, useCallback, useRef } from 'react';
import type {
  ModalState,
  Session,
  Offer,
  TranscriptEntry,
  ExitButtonError,
  InitiateResponse,
} from '@tranzmit/exit-button-core';
import { useExitButtonContext } from '../context';

export interface UseCancelFlowOptions {
  /** User ID */
  userId: string;
  /** User's current plan name */
  planName?: string;
  /** Monthly recurring revenue */
  mrr?: number;
  /** Account age (e.g., "8 months") */
  accountAge?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Callback when offers are received */
  onOffer?: (offers: Offer[]) => void;
  /** Callback when session completes */
  onComplete?: (session: Session) => void;
  /** Callback on error */
  onError?: (error: ExitButtonError) => void;
}

export interface UseCancelFlowReturn {
  /** Start the cancellation flow */
  start: () => Promise<void>;
  /** Close the modal */
  close: () => void;
  /** Whether the modal is open */
  isOpen: boolean;
  /** Current modal state */
  status: ModalState;
  /** Session ID */
  sessionId: string | null;
  /** Available offers */
  offers: Offer[];
  /** Conversation transcript */
  transcript: TranscriptEntry[];
  /** Current session data */
  session: Session | null;
  /** Accept an offer by index */
  acceptOffer: (index: number) => Promise<void>;
  /** Decline all offers and proceed with cancellation */
  decline: () => Promise<void>;
  /** Voice session URL for WebSocket connection */
  voiceSessionUrl: string | null;
  /** Error if any */
  error: ExitButtonError | null;
  /** Loading state */
  isLoading: boolean;
}

export function useCancelFlow(options: UseCancelFlowOptions): UseCancelFlowReturn {
  const { apiClient } = useExitButtonContext();

  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<ModalState>('closed');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [voiceSessionUrl, setVoiceSessionUrl] = useState<string | null>(null);
  const [error, setError] = useState<ExitButtonError | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  /**
   * Start the cancellation flow
   */
  const start = useCallback(async () => {
    if (isOpen) return;

    setIsOpen(true);
    setStatus('connecting');
    setError(null);
    setIsLoading(true);

    try {
      const response: InitiateResponse = await apiClient.initiate({
        userId: optionsRef.current.userId,
        planName: optionsRef.current.planName,
        mrr: optionsRef.current.mrr,
        accountAge: optionsRef.current.accountAge,
        metadata: optionsRef.current.metadata,
      });

      setSessionId(response.sessionId);
      if (response.signedUrl) {
        setVoiceSessionUrl(response.signedUrl);
      }
      setStatus('permission');
    } catch (err) {
      const error = err as ExitButtonError;
      setError(error);
      setStatus('error');
      optionsRef.current.onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, isOpen]);

  /**
   * Close the modal
   */
  const close = useCallback(() => {
    setIsOpen(false);
    setStatus('closed');
    setSessionId(null);
    setOffers([]);
    setTranscript([]);
    setSession(null);
    setVoiceSessionUrl(null);
    setError(null);
  }, []);

  /**
   * Accept an offer
   */
  const acceptOffer = useCallback(
    async (index: number) => {
      if (!sessionId) return;

      setStatus('completing');
      setIsLoading(true);

      try {
        await apiClient.complete(sessionId, {
          userId: optionsRef.current.userId,
          outcome: 'retained',
          acceptedOffer: offers[index],
          transcript,
        });
        const sessionData = {
          id: sessionId,
          userId: optionsRef.current.userId,
          status: 'retained' as const,
          voiceTranscript: transcript,
          offers,
          acceptedOffer: offers[index],
          churnRiskScore: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setSession(sessionData);
        setStatus('done');
        optionsRef.current.onComplete?.(sessionData);
      } catch (err) {
        const error = err as ExitButtonError;
        setError(error);
        setStatus('error');
        optionsRef.current.onError?.(error);
      } finally {
        setIsLoading(false);
      }
    },
    [apiClient, sessionId, offers, transcript]
  );

  /**
   * Decline and proceed with cancellation
   */
  const decline = useCallback(async () => {
    if (!sessionId) return;

    setStatus('completing');
    setIsLoading(true);

    try {
      await apiClient.complete(sessionId, {
        userId: optionsRef.current.userId,
        outcome: 'churned',
        transcript,
      });
      const sessionData = {
        id: sessionId,
        userId: optionsRef.current.userId,
        status: 'churned' as const,
        voiceTranscript: transcript,
        offers,
        churnRiskScore: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setSession(sessionData);
      setStatus('done');
      optionsRef.current.onComplete?.(sessionData);
    } catch (err) {
      const error = err as ExitButtonError;
      setError(error);
      setStatus('error');
      optionsRef.current.onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, sessionId, offers, transcript]);

  /**
   * Update offers (called from useVoiceState when offers received)
   */
  const updateOffers = useCallback(
    (newOffers: Offer[]) => {
      setOffers(newOffers);
      optionsRef.current.onOffer?.(newOffers);
    },
    []
  );

  /**
   * Add transcript entry
   */
  const addTranscriptEntry = useCallback((entry: TranscriptEntry) => {
    setTranscript((prev) => [...prev, entry]);
  }, []);

  /**
   * Set status externally (for voice state updates)
   */
  const updateStatus = useCallback((newStatus: ModalState) => {
    setStatus(newStatus);
  }, []);

  return {
    start,
    close,
    isOpen,
    status,
    sessionId,
    offers,
    transcript,
    session,
    acceptOffer,
    decline,
    voiceSessionUrl,
    error,
    isLoading,
    // Internal methods exposed for other hooks
    _updateOffers: updateOffers,
    _addTranscriptEntry: addTranscriptEntry,
    _updateStatus: updateStatus,
  } as UseCancelFlowReturn & {
    _updateOffers: (offers: Offer[]) => void;
    _addTranscriptEntry: (entry: TranscriptEntry) => void;
    _updateStatus: (status: ModalState) => void;
  };
}
