/**
 * Exit Button React Context
 * Provides API client and shared state to child components
 */

import { createContext, useContext, useMemo, ReactNode } from 'react';
import { createApiClient, ExitButtonApiClient } from '@tranzmit/exit-button-core';

interface ExitButtonContextValue {
  apiClient: ExitButtonApiClient;
  apiKey: string;
}

const ExitButtonContext = createContext<ExitButtonContextValue | null>(null);

export interface ExitButtonProviderProps {
  /** Your Exit Button API key */
  apiKey: string;
  /** API base URL (defaults to https://api.tranzmitai.com/v1) */
  baseUrl?: string;
  /** Child components */
  children: ReactNode;
}

/**
 * Provider component that makes Exit Button functionality available to child components
 */
export function ExitButtonProvider({
  apiKey,
  baseUrl = 'https://api.tranzmitai.com/v1',
  children,
}: ExitButtonProviderProps): JSX.Element {
  const value = useMemo(() => {
    const apiClient = createApiClient({ apiKey, baseUrl });
    return { apiClient, apiKey };
  }, [apiKey, baseUrl]);

  return (
    <ExitButtonContext.Provider value={value}>
      {children}
    </ExitButtonContext.Provider>
  );
}

/**
 * Hook to access the Exit Button context
 */
export function useExitButtonContext(): ExitButtonContextValue {
  const context = useContext(ExitButtonContext);
  if (!context) {
    throw new Error('useExitButtonContext must be used within an ExitButtonProvider');
  }
  return context;
}
