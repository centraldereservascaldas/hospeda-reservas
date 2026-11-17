import { useEffect, useState } from 'react';
import type { Property } from '../types';
import type { AppOverlayBookingPayload } from '../types/booking';
import { crcnBackendApi, getCalendarExpiration } from '../services/crcnBackendApi';
import { countOccupancyGuests } from '../utils/guestCounts';
import { isConfirmedPropertyQuote } from '../utils/propertyPricing';
import { validateCalendarRange } from '../utils/staysAvailability';
import { NEW_CHECKOUT_PATH, readCheckoutDraft } from '../utils/checkoutDraft';

export function useCheckoutDraftRecovery(
  properties: Property[],
  catalogLoading: boolean,
  bookingPayload: AppOverlayBookingPayload | null,
  setBookingPayload: (payload: AppOverlayBookingPayload | null) => void,
  navigation: number,
) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (window.location.pathname !== NEW_CHECKOUT_PATH || bookingPayload) {
      setStatus('idle');
      return;
    }
    const draft = readCheckoutDraft();
    if (!draft) {
      setStatus('error');
      return;
    }
    if (catalogLoading) {
      setStatus('loading');
      return;
    }
    let active = true;
    setStatus('loading');
    void (async () => {
      const property =
        properties.find((item) => item.id === draft.propertyId) ??
        (await crcnBackendApi.getAccommodationById(draft.propertyId));
      if (!active) return;
      if (
        !property ||
        property.simulatedData ||
        (property.id !== draft.propertyId && property.staysListingId !== draft.propertyId)
      ) {
        setStatus('error');
        return;
      }
      const listingId = property.staysListingId || property.id;
      const guests = countOccupancyGuests(draft.guests);
      const [calendar, quote] = await Promise.all([
        crcnBackendApi.getAccommodationCalendar(listingId, draft.checkIn, draft.checkOut),
        crcnBackendApi.calculatePrice({
          listingId,
          from: draft.checkIn,
          to: draft.checkOut,
          guests,
        }),
      ]);
      if (!active) return;
      const expiry = getCalendarExpiration(calendar);
      if (
        (expiry !== undefined && expiry <= Date.now()) ||
        !validateCalendarRange(calendar, draft.checkIn, draft.checkOut).available ||
        !isConfirmedPropertyQuote(quote) ||
        quote.source !== 'stays-live'
      ) {
        setStatus('error');
        return;
      }
      setBookingPayload({
        property,
        checkIn: draft.checkIn,
        checkOut: draft.checkOut,
        guests: draft.guests,
        nights: quote.nights,
        totalAmount: quote.total,
        cleaningFee: quote.cleaningFee,
        serviceFee: quote.serviceFee,
        discount: quote.discount,
        quote,
      });
      setStatus('idle');
    })().catch(() => {
      if (active) setStatus('error');
    });
    return () => {
      active = false;
    };
  }, [properties, catalogLoading, bookingPayload, setBookingPayload, navigation, retry]);
  return { status, retry: () => setRetry((value) => value + 1) };
}
