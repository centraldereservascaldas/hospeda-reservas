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
window.scrollTo = () => {};

const { act, cleanup, renderHook, waitFor } = await import('@testing-library/react');
const React = (await import('react')).default;
const { useAccommodationRouting } = await import('../src/hooks/useAccommodationRouting.ts');
const { crcnBackendApi } = await import('../src/services/crcnBackendApi.ts');

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

function renderRouting(
  properties: Property[],
  restored: SearchFilters[] = [],
  restoreSearch?: (
    filters: SearchFilters,
    options?: { scrollCatalog?: boolean },
  ) => void | Promise<void>,
) {
  return renderHook(() => {
    const [selectedProperty, setSelectedProperty] = React.useState<Property | null>(null);
    const [filters, setFilters] = React.useState<SearchFilters>(createDefaultSearchFilters);
    const restoreSearchFromUrlRef = React.useRef<
      (value: SearchFilters, options?: { scrollCatalog?: boolean }) => void | Promise<void>
    >((value) => {
      restored.push(value);
    });
    if (restoreSearch) restoreSearchFromUrlRef.current = restoreSearch;
    const routing = useAccommodationRouting({
      properties,
      selectedProperty,
      setSelectedProperty,
      setFilters,
      restoreSearchFromUrlRef,
    });
    return { selectedProperty, filters, ...routing };
  });
}

test('deep link selects by Stays ID and selection/close preserve query and hash', async () => {
  const property = STAYS_NET_APARTMENTS[0]!;
  const restored: SearchFilters[] = [];
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
    const { result } = renderRouting([property], restored);
    await waitFor(() =>
      assert.ok(result.current.selectedProperty?.images.includes(refreshedImage)),
    );
    assert.equal(result.current.selectedProperty?.id, property.id);

    act(() => result.current.handleClosePropertyDetail());
    assert.equal(window.location.pathname, '/');
    assert.equal(window.location.search, '?from=2026-11-11&to=2026-11-13&utm_source=share');
    assert.equal(window.location.hash, '#booking');
    assert.equal(result.current.selectedProperty?.id ?? null, null);
    assert.equal(restored.length, 1);
    assert.equal(restored[0]?.checkIn, '2026-11-11');
    assert.equal(restored[0]?.checkOut, '2026-11-13');

    act(() => result.current.handleSelectProperty(property));
    await waitFor(() =>
      assert.ok(result.current.selectedProperty?.images.includes(refreshedImage)),
    );
    assert.equal(window.location.pathname, `/apartamento/${property.staysListingId}`);
    assert.equal(window.location.search, '?from=2026-11-11&to=2026-11-13&utm_source=share');
    assert.equal(window.location.hash, '#booking');
    assert.equal(result.current.selectedProperty?.id, property.id);

    act(() => result.current.handleClosePropertyDetail());
    await waitFor(() => assert.equal(window.location.pathname, '/'));
    assert.equal(window.location.search, '?from=2026-11-11&to=2026-11-13&utm_source=share');
    assert.equal(window.location.hash, '#booking');
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

test('switching properties from an open detail keeps one catalog return entry', async () => {
  const first = STAYS_NET_APARTMENTS[0]!;
  const second = STAYS_NET_APARTMENTS[1]!;
  const originalGetAccommodationById = crcnBackendApi.getAccommodationById;
  crcnBackendApi.getAccommodationById = async (id) =>
    id === (first.staysListingId || first.id) ? first : second;
  window.history.replaceState(
    null,
    '',
    '/?from=2026-12-01&to=2026-12-04&utm_source=search#results',
  );

  try {
    const { result } = renderRouting([first, second]);
    act(() => result.current.handleSelectProperty(first));
    await waitFor(() => assert.equal(result.current.selectedProperty?.id, first.id));
    const historyLengthAfterOpeningCatalogDetail = window.history.length;
    assert.equal(window.history.state.__crcnPropertyDetailEntry, true);

    act(() => result.current.handleSelectProperty(second));
    await waitFor(() => assert.equal(result.current.selectedProperty?.id, second.id));
    assert.equal(window.location.pathname, `/apartamento/${second.staysListingId}`);
    assert.equal(window.location.search, '?from=2026-12-01&to=2026-12-04&utm_source=search');
    assert.equal(window.location.hash, '#results');
    assert.equal(window.history.length, historyLengthAfterOpeningCatalogDetail);
    assert.equal(window.history.state.__crcnPropertyDetailEntry, true);

    act(() => result.current.handleClosePropertyDetail());
    await waitFor(() => assert.equal(window.location.pathname, '/'));
    assert.equal(window.location.search, '?from=2026-12-01&to=2026-12-04&utm_source=search');
    assert.equal(window.location.hash, '#results');
    assert.equal(result.current.selectedProperty, null);
  } finally {
    crcnBackendApi.getAccommodationById = originalGetAccommodationById;
  }
});

test('detail close waits for popstate before clearing the selected property', async () => {
  const property = STAYS_NET_APARTMENTS[0]!;
  const originalGetAccommodationById = crcnBackendApi.getAccommodationById;
  crcnBackendApi.getAccommodationById = async () => property;
  window.history.replaceState({ __crcnPropertyDetailReturnFocusProperty: property.id }, '', '/');
  window.history.pushState({ __crcnPropertyDetailEntry: true }, '', `/apartamento/${property.id}`);

  try {
    const { result } = renderRouting([property]);
    await waitFor(() => assert.equal(result.current.selectedProperty?.id, property.id));

    act(() => result.current.handleClosePropertyDetail());

    assert.equal(result.current.selectedProperty?.id, property.id);
    await waitFor(() => assert.equal(window.location.pathname, '/'));
    await waitFor(() => assert.equal(result.current.selectedProperty, null));
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

test('restores the saved catalog position after date search results finish loading', async () => {
  const property = STAYS_NET_APARTMENTS[0]!;
  const originalGetAccommodationById = crcnBackendApi.getAccommodationById;
  crcnBackendApi.getAccommodationById = async () => property;
  let resolveSearch: (() => void) | undefined;
  const searchRestore = new Promise<void>((resolve) => {
    resolveSearch = resolve;
  });
  const requestedOptions: Array<{ scrollCatalog?: boolean } | undefined> = [];
  const scrollPositions: number[] = [];
  const originalScrollTo = window.scrollTo;
  window.scrollTo = ((_, y) => {
    scrollPositions.push(y);
  }) as typeof window.scrollTo;
  window.history.replaceState(
    { __crcnPropertyDetailReturnScroll: 640 },
    '',
    '/?from=2026-12-01&to=2026-12-04&guests=3',
  );
  window.history.pushState(
    { __crcnPropertyDetailEntry: true },
    '',
    `/apartamento/${property.id}?from=2026-12-01&to=2026-12-04&guests=3`,
  );

  try {
    const { result } = renderRouting([property], [], (_filters, options) => {
      requestedOptions.push(options);
      return searchRestore;
    });

    window.history.back();
    await waitFor(() => assert.equal(window.location.pathname, '/'));
    assert.equal(result.current.selectedProperty, null);
    assert.equal(requestedOptions[0]?.scrollCatalog, false);
    assert.equal(scrollPositions.includes(640), false);

    resolveSearch?.();
    await waitFor(() => assert.equal(scrollPositions[scrollPositions.length - 1], 640));
  } finally {
    crcnBackendApi.getAccommodationById = originalGetAccommodationById;
    window.scrollTo = originalScrollTo;
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

test('catalog refresh does not replace an open detail with a stale catalog record', async () => {
  const property = STAYS_NET_APARTMENTS[0]!;
  const refreshedImage = 'https://cdn.stays.net/refreshed-detail.jpg';
  const originalGetAccommodationById = crcnBackendApi.getAccommodationById;
  let detailRequests = 0;
  crcnBackendApi.getAccommodationById = async () => {
    detailRequests += 1;
    return { ...property, images: [...property.images, refreshedImage] };
  };
  window.history.replaceState(null, '', `/apartamento/${property.staysListingId}`);

  try {
    const { result } = renderHook(() => {
      const [properties, setProperties] = React.useState<Property[]>([property]);
      const [selectedProperty, setSelectedProperty] = React.useState<Property | null>(null);
      const [, setFilters] = React.useState<SearchFilters>(createDefaultSearchFilters);
      const restoreSearchFromUrlRef = React.useRef(() => {});
      const routing = useAccommodationRouting({
        properties,
        selectedProperty,
        setSelectedProperty,
        setFilters,
        restoreSearchFromUrlRef,
      });
      return { selectedProperty, setProperties, propertyRouteStatus: routing.propertyRouteStatus };
    });

    await waitFor(() =>
      assert.ok(result.current.selectedProperty?.images.includes(refreshedImage)),
    );
    act(() => result.current.setProperties([{ ...property, title: 'Catalog updated' }]));

    assert.ok(result.current.selectedProperty?.images.includes(refreshedImage));
    assert.equal(result.current.propertyRouteStatus, 'idle');
    assert.equal(detailRequests, 1);
  } finally {
    crcnBackendApi.getAccommodationById = originalGetAccommodationById;
  }
});

test('does not reopen a deep-linked property after navigation changes during loading', async () => {
  const property = STAYS_NET_APARTMENTS[0]!;
  const originalGetAccommodationById = crcnBackendApi.getAccommodationById;
  let resolveProperty: ((value: Property) => void) | undefined;
  const propertyResponse = new Promise<Property>((resolve) => {
    resolveProperty = resolve;
  });
  const requestedIds: string[] = [];
  crcnBackendApi.getAccommodationById = async (id) => {
    requestedIds.push(id);
    return propertyResponse;
  };
  window.history.replaceState(null, '', `/apartamento/${property.id}`);

  try {
    const { result } = renderRouting([]);
    await waitFor(() => assert.deepEqual(requestedIds, [property.id]));

    act(() => {
      window.history.pushState(null, '', '/');
      window.dispatchEvent(new window.PopStateEvent('popstate'));
    });

    await act(async () => {
      resolveProperty?.(property);
      await propertyResponse;
    });

    assert.equal(result.current.selectedProperty, null);
    assert.equal(window.location.pathname, '/');
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

test('preserves Portuguese catalog and detail routes when opening and closing a shared listing', async () => {
  const property = STAYS_NET_APARTMENTS[0]!;
  const originalGetAccommodationById = crcnBackendApi.getAccommodationById;
  crcnBackendApi.getAccommodationById = async () => property;
  window.history.replaceState(
    null,
    '',
    `/pt/search?from=2027-03-01&to=2027-03-05&utm_source=share#results`,
  );

  try {
    const { result } = renderRouting([property]);
    act(() => result.current.handleSelectProperty(property));

    assert.equal(window.location.pathname, `/pt/apartment/${property.staysListingId}`);
    assert.equal(window.location.search, '?from=2027-03-01&to=2027-03-05&utm_source=share');
    assert.equal(window.location.hash, '#results');

    window.history.replaceState(
      null,
      '',
      `/pt/apartment/${property.staysListingId}${window.location.search}${window.location.hash}`,
    );
    act(() => result.current.handleClosePropertyDetail());

    assert.equal(window.location.pathname, '/pt/search');
    assert.equal(window.location.search, '?from=2027-03-01&to=2027-03-05&utm_source=share');
    assert.equal(window.location.hash, '#results');
  } finally {
    crcnBackendApi.getAccommodationById = originalGetAccommodationById;
  }
});
