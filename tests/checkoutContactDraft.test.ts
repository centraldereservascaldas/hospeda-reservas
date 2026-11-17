import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { CHECKOUT_DRAFT_HISTORY_KEY, clearCheckoutContact, readCheckoutContact, saveCheckoutContact } from '../src/utils/checkoutDraft.ts';

const dom = new JSDOM('', { url: 'http://localhost/checkout/nova' });
Object.assign(globalThis, { window: dom.window });
const id = '12345678-1234-1234-1234-123456789abc';

test('restores only the three contact fields for this checkout and clears them after order creation', () => {
  window.history.replaceState({ [CHECKOUT_DRAFT_HISTORY_KEY]: id }, '', '/checkout/nova');
  const contact = { fullName: 'Ana Teste', email: 'ana@example.com', phone: '11999999999', cpf: '11111111111', card: '4111111111111111', accepted: true };
  saveCheckoutContact(contact);
  assert.deepEqual(readCheckoutContact(), { fullName: contact.fullName, email: contact.email, phone: contact.phone });
  const saved = window.sessionStorage.getItem(`crcn.checkout.draft.v1.${id}.contact`)!;
  assert.equal(saved.includes(contact.cpf), false);
  assert.equal(saved.includes(contact.card), false);
  assert.equal(saved.includes('accepted'), false);
  clearCheckoutContact();
  assert.equal(readCheckoutContact(), null);
});

test('contact drafts are isolated by history entry and unavailable after the order route', () => {
  window.history.replaceState({ [CHECKOUT_DRAFT_HISTORY_KEY]: id }, '', '/checkout/nova');
  saveCheckoutContact({ fullName: 'Ana', email: '', phone: '' });
  window.history.replaceState({ [CHECKOUT_DRAFT_HISTORY_KEY]: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }, '', '/checkout/nova');
  assert.equal(readCheckoutContact(), null);
  window.history.replaceState({ [CHECKOUT_DRAFT_HISTORY_KEY]: id }, '', '/checkout/1234567890123456789012345678901234567890');
  assert.equal(readCheckoutContact(), null);
  window.history.replaceState({ [CHECKOUT_DRAFT_HISTORY_KEY]: id }, '', '/checkout/nova');
  clearCheckoutContact();
});
