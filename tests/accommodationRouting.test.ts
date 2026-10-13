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
  window.history.replaceState(
    null,
    '',
    `/apartamento/${property.staysListingId}?from=2026-11-11&to=2026-11-13&utm_source=share#booking`,
  );

  const { result } = renderRouting([property]);
  await waitFor(() => assert.equal(result.current.selectedProperty, property));

  act(() => result.current.handleClosePropertyDetail());
  assert.equal(window.location.pathname, '/');
  assert.equal(window.location.search, '?from=2026-11-11&to=2026-11-13&utm_source=share');
  assert.equal(window.location.hash, '#booking');
  assert.equal(result.current.selectedProperty, null);

  act(() => result.current.handleSelectProperty(property));
  assert.equal(window.location.pathname, `/apartamento/${property.staysListingId}`);
  assert.equal(window.location.search, '?from=2026-11-11&to=2026-11-13&utm_source=share');
  assert.equal(window.location.hash, '#booking');
  assert.equal(result.current.selectedProperty, property);
});

test('popstate restores filters and search when returning from a property route', () => {
  const property = STAYS_NET_APARTMENTS[0]!;
  const restored: SearchFilters[] = [];
  window.history.replaceState(null, '', `/apartamento/${property.id}`);
  const { result } = renderRouting([property], restored);

  act(() => {
    window.history.pushState(null, '', '/?from=2026-12-01&to=2026-12-04&guests=3');
    window.dispatchEvent(new window.PopStateEvent('popstate'));
  });

  assert.equal(result.current.selectedProperty, null);
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
