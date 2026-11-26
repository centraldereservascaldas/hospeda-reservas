import test from 'node:test';
import assert from 'node:assert/strict';
import { openCheckoutOperationStore } from '../src/checkout-operation-store.mjs';
import { createPaidReservationOrchestrator } from '../src/paid-reservation-orchestrator.mjs';
import { cardPricing } from '../src/checkout-quote.mjs';

for (const method of ['pix', 'card']) test(`${method}: pagamento confirmado precede uma única pré-reserva`, async () => {
  const operations = openCheckoutOperationStore(':memory:');
  const events = [];
  let sellerOrder;
  const order = { id: 'ORDER1', merchantOrderId: 'ORDER1', simulation: true, propertyId: 'imobsys-crcn-2-663', from: '2027-05-17', to: '2027-05-19', guests: 2, amountCents: method === 'pix' ? 52300 : cardPricing(52300, 6).totalCents, installments: 6, method };
  operations.claim(order.id, {});
  operations.advance(order.id, 'payment_pending', { order, paymentId: 'PAY1' });
  const flow = createPaidReservationOrchestrator({ enabled: true, operations, loadContext: async () => ({ order, paymentId: 'PAY1', quote: { ...order, pix: { totalCents: 52300 } }, reservationInput: { sourcePropertyId: order.propertyId, fields: { idImovel: '663', entrada: order.from, saida: order.to, totalDinheiro: '523.00' } } }), cielo: { findPayment: async () => { events.push('payment'); return { MerchantOrderId: order.id, Payment: { PaymentId: 'PAY1', Status: 2, Amount: order.amountCents, Currency: 'BRL', Type: method === 'pix' ? 'Pix' : 'CreditCard', Installments: 6 } }; } }, reservations: { create: async () => { events.push('reserve'); return { reference: '1600' }; } }, verifyReservation: async () => true, sellerStore: { recordPaid: input => { sellerOrder = input; events.push('seller'); } } });
  try {
    assert.equal((await flow.reconcile(order.id)).status, 'awaiting_seller_confirmation');
    assert.equal((await flow.reconcile(order.id)).status, 'awaiting_seller_confirmation');
    assert.deepEqual(events, ['payment', 'reserve', 'seller']);
    assert.equal(sellerOrder.supplierAmountCents, null);
    assert.equal(sellerOrder.amountCents, order.amountCents);
  } finally { operations.close(); }
});

test('pagamento não confirmado não cria pré-reserva', async () => {
  const operations = openCheckoutOperationStore(':memory:');
  const order = { id: 'ORDER2', merchantOrderId: 'ORDER2', simulation: true, propertyId: 'imobsys-crcn-2-663', from: '2027-05-17', to: '2027-05-19', guests: 2, amountCents: 52300, method: 'pix' };
  operations.claim(order.id, {}); operations.advance(order.id, 'payment_pending', { order, paymentId: 'PAY2' });
  let calls = 0;
  const flow = createPaidReservationOrchestrator({ enabled: true, operations, loadContext: async () => ({ order, paymentId: 'PAY2', quote: { ...order, pix: { totalCents: 52300 } }, reservationInput: { sourcePropertyId: order.propertyId, fields: { idImovel: '663', entrada: order.from, saida: order.to, totalDinheiro: '523.00' } } }), cielo: { findPayment: async () => ({ MerchantOrderId: order.id, Payment: { PaymentId: 'PAY2', Status: 12, Amount: 52300, Currency: 'BRL', Type: 'Pix' } }) }, reservations: { create: async () => { calls++; } } });
  try { await assert.rejects(flow.reconcile(order.id)); assert.equal(calls, 0); assert.equal(operations.get(order.id).state, 'payment_pending'); } finally { operations.close(); }
});

test('divergência na unidade ou no preço impede a pré-reserva mesmo após pagamento', async () => {
  const operations = openCheckoutOperationStore(':memory:');
  const order = { id: 'ORDER3', merchantOrderId: 'ORDER3', simulation: true, propertyId: 'imobsys-crcn-2-663', from: '2027-05-17', to: '2027-05-19', guests: 2, amountCents: 52300, method: 'pix' };
  operations.claim(order.id, {}); operations.advance(order.id, 'payment_pending', { order, paymentId: 'PAY3' });
  let calls = 0;
  const context = { order, paymentId: 'PAY3', quote: { ...order, pix: { totalCents: 52300 } }, reservationInput: { sourcePropertyId: order.propertyId, fields: { idImovel: '664', entrada: order.from, saida: order.to, totalDinheiro: '523.00' } } };
  const flow = createPaidReservationOrchestrator({ enabled: true, operations, loadContext: async () => context, cielo: { findPayment: async () => ({ MerchantOrderId: order.id, Payment: { PaymentId: 'PAY3', Status: 2, Amount: 52300, Currency: 'BRL', Type: 'Pix' } }) }, reservations: { create: async () => { calls++; } } });
  try {
    await assert.rejects(flow.reconcile(order.id));
    context.reservationInput.fields.idImovel = '663';
    context.reservationInput.fields.totalDinheiro = '522.00';
    await assert.rejects(flow.reconcile(order.id));
    assert.equal(calls, 0);
    assert.equal(operations.get(order.id).state, 'payment_pending');
  } finally { operations.close(); }
});

test('falha após pagamento fica visível para a equipe e não repete a criação', async () => {
  const operations = openCheckoutOperationStore(':memory:');
  const order = { id: 'ORDER4', merchantOrderId: 'ORDER4', simulation: true, propertyId: 'imobsys-crcn-2-663', from: '2027-05-17', to: '2027-05-19', guests: 2, amountCents: 52300, method: 'pix' };
  operations.claim(order.id, {}); operations.advance(order.id, 'payment_pending', { order, paymentId: 'PAY4' });
  let calls = 0;
  const flow = createPaidReservationOrchestrator({ enabled: true, operations, loadContext: async () => ({ order, paymentId: 'PAY4', quote: { ...order, pix: { totalCents: 52300 } }, reservationInput: { sourcePropertyId: order.propertyId, fields: { idImovel: '663', entrada: order.from, saida: order.to, totalDinheiro: '523.00' } } }), cielo: { findPayment: async () => ({ MerchantOrderId: order.id, Payment: { PaymentId: 'PAY4', Status: 2, Amount: 52300, Currency: 'BRL', Type: 'Pix' } }) }, reservations: { create: async () => { calls++; throw new Error('timeout'); } } });
  try {
    await assert.rejects(flow.reconcile(order.id));
    await assert.rejects(flow.reconcile(order.id));
    assert.equal(calls, 1);
    assert.equal(operations.get(order.id).state, 'attention_required');
    assert.deepEqual(operations.listAttention().map(item => [item.id, item.property_id, item.reason]), [['ORDER4', order.propertyId, 'paid_reservation_requires_review']]);
  } finally { operations.close(); }
});

for (const [gatewayStatus, expected] of [[3, 'payment_rejected'], [10, 'payment_cancelled'], [13, 'payment_cancelled']]) test(`estado Cielo ${gatewayStatus} encerra consulta sem pré-reserva`, async () => {
  const operations = openCheckoutOperationStore(':memory:');
  const order = { id: 'ORDER5', merchantOrderId: 'ORDER5', simulation: true, propertyId: 'imobsys-crcn-2-663', from: '2027-05-17', to: '2027-05-19', guests: 2, amountCents: 52300, method: 'pix' };
  operations.claim(order.id, {}); operations.advance(order.id, 'payment_pending', { order, paymentId: 'PAY5' });
  let reservations = 0;
  const flow = createPaidReservationOrchestrator({ enabled: true, operations, loadContext: async () => ({ order, paymentId: 'PAY5', quote: { ...order, pix: { totalCents: 52300 } }, reservationInput: { sourcePropertyId: order.propertyId, fields: { idImovel: '663', entrada: order.from, saida: order.to, totalDinheiro: '523.00' } } }), cielo: { findPayment: async () => ({ MerchantOrderId: order.id, Payment: { PaymentId: 'PAY5', Status: gatewayStatus, Amount: 52300, Currency: 'BRL', Type: 'Pix' } }) }, reservations: { create: async () => { reservations++; } } });
  try { assert.equal((await flow.reconcile(order.id)).status, expected); assert.equal((await flow.reconcile(order.id)).status, expected); assert.equal(operations.get(order.id).state, expected); assert.equal(reservations, 0); assert.deepEqual(operations.listPaymentPending(), []); } finally { operations.close(); }
});
