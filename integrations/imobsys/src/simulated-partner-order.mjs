/** Local-only state machine. External reservation and payment actions are not implemented. */
export function simulatedPartnerOrder(quote, { id, now = Date.now() }) {
  if (quote?.provider !== 'imobsys-crcn' || quote.mode !== 'simulation-only' || !id || !Number.isSafeInteger(quote.pix?.totalCents) || quote.pix.totalCents <= 0 || !Number.isFinite(Date.parse(quote.observedAt)) || now < Date.parse(quote.observedAt) || now - Date.parse(quote.observedAt) > 30000) throw new Error('Cotação inválida ou expirada.');
  return Object.freeze({ id, provider:quote.provider, propertyId:quote.propertyId, from:quote.from, to:quote.to, guests:quote.guests, amountCents:quote.pix.totalCents, status:'awaiting_pre_reservation', reservationReference:null, paymentReference:null, simulation:true });
}

export function advanceSimulatedOrder(order, event) {
  if (!order?.simulation || !event || typeof event !== 'object') throw new Error('Somente pedidos simulados são aceitos.');
  if (event.type === 'pre_reservation_created' && order.status === 'awaiting_pre_reservation' && typeof event.reference === 'string' && event.reference.trim()) return Object.freeze({...order,status:'awaiting_payment',reservationReference:event.reference.trim()});
  if (event.type === 'payment_verified' && order.status === 'awaiting_payment' && event.amountCents === order.amountCents && event.currency === 'BRL' && typeof event.reference === 'string' && event.reference.trim()) return Object.freeze({...order,status:'awaiting_seller_confirmation',paymentReference:event.reference.trim()});
  if (event.type === 'seller_confirmed' && order.status === 'awaiting_seller_confirmation' && typeof event.operator === 'string' && event.operator.trim()) return Object.freeze({...order,status:'confirmed',confirmedBy:event.operator.trim()});
  if (event.type === 'payment_declined' && order.status === 'awaiting_payment') return Object.freeze({...order,status:'payment_declined'});
  throw new Error('Transição simulada inválida.');
}
