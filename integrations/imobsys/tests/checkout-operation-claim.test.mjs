import test from 'node:test';
import assert from 'node:assert/strict';
import { openCheckoutOperationStore } from '../src/checkout-operation-store.mjs';

test('uma operação paga só pode ser reivindicada uma vez para criação da pré-reserva', () => {
  const store = openCheckoutOperationStore(':memory:');
  try {
    store.claim('ORDER1', { amountCents: 52300 });
    store.advance('ORDER1', 'payment_verified', {});
    assert.equal(store.claimTransition('ORDER1', 'payment_verified', 'reservation_starting'), true);
    assert.equal(store.claimTransition('ORDER1', 'payment_verified', 'reservation_starting'), false);
    assert.equal(store.get('ORDER1').state, 'reservation_starting');
  } finally {
    store.close();
  }
});

test('interrupção ao iniciar pagamento aparece para conferência sem expor o contexto', () => {
  const store = openCheckoutOperationStore(':memory:');
  try {
    store.claim('ORDER2', { order: { propertyId: 'imobsys-crcn-2-663', from: '2027-05-17', to: '2027-05-19', amountCents: 52300, method: 'pix' }, customer: { cpf: '12345678901' } });
    const attention = store.listAttention();
    assert.equal(attention[0].id, 'ORDER2');
    assert.equal(attention[0].state, 'payment_starting');
    assert.equal(JSON.stringify(attention).includes('12345678901'), false);
  } finally { store.close(); }
});

test('pedidos pendentes continuam consultáveis sem inferir que estão pagos', () => {
  const store = openCheckoutOperationStore(':memory:');
  try {
    store.claim('P002', {}); store.advance('P002', 'payment_pending', {});
    store.claim('P001', {}); store.advance('P001', 'payment_pending', {});
    assert.deepEqual(store.listPaymentPending(1), ['P001']);
    assert.deepEqual(store.listPaymentPending(1, 'P001'), ['P002']);
    assert.equal(store.get('P002').state, 'payment_pending');
  } finally { store.close(); }
});
