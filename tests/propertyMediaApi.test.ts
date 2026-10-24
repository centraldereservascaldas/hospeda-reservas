import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { STAYS_NET_APARTMENTS } from '../src/data/staysApartments.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle,
});

const { crcnBackendApi } = await import('../src/services/crcnBackendApi.ts');
const { staysApi } = await import('../src/services/staysApi.ts');

test('sanitizes media from the Laravel catalog, detail, and search responses', async () => {
  const originalFetch = globalThis.fetch;
  const unsafeListing = {
    ...STAYS_NET_APARTMENTS[0]!,
    images: ['https://cdn.stays.net/cover.jpg', 'javascript:alert(1)'],
    complexImages: ['data:image/svg+xml,<svg/>'],
    host: { ...STAYS_NET_APARTMENTS[0]!.host, avatar: '//cdn.stays.net/avatar.jpg' },
  };
  globalThis.fetch = async (input) => {
    const path = String(input);
    const payload = path.includes('/search')
      ? { success: true, total: 1, data: [unsafeListing] }
      : path.includes(unsafeListing.id)
        ? { success: true, data: unsafeListing }
        : { success: true, source: 'stays-live', total: 1, data: [unsafeListing] };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const catalog = await crcnBackendApi.getAccommodations();
    const detail = await crcnBackendApi.getAccommodationById(unsafeListing.id);
    const search = await crcnBackendApi.searchAccommodations({ destination: 'Caldas' });

    for (const property of [catalog[0], detail, search.data[0]]) {
      assert.ok(property);
      assert.deepEqual(property.images, ['https://cdn.stays.net/cover.jpg']);
      assert.deepEqual(property.complexImages, []);
      assert.equal(property.host.avatar, '');
    }
    assert.deepEqual(JSON.parse(localStorage.getItem('hospeda_properties') || '[]')[0].images, [
      'https://cdn.stays.net/cover.jpg',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  }
});

test('accepts simulated catalog and dated search responses without treating them as live', async () => {
  const originalFetch = globalThis.fetch;
  const simulatedListing = {
    ...STAYS_NET_APARTMENTS[0]!,
    simulatedData: true,
    dataSource: 'stays-simulated' as const,
  };
  globalThis.fetch = async (input) => {
    const path = String(input);
    const payload = path.includes('/search')
      ? {
          success: true,
          source: 'stays-simulated',
          total: 1,
          from: '2026-11-02',
          to: '2026-11-04',
          guests: 2,
          data: [simulatedListing],
        }
      : { success: true, source: 'stays-simulated', total: 1, data: [simulatedListing] };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const catalog = await crcnBackendApi.getAccommodations();
    const search = await crcnBackendApi.searchAccommodations({
      from: '2026-11-02',
      to: '2026-11-04',
      guests: 2,
    });

    assert.equal(catalog[0]?.simulatedData, true);
    assert.equal(localStorage.getItem('hospeda_properties_source'), 'stays-simulated');
    assert.equal(search.data[0]?.dataSource, 'stays-simulated');
  } finally {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  }
});

test('sanitizes media before Stays listings are persisted or returned', async () => {
  const originalFetch = globalThis.fetch;
  const unsafeListing = {
    ...STAYS_NET_APARTMENTS[0]!,
    images: ['https://cdn.stays.net/cover.jpg', 'javascript:alert(1)'],
    host: { ...STAYS_NET_APARTMENTS[0]!.host, avatar: 'data:image/png;base64,abc' },
  };
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ success: true, source: 'stays-live', data: [unsafeListing] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    const result = await staysApi.fetchListings();
    assert.equal(result.success, true);
    assert.deepEqual(result.listings[0]?.images, ['https://cdn.stays.net/cover.jpg']);
    assert.equal(result.listings[0]?.host.avatar, '');
    assert.deepEqual(JSON.parse(localStorage.getItem('hospeda_properties') || '[]')[0].images, [
      'https://cdn.stays.net/cover.jpg',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  }
});
