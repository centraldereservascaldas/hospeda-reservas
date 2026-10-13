import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import { STAYS_NET_APARTMENTS } from '../src/data/staysApartments.ts';
import type { Property, SearchFilters } from '../src/types';
import { createDefaultSearchFilters } from '../src/utils/searchUrlState.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle,
});

const { act, cleanup, renderHook, waitFor } = await import('@testing-library/react');
const React = (await import('react')).default;
const { useAccommodationRouting } = await import('../src/hooks/useAccommodationRouting.ts');
const { crcnBackendApi } = await import('../src/services/crcnBackendApi.ts');

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

function renderRouting(properties: Property[], restored: SearchFilters[] = []) {
  return renderHook(() => {
    const [selectedProperty, setSelectedProperty] = React.useState<Property | null>(null);
    const [filters, setFilters] = React.useState<SearchFilters>(createDefaultSearchFilters);
    const restoreSearchFromUrlRef = React.useRef((value: SearchFilters) => restored.push(value));
    const routing = useAccommodationRouting({
      properties,
      setSelectedProperty,
      setFilters,
      restoreSearchFromUrlRef,
    });
    return { selectedProperty, filters, ...routing };
  });
}

test('deep link selects by Stays ID and selection/close preserve query and hash', async () => {
  const property = STAYS_NET_APARTMENTS[0]!;
  const originalGetAccommodationById = crcnBackendApi.getAccommodationById;
  const refreshedImage = 'https://cdn.stays.net/live-gallery.jpg';
  const requestedIds: string[] = [];
  crcnBackendApi.getAccommodationById = async (id) => {
    requestedIds.push(id);
    return { ...property, images: [...property.images, refreshedImage] };
  };
  window.history.replaceState(
    null,
    '',
    `/apartamento/${property.staysListingId}?from=2026-11-11&to=2026-11-13&utm_source=share#booking`,
  );

  try {
    const { result } = renderRouting([property]);
    await waitFor(() =>
      assert.ok(result.current.selectedProperty?.images.includes(refreshedImage)),
    );
    assert.equal(result.current.selectedProperty?.id, property.id);

    act(() => result.current.handleClosePropertyDetail());
    assert.equal(window.location.pathname, '/');
    assert.equal(window.location.search, '?from=2026-11-11&to=2026-11-13&utm_source=share');
    assert.equal(window.location.hash, '#booking');
    assert.equal(result.current.selectedProperty?.id ?? null, null);

    act(() => result.current.handleSelectProperty(property));
    await waitFor(() =>
      assert.ok(result.current.selectedProperty?.images.includes(refreshedImage)),
    );
    assert.equal(window.location.pathname, `/apartamento/${property.staysListingId}`);
    assert.equal(window.location.search, '?from=2026-11-11&to=2026-11-13&utm_source=share');
    assert.equal(window.location.hash, '#booking');
    assert.equal(result.current.selectedProperty?.id, property.id);
    assert.deepEqual(requestedIds, [property.staysListingId, property.staysListingId]);
  } finally {
    crcnBackendApi.getAccommodationById = originalGetAccommodationById;
  }
});

test('ignores a late detail response after another accommodation is selected', async () => {
  const first = STAYS_NET_APARTMENTS[0]!;
  const second = STAYS_NET_APARTMENTS[1]!;
  let resolveFirst: ((property: Property) => void) | undefined;
  const firstResponse = new Promise<Property>((resolve) => {
    resolveFirst = resolve;
  });
  const originalGetAccommodationById = crcnBackendApi.getAccommodationById;
  crcnBackendApi.getAccommodationById = async (id) =>
    id === (first.staysListingId || first.id) ? firstResponse : second;

  try {
    const { result } = renderRouting([first, second]);
    act(() => result.current.handleSelectProperty(first));
    act(() => result.current.handleSelectProperty(second));
    await waitFor(() => assert.equal(result.current.selectedProperty?.id, second.id));

    await act(async () => {
      resolveFirst?.({ ...first, images: [...first.images, 'https://cdn.stays.net/late.jpg'] });
      await firstResponse;
    });

    assert.equal(result.current.selectedProperty?.id, second.id);
    assert.equal(
      result.current.selectedProperty?.images.includes('https://cdn.stays.net/late.jpg'),
      false,
    );
  } finally {
    crcnBackendApi.getAccommodationById = originalGetAccommodationById;
  }
});

test('popstate restores filters and search when returning from a property route', () => {
  const property = STAYS_NET_APARTMENTS[0]!;
  const restored: SearchFilters[] = [];
  const originalGetAccommodationById = crcnBackendApi.getAccommodationById;
  crcnBackendApi.getAccommodationById = async () => property;
  window.history.replaceState(null, '', `/apartamento/${property.id}`);

  try {
    const { result } = renderRouting([property], restored);

    act(() => {
      window.history.pushState(null, '', '/?from=2026-12-01&to=2026-12-04&guests=3');
      window.dispatchEvent(new window.PopStateEvent('popstate'));
    });

    assert.equal(result.current.selectedProperty?.id ?? null, null);
    assert.equal(result.current.filters.checkIn, '2026-12-01');
    assert.equal(result.current.filters.checkOut, '2026-12-04');
    assert.deepEqual(result.current.filters.guests, {
      adults: 3,
      children: 0,
      infants: 0,
      pets: 0,
    });
    assert.equal(restored.length, 1);
    assert.equal(restored[0]?.checkIn, '2026-12-01');
  } finally {
    crcnBackendApi.getAccommodationById = originalGetAccommodationById;
  }
});

test('deep link loads an accommodation absent from the current catalog', async () => {
  const property = STAYS_NET_APARTMENTS[0]!;
  const originalGetAccommodationById = crcnBackendApi.getAccommodationById;
  const requestedIds: string[] = [];
  crcnBackendApi.getAccommodationById = async (id) => {
    requestedIds.push(id);
    return property;
  };
  window.history.replaceState(null, '', `/apartamento/${property.id}`);

  try {
    const { result } = renderRouting([]);
    await waitFor(() => assert.equal(result.current.selectedProperty, property));
    assert.deepEqual(requestedIds, [property.id]);
  } finally {
    crcnBackendApi.getAccommodationById = originalGetAccommodationById;
  }
});

test('Stays localized apartment URL opens the listing with date and persons filters', async () => {
  const property = STAYS_NET_APARTMENTS[0]!;
  const originalGetAccommodationById = crcnBackendApi.getAccommodationById;
  crcnBackendApi.getAccommodationById = async () => property;
  window.history.replaceState(
    null,
    '',
    `/pt/apartment/${property.staysListingId}/listing-slug?from=2027-03-01&to=2027-03-05&persons=10`,
  );

  try {
    const { result } = renderRouting([property]);
    await waitFor(() => assert.equal(result.current.selectedProperty?.id, property.id));
    assert.equal(result.current.filters.checkIn, '2027-03-01');
    assert.equal(result.current.filters.checkOut, '2027-03-05');
    assert.deepEqual(result.current.filters.guests, {
      adults: 10,
      children: 0,
      infants: 0,
      pets: 0,
    });
    assert.equal(window.location.pathname.startsWith('/pt/apartment/'), true);
  } finally {
    crcnBackendApi.getAccommodationById = originalGetAccommodationById;
  }
});
