import { ConnectorError } from './provider-http.mjs';

/** Prepare data for a future partner checkout. Does not reserve or charge. */
export function prepareManualCheckout(quote, { now = Date.now(), maximumAgeMs = 30000 } = {}) {
  const observed = Date.parse(quote?.observedAt);
  if (quote?.provider !== 'imobsys-crcn' || quote.mode !== 'simulation-only'
      || !Number.isFinite(observed) || observed > now || now - observed > maximumAgeMs
      || !Number.isSafeInteger(quote?.pix?.totalCents) || quote.pix.totalCents < 1
      || !Array.isArray(quote.card) || quote.card.length !== 6
      || quote.card.some((item, i) => item.installments !== i + 1 || item.baseCents !== quote.pix.totalCents)) {
    throw new ConnectorError('quote_not_current', 'A cotação precisa ser consultada novamente.', 409);
  }
  return {
    origin: 'imobsys_manual',
    providerPropertyId: quote.propertyId,
    stay: { checkIn: quote.from, checkOut: quote.to, guests: quote.guests },
    property: quote.accommodation,
    quote: { currency: 'BRL', baseCents: quote.pix.totalCents, observedAt: quote.observedAt, cardOptions: quote.card },
    fulfillment: { method: 'manual', status: 'awaiting_manual_reservation', reservationConfirmed: false, inventoryHeld: false },
    gateway: 'cielo',
    paymentEnabled: false,
    bookingEnabled: false,
  };
}
