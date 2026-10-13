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
const { staysApi } = await import('../src/services/staysApi.ts');

afterEach(() => {
  cleanup();
  localStorage.clear();
});

test('uses only synchronized cache, filters stale image URLs, and replaces it with live data', async () => {
  const originalGetAccommodations = crcnBackendApi.getAccommodations;
  const originalFetchListings = staysApi.fetchListings;
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

  let resolveCatalog!: (items: (typeof liveProperty)[]) => void;
  crcnBackendApi.getAccommodations = () =>
    new Promise((resolve) => {
      resolveCatalog = resolve as typeof resolveCatalog;
    });
  staysApi.fetchListings = async () => ({
    success: false,
    listings: [],
    syncedAt: '',
    total: 0,
    source: 'empty',
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
      'Acomodação atualizada',
    );

    const addedProperty = { ...liveProperty, id: 'new-live-listing' };
    act(() => result.current.setProperties([addedProperty]));
    await waitFor(() => {
      assert.equal(
        JSON.parse(localStorage.getItem('hospeda_properties') || '[]')[0].id,
        'new-live-listing',
      );
    });
  } finally {
    crcnBackendApi.getAccommodations = originalGetAccommodations;
    staysApi.fetchListings = originalFetchListings;
  }
});

test('ignores stale catalog responses after unmount', async () => {
  const originalGetAccommodations = crcnBackendApi.getAccommodations;
  const originalFetchListings = staysApi.fetchListings;
  let resolveCatalog!: (items: typeof STAYS_NET_APARTMENTS) => void;
  crcnBackendApi.getAccommodations = () =>
    new Promise((resolve) => {
      resolveCatalog = resolve as typeof resolveCatalog;
    });
  staysApi.fetchListings = async () => ({
    success: false,
    listings: [],
    syncedAt: '',
    total: 0,
    source: 'empty',
  });

  try {
    const { unmount } = renderHook(() => useAccommodationCatalog());
    unmount();
    await act(async () => resolveCatalog(STAYS_NET_APARTMENTS));
    assert.deepEqual(JSON.parse(localStorage.getItem('hospeda_properties') || 'null'), []);
  } finally {
    crcnBackendApi.getAccommodations = originalGetAccommodations;
    staysApi.fetchListings = originalFetchListings;
  }
});

test('loads the bundled catalog when the backend catalog is empty', async () => {
  const originalGetAccommodations = crcnBackendApi.getAccommodations;
  const originalFetchListings = staysApi.fetchListings;
  crcnBackendApi.getAccommodations = async () => [];
  staysApi.fetchListings = async () => ({
    success: false,
    listings: [],
    syncedAt: '',
    total: 0,
    source: 'empty',
  });

  try {
    const { result } = renderHook(() => useAccommodationCatalog());
    await waitFor(() => assert.equal(result.current.catalogLoading, false));
    assert.ok(result.current.properties.length > 0);
    assert.equal(result.current.catalogLoadError, false);
  } finally {
    crcnBackendApi.getAccommodations = originalGetAccommodations;
    staysApi.fetchListings = originalFetchListings;
  }
});

test('announces catalog failure when both synchronized sources reject', async () => {
  const originalGetAccommodations = crcnBackendApi.getAccommodations;
  const originalFetchListings = staysApi.fetchListings;
  const originalWarn = console.warn;
  crcnBackendApi.getAccommodations = async () => {
    throw new Error('catalog unavailable');
  };
  staysApi.fetchListings = async () => {
    throw new Error('Stays sync unavailable');
  };
  console.warn = () => undefined;

  try {
    const { result } = renderHook(() => useAccommodationCatalog());
    await waitFor(() => assert.equal(result.current.catalogLoading, false));
    assert.equal(result.current.catalogLoadError, true);
    assert.deepEqual(result.current.properties, []);
  } finally {
    crcnBackendApi.getAccommodations = originalGetAccommodations;
    staysApi.fetchListings = originalFetchListings;
    console.warn = originalWarn;
  }
});
