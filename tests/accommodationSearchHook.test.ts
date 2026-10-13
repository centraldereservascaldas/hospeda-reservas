import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import { STAYS_NET_APARTMENTS } from '../src/data/staysApartments.ts';
import { createDefaultSearchFilters } from '../src/utils/searchUrlState.ts';
import type { Property, SearchFilters } from '../src/types/index.ts';
import type { SearchAccommodationsParams } from '../src/services/crcnBackendApi.ts';
import type { SurpriseDateOption } from '../src/utils/surpriseDates.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
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

const { act, cleanup, renderHook, waitFor } = await import('@testing-library/react');
const { useState, useRef } = await import('react');
const { useAccommodationSearch } = await import('../src/hooks/useAccommodationSearch.ts');

const property = STAYS_NET_APARTMENTS[0]!;
const candidates: SurpriseDateOption[] = [
  { checkIn: '2027-01-10', checkOut: '2027-01-13', occasion: 'one', kind: 'holiday', weight: 3 },
  { checkIn: '2027-02-10', checkOut: '2027-02-13', occasion: 'two', kind: 'event', weight: 2 },
  { checkIn: '2027-03-10', checkOut: '2027-03-13', occasion: 'three', kind: 'holiday', weight: 1 },
  { checkIn: '2027-04-10', checkOut: '2027-04-13', occasion: 'four', kind: 'holiday', weight: 1 },
];

function renderSearchHook(
  options: {
    searchAccommodations?: (
      params: SearchAccommodationsParams,
    ) => Promise<{ total: number; data: Property[] }>;
    getSurpriseCandidates?: () => SurpriseDateOption[];
    random?: () => number;
    scrollCatalog?: () => void;
    initialProperties?: Property[];
  } = {},
) {
  const scrollCatalog = options.scrollCatalog ?? (() => undefined);
  const searchAccommodations =
    options.searchAccommodations ?? (async () => ({ total: 0, data: [] }));
  const getSurpriseCandidates = options.getSurpriseCandidates ?? (() => candidates);
  const random = options.random ?? (() => 0);

  return renderHook(() => {
    const [properties, setProperties] = useState<Property[]>(options.initialProperties ?? []);
    const [filters, setFilters] = useState<SearchFilters>(createDefaultSearchFilters);
    const restoreSearchFromUrlRef = useRef<(restoredFilters: SearchFilters) => void>(
      () => undefined,
    );
    const search = useAccommodationSearch({
      setProperties,
      setFilters,
      restoreSearchFromUrlRef,
      searchAccommodations,
      getSurpriseCandidates,
      random,
      scrollCatalog,
    });
    return { ...search, properties, filters, restoreSearchFromUrlRef };
  });
}

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
  localStorage.clear();
});

test('applies filters and replaces the catalogue after a normal search, including empty results', async () => {
  let scrollCount = 0;
  const searchAccommodations = async (params: SearchAccommodationsParams) => {
    assert.deepEqual(params, {
      from: '2027-05-01',
      to: '2027-05-04',
      guests: 3,
      destination: 'Caldas Novas',
      propertyId: 'listing-1',
    });
    return { total: 1, data: [property] };
  };
  const hook = renderSearchHook({
    initialProperties: [STAYS_NET_APARTMENTS[1]!],
    searchAccommodations,
    scrollCatalog: () => {
      scrollCount += 1;
    },
  });

  await act(async () => {
    await hook.result.current.handleStaysWidgetSearch({
      checkIn: '2027-05-01',
      checkOut: '2027-05-04',
      persons: 3,
      destination: 'Caldas Novas',
      propertyId: 'listing-1',
    });
  });
  assert.deepEqual(hook.result.current.properties, [property]);
  assert.equal(hook.result.current.filters.checkIn, '2027-05-01');
  assert.equal(hook.result.current.filters.checkOut, '2027-05-04');
  assert.equal(hook.result.current.filters.destination, 'Caldas Novas');
  assert.equal(hook.result.current.filters.guests.adults, 3);
  assert.equal(scrollCount, 1);

  let emptyScrollCount = 0;
  const emptySearch = renderSearchHook({
    searchAccommodations: async () => ({ total: 0, data: [] }),
    scrollCatalog: () => {
      emptyScrollCount += 1;
    },
  });
  await act(async () => {
    await emptySearch.result.current.handleStaysWidgetSearch({
      checkIn: '2027-05-01',
      checkOut: '2027-05-04',
      persons: 1,
    });
  });
  assert.deepEqual(emptySearch.result.current.properties, []);
  assert.equal(emptyScrollCount, 1);
});

test('retains the current catalogue if a normal search fails and still scrolls to the results', async () => {
  const originalWarn = console.warn;
  console.warn = () => undefined;
  let scrollCount = 0;
  const hook = renderSearchHook({
    initialProperties: [property],
    searchAccommodations: async () => {
      throw new Error('search unavailable');
    },
    scrollCatalog: () => {
      scrollCount += 1;
    },
  });

  try {
    await act(async () => {
      await hook.result.current.handleStaysWidgetSearch({
        checkIn: '2027-05-01',
        checkOut: '2027-05-04',
        persons: 2,
      });
    });
    assert.deepEqual(hook.result.current.properties, [property]);
    assert.equal(scrollCount, 1);
  } finally {
    console.warn = originalWarn;
  }
});

test('tries surprise candidates in order and uses the first results with positive official quotes', async () => {
  const quotedProperty = {
    ...property,
    id: 'quoted',
    calculatedPrice: { totalAmount: 120 },
  } as Property;
  const unquotedProperty = {
    ...property,
    id: 'unquoted',
    calculatedPrice: { totalAmount: 0 },
  } as Property;
  const calls: SearchAccommodationsParams[] = [];
  const hook = renderSearchHook({
    searchAccommodations: async (params) => {
      calls.push(params);
      if (calls.length === 1) throw new Error('first candidate unavailable');
      if (calls.length === 2) return { total: 1, data: [unquotedProperty] };
      return { total: 2, data: [unquotedProperty, quotedProperty] };
    },
  });
  const originalWarn = console.warn;
  console.warn = () => undefined;

  try {
    await act(async () => {
      await hook.result.current.handleStaysWidgetSearch({
        checkIn: '',
        checkOut: '',
        persons: 2,
        destination: 'ignored for surprise filters',
        surpriseMe: true,
      });
    });
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(
    calls.map(({ from, to }) => [from, to]),
    candidates.slice(0, 3).map(({ checkIn, checkOut }) => [checkIn, checkOut]),
  );
  assert.deepEqual(hook.result.current.properties, [quotedProperty]);
  assert.equal(hook.result.current.filters.checkIn, candidates[2]!.checkIn);
  assert.equal(hook.result.current.filters.checkOut, candidates[2]!.checkOut);
  assert.equal(hook.result.current.filters.destination, '');
});

test('excludes unquoted properties and leaves dates unchanged when surprise candidates have no quote', async () => {
  const initialProperty = STAYS_NET_APARTMENTS[1]!;
  let callCount = 0;
  const hook = renderSearchHook({
    initialProperties: [initialProperty],
    searchAccommodations: async () => {
      callCount += 1;
      return {
        total: 1,
        data: [{ ...property, calculatedPrice: { totalAmount: 0 } } as Property],
      };
    },
  });

  await act(async () => {
    await hook.result.current.handleStaysWidgetSearch({
      checkIn: '',
      checkOut: '',
      persons: 1,
      surpriseMe: true,
    });
  });
  assert.equal(callCount, 3);
  assert.deepEqual(hook.result.current.properties, []);
  assert.equal(hook.result.current.filters.checkIn, '');
  assert.equal(hook.result.current.filters.checkOut, '');
});

test('ranks surprise results, breaks ties with the official quote, and takes five from the top ten', async () => {
  const results = Array.from({ length: 12 }, (_, index) => ({
    ...property,
    id: `surprise-${index + 1}`,
    rating: 4.8,
    calculatedPrice: { totalAmount: index + 1 },
  })) as Property[];
  const hook = renderSearchHook({
    searchAccommodations: async () => ({ total: results.length, data: results }),
    random: () => 0.999999,
  });

  await act(async () => {
    await hook.result.current.handleStaysWidgetSearch({
      checkIn: '',
      checkOut: '',
      persons: 1,
      surpriseMe: true,
    });
  });

  assert.deepEqual(
    hook.result.current.properties.map(({ id }) => id),
    ['surprise-1', 'surprise-2', 'surprise-3', 'surprise-4', 'surprise-5'],
  );
});

test('runs an initial URL search only once and skips initial deep links to an accommodation', async () => {
  const calls: SearchAccommodationsParams[] = [];
  const searchAccommodations = async (params: SearchAccommodationsParams) => {
    calls.push(params);
    return { total: 0, data: [] };
  };
  window.history.replaceState({}, '', '/?from=2027-05-01&to=2027-05-04&adults=2&children=1');
  const hook = renderSearchHook({ searchAccommodations });

  await waitFor(() => assert.equal(calls.length, 1));
  hook.rerender();
  await act(async () => Promise.resolve());
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    from: '2027-05-01',
    to: '2027-05-04',
    guests: 3,
    destination: '',
    propertyId: '',
  });

  cleanup();
  calls.length = 0;
  window.history.replaceState({}, '', '/apartamento/JQ08G?from=2027-05-01&to=2027-05-04');
  renderSearchHook({ searchAccommodations });
  await act(async () => Promise.resolve());
  assert.equal(calls.length, 0);
});

test('exposes URL restoration through the routing ref and scrolls the catalogue', async () => {
  let scrollCount = 0;
  const hook = renderSearchHook({
    searchAccommodations: async () => ({ total: 0, data: [property] }),
    scrollCatalog: () => {
      scrollCount += 1;
    },
  });
  const restoredFilters = {
    ...createDefaultSearchFilters(),
    checkIn: '2027-05-01',
    checkOut: '2027-05-04',
    guests: { adults: 2, children: 1, infants: 0, pets: 0 },
    destination: 'Centro',
    destinationPropertyId: 'target',
  };

  await act(async () => hook.result.current.restoreSearchFromUrlRef.current(restoredFilters));
  assert.deepEqual(hook.result.current.properties, [property]);
  assert.equal(hook.result.current.filters.destination, 'Centro');
  assert.equal(hook.result.current.filters.destinationPropertyId, 'target');
  assert.equal(hook.result.current.filters.guests.adults, 2);
  assert.equal(scrollCount, 1);
});

test('ignores an older search response after a newer search finishes', async () => {
  const pending: Array<(result: { total: number; data: Property[] }) => void> = [];
  const hook = renderSearchHook({
    searchAccommodations: () =>
      new Promise((resolve) => {
        pending.push(resolve);
      }),
  });

  let firstSearch!: Promise<void>;
  let secondSearch!: Promise<void>;
  act(() => {
    firstSearch = hook.result.current.handleStaysWidgetSearch({
      checkIn: '2027-05-01',
      checkOut: '2027-05-04',
      persons: 2,
    });
    secondSearch = hook.result.current.handleStaysWidgetSearch({
      checkIn: '2027-06-01',
      checkOut: '2027-06-04',
      persons: 3,
    });
  });
  const latest = { ...property, id: 'latest' };
  await act(async () => {
    pending[1]!({ total: 1, data: [latest] });
    await secondSearch;
  });
  await act(async () => {
    pending[0]!({ total: 1, data: [property] });
    await firstSearch;
  });
  assert.deepEqual(hook.result.current.properties, [latest]);
  assert.equal(hook.result.current.filters.checkIn, '2027-06-01');
});
