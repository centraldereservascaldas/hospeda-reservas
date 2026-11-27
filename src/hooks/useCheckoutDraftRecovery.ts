import { useEffect, useState } from 'react';
import type { Property } from '../types';
import type { AppOverlayBookingPayload } from '../types/booking';
import { crcnBackendApi, getCalendarExpiration } from '../services/crcnBackendApi';
import { countOccupancyGuests } from '../utils/guestCounts';
import { isConfirmedPropertyQuote } from '../utils/propertyPricing';
import { validateCalendarRange } from '../utils/staysAvailability';
import { isNewCheckoutPath, readCheckoutDraft } from '../utils/checkoutDraft';
import { checkoutStayFromSearch, checkoutUrlWithStay } from '../utils/checkoutUrl';
import { accommodationPagePath } from '../utils/accommodationPageUrl';

function propertyReturnUrl(
  path: string,
  stay: Parameters<typeof checkoutUrlWithStay>[1],
  sourceSearch: string,
  currency: string,
): string {
  const checkoutUrl = checkoutUrlWithStay(path, stay, sourceSearch, currency);
  const destination = new URL(checkoutUrl, window.location.origin);
  destination.searchParams.delete('accommodation');
  return `${destination.pathname}${destination.search}`;
}

export function useCheckoutDraftRecovery(
  properties: Property[],
  catalogLoading: boolean,
  bookingPayload: AppOverlayBookingPayload | null,
  setBookingPayload: (payload: AppOverlayBookingPayload | null) => void,
  navigation: number,
) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [retry, setRetry] = useState(0);
  const [returnUrl, setReturnUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!isNewCheckoutPath(window.location.pathname) || bookingPayload) {
      setStatus('idle');
      setReturnUrl(null);
      return;
    }
    const storedDraft = readCheckoutDraft();
    const urlStay = checkoutStayFromSearch(window.location.search);
    const draft = urlStay
      ? {
          propertyId: urlStay.listingId,
          checkIn: urlStay.from,
          checkOut: urlStay.to,
          guests: urlStay.guests,
        }
      : storedDraft;
    if (!draft) {
      setStatus('error');
      setReturnUrl(null);
      return;
    }
    const stay = {
      listingId: draft.propertyId,
      from: draft.checkIn,
      to: draft.checkOut,
      guests: draft.guests,
    };
    const sourceParams = new URLSearchParams(window.location.search);
    const requestedCurrency = sourceParams.getAll('currency');
    const currency =
      requestedCurrency.length === 1 && /^[A-Z]{3}$/.test(requestedCurrency[0])
        ? requestedCurrency[0]
        : 'BRL';
    const fallbackPropertyId = draft.propertyId.replace(
      /^imobsys-crcn-(\d+)-(\d+)$/,
      'parceiro-crcn-$1-$2',
    );
    const fallbackPath = `/apartamento/${encodeURIComponent(fallbackPropertyId)}`;
    setReturnUrl(propertyReturnUrl(fallbackPath, stay, window.location.search, currency));
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
      setReturnUrl(
        propertyReturnUrl(accommodationPagePath(property), stay, window.location.search, currency),
      );
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
  return { status, returnUrl, retry: () => setRetry((value) => value + 1) };
}
