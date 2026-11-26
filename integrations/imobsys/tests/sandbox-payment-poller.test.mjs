import test from 'node:test';
import assert from 'node:assert/strict';
import { createSandboxPaymentPoller } from '../src/sandbox-payment-poller.mjs';

test('consulta pedidos sequencialmente e impede ciclos sobrepostos', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const seen = [];
  const poll = createSandboxPaymentPoller({ operations: { listPaymentPending: () => ['A', 'B'] }, reconcile: async id => { seen.push(id); if (id === 'A') { await gate; throw Error('pending'); } } });
  const first = poll();
  await poll();
  assert.deepEqual(seen, ['A']);
  release(); await first;
  assert.deepEqual(seen, ['A', 'B']);
});

test('prossegue para a próxima página mesmo quando os primeiros pedidos continuam pendentes', async () => {
  const ids = Array.from({ length: 55 }, (_, i) => `P${String(i).padStart(3, '0')}`);
  const seen = [];
  const poll = createSandboxPaymentPoller({ operations: { listPaymentPending: (limit, after) => ids.filter(id => id > after).slice(0, limit) }, reconcile: async id => { seen.push(id); throw Error('pending'); } });
  await poll(); await poll();
  assert.deepEqual(seen, ids);
  await poll();
  assert.equal(seen[55], 'P000');
});
