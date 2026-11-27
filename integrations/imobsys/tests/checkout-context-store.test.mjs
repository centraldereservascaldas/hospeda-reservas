import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openCheckoutContextStore } from '../src/checkout-context-store.mjs';

test('persiste contexto cifrado, impede substituição e rejeita chave diferente', () => {
  const dir = mkdtempSync(join(tmpdir(), 'checkout-context-'));
  const path = join(dir, 'context.sqlite');
  const key = randomBytes(32);
  const context = { customer: { name: 'Titular de teste', cpf: '12345678901' } };
  try {
    let store = openCheckoutContextStore(path, key);
    store.save('ORDER1', context);
    assert.throws(() => store.save('ORDER1', context));
    store.close();
    assert.equal(readFileSync(path).includes(Buffer.from('12345678901')), false);
    store = openCheckoutContextStore(path, key);
    assert.deepEqual(store.load('ORDER1'), context);
    store.close();
    store = openCheckoutContextStore(path, randomBytes(32));
    assert.throws(() => store.load('ORDER1'));
    store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
