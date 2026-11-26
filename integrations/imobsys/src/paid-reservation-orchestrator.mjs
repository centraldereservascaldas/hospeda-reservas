import { cardPricing } from './checkout-quote.mjs';

/** Sandbox-only coordinator. The context loader must return server-owned order data. */
export function createPaidReservationOrchestrator({ operations, loadContext, cielo, reservations, verifyReservation, sellerStore, enabled = false }) {
  return {
    async reconcile(id) {
      if (!enabled) throw new Error('Integração desativada.');
      const operation = operations.get(id);
      if (!operation) throw new Error('Pedido não encontrado.');
      if (['awaiting_seller_confirmation', 'payment_rejected', 'payment_cancelled'].includes(operation.state)) return { status: operation.state };
      if (operation.state !== 'payment_pending') throw new Error('Pedido requer conferência.');
      const context = await loadContext(id);
      const { order, paymentId, quote, reservationInput } = context;
      if (order?.simulation !== true || order.id !== id || order.merchantOrderId !== id || !['pix', 'card'].includes(order.method) || !Number.isSafeInteger(order.amountCents) || order.amountCents < 1 || !paymentId || !quote || quote.propertyId !== order.propertyId || quote.from !== order.from || quote.to !== order.to || quote.guests !== order.guests) throw new Error('Contexto do pedido divergente.');
      const property = /^imobsys-crcn-([1-9]\d*)-([1-9]\d*)$/.exec(order.propertyId || '');
      const fields = reservationInput?.fields;
      const total = fields?.totalDinheiro;
      if (!property || reservationInput?.sourcePropertyId !== order.propertyId || fields?.idImovel !== property[2] || fields.entrada !== order.from || fields.saida !== order.to || typeof total !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(total) || !Number.isSafeInteger(quote.pix?.totalCents) || Math.round(Number(total) * 100) !== quote.pix.totalCents) throw new Error('Dados da pré-reserva divergentes.');
      const expectedAmount = order.method === 'pix' ? quote.pix.totalCents : cardPricing(quote.pix.totalCents, order.installments).totalCents;
      if (expectedAmount !== order.amountCents || operation.payload.paymentId !== paymentId || operation.payload.order?.propertyId !== order.propertyId || operation.payload.order?.from !== order.from || operation.payload.order?.to !== order.to || operation.payload.order?.guests !== order.guests || operation.payload.order?.amountCents !== order.amountCents || operation.payload.order?.method !== order.method || (order.method === 'card' && operation.payload.order?.installments !== order.installments)) throw new Error('Pagamento e pedido registrados divergem.');
      const result = await cielo.findPayment(paymentId);
      const payment = result?.Payment;
      if (result?.MerchantOrderId !== id || payment?.PaymentId !== paymentId || payment.Amount !== order.amountCents || payment.Currency !== 'BRL' || payment.Type !== (order.method === 'pix' ? 'Pix' : 'CreditCard') || (order.method === 'card' && payment.Installments !== order.installments)) throw new Error('Pagamento não confirmado ou divergente.');
      if ([3, 10, 13].includes(payment.Status)) {
        const status = payment.Status === 3 ? 'payment_rejected' : 'payment_cancelled';
        if (!operations.claimTransition(id, 'payment_pending', status)) throw new Error('Pedido já está em processamento.');
        return { status };
      }
      if (payment.Status !== 2) throw new Error('Pagamento ainda não confirmado.');
      if (!operations.claimTransition(id, 'payment_pending', 'reservation_starting')) throw new Error('Pedido já está em processamento ou requer conferência.');
      try {
        const reservation = await reservations.create(reservationInput);
        operations.advance(id, 'reservation_returned', { reference: reservation.reference });
        if (await verifyReservation(reservation, quote) !== true) throw new Error('Pré-reserva não conferida.');
        // O Pix da cotação é o valor do hóspede; o valor devido ao parceiro é outro campo.
        sellerStore.recordPaid({ ...order, reservationReference: reservation.reference, supplierAmountCents: null, paymentId, simulation: true, paymentVerified: true });
        operations.advance(id, 'awaiting_seller_confirmation', { reference: reservation.reference, paymentId });
        return { status: 'awaiting_seller_confirmation', reference: reservation.reference };
      } catch (error) {
        operations.advance(id, 'attention_required', { reason: 'paid_reservation_requires_review' });
        throw error;
      }
    },
  };
}
