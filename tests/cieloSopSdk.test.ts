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
const { loadCieloSopSdk } = await import('../src/services/cieloSopSdk.ts');

test('SOP script timeout rejects and removes its script so another load can retry', async () => {
  const originalSetTimeout = window.setTimeout;
  const timeout = { callback: null as (() => void) | null };
  window.setTimeout = ((callback: () => void, delay?: number) => {
    assert.equal(delay, 15_000);
    timeout.callback = callback;
    return 99;
  }) as typeof window.setTimeout;

  try {
    const pending = loadCieloSopSdk();
    const script = document.querySelector<HTMLScriptElement>('script[data-cielo-sop="true"]');
    assert.ok(script);
    assert.equal(
      script.src,
      'https://transactionsandbox.pagador.com.br/post/Scripts/silentorderpost-1.0.min.js',
    );
    assert.equal(script.hasAttribute('crossorigin'), false);
    timeout.callback?.();

    await assert.rejects(pending, {
      message: 'Tempo limite ao carregar Silent Order Post.',
    });
    assert.equal(document.querySelector('script[data-cielo-sop="true"]'), null);
  } finally {
    window.setTimeout = originalSetTimeout;
  }
});

test('production SOP loads the production script and waits for the supported API', async () => {
  const pending = loadCieloSopSdk('production');
  const script = document.querySelector<HTMLScriptElement>('script[data-cielo-sop="true"]');
  assert.ok(script);
  assert.equal(script.src, 'https://www.pagador.com.br/post/Scripts/silentorderpost-1.0.min.js');
  window.bpSop_silentOrderPost = () => {};
  try {
    script.dispatchEvent(new dom.window.Event('load'));
    await pending;
  } finally {
    delete window.bpSop_silentOrderPost;
    script.remove();
  }
});
