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
    let expirationTimer: ReturnType<typeof setTimeout> | undefined;
    let expiresAt: number | undefined;
    const expire = () => {
      if (current && expiresAt !== undefined && expiresAt <= Date.now()) {
        setState((previous) => ({
          ...previous,
          quote: previous.quote ? { ...previous.quote } : null,
        }));
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') expire();
    };
    document.addEventListener('visibilitychange', onVisibility);
    setState({ contextKey, quote: null, loading: true, failed: false });
    crcnBackendApi
      .calculatePrice({ listingId, from: checkIn, to: checkOut, guests })
      .then((quote) => {
        if (!current) return;
        expiresAt = quote ? Math.min(quote.expiresAt ?? Infinity, Date.now() + 45_000) : undefined;
        setState({
          contextKey,
          quote: quote ? { ...quote, expiresAt } : null,
          loading: false,
          failed: false,
        });
        if (expiresAt !== undefined)
          expirationTimer = setTimeout(expire, Math.max(1, expiresAt - Date.now()));
      })
      .catch(() => {
        if (current) setState({ contextKey, quote: null, loading: false, failed: true });
      });
    return () => {
      current = false;
      if (expirationTimer !== undefined) clearTimeout(expirationTimer);
      document.removeEventListener('visibilitychange', onVisibility);
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
