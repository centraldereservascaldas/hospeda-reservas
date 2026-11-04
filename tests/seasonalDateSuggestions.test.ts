import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle,
});

const React = (await import('react')).default;
const { act, cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { SeasonalDateSuggestions } =
  await import('../src/components/search/SeasonalDateSuggestions.tsx');
const { crcnBackendApi } = await import('../src/services/crcnBackendApi.ts');
const { STAYS_NET_APARTMENTS } = await import('../src/data/staysApartments.ts');

import type {
  AccommodationSearchPage,
  SearchAccommodationsParams,
} from '../src/services/crcnBackendApi.ts';
import type { ScheduledRequestOptions } from '../src/services/requestScheduler.ts';

const originalSearch = crcnBackendApi.searchAccommodationsPage;

function mockSearch(
  search: (
    params: SearchAccommodationsParams,
    options?: ScheduledRequestOptions,
  ) => Promise<Pick<AccommodationSearchPage, 'data' | 'total'> & Partial<AccommodationSearchPage>>,
) {
  crcnBackendApi.searchAccommodationsPage = async (params, options) => {
    const result = await search(params, options);
    return {
      ...result,
      unquotedCount: result.unquotedCount ?? 0,
      pagination: result.pagination ?? {
        receivedCount: result.data.length,
        nextSkip: (params.skip ?? 0) + result.data.length,
        hasMore: false,
      },
    };
  };
}

class VisibilityObserver {
  static automatic = true;
  static instances = new Set<VisibilityObserver>();
  readonly targets = new Set<Element>();
  constructor(private callback: ConstructorParameters<typeof IntersectionObserver>[0]) {
    VisibilityObserver.instances.add(this);
  }
  observe(element: Element) {
    this.targets.add(element);
    if (VisibilityObserver.automatic) this.emit(element, true);
  }
  disconnect() {
    this.targets.clear();
    VisibilityObserver.instances.delete(this);
  }
  emit(element: Element, visible: boolean) {
    this.callback(
      [
        {
          target: element,
          isIntersecting: visible,
          intersectionRatio: visible ? 1 : 0,
          boundingClientRect: element.getBoundingClientRect(),
          intersectionRect: element.getBoundingClientRect(),
          rootBounds: null,
          time: 0,
        },
      ],
      this as unknown as IntersectionObserver,
    );
  }
  static show(key: string, visible: boolean) {
    for (const instance of this.instances)
      for (const element of instance.targets)
        if (element.getAttribute('data-discovery-query') === key) instance.emit(element, visible);
  }
}
Object.assign(globalThis, { IntersectionObserver: VisibilityObserver });

afterEach(() => {
  cleanup();
  VisibilityObserver.automatic = true;
  window.sessionStorage.clear();
  crcnBackendApi.searchAccommodationsPage = originalSearch;
});

test('shows date suggestions with real quoted totals and applies the selected period', async () => {
  mockSearch(async () => ({
    total: 1,
    data: [
      {
        ...STAYS_NET_APARTMENTS[0]!,
        calculatedPrice: {
          nights: 2,
          dailyRate: 600,
          basePrice: 1200,
          cleaningFee: 0,
          serviceFee: 0,
          totalAmount: 1200,
          currency: 'BRL',
        },
      },
    ],
  }));
  const selections: Array<{ checkIn: string; checkOut: string }> = [];

  render(
    React.createElement(SeasonalDateSuggestions, {
      currency: 'BRL',
      guestCount: 2,
      guests: { adults: 2, children: 0, infants: 0, pets: 0 },
      onSelect: (params) => {
        selections.push({ checkIn: params.checkIn, checkOut: params.checkOut });
      },
    }),
  );

  assert.ok(screen.getByRole('heading', { name: 'Hospedagens para viajar com seu pet' }));
  assert.ok(screen.getByRole('heading', { name: 'Caldas Country Festival' }));
  assert.ok(screen.getByRole('heading', { name: 'Datas comemorativas e feriados' }));
  await waitFor(() => assert.ok(screen.getAllByText('R$ 1.200,00').length > 0));
  assert.ok(screen.getAllByRole('img').length > 0);
  const firstSuggestion = screen.getAllByRole('button', { name: /a partir de.*1\.200,00/i })[0]!;
  fireEvent.click(firstSuggestion);

  const selected = selections[0];
  assert.ok(selected);
  assert.ok(selected.checkOut > selected.checkIn);
});

test('keeps a consultation failure separate from no availability and never caches it', async () => {
  mockSearch(async () => {
    throw new Error('offline');
  });
  render(
    React.createElement(SeasonalDateSuggestions, {
      currency: 'BRL',
      guestCount: 2,
      guests: { adults: 2, children: 0, infants: 0, pets: 0 },
      onSelect: () => {},
    }),
  );
  await waitFor(() =>
    assert.ok(screen.getAllByText('Consulta indisponível. Tente buscar.').length > 0),
  );
  assert.equal(window.sessionStorage.length, 0);
  assert.doesNotMatch(document.body.textContent || '', /Nenhuma acomodação disponível|R\$/);
});

test('does not use a neighbouring apartment quote for another unit of the same condominium', async () => {
  const unitA = {
    ...STAYS_NET_APARTMENTS[0]!,
    id: 'unit-a',
    title: 'Apartamento A',
    staysListingId: 'unit-a',
    staysPropertyId: 'same-complex',
    maxGuests: 4,
  };
  const unitB = { ...unitA, id: 'unit-b', title: 'Apartamento B', staysListingId: 'unit-b' };
  mockSearch(async (params) => ({
    total: 1,
    data: params.from
      ? [
          {
            ...unitA,
            calculatedPrice: {
              nights: Math.round((Date.parse(params.to!) - Date.parse(params.from)) / 86400000),
              dailyRate: 250,
              basePrice: 500,
              cleaningFee: 0,
              serviceFee: 0,
              totalAmount: 500,
              currency: 'BRL',
            },
          },
        ]
      : [unitB],
  }));
  render(
    React.createElement(SeasonalDateSuggestions, {
      currency: 'BRL',
      guestCount: 2,
      guests: { adults: 2, children: 0, infants: 0, pets: 0 },
      fallbackProperties: [unitB],
      onSelect: () => {},
    }),
  );
  await waitFor(() =>
    assert.ok(screen.getAllByRole('button', { name: /Apartamento B/ }).length > 0),
  );
  for (const button of screen.getAllByRole('button', { name: /Apartamento B/ })) {
    assert.doesNotMatch(button.textContent || '', /R\$/);
    assert.match(button.getAttribute('aria-label') || '', /sugestão de hospedagem/);
  }
});

test('hides quotes from a previous occupancy while the new search is pending', async () => {
  mockSearch(async (params) => {
    if (params.guests === 3) return new Promise(() => {});
    return {
      total: 1,
      data: [
        {
          ...STAYS_NET_APARTMENTS[0]!,
          calculatedPrice: {
            nights:
              params.from && params.to
                ? Math.round((Date.parse(params.to) - Date.parse(params.from)) / 86400000)
                : 2,
            dailyRate: 250,
            basePrice: 500,
            cleaningFee: 0,
            serviceFee: 0,
            totalAmount: 500,
            currency: 'BRL',
          },
        },
      ],
    };
  });
  const props = {
    currency: 'BRL' as const,
    guestCount: 2,
    guests: { adults: 2, children: 0, infants: 0, pets: 0 },
    onSelect: () => {},
  };
  const view = render(React.createElement(SeasonalDateSuggestions, props));
  await waitFor(() => assert.ok(screen.getAllByText('R$ 500,00').length > 0));
  view.rerender(
    React.createElement(SeasonalDateSuggestions, {
      ...props,
      guestCount: 3,
      guests: { ...props.guests, adults: 3 },
    }),
  );
  assert.doesNotMatch(document.body.textContent || '', /R\$ 500/);
});

test('does not restore an expired price as a confirmed offer on the next visit', async () => {
  const now = Date.now;
  mockSearch(async (params) => ({
    total: 1,
    data: [
      {
        ...STAYS_NET_APARTMENTS[0]!,
        calculatedPrice: {
          nights:
            params.from && params.to
              ? Math.round((Date.parse(params.to) - Date.parse(params.from)) / 86400000)
              : 2,
          dailyRate: 250,
          basePrice: 500,
          cleaningFee: 0,
          serviceFee: 0,
          totalAmount: 500,
          currency: 'BRL',
        },
      },
    ],
  }));
  const props = {
    currency: 'BRL' as const,
    guestCount: 2,
    guests: { adults: 2, children: 0, infants: 0, pets: 0 },
    onSelect: () => {},
  };
  const view = render(React.createElement(SeasonalDateSuggestions, props));
  await waitFor(() => assert.ok(screen.getAllByText('R$ 500,00').length > 0));
  view.unmount();
  try {
    const expiredNow = now() + 46_000;
    Date.now = () => expiredNow;
    mockSearch(async () => new Promise(() => {}));
    render(React.createElement(SeasonalDateSuggestions, props));
    assert.doesNotMatch(document.body.textContent || '', /R\$ 500/);
  } finally {
    Date.now = now;
  }
});

test('prioritizes only the first collection cover and supplies responsive image variants', async () => {
  mockSearch(async (params) => ({
    total: 1,
    data: [
      {
        ...STAYS_NET_APARTMENTS[0]!,
        images: ['https://crcn.stays.net/image/6a356fe93db977efbea5a948'],
        calculatedPrice: {
          nights:
            params.from && params.to
              ? Math.round((Date.parse(params.to) - Date.parse(params.from)) / 86400000)
              : 2,
          dailyRate: 250,
          basePrice: 500,
          cleaningFee: 0,
          serviceFee: 0,
          totalAmount: 500,
          currency: 'BRL',
        },
      },
    ],
  }));
  render(
    React.createElement(SeasonalDateSuggestions, {
      currency: 'BRL',
      guestCount: 2,
      guests: { adults: 2, children: 0, infants: 0, pets: 0 },
      onSelect: () => {},
    }),
  );
  await waitFor(() => assert.ok(document.querySelector('img[fetchpriority="high"]')));
  const primary = document.querySelector('img[fetchpriority="high"]')!;
  assert.equal(primary.getAttribute('loading'), 'eager');
  assert.match(primary.getAttribute('srcset') || '', /640w/);
  assert.equal(document.querySelectorAll('img[fetchpriority="high"]').length, 1);
  assert.ok(document.querySelectorAll('img[loading="lazy"]').length > 0);
});

test('detaches every promotional query when its collection unmounts', async () => {
  const signals: AbortSignal[] = [];
  mockSearch((_params, options) => {
    assert.ok(options?.signal);
    const signal = options.signal;
    signals.push(signal);
    return new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
    );
  });
  const rendered = render(
    React.createElement(SeasonalDateSuggestions, {
      currency: 'BRL',
      guestCount: 2,
      guests: { adults: 2, children: 0, infants: 0, pets: 0 },
      onSelect: () => {},
    }),
  );
  await waitFor(() => assert.ok(signals.length > 0));
  rendered.unmount();
  assert.ok(signals.every((signal) => signal.aborted));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(window.sessionStorage.length, 0);
});

const discoveryProps = {
  currency: 'BRL' as const,
  guestCount: 2,
  guests: { adults: 2, children: 0, infants: 0, pets: 0 },
  onSelect: () => {},
};
const quoteResult = (total = 500) => ({
  total: 1,
  data: [
    {
      ...STAYS_NET_APARTMENTS[0]!,
      calculatedPrice: {
        nights: 2,
        dailyRate: total / 2,
        basePrice: total,
        cleaningFee: 0,
        serviceFee: 0,
        totalAmount: total,
        currency: 'BRL',
      },
    },
  ],
});

test('queries only visible dates, groups equal dates and defers the thematic catalogue', async () => {
  VisibilityObserver.automatic = false;
  const calls: SearchAccommodationsParams[] = [];
  mockSearch(async (params) => {
    calls.push(params);
    return quoteResult();
  });
  render(React.createElement(SeasonalDateSuggestions, discoveryProps));
  assert.equal(calls.length, 0);
  act(() => VisibilityObserver.show('pet-weekend-1', true));
  await waitFor(() => assert.equal(calls.length, 1));
  assert.equal(calls[0]!.limit, 8);
  act(() => VisibilityObserver.show('caldas-country-1', true));
  await waitFor(() => assert.equal(calls.length, 2));
  act(() => VisibilityObserver.show('caldas-country-2', true));
  await act(async () => Promise.resolve());
  assert.equal(calls.length, 2);
  assert.ok(calls.every((params) => params.from));
  act(() => VisibilityObserver.show('catalog', true));
  await waitFor(() => assert.equal(calls.length, 4));
  assert.equal(calls.filter((params) => !params.from).length, 1);
  assert.equal(calls.filter((params) => params.limit === 20).length, 2);
});

test('leaving a date aborts its query and discards a late quote before a fresh re-entry', async () => {
  VisibilityObserver.automatic = false;
  const pending: Array<{
    signal: AbortSignal;
    resolve: (value: ReturnType<typeof quoteResult>) => void;
  }> = [];
  mockSearch(
    (_params, options) =>
      new Promise((resolve) => pending.push({ signal: options!.signal!, resolve })),
  );
  render(React.createElement(SeasonalDateSuggestions, discoveryProps));
  act(() => VisibilityObserver.show('pet-weekend-1', true));
  await waitFor(() => assert.equal(pending.length, 1));
  act(() => VisibilityObserver.show('pet-weekend-1', false));
  assert.equal(pending[0]!.signal.aborted, true);
  act(() => VisibilityObserver.show('pet-weekend-1', true));
  await waitFor(() => assert.equal(pending.length, 2));
  await act(async () => pending[0]!.resolve(quoteResult(666)));
  assert.doesNotMatch(document.body.textContent || '', /666,00/);
  await act(async () => pending[1]!.resolve(quoteResult(778)));
  await waitFor(() => assert.ok(screen.getAllByText('R$ 778,00').length > 0));
});

test('visibility re-entry reuses fresh quotes instead of querying the same date again', async () => {
  VisibilityObserver.automatic = false;
  let calls = 0;
  mockSearch(async () => {
    calls++;
    return quoteResult();
  });
  render(React.createElement(SeasonalDateSuggestions, discoveryProps));
  act(() => VisibilityObserver.show('pet-weekend-1', true));
  await waitFor(() => assert.ok(screen.getAllByText('R$ 500,00').length > 0));
  act(() => VisibilityObserver.show('pet-weekend-1', false));
  act(() => VisibilityObserver.show('pet-weekend-1', true));
  await act(async () => Promise.resolve());
  assert.equal(calls, 1);
});

test('guest changes cancel active visible work and can restore a still-valid prior occupancy quote', async () => {
  VisibilityObserver.automatic = false;
  const pending: Array<{
    guests: number;
    signal: AbortSignal;
    resolve: (value: ReturnType<typeof quoteResult>) => void;
  }> = [];
  mockSearch(
    (params, options) =>
      new Promise((resolve) =>
        pending.push({ guests: params.guests!, signal: options!.signal!, resolve }),
      ),
  );
  const rendered = render(React.createElement(SeasonalDateSuggestions, discoveryProps));
  act(() => VisibilityObserver.show('pet-weekend-1', true));
  await waitFor(() => assert.equal(pending.length, 1));
  await act(async () => pending[0]!.resolve(quoteResult(500)));
  await waitFor(() => assert.ok(screen.getAllByText('R$ 500,00').length > 0));
  rendered.rerender(
    React.createElement(SeasonalDateSuggestions, {
      ...discoveryProps,
      guestCount: 3,
      guests: { ...discoveryProps.guests, adults: 3 },
    }),
  );
  await waitFor(() => assert.equal(pending.length, 2));
  assert.equal(pending[0]!.signal.aborted, true);
  assert.equal(pending[1]!.guests, 3);
  assert.doesNotMatch(document.body.textContent || '', /R\$ 500/);
  rendered.rerender(React.createElement(SeasonalDateSuggestions, discoveryProps));
  await waitFor(() => assert.ok(screen.getAllByText('R$ 500,00').length > 0));
  assert.equal(pending[1]!.signal.aborted, true);
  assert.equal(pending.length, 2);
});

test('does not cache an incomplete empty page as no availability and permits a visibility retry', async () => {
  VisibilityObserver.automatic = false;
  let calls = 0;
  mockSearch(async () => {
    calls++;
    return calls === 1
      ? {
          total: 0,
          data: [],
          unquotedCount: 1,
          pagination: { receivedCount: 8, nextSkip: 8, hasMore: true },
        }
      : quoteResult();
  });
  render(React.createElement(SeasonalDateSuggestions, discoveryProps));
  act(() => VisibilityObserver.show('pet-weekend-1', true));
  await waitFor(() =>
    assert.ok(screen.getAllByText('Consulta indisponível. Tente buscar.').length > 0),
  );
  assert.equal(window.sessionStorage.length, 0);
  act(() => VisibilityObserver.show('pet-weekend-1', false));
  act(() => VisibilityObserver.show('pet-weekend-1', true));
  await waitFor(() => assert.ok(screen.getAllByText('R$ 500,00').length > 0));
  assert.equal(calls, 2);
});

test('retains the server deadline when persisting a reused promotional quote', async () => {
  VisibilityObserver.automatic = false;
  const expiresAt = Date.now() + 5_000;
  mockSearch(async () => ({ ...quoteResult(), expiresAt }));
  render(React.createElement(SeasonalDateSuggestions, discoveryProps));
  act(() => VisibilityObserver.show('pet-weekend-1', true));
  await waitFor(() => assert.ok(screen.getAllByText('R$ 500,00').length > 0));
  assert.ok(window.sessionStorage.length > 0);
  for (let index = 0; index < window.sessionStorage.length; index++) {
    const key = window.sessionStorage.key(index)!;
    const cached = JSON.parse(window.sessionStorage.getItem(key)!);
    assert.equal(cached.expiresAt, expiresAt);
  }
});

test('bounds quote storage and removes old, expired, malformed and oversized entries without touching other data', () => {
  VisibilityObserver.automatic = false;
  const prefix = 'crcn.home-date-quote.v7.';
  for (let index = 0; index < 100; index++)
    window.sessionStorage.setItem(
      `${prefix}${index}`,
      JSON.stringify({
        status: 'unavailable',
        guests: 2,
        expiresAt: Date.now() + 30_000,
        cachedAt: Date.now() - index,
      }),
    );
  for (const [key, value] of Object.entries({
    'crcn.home-date-quote.v6.legacy': '{}',
    [`${prefix}expired`]: JSON.stringify({ expiresAt: 1 }),
    [`${prefix}invalid`]: 'invalid',
    [`${prefix}large`]: 'x'.repeat(9000),
  }))
    window.sessionStorage.setItem(key, value);
  window.sessionStorage.setItem('other-data', 'preserved');
  render(
    React.createElement(SeasonalDateSuggestions, {
      currency: 'BRL',
      guestCount: 2,
      guests: { adults: 2, children: 0, infants: 0, pets: 0 },
      onSelect: () => {},
    }),
  );
  const keys = Object.keys(window.sessionStorage);
  assert.equal(keys.filter((key) => key.startsWith(prefix)).length, 60);
  assert.equal(window.sessionStorage.getItem('crcn.home-date-quote.v6.legacy'), null);
  assert.equal(window.sessionStorage.getItem(`${prefix}expired`), null);
  assert.equal(window.sessionStorage.getItem(`${prefix}invalid`), null);
  assert.equal(window.sessionStorage.getItem(`${prefix}large`), null);
  assert.equal(window.sessionStorage.getItem('other-data'), 'preserved');
});

test('does not restore a promotional quote whose expiry exceeds the local validity window', async () => {
  VisibilityObserver.automatic = false;
  const { getHomeDiscoveryCollections } = await import('../src/utils/homeDateSuggestions.ts');
  const suggestion = getHomeDiscoveryCollections()[0]!.suggestions[0]!;
  const key = `crcn.home-date-quote.v7.${suggestion.id}.${suggestion.checkIn}.${suggestion.checkOut}.2`;
  window.sessionStorage.setItem(
    key,
    JSON.stringify({
      status: 'ready',
      guests: 2,
      total: 123,
      nightly: 41,
      propertyTitle: 'Invalid cached property',
      expiresAt: Date.now() + 3_600_000,
    }),
  );
  render(
    React.createElement(SeasonalDateSuggestions, {
      currency: 'BRL',
      guestCount: 2,
      guests: { adults: 2, children: 0, infants: 0, pets: 0 },
      onSelect: () => {},
    }),
  );
  assert.doesNotMatch(document.body.textContent || '', /Invalid cached property/);
  assert.equal(window.sessionStorage.getItem(key), null);
});
