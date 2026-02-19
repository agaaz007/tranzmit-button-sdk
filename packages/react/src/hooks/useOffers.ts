/**
 * useOffers Hook
 * Manages win-back offers state and actions
 */

import { useState, useCallback } from 'react';
import type { Offer } from '@tranzmit/exit-button-core';

export interface UseOffersReturn {
  /** Available offers */
  offers: Offer[];
  /** Currently selected offer index */
  selectedIndex: number | null;
  /** Set offers */
  setOffers: (offers: Offer[]) => void;
  /** Select an offer by index */
  select: (index: number) => void;
  /** Clear selection */
  clearSelection: () => void;
  /** Get selected offer */
  selectedOffer: Offer | null;
  /** Check if there are any offers */
  hasOffers: boolean;
}

export function useOffers(): UseOffersReturn {
  const [offers, setOffersState] = useState<Offer[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const setOffers = useCallback((newOffers: Offer[]) => {
    setOffersState(newOffers);
    setSelectedIndex(null);
  }, []);

  const select = useCallback((index: number) => {
    if (index >= 0 && index < offers.length) {
      setSelectedIndex(index);
    }
  }, [offers.length]);

  const clearSelection = useCallback(() => {
    setSelectedIndex(null);
  }, []);

  const selectedOffer = selectedIndex !== null ? offers[selectedIndex] ?? null : null;
  const hasOffers = offers.length > 0;

  return {
    offers,
    selectedIndex,
    setOffers,
    select,
    clearSelection,
    selectedOffer,
    hasOffers,
  };
}
