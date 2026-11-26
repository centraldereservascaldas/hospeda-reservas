import { cardPricing } from './checkout-quote.mjs';

/** Starts only sandbox payments. Reservation context is encrypted before contacting Cielo. */
export function createPaidCheckoutStart({ quoteProvider, contextStore, operations, cielo, enabled = false }) {
  return {
    async start(input) {
      if (!enabled) throw new Error('Integração desativada.');
      if (!input || !/^[A-Za-z0-9]{1,25}$/.test(input.id || '') || !['pix', 'card'].includes(input.method)) throw new Error('Pedido inválido.');
      const customer = input.customer;
      if (!customer || typeof customer.name !== 'string' || !customer.name.trim() || !/^\d{11}$/.test(customer.cpf || '') || !/^\d{10,13}$/.test(customer.phone || '')) throw new Error('Dados do hóspede inválidos.');
      const candidate = { id: input.id, propertyId: input.propertyId, from: input.from, to: input.to, guests: input.guests, reservationInput: { customer: { name: customer.name, cpf: customer.cpf, phone: customer.phone } } };
      const quote = await quoteProvider(candidate);
      if (quote.provider !== 'imobsys-crcn' || quote.propertyId !== input.propertyId || quote.from !== input.from || quote.to !== input.to || quote.guests !== input.guests || !Number.isSafeInteger(quote.pix?.totalCents) || quote.pix.totalCents !== input.acceptedBaseCents) throw new Error('Cotação divergente.');
      const amountCents = input.method === 'pix' ? quote.pix.totalCents : cardPricing(quote.pix.totalCents, input.installments).totalCents;
      const order = { id: input.id, merchantOrderId: input.id, simulation: true, propertyId: quote.propertyId, from: quote.from, to: quote.to, guests: quote.guests, amountCents, method: input.method, ...(input.method === 'card' ? { installments: input.installments } : {}) };
      operations.claim(input.id, { order });
      try {
        const storedQuote = { provider: quote.provider, propertyId: quote.propertyId, from: quote.from, to: quote.to, guests: quote.guests, pix: { totalCents: quote.pix.totalCents } };
        contextStore.save(input.id, { quote: storedQuote, reservationInput: candidate.reservationInput });
        operations.advance(input.id, 'payment_starting', {});
        const common = { merchantOrderId: input.id, amountCents, customerName: customer.name, customerIdentity: customer.cpf };
        const result = input.method === 'pix' ? await cielo.createPix(common) : await cielo.createCard({ ...common, paymentToken: input.paymentToken, installments: input.installments });
        const paymentId = result?.Payment?.PaymentId;
        if (typeof paymentId !== 'string' || !paymentId) throw new Error('Pagamento requer conferência.');
        operations.advance(input.id, 'payment_pending', { order, paymentId });
        return { orderId: input.id, paymentId, status: 'payment_pending', simulation: true, qrCode: input.method === 'pix' ? result.Payment.QrCodeString || null : null };
      } catch (error) {
        operations.advance(input.id, 'attention_required', { reason: 'payment_start_requires_review' });
        throw error;
      }
    },
  };
}
