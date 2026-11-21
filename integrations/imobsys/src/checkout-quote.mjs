import { ConnectorError, validateDates } from './provider-http.mjs';

// Mirrors CieloCardPricing: gross up with integer-cent rounding, never supplier net.
export function cardPricing(baseCents, installments) {
  if (!Number.isSafeInteger(baseCents) || baseCents < 1 || baseCents > 100000000 || !Number.isInteger(installments) || installments < 1 || installments > 6) throw new ConnectorError('invalid_price', 'Valor ou parcelamento inválido.', 400);
  const rateBasisPoints = installments === 1 ? 599 : installments <= 3 ? 1250 : 1800;
  const divisor = 10000 - rateBasisPoints;
  const totalCents = Math.floor((baseCents * 10000 + divisor - 1) / divisor);
  return { installments, baseCents, feeCents: totalCents - baseCents, totalCents, rateBasisPoints };
}

export function validateCheckoutQuery(query) {
  const {from, to} = validateDates(query.from, query.to);
  if (!/^imobsys-crcn-[1-9]\d*-[1-9]\d*$/.test(query.propertyId || '')) throw new ConnectorError('invalid_property', 'Apartamento inválido.', 400);
  if (!/^(?:[2-9]|10)$/.test(query.guests || '')) throw new ConnectorError('invalid_guests', 'Selecione de 2 a 10 hóspedes para consultar o parceiro.', 400);
  return {propertyId:query.propertyId, from, to, guests:query.guests};
}

export function checkoutQuote(query, result) {
  const q = validateCheckoutQuery(query);
  if (result.source !== 'authenticated-network-search' || result.from !== q.from || result.to !== q.to || String(result.guests) !== q.guests || !Array.isArray(result.offers)) throw new ConnectorError('quote_mismatch', 'A cotação não corresponde à busca.', 409);
  const matches = result.offers.filter(item => item.id === q.propertyId);
  if (matches.length !== 1) throw new ConnectorError('offer_not_found', 'Não encontramos oferta para esse apartamento e período.', 409);
  const offer = matches[0], baseCents = offer.pixCents;
  if (!Number.isSafeInteger(baseCents) || baseCents < 1 || baseCents > 100000000) throw new ConnectorError('invalid_price', 'A cotação não tem valor final válido.', 409);
  return { provider:'imobsys-crcn', propertyId:q.propertyId, from:q.from, to:q.to, guests:Number(q.guests), accommodation:{condominium:offer.condominium, unit:offer.unit}, observedAt:result.observedAt, pix:{baseCents,totalCents:baseCents,feeCents:0}, card:Array.from({length:6},(_,i)=>cardPricing(baseCents,i+1)), availabilityConfirmed:false, reservationGuaranteed:false, paymentEnabled:false, bookingEnabled:false, mode:'simulation-only' };
}
