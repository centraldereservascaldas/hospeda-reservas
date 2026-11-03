import { useEffect, useState } from 'react';
import { crcnBackendApi } from '../../services/crcnBackendApi';
import type { CalculatedPriceResponse } from '../../services/crcnBackendApi';

interface PropertyQuoteOptions {
  listingId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}

export function usePropertyQuote({ listingId, checkIn, checkOut, guests }: PropertyQuoteOptions) {
  const contextKey = JSON.stringify([listingId, checkIn, checkOut, guests]);
  const [state, setState] = useState<{
    contextKey: string;
    quote: CalculatedPriceResponse | null;
    loading: boolean;
    failed: boolean;
  }>({ contextKey: '', quote: null, loading: false, failed: false });
  const [retryToken, setRetryToken] = useState(0);
  useEffect(() => {
    if (!listingId || !checkIn || !checkOut) {
      setState({ contextKey, quote: null, loading: false, failed: false });
      return;
    }
    let current = true;
    setState({ contextKey, quote: null, loading: true, failed: false });
    crcnBackendApi
      .calculatePrice({ listingId, from: checkIn, to: checkOut, guests })
      .then((quote) => {
        if (current) setState({ contextKey, quote, loading: false, failed: false });
      })
      .catch(() => {
        if (current) setState({ contextKey, quote: null, loading: false, failed: true });
      });
    return () => {
      current = false;
    };
  }, [listingId, checkIn, checkOut, guests, contextKey, retryToken]);
  const isCurrent = state.contextKey === contextKey;
  return {
    staysPrice: isCurrent ? state.quote : null,
    isCalculatingPrice: Boolean(listingId && (!isCurrent || state.loading)),
    priceRequestFailed: isCurrent && state.failed,
    retryPrice: () => setRetryToken((token) => token + 1),
  };
}
