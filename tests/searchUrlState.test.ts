import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCondominiumDirectoryUrl,
  createDefaultSearchFilters,
  getAccommodationIdFromPath,
  mergeSearchFiltersIntoUrl,
  parseSearchFilters,
  serializeSearchFilters,
} from '../src/utils/searchUrlState.ts';

test('opens the condominium SEO directory while preserving only campaign parameters', () => {
  assert.equal(
    buildCondominiumDirectoryUrl(
      '?utm_source=instagram&utm_campaign=summer&category=pools_24h&checkin=2026-11-20',
    ),
    '/condominios?utm_source=instagram&utm_campaign=summer',
  );
  assert.equal(buildCondominiumDirectoryUrl('?category=condominiums'), '/condominios');
});

test('restores dates, guest composition, destination, and repeated filters from a shared URL', () => {
  const filters = parseSearchFilters(
    '?checkin=2026-11-05&checkout=2026-11-08&adults=2&children=1&infants=1&pets=1' +
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

test('accepts Stays persons parameter and its localized apartment route', () => {
  const filters = parseSearchFilters('?from=2027-03-01&to=2027-03-05&persons=10');

  assert.equal(filters.checkIn, '2027-03-01');
  assert.equal(filters.checkOut, '2027-03-05');
  assert.deepEqual(filters.guests, { adults: 10, children: 0, infants: 0, pets: 0 });
  assert.equal(getAccommodationIdFromPath('/pt/apartment/LG07J/crcn-casa-com-piscina'), 'LG07J');
  assert.equal(getAccommodationIdFromPath('/apartamento/LG02J'), 'LG02J');
  assert.equal(getAccommodationIdFromPath('/pt/search'), null);
});

test('serializes non-default search state and round-trips it', () => {
  const filters = {
    ...createDefaultSearchFilters(),
    checkIn: '2026-11-05',
    checkOut: '2026-11-08',
    guests: { adults: 2, children: 1, infants: 0, pets: 1 },
    destination: 'Rio Quente',
    category: 'pools_24h',
    minPrice: 150,
    maxPrice: 900,
    propertyTypes: ['villa'],
    amenities: ['Piscina'],
    minBedrooms: 2,
    minBeds: 1,
    minBaths: 1,
    superhostOnly: true,
    instantBookOnly: true,
  };
  const serialized = serializeSearchFilters(filters);
  const restored = parseSearchFilters(`?${serialized}`);

  assert.deepEqual(restored, filters);
  const params = new URLSearchParams(serialized);
  assert.equal(params.get('date_picker_type'), 'calendar');
  assert.equal(params.get('checkin'), '2026-11-05');
  assert.equal(params.get('checkout'), '2026-11-08');
  assert.equal(params.get('adults'), '2');
  assert.equal(params.get('children'), '1');
  assert.equal(params.get('infants'), '0');
  assert.equal(params.get('pets'), '1');
  assert.equal(params.has('guests'), false);
  assert.equal(params.get('query'), 'Rio Quente');
  assert.equal(params.get('price_min'), '150');
  assert.equal(params.get('price_max'), '900');
  assert.equal(params.get('property_type'), 'villa');
  assert.equal(params.get('amenities[]'), 'Piscina');
  assert.equal(params.get('min_bedrooms'), '2');
  assert.equal(params.get('min_beds'), '1');
  assert.equal(params.get('min_bathrooms'), '1');
  assert.equal(params.get('superhost'), 'true');
  assert.equal(params.get('instant_book'), 'true');
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
  assert.equal(params.get('query'), 'Caldas Novas');
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
    assert.equal(url.searchParams.get('checkin'), '2026-11-05');
    assert.equal(url.searchParams.get('checkout'), '2026-11-08');
    assert.equal(url.searchParams.get('adults'), '2');
    assert.equal(url.searchParams.get('children'), '1');
    assert.equal(url.searchParams.get('infants'), '0');
    assert.equal(url.searchParams.get('pets'), '0');
    assert.equal(url.searchParams.has('guests'), false);
    view.unmount();
  } finally {
    Object.assign(globalThis, original);
    dom.window.close();
  }
});

test('round-trips supported flexible date windows and rejects unsupported values', () => {
  for (const days of [1, 2] as const) {
    const filters = {
      ...createDefaultSearchFilters(),
      checkIn: '2027-01-10',
      checkOut: '2027-01-13',
      dateFlexibility: days,
    };
    const query = serializeSearchFilters(filters);
    assert.equal(new URLSearchParams(query).get('flexDays'), String(days));
    assert.equal(parseSearchFilters(query).dateFlexibility, days);
  }
  assert.equal(parseSearchFilters('?flexDays=14').dateFlexibility, 0);
});

test('keeps the default search URL clean and preserves unrelated parameters', () => {
  const defaults = createDefaultSearchFilters();
  assert.equal(serializeSearchFilters(defaults), '');
  assert.equal(mergeSearchFiltersIntoUrl('', defaults), '');
  assert.equal(
    mergeSearchFiltersIntoUrl(
      '?utm_source=share&adults=1&children=0&infants=0&pets=0&date_picker_type=calendar',
      defaults,
    ),
    'utm_source=share',
  );
  assert.equal(
    new URLSearchParams(
      serializeSearchFilters({ ...defaults, guests: { ...defaults.guests, adults: 2 } }),
    ).get('adults'),
    '2',
  );
});
