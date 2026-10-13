import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDefaultSearchFilters,
  mergeSearchFiltersIntoUrl,
  parseSearchFilters,
  serializeSearchFilters,
} from '../src/utils/searchUrlState.ts';

test('restores dates, guest composition, destination, and repeated filters from a shared URL', () => {
  const filters = parseSearchFilters(
    '?from=2026-11-05&to=2026-11-08&guests=3&adults=2&children=1&infants=1&pets=1' +
      '&destination=Rio%20Quente&propertyId=property-42&category=pools_24h' +
      '&minPrice=150&maxPrice=900&type=cabin&type=villa&amenity=Piscina&amenity=Wi-Fi' +
      '&minBedrooms=2&minBaths=1&superhost=true&instantBook=1',
  );

  assert.equal(filters.checkIn, '2026-11-05');
  assert.equal(filters.checkOut, '2026-11-08');
  assert.deepEqual(filters.guests, { adults: 2, children: 1, infants: 1, pets: 1 });
  assert.equal(filters.destination, 'Rio Quente');
  assert.equal(filters.destinationPropertyId, 'property-42');
  assert.equal(filters.category, 'pools_24h');
  assert.equal(filters.minPrice, 150);
  assert.equal(filters.maxPrice, 900);
  assert.deepEqual(filters.propertyTypes, ['cabin', 'villa']);
  assert.deepEqual(filters.amenities, ['Piscina', 'Wi-Fi']);
  assert.equal(filters.minBedrooms, 2);
  assert.equal(filters.minBaths, 1);
  assert.equal(filters.superhostOnly, true);
  assert.equal(filters.instantBookOnly, true);
});

test('accepts Stays date aliases and a total guest count without composition', () => {
  const filters = parseSearchFilters('?checkIn=2026-12-01&checkOut=2026-12-04&guests=4');

  assert.equal(filters.checkIn, '2026-12-01');
  assert.equal(filters.checkOut, '2026-12-04');
  assert.deepEqual(filters.guests, { adults: 4, children: 0, infants: 0, pets: 0 });
});

test('serializes non-default search state and round-trips it', () => {
  const filters = {
    ...createDefaultSearchFilters(),
    checkIn: '2026-11-05',
    checkOut: '2026-11-08',
    guests: { adults: 2, children: 1, infants: 0, pets: 1 },
    destination: 'Rio Quente',
    category: 'pools_24h',
    propertyTypes: ['villa'],
    amenities: ['Piscina'],
    superhostOnly: true,
  };
  const serialized = serializeSearchFilters(filters);
  const restored = parseSearchFilters(`?${serialized}`);

  assert.deepEqual(restored, filters);
  assert.equal(new URLSearchParams(serialized).get('guests'), '3');
});

test('replaces only search keys and preserves unrelated URL parameters', () => {
  const filters = { ...createDefaultSearchFilters(), destination: 'Caldas Novas' };
  const search = mergeSearchFiltersIntoUrl(
    '?utm_source=share&category=hot_tub&campaign=spring',
    filters,
  );
  const params = new URLSearchParams(search);

  assert.equal(params.get('utm_source'), 'share');
  assert.equal(params.get('campaign'), 'spring');
  assert.equal(params.get('destination'), 'Caldas Novas');
  assert.equal(params.has('category'), false);
});

test('ignores malformed dates and unsupported or out-of-range filter values', () => {
  const filters = parseSearchFilters(
    '?from=2026-02-30&to=2026-03-02&guests=99&category=unknown&minPrice=900&maxPrice=100' +
      '&type=unknown&amenity=' +
      'a'.repeat(81) +
      '&superhost=yes',
  );

  assert.equal(filters.checkIn, '');
  assert.equal(filters.checkOut, '');
  assert.deepEqual(filters.guests, { adults: 17, children: 0, infants: 0, pets: 0 });
  assert.equal(filters.category, 'all');
  assert.equal(filters.minPrice, 0);
  assert.equal(filters.maxPrice, 5000);
  assert.deepEqual(filters.propertyTypes, []);
  assert.deepEqual(filters.amenities, []);
  assert.equal(filters.superhostOnly, false);
});

test('syncs filter updates to the URL without dropping path, hash, or unrelated parameters', async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/apartamento/JQ08G?utm_source=share#booking',
  });
  const original = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Element: globalThis.Element,
    Node: globalThis.Node,
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
  });

  try {
    const React = (await import('react')).default;
    const { render, act } = await import('@testing-library/react');
    const { useSearchUrlSync } = await import('../src/hooks/useSearchUrlSync.ts');
    const initial = createDefaultSearchFilters();
    const filters = {
      ...initial,
      checkIn: '2026-11-05',
      checkOut: '2026-11-08',
      guests: { adults: 2, children: 1, infants: 0, pets: 0 },
    };
    const Harness = ({ value }: { value: typeof initial }) => {
      useSearchUrlSync(value);
      return null;
    };
    const view = render(React.createElement(Harness, { value: initial }), {
      container: document.getElementById('root')!,
    });
    await act(async () => view.rerender(React.createElement(Harness, { value: filters })));

    const url = new URL(window.location.href);
    assert.equal(url.pathname, '/apartamento/JQ08G');
    assert.equal(url.hash, '#booking');
    assert.equal(url.searchParams.get('utm_source'), 'share');
    assert.equal(url.searchParams.get('from'), '2026-11-05');
    assert.equal(url.searchParams.get('to'), '2026-11-08');
    assert.equal(url.searchParams.get('guests'), '3');
    view.unmount();
  } finally {
    Object.assign(globalThis, original);
    dom.window.close();
  }
});
