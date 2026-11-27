import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const stylesheet = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('stacks checkout payment method content below 340px to keep the selection mark clear', () => {
  const narrowCheckoutStyles = stylesheet.match(
    /@media \(max-width: 339px\) \{([\s\S]*?)\n\}/,
  )?.[1];

  assert.ok(narrowCheckoutStyles, 'checkout payment styles should cover 320px layouts');
  assert.match(narrowCheckoutStyles, /\.checkout-payment-method\s*\{/);
  assert.match(narrowCheckoutStyles, /flex-direction:\s*column/);
  assert.match(narrowCheckoutStyles, /text-align:\s*center/);
  assert.match(stylesheet, /\.checkout-payment-method\[aria-pressed='true'\]::after/);
});
