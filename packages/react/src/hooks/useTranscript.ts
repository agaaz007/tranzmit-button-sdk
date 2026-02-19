/**
 * useTranscript Hook
 * Provides access to the conversation transcript
 */

import { useState, useCallback } from 'react';
import type { TranscriptEntry } from '@tranzmit/exit-button-core';

export interface UseTranscriptReturn {
  /** Full conversation transcript */
  transcript: TranscriptEntry[];
  /** Add a new entry to the transcript */
  addEntry: (entry: TranscriptEntry) => void;
  /** Clear the transcript */
  clear: () => void;
  /** Get the last entry */
  lastEntry: TranscriptEntry | null;
  /** Check if transcript has any entries */
  hasEntries: boolean;
}

export function useTranscript(): UseTranscriptReturn {
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  const addEntry = useCallback((entry: TranscriptEntry) => {
    setTranscript((prev) => [...prev, entry]);
  }, []);

  const clear = useCallback(() => {
    setTranscript([]);
  }, []);

  const lastEntry = transcript.length > 0 ? transcript[transcript.length - 1]! : null;
  const hasEntries = transcript.length > 0;

  return {
    transcript,
    addEntry,
    clear,
    lastEntry,
    hasEntries,
  };
}
