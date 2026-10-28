import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'http://localhost',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
});

const { loadMercadoPagoSdk } = await import('../src/services/mercadoPagoSdk.ts');

test('rejects and removes a stuck Mercado Pago SDK script after the load timeout', async () => {
  const script = document.createElement('script');
  script.dataset.mercadopagoSdk = 'true';
  document.head.append(script);

  const originalSetTimeout = window.setTimeout;
  const originalClearTimeout = window.clearTimeout;
  window.setTimeout = ((callback: () => void) => {
    callback();
    return 1;
  }) as typeof window.setTimeout;
  window.clearTimeout = (() => undefined) as typeof window.clearTimeout;

  try {
    await assert.rejects(loadMercadoPagoSdk(), /Tempo limite ao carregar MercadoPago\.js/);
    assert.equal(document.querySelector('script[data-mercadopago-sdk="true"]'), null);
  } finally {
    window.setTimeout = originalSetTimeout;
    window.clearTimeout = originalClearTimeout;
  }
});
