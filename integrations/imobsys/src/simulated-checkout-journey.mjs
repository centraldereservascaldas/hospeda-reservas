import { simulatedPartnerOrder, advanceSimulatedOrder } from './simulated-partner-order.mjs';
import { cardPricing } from './checkout-quote.mjs';

/** Test-only orchestration. Gateways are explicit in-process fakes; no HTTP or secrets. */
export function createSimulatedCheckoutJourney({ reserve, charge }) {
  if (typeof reserve !== 'function' || typeof charge !== 'function') throw new Error('Test doubles required.');
  const orders = new Map();
  return {
    async start({id, quote, method, installments, now = Date.now()}) {
      if (orders.has(id)) throw new Error('Identificador já utilizado.');
      if (!['pix','card'].includes(method)) throw new Error('Método inválido.');
      const total = method === 'pix' ? quote.pix.totalCents : cardPricing(quote.pix.totalCents, installments).totalCents;
      let order = simulatedPartnerOrder(quote, {id, now});
      orders.set(id, {order, total, method, phase:'creating_reservation'});
      let reservation;
      try { reservation = await reserve({id, quote}); } catch { orders.set(id,{order,total,method,phase:'reservation_result_unknown'}); return orders.get(id); }
      if (reservation?.status !== 'created' || !reservation.reference) { orders.set(id,{order,total,method,phase:'reservation_not_created'}); return orders.get(id); }
      order = advanceSimulatedOrder(order,{type:'pre_reservation_created',reference:reservation.reference});
      orders.set(id,{order,total,method,phase:'initiating_payment'});
      let payment;
      try { payment = await charge({id, amountCents:total, currency:'BRL', method, installments:method==='card'?installments:1}); } catch { orders.set(id,{order,total,method,phase:'payment_result_unknown'}); return orders.get(id); }
      if (payment?.status === 'declined') { order=advanceSimulatedOrder(order,{type:'payment_declined'}); orders.set(id,{order,total,method,phase:'payment_declined'}); return orders.get(id); }
      if (payment?.status !== 'approved' || payment.amountCents !== total || payment.currency !== 'BRL' || !payment.reference) { orders.set(id,{order,total,method,phase:'payment_pending_or_unverified'}); return orders.get(id); }
      // The order tracks the accommodation base; the gateway amount above includes card fees.
      order=advanceSimulatedOrder(order,{type:'payment_verified',amountCents:quote.pix.totalCents,currency:'BRL',reference:payment.reference});
      orders.set(id,{order,total,method,phase:'awaiting_seller_confirmation'});
      return orders.get(id);
    },
    confirm(id, operator) {
      const state=orders.get(id);
      if (!state || state.phase!=='awaiting_seller_confirmation') throw new Error('Pedido não está pronto para confirmação manual.');
      const order=advanceSimulatedOrder(state.order,{type:'seller_confirmed',operator});
      const updated={...state,order,phase:'confirmed'}; orders.set(id,updated); return updated;
    },
    get(id) { return orders.get(id) || null; },
    sellerQueue() { return [...orders.values()].filter(state=>state.phase==='awaiting_seller_confirmation').map(state=>({id:state.order.id,propertyId:state.order.propertyId,from:state.order.from,to:state.order.to,guests:state.order.guests,reservationReference:state.order.reservationReference,amountCents:state.total,paymentMethod:state.method,status:state.phase,simulation:true})); },
  };
}
