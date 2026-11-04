import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import { STAYS_NET_APARTMENTS } from '../src/data/staysApartments.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle,
});

const { act, cleanup, renderHook, waitFor } = await import('@testing-library/react');
const { useAccommodationCatalog } = await import('../src/hooks/useAccommodationCatalog.ts');
const { crcnBackendApi } = await import('../src/services/crcnBackendApi.ts');

afterEach(() => {
  cleanup();
  localStorage.clear();
});

test('uses only synchronized cache, filters stale image URLs, and replaces it with live data', async () => {
  const originalGetAccommodations = crcnBackendApi.getAccommodations;
  const cachedProperty = {
    ...STAYS_NET_APARTMENTS[0]!,
    images: ['https://example.com/cover.jpg', 'javascript:invalid'],
  };
  const liveProperty = { ...cachedProperty, title: 'Acomodação atualizada' };
  localStorage.setItem(
    'hospeda_properties',
    JSON.stringify([
      cachedProperty,
      { ...cachedProperty, id: 'prop-demo' },
      { title: 'Registro sem id' },
      { ...cachedProperty, title: '' },
    ]),
  );
  localStorage.setItem('hospeda_properties_source', 'stays-live');
  localStorage.setItem(
    'hospeda_properties_meta',
    JSON.stringify({ version: 1, expiresAt: Date.now() + 60_000 }),
  );

  let resolveCatalog!: (items: (typeof liveProperty)[]) => void;
  crcnBackendApi.getAccommodations = () =>
    new Promise((resolve) => {
      resolveCatalog = resolve as typeof resolveCatalog;
    });

  try {
    const { result } = renderHook(() => useAccommodationCatalog());
    assert.equal(result.current.properties.length, 1);
    assert.equal(result.current.properties[0]?.id, cachedProperty.id);
    assert.deepEqual(result.current.properties[0]?.images, ['https://example.com/cover.jpg']);
    assert.equal(result.current.catalogLoading, true);

    await act(async () => resolveCatalog([liveProperty]));
    await waitFor(() => assert.equal(result.current.properties[0]?.title, 'Acomodação atualizada'));
    assert.equal(result.current.catalogLoading, false);
    assert.equal(result.current.catalogLoadError, false);
    assert.equal(localStorage.getItem('hospeda_properties_source'), 'stays-live');
    assert.equal(
      JSON.parse(localStorage.getItem('hospeda_properties') || '[]')[0].title,
      cachedProperty.title,
    );

    const addedProperty = { ...liveProperty, id: 'new-live-listing' };
    act(() => result.current.setProperties([addedProperty]));
    assert.equal(result.current.properties[0]?.id, 'new-live-listing');
    assert.equal(
      JSON.parse(localStorage.getItem('hospeda_properties') || '[]')[0].id,
      cachedProperty.id,
    );
  } finally {
    crcnBackendApi.getAccommodations = originalGetAccommodations;
  }
});

test('ignores stale catalog responses after unmount', async () => {
  const originalGetAccommodations = crcnBackendApi.getAccommodations;
  let resolveCatalog!: (items: typeof STAYS_NET_APARTMENTS) => void;
  crcnBackendApi.getAccommodations = () =>
    new Promise((resolve) => {
      resolveCatalog = resolve as typeof resolveCatalog;
    });

  try {
    const { unmount } = renderHook(() => useAccommodationCatalog());
    unmount();
    await act(async () => resolveCatalog(STAYS_NET_APARTMENTS));
    assert.equal(localStorage.getItem('hospeda_properties'), null);
  } finally {
    crcnBackendApi.getAccommodations = originalGetAccommodations;
  }
});

test('keeps a live empty catalog empty without loading bundled listings', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ success: true, source: 'stays-live', data: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  try {
    const { result } = renderHook(() => useAccommodationCatalog());
    await waitFor(() => assert.equal(result.current.catalogLoading, false));
    assert.deepEqual(result.current.properties, []);
    assert.equal(result.current.catalogLoadError, false);
    assert.equal(localStorage.getItem('hospeda_properties_source'), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('clears synchronized cache when the live API returns an empty catalog', async () => {
  const originalFetch = globalThis.fetch;
  localStorage.setItem('hospeda_properties', JSON.stringify([STAYS_NET_APARTMENTS[0]!]));
  localStorage.setItem('hospeda_properties_source', 'stays-live');
  localStorage.setItem(
    'hospeda_properties_meta',
    JSON.stringify({ version: 1, expiresAt: Date.now() + 60_000 }),
  );
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ success: true, source: 'stays-live', data: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  try {
    const { result } = renderHook(() => useAccommodationCatalog());
    assert.equal(result.current.properties.length, 1);
    await waitFor(() => assert.equal(result.current.catalogLoading, false));
    assert.deepEqual(result.current.properties, []);
    assert.equal(result.current.catalogLoadError, false);
    assert.equal(localStorage.getItem('hospeda_properties'), null);
    assert.equal(localStorage.getItem('hospeda_properties_source'), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('announces catalog failure when the live source rejects', async () => {
  const originalGetAccommodations = crcnBackendApi.getAccommodations;
  const originalWarn = console.warn;
  crcnBackendApi.getAccommodations = async () => {
    throw new Error('catalog unavailable');
  };
  console.warn = () => undefined;

  try {
    const { result } = renderHook(() => useAccommodationCatalog());
    await waitFor(() => assert.equal(result.current.catalogLoading, false));
    assert.equal(result.current.catalogLoadError, true);
    assert.deepEqual(result.current.properties, []);
  } finally {
    crcnBackendApi.getAccommodations = originalGetAccommodations;
    console.warn = originalWarn;
  }
});

test('retries a failed catalog request and replaces the error with live properties', async () => {
  const originalGetAccommodations = crcnBackendApi.getAccommodations;
  const originalWarn = console.warn;
  const liveProperty = { ...STAYS_NET_APARTMENTS[0]!, title: 'Acomodação recuperada' };
  let attempts = 0;
  crcnBackendApi.getAccommodations = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('catalog unavailable');
    return [liveProperty];
  };
  console.warn = () => undefined;

  try {
    const { result } = renderHook(() => useAccommodationCatalog());
    await waitFor(() => assert.equal(result.current.catalogLoadError, true));
    assert.equal(result.current.catalogLoading, false);

    act(() => result.current.retryCatalog());
    assert.equal(result.current.catalogLoading, true);

    await waitFor(() => assert.equal(result.current.catalogLoading, false));
    assert.equal(result.current.catalogLoadError, false);
    assert.equal(result.current.properties[0]?.title, 'Acomodação recuperada');
    assert.equal(attempts, 2);
  } finally {
    crcnBackendApi.getAccommodations = originalGetAccommodations;
    console.warn = originalWarn;
  }
});

test('does not let a late catalog response replace an active search result', async () => {
  const originalGetAccommodations = crcnBackendApi.getAccommodations;
  let resolveCatalog!: (items: typeof STAYS_NET_APARTMENTS) => void;
  crcnBackendApi.getAccommodations = () =>
    new Promise((resolve) => {
      resolveCatalog = resolve as typeof resolveCatalog;
    });

  try {
    const { result } = renderHook(() => useAccommodationCatalog());
    const searchResult = [{ ...STAYS_NET_APARTMENTS[0]!, id: 'search-result' }];
    act(() => result.current.setProperties(searchResult));
    await act(async () => resolveCatalog(STAYS_NET_APARTMENTS));
    assert.deepEqual(result.current.properties, searchResult);
    assert.equal(result.current.catalogLoading, false);
  } finally {
    crcnBackendApi.getAccommodations = originalGetAccommodations;
  }
});

test('shows a stale-data warning for cached listings after API failure, then clears it on search', async () => {
  const originalGetAccommodations = crcnBackendApi.getAccommodations;
  const originalWarn = console.warn;
  localStorage.setItem('hospeda_properties', JSON.stringify([STAYS_NET_APARTMENTS[0]!]));
  localStorage.setItem('hospeda_properties_source', 'stays-live');
  localStorage.setItem(
    'hospeda_properties_meta',
    JSON.stringify({ version: 1, expiresAt: Date.now() + 60_000 }),
  );
  crcnBackendApi.getAccommodations = async () => {
    throw new Error('catalog unavailable');
  };
  console.warn = () => undefined;

  try {
    const { result } = renderHook(() => useAccommodationCatalog());
    await waitFor(() => assert.equal(result.current.catalogLoading, false));
    assert.equal(result.current.catalogLoadError, true);
    assert.equal(result.current.properties.length, 1);

    act(() => result.current.setProperties([]));
    assert.equal(result.current.catalogLoadError, false);
    assert.deepEqual(result.current.properties, []);
  } finally {
    crcnBackendApi.getAccommodations = originalGetAccommodations;
    console.warn = originalWarn;
  }
});
