import type { Currency } from '../types';
import type { AppOverlayBookingPayload } from '../types/booking';
import { accommodationPagePath } from './accommodationPageUrl';
import { checkoutUrlWithStay } from './checkoutUrl';

export function getCheckoutAccommodationReturnUrl(
  payload: AppOverlayBookingPayload,
  currency: Currency,
  sourceSearch: string,
): string {
  const currencyFromUrl = new URLSearchParams(sourceSearch).get('currency');
  const returnCurrency =
    currencyFromUrl === 'USD' || currencyFromUrl === 'EUR' || currencyFromUrl === 'BRL'
      ? currencyFromUrl
      : currency;

  return checkoutUrlWithStay(
    accommodationPagePath(payload.property),
    {
      listingId: payload.property.staysListingId || payload.property.id,
      from: payload.checkIn,
      to: payload.checkOut,
      guests: payload.guests,
    },
    sourceSearch,
    returnCurrency,
  );
}
