import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import { STAYS_NET_APARTMENTS } from '../src/data/staysApartments.ts';
import { createDefaultSearchFilters } from '../src/utils/searchUrlState.ts';
import type { Property, SearchFilters } from '../src/types/index.ts';
import type {
  AccommodationSearchPage,
  SearchAccommodationsParams,
} from '../src/services/crcnBackendApi.ts';
import { getConfirmedPropertyQuote } from '../src/utils/propertyDisplayPrice.ts';
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
      options?: { signal?: AbortSignal },
    ) => Promise<{
      total: number;
      data: Property[];
      unquotedCount?: number;
      pagination?: AccommodationSearchPage['pagination'];
      expiresAt?: number;
    }>;
    getSurpriseCandidates?: () => SurpriseDateOption[];
    random?: () => number;
    scrollCatalog?: () => void;
    initialProperties?: Property[];
    initialFilters?: SearchFilters;
  } = {},
) {
  const scrollCatalog = options.scrollCatalog ?? (() => undefined);
  const searchAccommodations =
    options.searchAccommodations ?? (async () => ({ total: 0, data: [] }));
  const getSurpriseCandidates = options.getSurpriseCandidates ?? (() => candidates);
  const random = options.random ?? (() => 0);

  return renderHook(() => {
    const [properties, setProperties] = useState<Property[]>(options.initialProperties ?? []);
    const [filters, setFilters] = useState<SearchFilters>(
      options.initialFilters ?? createDefaultSearchFilters(),
    );
    const restoreSearchFromUrlRef = useRef<
      (
        restoredFilters: SearchFilters,
        options?: { scrollCatalog?: boolean },
      ) => void | Promise<void>
    >(() => undefined);
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
      limit: 12,
      skip: 0,
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
  assert.equal(hook.result.current.availabilitySearchState, 'success');
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
  assert.equal(emptySearch.result.current.availabilitySearchState, 'success');
  assert.equal(emptyScrollCount, 1);
});

test('hides unconfirmed catalogue results after a failed search and retries the last query', async () => {
  const originalWarn = console.warn;
  console.warn = () => undefined;
  let scrollCount = 0;
  let attempt = 0;
  const hook = renderSearchHook({
    initialProperties: [property],
    searchAccommodations: async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('search unavailable');
      return { total: 1, data: [property] };
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
    assert.deepEqual(hook.result.current.properties, []);
    assert.equal(hook.result.current.availabilitySearchState, 'error');
    assert.equal(scrollCount, 1);

    await act(async () => {
      await hook.result.current.retryLastSearch();
    });

    assert.deepEqual(hook.result.current.properties, [property]);
    assert.equal(hook.result.current.availabilitySearchState, 'success');
    assert.equal(attempt, 2);
  } finally {
    console.warn = originalWarn;
  }
});

test('clears stale date quotes and returns to catalogue browsing when dates are removed', async () => {
  const priorDatedQuote = {
    ...property,
    calculatedPrice: {
      nights: 3,
      dailyRate: 300,
      basePrice: 900,
      cleaningFee: 0,
      serviceFee: 0,
      totalAmount: 900,
      currency: 'BRL',
    },
  };
  const initialFilters = {
    ...createDefaultSearchFilters(),
    checkIn: '2027-05-01',
    checkOut: '2027-05-04',
  };
  const hook = renderSearchHook({
    initialProperties: [priorDatedQuote],
    initialFilters,
    searchAccommodations: async (params) => {
      assert.deepEqual(params, {
        from: '',
        to: '',
        guests: 1,
        destination: undefined,
        propertyId: undefined,
        limit: 12,
        skip: 0,
      });
      return { total: 1, data: [priorDatedQuote] };
    },
  });

  await act(async () => {
    await hook.result.current.handleStaysWidgetSearch({
      checkIn: '',
      checkOut: '',
      persons: 1,
      guests: { adults: 1, children: 0, infants: 0, pets: 0 },
    });
  });

  assert.equal(hook.result.current.availabilitySearchState, 'idle');
  assert.equal(hook.result.current.properties[0]?.calculatedPrice, undefined);
  assert.equal(hook.result.current.filters.checkIn, '');
  assert.equal(hook.result.current.filters.checkOut, '');
});

test('rejects incomplete search dates without sending an availability request', async () => {
  let searchCount = 0;
  const hook = renderSearchHook({
    initialProperties: [property],
    searchAccommodations: async () => {
      searchCount += 1;
      return { total: 1, data: [property] };
    },
  });

  await act(async () => {
    await hook.result.current.handleStaysWidgetSearch({
      checkIn: '2027-05-01',
      checkOut: '',
      persons: 1,
    });
  });

  assert.equal(searchCount, 0);
  assert.deepEqual(hook.result.current.properties, []);
  assert.equal(hook.result.current.availabilitySearchState, 'invalid-dates');
  assert.equal(hook.result.current.filters.checkIn, '2027-05-01');
  assert.equal(hook.result.current.filters.checkOut, '');

  await act(async () => {
    await hook.result.current.retryLastSearch();
  });
  assert.equal(searchCount, 0);
  assert.equal(hook.result.current.filters.checkIn, '2027-05-01');
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
  assert.equal(hook.result.current.availabilitySearchState, 'success');
  assert.equal(hook.result.current.filters.checkIn, candidates[2]!.checkIn);
  assert.equal(hook.result.current.filters.checkOut, candidates[2]!.checkOut);
  assert.equal(hook.result.current.filters.destination, '');
});

test('excludes unquoted properties and clears prior dates when surprise candidates have no quote', async () => {
  const initialProperty = STAYS_NET_APARTMENTS[1]!;
  const initialFilters = {
    ...createDefaultSearchFilters(),
    checkIn: '2027-05-01',
    checkOut: '2027-05-04',
  };
  let callCount = 0;
  const hook = renderSearchHook({
    initialProperties: [initialProperty],
    initialFilters,
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
  assert.equal(hook.result.current.availabilitySearchState, 'success');
  assert.equal(hook.result.current.filters.checkIn, '');
  assert.equal(hook.result.current.filters.checkOut, '');
});

test('keeps surprise search in error when some date candidates fail without a confirmed quote', async () => {
  const originalWarn = console.warn;
  console.warn = () => undefined;
  let callCount = 0;
  const hook = renderSearchHook({
    searchAccommodations: async () => {
      callCount += 1;
      if (callCount === 2) {
        return {
          total: 1,
          data: [{ ...property, calculatedPrice: { totalAmount: 0 } } as Property],
        };
      }
      throw new Error(`candidate ${callCount} unavailable`);
    },
  });

  try {
    await act(async () => {
      await hook.result.current.handleStaysWidgetSearch({
        checkIn: '',
        checkOut: '',
        persons: 1,
        surpriseMe: true,
      });
    });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(callCount, 3);
  assert.deepEqual(hook.result.current.properties, []);
  assert.equal(hook.result.current.availabilitySearchState, 'error');
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
    limit: 12,
    skip: 0,
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

test('keeps verified results and exposes a partial state when some quotes failed', async () => {
  const hook = renderSearchHook({
    searchAccommodations: async () => ({ total: 1, data: [property], unquotedCount: 2 }),
  });
  await act(async () =>
    hook.result.current.handleStaysWidgetSearch({
      checkIn: '2027-05-01',
      checkOut: '2027-05-04',
      persons: 2,
    }),
  );
  assert.equal(hook.result.current.availabilitySearchState, 'partial');
  assert.equal(hook.result.current.properties.length, 1);
});

test('surprise search also reports partial quote failures for its chosen period', async () => {
  const hook = renderSearchHook({
    searchAccommodations: async () => ({
      total: 1,
      unquotedCount: 1,
      data: [
        {
          ...property,
          calculatedPrice: {
            nights: 3,
            dailyRate: 250,
            basePrice: 750,
            cleaningFee: 0,
            serviceFee: 0,
            totalAmount: 750,
            currency: 'BRL',
          },
        },
      ],
    }),
  });
  await act(async () =>
    hook.result.current.handleStaysWidgetSearch({
      checkIn: '',
      checkOut: '',
      persons: 2,
      surpriseMe: true,
    }),
  );
  assert.equal(hook.result.current.availabilitySearchState, 'partial');
  assert.equal(hook.result.current.properties.length, 1);
});

const normalSearch = { checkIn: '2027-05-01', checkOut: '2027-05-04', persons: 2 };

test('delivers one page first, preserves it on continuation failure and retries the same raw offset', async () => {
  const offsets: number[] = [];
  const originalWarn = console.warn;
  console.warn = () => {};
  const hook = renderSearchHook({
    searchAccommodations: async (params) => {
      offsets.push(params.skip!);
      if (offsets.length === 2) throw new Error('next page failed');
      return offsets.length === 1
        ? {
            total: 1,
            data: [property],
            unquotedCount: 1,
            pagination: { receivedCount: 12, nextSkip: 12, hasMore: true },
          }
        : {
            total: 2,
            data: [property, { ...property, id: 'next' }],
            pagination: { receivedCount: 2, nextSkip: 14, hasMore: false },
          };
    },
  });
  try {
    await act(async () => hook.result.current.handleStaysWidgetSearch(normalSearch));
    assert.deepEqual(offsets, [0]);
    assert.equal(hook.result.current.properties.length, 1);
    assert.equal(hook.result.current.searchPagination.hasMore, true);
    await act(async () => hook.result.current.loadMoreSearchResults());
    assert.equal(hook.result.current.searchPagination.error, true);
    assert.deepEqual(hook.result.current.properties, [property]);
    await act(async () => hook.result.current.loadMoreSearchResults());
    assert.deepEqual(offsets, [0, 12, 12]);
    assert.deepEqual(
      hook.result.current.properties.map((p) => p.id),
      [property.id, 'next'],
    );
    assert.equal(hook.result.current.searchPagination.loadedCount, 2);
    assert.equal(hook.result.current.searchPagination.hasMore, false);
    assert.equal(hook.result.current.searchPagination.error, false);
    assert.equal(hook.result.current.availabilitySearchState, 'partial');
    await act(async () => hook.result.current.loadMoreSearchResults());
    assert.equal(offsets.length, 3);
  } finally {
    console.warn = originalWarn;
  }
});

test('ignores double load-more clicks and discards a continuation after a new search', async () => {
  let resolveNext!: (page: AccommodationSearchPage) => void;
  let nextSignal: AbortSignal | undefined;
  let calls = 0;
  const hook = renderSearchHook({
    searchAccommodations: async (params, options) => {
      calls += 1;
      if (params.skip === 12) {
        nextSignal = options?.signal;
        return new Promise((resolve) => {
          resolveNext = resolve;
        });
      }
      return {
        total: 1,
        data: [{ ...property, id: params.from! }],
        pagination: { receivedCount: 12, nextSkip: 12, hasMore: true },
      };
    },
  });
  await act(async () => hook.result.current.handleStaysWidgetSearch(normalSearch));
  let pending!: Promise<void>;
  act(() => {
    pending = hook.result.current.loadMoreSearchResults();
  });
  await act(async () => hook.result.current.loadMoreSearchResults());
  assert.equal(calls, 2);
  await act(async () =>
    hook.result.current.handleStaysWidgetSearch({
      ...normalSearch,
      checkIn: '2027-06-01',
      checkOut: '2027-06-04',
    }),
  );
  assert.equal(nextSignal?.aborted, true);
  await act(async () => {
    resolveNext({
      total: 1,
      data: [property],
      unquotedCount: 0,
      pagination: { receivedCount: 1, nextSkip: 13, hasMore: false },
    });
    await pending;
  });
  assert.deepEqual(
    hook.result.current.properties.map((p) => p.id),
    ['2027-06-01'],
  );
  assert.equal(hook.result.current.searchPagination.hasMore, true);
});

test('keeps an all-unquoted first page partial and permits the user to inspect the next page', async () => {
  const hook = renderSearchHook({
    searchAccommodations: async (params) =>
      params.skip === 0
        ? {
            total: 0,
            data: [],
            unquotedCount: 12,
            pagination: { receivedCount: 12, nextSkip: 12, hasMore: true },
          }
        : {
            total: 1,
            data: [property],
            pagination: { receivedCount: 1, nextSkip: 13, hasMore: false },
          },
  });
  await act(async () => hook.result.current.handleStaysWidgetSearch(normalSearch));
  assert.equal(hook.result.current.availabilitySearchState, 'partial');
  assert.equal(hook.result.current.searchPagination.hasMore, true);
  await act(async () => hook.result.current.loadMoreSearchResults());
  assert.equal(hook.result.current.properties.length, 1);
});

test('unmount cancels the active page and prevents further continuation work', async () => {
  let signal: AbortSignal | undefined;
  let resolve!: (page: { total: number; data: Property[] }) => void;
  const hook = renderSearchHook({
    searchAccommodations: (_params, options) => {
      signal = options?.signal;
      return new Promise((done) => {
        resolve = done;
      });
    },
  });
  let pending!: Promise<void>;
  act(() => {
    pending = hook.result.current.handleStaysWidgetSearch(normalSearch);
  });
  hook.unmount();
  assert.equal(signal?.aborted, true);
  resolve({ total: 1, data: [property] });
  await pending;
});

test('returning from detail preserves delivered pages for the same search but restores a different context', async () => {
  let calls = 0;
  const hook = renderSearchHook({
    searchAccommodations: async (params) => {
      calls += 1;
      return {
        total: 1,
        data: [{ ...property, id: String(params.skip) }],
        pagination: { receivedCount: 12, nextSkip: (params.skip ?? 0) + 12, hasMore: calls === 1 },
      };
    },
  });
  await act(async () => hook.result.current.handleStaysWidgetSearch(normalSearch));
  await act(async () => hook.result.current.loadMoreSearchResults());
  const restored = {
    ...createDefaultSearchFilters(),
    checkIn: normalSearch.checkIn,
    checkOut: normalSearch.checkOut,
    guests: { adults: 2, children: 0, infants: 0, pets: 0 },
  };
  await act(async () =>
    hook.result.current.restoreSearchFromUrlRef.current(restored, { scrollCatalog: false }),
  );
  assert.equal(calls, 2);
  assert.equal(hook.result.current.properties.length, 2);
  await act(async () =>
    hook.result.current.restoreSearchFromUrlRef.current(
      { ...restored, checkOut: '2027-05-05' },
      { scrollCatalog: false },
    ),
  );
  assert.equal(calls, 3);
  assert.equal(hook.result.current.properties.length, 1);
});

test('surprise search does not declare no availability when its candidate pages remain incomplete', async () => {
  const hook = renderSearchHook({
    searchAccommodations: async () => ({
      total: 0,
      data: [],
      unquotedCount: 1,
      pagination: { receivedCount: 12, nextSkip: 12, hasMore: true },
    }),
  });
  await act(async () =>
    hook.result.current.handleStaysWidgetSearch({
      checkIn: '',
      checkOut: '',
      persons: 2,
      surpriseMe: true,
    }),
  );
  assert.equal(hook.result.current.availabilitySearchState, 'error');
  assert.equal(hook.result.current.searchPagination.active, false);
});

const expiryQuote = (id: string, expiresAt: number): Property => ({
  ...property,
  id,
  calculatedPrice: {
    nights: 3,
    dailyRate: 250,
    basePrice: 750,
    cleaningFee: 0,
    serviceFee: 0,
    totalAmount: 750,
    currency: 'BRL',
    expiresAt,
  },
});
const expirySearch = { checkIn: '2027-01-10', checkOut: '2027-01-13', persons: 2 };

test('expires only the affected page and retains delivered cards without automatic queries', async (context) => {
  const now = Date.UTC(2026, 10, 3);
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
  let calls = 0;
  const hook = renderSearchHook({
    searchAccommodations: async () => {
      calls++;
      return calls === 1
        ? {
            total: 1,
            data: [expiryQuote('first', now + 5000)],
            expiresAt: now + 5000,
            pagination: { receivedCount: 12, nextSkip: 12, hasMore: true },
          }
        : {
            total: 1,
            data: [expiryQuote('second', now + 20000)],
            expiresAt: now + 20000,
            pagination: { receivedCount: 1, nextSkip: 13, hasMore: false },
          };
    },
  });
  try {
    await act(async () => {
      await hook.result.current.handleStaysWidgetSearch(expirySearch);
    });
    await act(async () => {
      await hook.result.current.loadMoreSearchResults();
    });
    await act(async () => {
      context.mock.timers.tick(4999);
    });
    assert.equal(hook.result.current.availabilitySearchState, 'success');
    await act(async () => {
      context.mock.timers.tick(1);
    });
    assert.equal(hook.result.current.availabilitySearchState, 'expired');
    assert.deepEqual(
      hook.result.current.properties.map((item) => item.id),
      ['first', 'second'],
    );
    assert.equal(getConfirmedPropertyQuote(hook.result.current.properties[0]!), null);
    assert.ok(getConfirmedPropertyQuote(hook.result.current.properties[1]!));
    assert.equal(calls, 2);
    await act(async () => {
      await hook.result.current.restoreSearchFromUrlRef.current(hook.result.current.filters, {
        scrollCatalog: false,
      });
    });
    assert.equal(calls, 2);
    assert.equal(hook.result.current.properties.length, 2);
  } finally {
    hook.unmount();
    context.mock.timers.reset();
  }
});

test('same-context revalidation retains cards while pending and after a transient failure', async (context) => {
  const now = Date.UTC(2026, 10, 3);
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
  let calls = 0;
  let rejectRefresh: ((error: Error) => void) | undefined;
  const hook = renderSearchHook({
    searchAccommodations: async () => {
      calls++;
      if (calls === 1)
        return { total: 1, data: [expiryQuote('first', now + 5000)], expiresAt: now + 5000 };
      return new Promise((_, reject) => {
        rejectRefresh = reject;
      });
    },
  });
  try {
    await act(async () => {
      await hook.result.current.handleStaysWidgetSearch(expirySearch);
    });
    await act(async () => {
      context.mock.timers.tick(5000);
    });
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = hook.result.current.retryLastSearch();
    });
    assert.equal(hook.result.current.availabilitySearchState, 'refreshing');
    assert.equal(hook.result.current.properties[0]?.id, 'first');
    await act(async () => {
      rejectRefresh!(new Error('temporary failure'));
      await pending;
    });
    assert.equal(hook.result.current.availabilitySearchState, 'error');
    assert.equal(hook.result.current.properties[0]?.id, 'first');
    assert.equal(getConfirmedPropertyQuote(hook.result.current.properties[0]!), null);
  } finally {
    hook.unmount();
    context.mock.timers.reset();
  }
});

test('an old search deadline cannot expire a new context', async (context) => {
  const now = Date.UTC(2026, 10, 3);
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
  const hook = renderSearchHook({
    searchAccommodations: async (params) => ({
      total: 1,
      data: [
        expiryQuote(
          params.guests === 2 ? 'old' : 'new',
          now + (params.guests === 2 ? 5000 : 20000),
        ),
      ],
      expiresAt: now + (params.guests === 2 ? 5000 : 20000),
    }),
  });
  try {
    await act(async () => {
      await hook.result.current.handleStaysWidgetSearch(expirySearch);
    });
    await act(async () => {
      context.mock.timers.tick(4000);
    });
    await act(async () => {
      await hook.result.current.handleStaysWidgetSearch({ ...expirySearch, persons: 3 });
    });
    await act(async () => {
      context.mock.timers.tick(1000);
    });
    assert.equal(hook.result.current.availabilitySearchState, 'success');
    assert.equal(hook.result.current.properties[0]?.id, 'new');
    assert.ok(getConfirmedPropertyQuote(hook.result.current.properties[0]!));
  } finally {
    hook.unmount();
    context.mock.timers.reset();
  }
});

test('an expired continuation response does not consume its ids before a successful retry', async (context) => {
  const now = Date.UTC(2026, 10, 3);
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
  let calls = 0;
  const hook = renderSearchHook({
    searchAccommodations: async () => {
      calls++;
      if (calls === 1)
        return {
          total: 1,
          data: [expiryQuote('first', now + 20000)],
          expiresAt: now + 20000,
          pagination: { receivedCount: 12, nextSkip: 12, hasMore: true },
        };
      return {
        total: 1,
        data: [expiryQuote('second', now + 20000)],
        expiresAt: calls === 2 ? now - 1 : now + 20000,
        pagination: { receivedCount: 1, nextSkip: 13, hasMore: false },
      };
    },
  });
  try {
    await act(async () => {
      await hook.result.current.handleStaysWidgetSearch(expirySearch);
    });
    await act(async () => {
      await hook.result.current.loadMoreSearchResults();
    });
    assert.equal(hook.result.current.searchPagination.error, true);
    assert.equal(hook.result.current.properties.length, 1);
    await act(async () => {
      await hook.result.current.loadMoreSearchResults();
    });
    assert.deepEqual(
      hook.result.current.properties.map((item) => item.id),
      ['first', 'second'],
    );
    assert.equal(hook.result.current.searchPagination.error, false);
  } finally {
    hook.unmount();
    context.mock.timers.reset();
  }
});
