import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { openCheckoutOperationStore } from '../src/checkout-operation-store.mjs';
import { openCheckoutContextStore } from '../src/checkout-context-store.mjs';
import { openSandboxOrderStore } from '../src/sandbox-order-store.mjs';
import { createPaidCheckoutStart } from '../src/paid-checkout-start.mjs';
import { createPaidReservationOrchestrator } from '../src/paid-reservation-orchestrator.mjs';

for (const method of ['pix', 'card']) test(`${method}: jornada persistente do pagamento até a fila`, async () => {
  const operations = openCheckoutOperationStore(':memory:');
  const contextStore = openCheckoutContextStore(':memory:', randomBytes(32));
  const sellerStore = openSandboxOrderStore(':memory:');
  const input = { id: 'ORDER1', propertyId: 'imobsys-crcn-2-663', from: '2027-05-17', to: '2027-05-19', guests: 2, acceptedBaseCents: 52300, method, installments: 6, paymentToken: 'TOKEN', customer: { name: 'Teste', cpf: '12345678901', phone: '64999999999' } };
  let amount, reservationCalls = 0;
  const cielo = { createPix: charge, createCard: charge, findPayment: async () => ({ MerchantOrderId: input.id, Payment: { PaymentId: 'PAY1', Status: 2, Amount: amount, Currency: 'BRL', Type: method === 'pix' ? 'Pix' : 'CreditCard', Installments: 6 } }) };
  async function charge(request) { amount = request.amountCents; return { Payment: { PaymentId: 'PAY1', Status: 12, QrCodeString: 'PIX-TESTE' } }; }
  const start = createPaidCheckoutStart({ enabled: true, operations, contextStore, cielo, quoteProvider: async candidate => { candidate.reservationInput.sourcePropertyId = input.propertyId; candidate.reservationInput.fields = { idImovel: '663', entrada: input.from, saida: input.to, totalDinheiro: '523.00' }; return { provider: 'imobsys-crcn', propertyId: input.propertyId, from: input.from, to: input.to, guests: 2, pix: { totalCents: 52300 } }; } });
  const finish = createPaidReservationOrchestrator({ enabled: true, operations, cielo, sellerStore, loadContext: async id => ({ ...contextStore.load(id), ...operations.get(id).payload }), reservations: { create: async () => { reservationCalls++; return { reference: '1600' }; } }, verifyReservation: async () => true });
  try {
    const started = await start.start(input);
    assert.equal(started.status, 'payment_pending');
    assert.equal(reservationCalls, 0);
    assert.equal((await finish.reconcile(input.id)).status, 'awaiting_seller_confirmation');
    assert.equal((await finish.reconcile(input.id)).status, 'awaiting_seller_confirmation');
    assert.equal(reservationCalls, 1);
    assert.equal(sellerStore.listPending()[0].reservation_reference, '1600');
    assert.equal(sellerStore.listPending()[0].amount_cents, amount);
    assert.equal(sellerStore.listPending()[0].supplier_amount_cents, 52300);
  } finally { operations.close(); contextStore.close(); sellerStore.close(); }
});
