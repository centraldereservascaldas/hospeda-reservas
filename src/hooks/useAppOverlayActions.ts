import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Currency, Property, SearchFilters } from '../types';
import type { AppOverlayBookingPayload } from '../types/booking';
import { scrollIntoViewRespectingMotion } from '../utils/motion';
import { emitFunnelEvent } from '../utils/measurementEvents';
import {
  CHECKOUT_DRAFT_HISTORY_KEY,
  NEW_CHECKOUT_PATH,
  saveCheckoutDraft,
} from '../utils/checkoutDraft';
import { checkoutUrlWithStay } from '../utils/checkoutUrl';
import { getCheckoutAccommodationReturnUrl } from '../utils/checkoutReturn';

export const CHECKOUT_MODAL_HISTORY_ENTRY = '__crcnCheckoutModalEntry';

export interface AppOverlaySuggestedFilters {
  destination?: string;
  guests?: number;
}

interface UseAppOverlayActionsOptions {
  currency?: Currency;
  setProperties: Dispatch<SetStateAction<Property[]>>;
  setFilters: Dispatch<SetStateAction<SearchFilters>>;
  setIsSofiaOpen: Dispatch<SetStateAction<boolean>>;
  setBookingPayload: Dispatch<SetStateAction<AppOverlayBookingPayload | null>>;
  onSelectProperty: (property: Property) => void;
  scrollCatalog?: () => void;
}

const scrollToAccommodationCatalog = () => {
  const catalogElement = document.getElementById('stays-apartments-catalog');
  if (catalogElement) scrollIntoViewRespectingMotion(catalogElement);
};

export function useAppOverlayActions({
  currency = 'BRL',
  setProperties,
  setFilters,
  setIsSofiaOpen,
  setBookingPayload,
  onSelectProperty,
  scrollCatalog = scrollToAccommodationCatalog,
}: UseAppOverlayActionsOptions) {
  const handleAddNewProperty = useCallback(
    (property: Property) => {
      setProperties((current) => [property, ...current]);
    },
    [setProperties],
  );

  const handleStartBooking = useCallback(
    (payload: AppOverlayBookingPayload) => {
      emitFunnelEvent({
        event: 'begin_checkout',
        items: [{ item_id: payload.property.staysListingId || payload.property.id }],
      });
      const state: Record<string, unknown> =
        window.history.state && typeof window.history.state === 'object'
          ? { ...window.history.state }
          : {};
      delete state[CHECKOUT_MODAL_HISTORY_ENTRY];
      const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.history.replaceState(state, '', currentUrl);
      const draftId = saveCheckoutDraft(payload);
      const checkoutUrl = checkoutUrlWithStay(
        NEW_CHECKOUT_PATH,
        {
          listingId: payload.property.staysListingId || payload.property.id,
          from: payload.checkIn,
          to: payload.checkOut,
          guests: payload.guests,
        },
        window.location.search,
        currency,
      );
      window.history.pushState(
        { ...state, [CHECKOUT_MODAL_HISTORY_ENTRY]: true, [CHECKOUT_DRAFT_HISTORY_KEY]: draftId },
        '',
        checkoutUrl,
      );
      setBookingPayload(payload);
    },
    [currency, setBookingPayload],
  );

  const handleCloseBooking = useCallback(
    (payload: AppOverlayBookingPayload | null) => {
      const state: unknown = window.history.state;
      const hasCheckoutModalEntry =
        state !== null &&
        typeof state === 'object' &&
        CHECKOUT_MODAL_HISTORY_ENTRY in state &&
        (state as Record<string, unknown>)[CHECKOUT_MODAL_HISTORY_ENTRY] === true;

      if (hasCheckoutModalEntry) {
        window.history.back();
      } else if (payload) {
        const nextState: Record<string, unknown> =
          state && typeof state === 'object' ? { ...state } : {};
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

      setBookingPayload(null);
    },
    [currency, setBookingPayload],
  );

  const handleAssistantApplyFilters = useCallback(
    (suggested: AppOverlaySuggestedFilters) => {
      if (suggested.destination || suggested.guests) {
        setFilters((previous) => {
          const isNewDestination =
            suggested.destination !== undefined && suggested.destination !== previous.destination;

          return {
            ...previous,
            ...(suggested.destination
              ? {
                  destination: suggested.destination,
                  ...(isNewDestination ? { destinationPropertyId: '' } : {}),
                }
              : {}),
            ...(suggested.guests
              ? { guests: { ...previous.guests, adults: suggested.guests } }
              : {}),
          };
        });
      }
      setIsSofiaOpen(false);
      scrollCatalog();
    },
    [scrollCatalog, setFilters, setIsSofiaOpen],
  );

  const handleSelectPropertyFromSofia = useCallback(
    (property: Property) => {
      setIsSofiaOpen(false);
      onSelectProperty(property);
    },
    [onSelectProperty, setIsSofiaOpen],
  );

  return {
    handleAddNewProperty,
    handleStartBooking,
    handleCloseBooking,
    handleAssistantApplyFilters,
    handleSelectPropertyFromSofia,
  };
}
