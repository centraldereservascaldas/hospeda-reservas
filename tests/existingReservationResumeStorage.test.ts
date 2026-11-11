import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { clearCheckoutResumeToken, saveCheckoutResumeToken } from '../src/utils/checkoutResumeStorage.ts';
import { getExistingReservationResumeReference, getExistingReservationResumeReferences, saveExistingReservationResumeReference } from '../src/utils/existingReservationResumeStorage.ts';

test('reservation reference requires the matching live token in the same browser session', () => {
  const dom = new JSDOM('', { url: 'https://example.test' });
  const previousWindow = globalThis.window;
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  const reference = 'R'.repeat(40);
  const token = 'T'.repeat(64);
  const key = 'crcn.existing-reservation.resume.ZX91K';
  try {
    saveExistingReservationResumeReference('ZX91K', reference);
    assert.equal(getExistingReservationResumeReference('ZX91K'), null);
    saveCheckoutResumeToken(reference, token, new Date(Date.now() + 60_000).toISOString());
    saveExistingReservationResumeReference('ZX91K', reference);
    assert.deepEqual(JSON.parse(dom.window.sessionStorage.getItem(key)!), [reference]);
    assert.equal(dom.window.sessionStorage.getItem(key)?.includes(token), false);
    assert.equal(getExistingReservationResumeReference('ZX91K'), reference);
    assert.equal(getExistingReservationResumeReference('OTHER'), null);
    clearCheckoutResumeToken(reference);
    assert.equal(getExistingReservationResumeReference('ZX91K'), null);
    assert.deepEqual(JSON.parse(dom.window.sessionStorage.getItem(key)!), [reference]);
    dom.window.sessionStorage.setItem(key, 'not-a-reference');
    assert.equal(getExistingReservationResumeReference('ZX91K'), null);
  } finally {
    clearCheckoutResumeToken(reference);
    globalThis.window = previousWindow;
    dom.window.close();
  }
});

test('a blocked session storage still allows recovery in memory during the current page session', () => {
  const dom = new JSDOM('', { url: 'https://example.test' });
  const previousWindow = globalThis.window;
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  const reference = 'S'.repeat(40);
  const token = 'U'.repeat(64);
  Object.defineProperty(dom.window, 'sessionStorage', { configurable: true, get: () => { throw new Error('storage blocked'); } });
  try {
    saveCheckoutResumeToken(reference, token, new Date(Date.now() + 60_000).toISOString());
    saveExistingReservationResumeReference('ZX91K', reference);
    assert.equal(getExistingReservationResumeReference('ZX91K'), reference);
    clearCheckoutResumeToken(reference);
    assert.equal(getExistingReservationResumeReference('ZX91K'), null);
  } finally {
    clearCheckoutResumeToken(reference);
    globalThis.window = previousWindow;
    dom.window.close();
  }
});


test('legacy single reference migrates to history without exposing or losing either token', () => {
  const dom = new JSDOM('', { url: 'https://example.test' });
  const previousWindow = globalThis.window;
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  const oldReference = 'A'.repeat(40), newReference = 'B'.repeat(40);
  const oldToken = 'C'.repeat(64), newToken = 'D'.repeat(64);
  const key = 'crcn.existing-reservation.resume.ZY92K';
  try {
    saveCheckoutResumeToken(oldReference, oldToken, new Date(Date.now() + 60_000).toISOString());
    saveCheckoutResumeToken(newReference, newToken, new Date(Date.now() + 60_000).toISOString());
    dom.window.sessionStorage.setItem(key, oldReference);
    assert.deepEqual(getExistingReservationResumeReferences('ZY92K'), [oldReference]);
    saveExistingReservationResumeReference('ZY92K', newReference);
    const stored = dom.window.sessionStorage.getItem(key)!;
    assert.deepEqual(JSON.parse(stored), [oldReference, newReference]);
    assert.equal(stored.includes(oldToken) || stored.includes(newToken), false);
    assert.deepEqual(getExistingReservationResumeReferences('ZY92K'), [oldReference, newReference]);
    assert.ok(dom.window.sessionStorage.getItem(`crcn.checkout.resume.${oldReference}`)?.includes(oldToken));
    assert.ok(dom.window.sessionStorage.getItem(`crcn.checkout.resume.${newReference}`)?.includes(newToken));
    clearCheckoutResumeToken(oldReference);
    assert.deepEqual(getExistingReservationResumeReferences('ZY92K'), [newReference]);
  } finally {
    clearCheckoutResumeToken(oldReference);
    clearCheckoutResumeToken(newReference);
    globalThis.window = previousWindow;
    dom.window.close();
  }
});
