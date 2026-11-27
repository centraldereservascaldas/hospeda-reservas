import { ConnectorError, htmlToText, moneyToCents } from './provider-http.mjs';

/** Recognize an already-returned partner contract; this never creates a reservation. */
export function inspectPartnerContract(html, expected) {
  if (typeof html !== 'string' || html.length > 2000000 || !expected || !/^[1-9]\d{0,11}$/.test(expected.reference||'') || !Number.isSafeInteger(expected.baseCents) || expected.baseCents < 1) throw new ConnectorError('invalid_contract','Dados de conferência inválidos.',400);
  const text=htmlToText(html);
  const ids=[...text.matchAll(/COD\s+ALUGUEL\s*:\s*(\d+)/gi)];
  const totals=[...text.matchAll(/VALOR\s+DO\s+ALUGUEL\s*:\s*R\$\s*([\d.]+,\d{2})/gi)];
  if (ids.length!==1 || totals.length!==1 || ids[0][1]!==expected.reference || moneyToCents(totals[0][1])!==expected.baseCents || !/sua\s+pr[eé]-reserva\s+expira/i.test(text) || /\bcancelad[ao]\b/i.test(text.slice(0,Math.min(text.length,1200)))) throw new ConnectorError('contract_unverified','Pré-reserva precisa de conferência antes do pagamento.',409);
  return {reference:expected.reference,baseCents:expected.baseCents,status:'pre_reservation_observed',reservationGuaranteed:false,paymentEnabled:false};
}
