import { ConnectorError, validateDates } from './provider-http.mjs';

// Compatible search envelope; unknown supplier details stay unknown.
export function mapAccommodationSearch(result, query) {
  const { from, to } = validateDates(query.from, query.to);
  const guests = Number(query.guests);
  if (!Number.isInteger(guests) || guests < 2 || guests > 10) throw new ConnectorError('invalid_guests', 'Informe de 2 a 10 hóspedes.', 400);
  if (!result || result.source !== 'authenticated-network-search' || result.from !== from || result.to !== to || String(result.guests) !== String(guests) || !Array.isArray(result.offers)) throw new ConnectorError('search_mismatch', 'Resultado da consulta não corresponde ao período solicitado.', 502);
  const nights = (Date.parse(to) - Date.parse(from)) / 86400000;
  const data = result.offers.map(offer => {
    if (!/^imobsys-crcn-[1-9]\d*-[1-9]\d*$/.test(offer.id || '') || !Number.isSafeInteger(offer.pixCents) || offer.pixCents < 1) throw new ConnectorError('invalid_offer', 'Oferta inválida.', 502);
    return {
      id: offer.id, title: `${offer.condominium} – Apartamento ${offer.unit}`,
      subtitle: offer.condominium, description: offer.description || '',
      provider: 'imobsys', images: [], maxGuests: null,
      calculatedPrice: { nights, totalAmount: offer.pixCents / 100, currency: 'BRL', feesIncluded: true, dailyRate: null, cleaningFee: null, serviceFee: null },
      availabilityStatus: 'offered', reservationGuaranteed: false,
    };
  });
  return { success: true, source: 'imobsys-live', total: data.length, from, to, guests, data,
    unquotedCount: 0, meta: { observedAt: result.observedAt, availabilityConfirmed: false, bookingEnabled: false, paymentEnabled: false },
    pagination: { receivedCount: data.length, nextSkip: null, hasMore: false } };
}
