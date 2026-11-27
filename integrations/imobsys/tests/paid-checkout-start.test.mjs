import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { openCheckoutOperationStore } from '../src/checkout-operation-store.mjs';
import { openCheckoutContextStore } from '../src/checkout-context-store.mjs';
import { createPaidCheckoutStart } from '../src/paid-checkout-start.mjs';

for (const method of ['pix', 'card']) test(`${method}: persiste o contexto antes de iniciar o pagamento`, async () => {
  const operations = openCheckoutOperationStore(':memory:');
  const contextStore = openCheckoutContextStore(':memory:', randomBytes(32));
  const input = { id: 'ORDER1', propertyId: 'imobsys-crcn-2-663', from: '2027-05-17', to: '2027-05-19', guests: 2, acceptedBaseCents: 52300, method, installments: 6, paymentToken: 'TESTTOKEN', customer: { name: 'Teste', cpf: '12345678901', phone: '64999999999' } };
  let calls = 0;
  const flow = createPaidCheckoutStart({ enabled: true, operations, contextStore, quoteProvider: async candidate => { assert.equal('paymentToken' in candidate, false); candidate.reservationInput.fields = { idImovel: '663' }; return { ...input, provider: 'imobsys-crcn', pix: { totalCents: 52300 } }; }, cielo: { createPix: charge, createCard: charge } });
  async function charge() { calls++; assert.equal(contextStore.load(input.id).reservationInput.customer.name, 'Teste'); return { Payment: { PaymentId: 'PAY1', QrCodeString: 'TEST' } }; }
  try {
    assert.equal((await flow.start(input)).status, 'payment_pending');
    assert.equal(operations.get(input.id).payload.paymentId, 'PAY1');
    await assert.rejects(flow.start(input));
    assert.equal(calls, 1);
    assert.equal(JSON.stringify(contextStore.load(input.id)).includes('TESTTOKEN'), false);
  } finally { operations.close(); contextStore.close(); }
});
