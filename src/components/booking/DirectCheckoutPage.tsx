import { lazy, Suspense, useState } from 'react';
import { useSupabaseSession } from '../../hooks/useSupabaseSession';
import { useCheckoutDraftRecovery } from '../../hooks/useCheckoutDraftRecovery';
import type { AppOverlayBookingPayload } from '../../types/booking';
import type { Currency } from '../../types';
import { AuthCallbackNotice } from '../account/AuthCallbackNotice';
import { CheckoutRecoveryPage } from './CheckoutRecoveryPage';
import { CHECKOUT_DRAFT_HISTORY_KEY } from '../../utils/checkoutDraft';
import { CHECKOUT_MODAL_HISTORY_ENTRY } from '../../hooks/useAppOverlayActions';
import { getAuthCallbackError } from '../../utils/authCallback';
import { getCheckoutAccommodationReturnUrl } from '../../utils/checkoutReturn';

const SinglePageCheckout = lazy(() =>
  import('./SinglePageCheckout').then(({ SinglePageCheckout }) => ({
    default: SinglePageCheckout,
  })),
);

const initialAuthCallbackError = getAuthCallbackError(window.location.search, window.location.hash);

function readCheckoutCurrency(): Currency {
  const currency = new URLSearchParams(window.location.search).get('currency');
  return currency === 'USD' || currency === 'EUR' || currency === 'BRL' ? currency : 'BRL';
}

function hasCheckoutModalHistoryEntry(): boolean {
  const state: unknown = window.history.state;
  return (
    state !== null &&
    typeof state === 'object' &&
    CHECKOUT_MODAL_HISTORY_ENTRY in state &&
    (state as Record<string, unknown>)[CHECKOUT_MODAL_HISTORY_ENTRY] === true
  );
}

function navigateBack(payload: AppOverlayBookingPayload | null, currency: Currency): void {
  if (hasCheckoutModalHistoryEntry()) {
    window.history.back();
    return;
  }
  if (!payload) {
    window.location.assign('/');
    return;
  }

  const state: unknown = window.history.state;
  const nextState: Record<string, unknown> = state && typeof state === 'object' ? { ...state } : {};
  delete nextState[CHECKOUT_MODAL_HISTORY_ENTRY];
  delete nextState[CHECKOUT_DRAFT_HISTORY_KEY];
  const accommodationUrl = getCheckoutAccommodationReturnUrl(
    payload,
    currency,
    window.location.search,
  );
  window.history.replaceState(nextState, '', accommodationUrl);
  window.dispatchEvent(new window.PopStateEvent('popstate', { state: nextState }));
}

export function DirectCheckoutPage() {
  const [bookingPayload, setBookingPayload] = useState<AppOverlayBookingPayload | null>(null);
  const recovery = useCheckoutDraftRecovery(bookingPayload, setBookingPayload, 0);
  const { accountSession, authCallbackNotice, setAuthCallbackNotice } = useSupabaseSession({
    isConfigured: Boolean(
      import.meta.env.VITE_SUPABASE_URL?.trim() && import.meta.env.VITE_SUPABASE_ANON_KEY?.trim(),
    ),
    initialHash: window.location.hash,
    initialAuthCallbackError,
  });
  const currency = readCheckoutCurrency();
  const guestPrefill = {
    fullName: String(
      accountSession?.user.user_metadata?.full_name ||
        accountSession?.user.user_metadata?.name ||
        '',
    ),
    email: accountSession?.user.email || '',
    phone: String(accountSession?.user.phone || accountSession?.user.user_metadata?.phone || ''),
  };
  const status = recovery.status === 'error' ? 'error' : 'loading';
  const onBack = () => navigateBack(bookingPayload, currency);

  if (!bookingPayload || recovery.status !== 'idle') {
    return (
      <>
        {authCallbackNotice && (
          <AuthCallbackNotice
            message={authCallbackNotice}
            isError={Boolean(initialAuthCallbackError)}
            onDismiss={() => setAuthCallbackNotice('')}
          />
        )}
        <CheckoutRecoveryPage status={status} onRetry={recovery.retry} onBack={onBack} />
      </>
    );
  }

  return (
    <>
      {authCallbackNotice && (
        <AuthCallbackNotice
          message={authCallbackNotice}
          isError={Boolean(initialAuthCallbackError)}
          onDismiss={() => setAuthCallbackNotice('')}
        />
      )}
      <Suspense
        fallback={
          <CheckoutRecoveryPage status="loading" onRetry={recovery.retry} onBack={onBack} />
        }
      >
        <SinglePageCheckout
          bookingData={bookingPayload}
          guestPrefill={guestPrefill}
          onClose={onBack}
          isStandalonePage
        />
      </Suspense>
    </>
  );
}
