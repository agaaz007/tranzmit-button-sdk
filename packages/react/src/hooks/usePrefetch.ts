/**
 * usePrefetch Hook
 * Prefetch PostHog session analysis so the cancel flow starts instantly.
 *
 * Usage:
 *   const { prefetch, triggered } = usePrefetch({ userId });
 *   useEffect(() => { prefetch(); }, []);
 */

import { useState, useCallback, useRef } from 'react';
import { useExitButtonContext } from '../context';

export interface UsePrefetchOptions {
  /** User ID (required — serves as cache key on the backend) */
  userId: string;
  /** Plan name for richer analysis */
  planName?: string;
  /** Monthly recurring revenue */
  mrr?: number;
  /** Account age (e.g., "8 months") */
  accountAge?: string;
  /** Enable PostHog session replay analysis (default: true). Set to false to skip. */
  sessionAnalysis?: boolean;
}

export interface UsePrefetchReturn {
  /** Trigger prefetch manually (deduped, fire-and-forget) */
  prefetch: () => void;
  /** Whether prefetch has been triggered at least once */
  triggered: boolean;
}

export function usePrefetch(options: UsePrefetchOptions): UsePrefetchReturn {
  const { apiClient } = useExitButtonContext();
  const [triggered, setTriggered] = useState(false);
  const doneRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const prefetch = useCallback(() => {
    if (doneRef.current) return; // already fired
    doneRef.current = true;
    setTriggered(true);

    apiClient
      .prefetch({
        userId: optionsRef.current.userId,
        planName: optionsRef.current.planName,
        mrr: optionsRef.current.mrr,
        accountAge: optionsRef.current.accountAge,
        sessionAnalysis: optionsRef.current.sessionAnalysis,
      })
      .catch(() => {
        // fire-and-forget — don't surface prefetch errors
      });
  }, [apiClient]);

  return { prefetch, triggered };
}
