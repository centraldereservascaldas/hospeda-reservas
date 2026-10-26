import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM(
  '<!doctype html><html><head><title>SSR aprovado</title><meta name="description" content="SSR description"><link rel="canonical" href="https://example.test/apartamento/JQ08G"></head><body></body></html>',
  { url: 'https://example.test/' },
);
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle,
});

const { act, cleanup, renderHook } = await import('@testing-library/react');
const { PAGE_METADATA_NAVIGATION_EVENT, usePageMetadata } =
  await import('../src/hooks/usePageMetadata.ts');

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  document.head.innerHTML = '<title>SSR aprovado</title>';
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
}

test('preserves approved SSR metadata until the matching API response arrives', async () => {
  const originalFetch = globalThis.fetch;
  let resolveMetadata!: (response: Response) => void;
  globalThis.fetch = () => new Promise((resolve) => (resolveMetadata = resolve));
  window.history.replaceState(null, '', '/apartamento/JQ08G');
  document.title = 'Metadata editorial SSR';
  document.head.innerHTML =
    '<title>Metadata editorial SSR</title><meta name="description" content="Descrição SSR"><link rel="canonical" href="https://example.test/apartamento/JQ08G">';

  try {
    renderHook(() => usePageMetadata(window.location.pathname));
    assert.equal(document.title, 'Metadata editorial SSR');
    assert.equal(document.querySelector('meta[name="robots"]'), null);

    await act(async () => {
      resolveMetadata(
        jsonResponse({
          approved: true,
          title: 'Metadata editorial API',
          description: 'Descrição editorial API.',
          canonicalUrl: 'https://example.test/apartamento/JQ08G',
          imageUrl: null,
        }),
      );
    });

    assert.equal(document.title, 'Metadata editorial API');
    assert.equal(
      document.querySelector('meta[name="description"]')?.getAttribute('content'),
      'Descrição editorial API.',
    );
    assert.equal(document.querySelector('meta[name="robots"]'), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('clears old property tags and ignores metadata responses after navigation', async () => {
  const originalFetch = globalThis.fetch;
  const pendingResponses = new Map<string, (response: Response) => void>();
  globalThis.fetch = (input) =>
    new Promise((resolve) => pendingResponses.set(String(input), resolve));

  try {
    const { unmount } = renderHook(() => usePageMetadata(window.location.pathname));
    act(() => {
      window.history.pushState(null, '', '/apartamento/JQ08G');
      window.dispatchEvent(new window.Event(PAGE_METADATA_NAVIGATION_EVENT));
    });
    const propertyRequest = '/api/public/property-metadata/JQ08G';

    act(() => {
      window.history.pushState(
        null,
        '',
        '/checkout/ABCDEFGHIJKLMNOPQRSTUVWXYZ12345678901234567890',
      );
      window.dispatchEvent(new window.Event(PAGE_METADATA_NAVIGATION_EVENT));
    });

    assert.equal(document.title, 'Acompanhe seu pedido | CRCN');
    assert.equal(
      document.querySelector('meta[name="robots"]')?.getAttribute('content'),
      'noindex, nofollow',
    );
    assert.equal(document.querySelector('link[rel="canonical"]'), null);

    await act(async () => {
      pendingResponses.get(propertyRequest)?.(
        jsonResponse({
          approved: true,
          title: 'Metadata antiga',
          description: 'Não deve voltar.',
          canonicalUrl: 'https://example.test/apartamento/JQ08G',
          imageUrl: null,
        }),
      );
    });

    assert.equal(document.title, 'Acompanhe seu pedido | CRCN');
    assert.equal(
      document.querySelector('meta[property="og:title"]')?.getAttribute('content'),
      'Acompanhe seu pedido | CRCN',
    );
    unmount();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps a property noindex when the API returns a canonical for another property', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    jsonResponse({
      approved: true,
      title: 'Metadata de outro imóvel',
      description: 'Não deve ser aplicada.',
      canonicalUrl: 'https://reservas.example.test/apartamento/LG03J',
      imageUrl: null,
    });
  window.history.replaceState(null, '', '/apartamento/JQ08G');
  document.head.innerHTML = '<title>Metadata genérica</title>';

  try {
    renderHook(() => usePageMetadata(window.location.pathname));
    assert.equal(
      document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content,
      'noindex, nofollow',
    );
    assert.equal(document.querySelector('link[rel="canonical"]'), null);
    await act(async () => Promise.resolve());
    assert.equal(
      document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content,
      'noindex, nofollow',
    );
    assert.equal(
      document.title,
      'Central de Reservas Caldas Novas - Hospedagens e Parques Termais',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
