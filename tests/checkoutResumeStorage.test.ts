import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import {
  clearCheckoutResumeToken,
  getCheckoutResumeToken,
  saveCheckoutResumeToken,
} from '../src/utils/checkoutResumeStorage.ts';

test('reads a legacy token without deleting it, while rejecting invalid and expired entries', () => {
  const dom = new JSDOM('', { url: 'https://example.test' });
  const previousWindow = globalThis.window;
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  const reference = 'R'.repeat(40);
  const key = `crcn.checkout.resume.${reference}`;
  const legacyToken = 'T'.repeat(64);

  try {
    dom.window.sessionStorage.setItem(key, legacyToken);
    assert.equal(getCheckoutResumeToken(reference), legacyToken);
    assert.equal(dom.window.sessionStorage.getItem(key), legacyToken);

    dom.window.sessionStorage.setItem(key, 'invalid');
    assert.equal(getCheckoutResumeToken(reference), null);
    assert.equal(dom.window.sessionStorage.getItem(key), null);

    saveCheckoutResumeToken(reference, 'N'.repeat(64), new Date(Date.now() + 60_000).toISOString());
    assert.equal(getCheckoutResumeToken(reference), 'N'.repeat(64));
    clearCheckoutResumeToken(reference);
    dom.window.sessionStorage.setItem(
      key,
      JSON.stringify({ token: 'E'.repeat(64), expiresAt: new Date(0).toISOString() }),
    );
    assert.equal(getCheckoutResumeToken(reference), null);
    assert.equal(dom.window.sessionStorage.getItem(key), null);
  } finally {
    clearCheckoutResumeToken(reference);
    globalThis.window = previousWindow;
    dom.window.close();
  }
});
