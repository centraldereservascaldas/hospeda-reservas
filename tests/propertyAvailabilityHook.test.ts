import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import { STAYS_NET_APARTMENTS } from '../src/data/staysApartments.ts';

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
const { act, render, cleanup, waitFor } = await import('@testing-library/react');
const { usePropertyAvailability } =
  await import('../src/components/property/usePropertyAvailability.ts');
const { crcnBackendApi } = await import('../src/services/crcnBackendApi.ts');
type CalculatedPriceResponse = import('../src/services/crcnBackendApi.ts').CalculatedPriceResponse;

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('property availability hook requests the Stays id and represents failed live data', async () => {
  const originalGetCalendar = crcnBackendApi.getAccommodationCalendar;
  const originalCalculatePrice = crcnBackendApi.calculatePrice;
  const property = STAYS_NET_APARTMENTS[0]!;
  const calendarRequests: Array<[string, string | undefined, string | undefined]> = [];
  const priceRequests: Array<{ listingId: string; from: string; to: string; guests?: number }> = [];
  crcnBackendApi.getAccommodationCalendar = async (id, from, to) => {
    calendarRequests.push([id, from, to]);
    return [];
  };
  crcnBackendApi.calculatePrice = async (request) => {
    priceRequests.push(request);
    return null;
  };

  function Probe() {
    const result = usePropertyAvailability({
      property,
      checkIn: '2026-11-11',
      checkOut: '2026-11-15',
      guests: 3,
      todayIso: '2026-10-13',
    });
    return React.createElement(
      'div',
      null,
      JSON.stringify({
        calendarAvailable: result.calendarAvailable,
        calendarMessage: result.calendarMessage,
        isCalculatingPrice: result.isCalculatingPrice,
        isLoadingCalendar: result.isLoadingCalendar,
        staysPrice: result.staysPrice,
      }),
    );
  }

  try {
    const { container } = render(React.createElement(Probe));
    await waitFor(() => {
      assert.match(container.textContent || '', /Não foi possível confirmar a disponibilidade/);
      assert.match(container.textContent || '', /"isCalculatingPrice":false/);
      assert.match(container.textContent || '', /"isLoadingCalendar":false/);
    });
    assert.deepEqual(calendarRequests, [
      [property.staysListingId || property.id, '2026-10-13', '2027-01-11'],
    ]);
    assert.deepEqual(priceRequests, [
      {
        listingId: property.staysListingId || property.id,
        from: '2026-11-11',
        to: '2026-11-15',
        guests: 3,
      },
    ]);
    assert.match(container.textContent || '', /"staysPrice":null/);
  } finally {
    crcnBackendApi.getAccommodationCalendar = originalGetCalendar;
    crcnBackendApi.calculatePrice = originalCalculatePrice;
  }
});

test('property availability hook clears loading and exposes an error when the calendar request rejects', async () => {
  const originalGetCalendar = crcnBackendApi.getAccommodationCalendar;
  const originalCalculatePrice = crcnBackendApi.calculatePrice;
  const property = STAYS_NET_APARTMENTS[0]!;
  crcnBackendApi.getAccommodationCalendar = async () => {
    throw new Error('calendar unavailable');
  };
  crcnBackendApi.calculatePrice = async () => null;

  function Probe() {
    const result = usePropertyAvailability({
      property,
      checkIn: '2026-11-11',
      checkOut: '2026-11-15',
      guests: 3,
      todayIso: '2026-10-13',
    });
    return React.createElement(
      'div',
      null,
      JSON.stringify({
        calendarAvailable: result.calendarAvailable,
        calendarMessage: result.calendarMessage,
        isLoadingCalendar: result.isLoadingCalendar,
      }),
    );
  }

  try {
    const { container } = render(React.createElement(Probe));
    await waitFor(() => {
      assert.match(container.textContent || '', /Não foi possível confirmar a disponibilidade/);
      assert.match(container.textContent || '', /"isLoadingCalendar":false/);
      assert.match(container.textContent || '', /"calendarAvailable":false/);
    });
  } finally {
    crcnBackendApi.getAccommodationCalendar = originalGetCalendar;
    crcnBackendApi.calculatePrice = originalCalculatePrice;
  }
});

test('property availability hook distinguishes a rejected price request from an empty quote', async () => {
  const originalGetCalendar = crcnBackendApi.getAccommodationCalendar;
  const originalCalculatePrice = crcnBackendApi.calculatePrice;
  const property = STAYS_NET_APARTMENTS[0]!;
  crcnBackendApi.getAccommodationCalendar = async () => [];
  crcnBackendApi.calculatePrice = async () => {
    throw new Error('price service unavailable');
  };

  function Probe() {
    const result = usePropertyAvailability({
      property,
      checkIn: '2026-11-11',
      checkOut: '2026-11-15',
      guests: 3,
      todayIso: '2026-10-13',
    });
    return React.createElement(
      'output',
      null,
      JSON.stringify({
        isCalculatingPrice: result.isCalculatingPrice,
        priceRequestFailed: result.priceRequestFailed,
      }),
    );
  }

  try {
    const { container } = render(React.createElement(Probe));
    await waitFor(() => {
      assert.match(container.textContent || '', /"isCalculatingPrice":false/);
      assert.match(container.textContent || '', /"priceRequestFailed":true/);
    });
  } finally {
    crcnBackendApi.getAccommodationCalendar = originalGetCalendar;
    crcnBackendApi.calculatePrice = originalCalculatePrice;
  }
});

test('property availability hides stale calendar and quote while guest or property context changes', async () => {
  const originalGetCalendar = crcnBackendApi.getAccommodationCalendar;
  const originalCalculatePrice = crcnBackendApi.calculatePrice;
  const firstProperty = STAYS_NET_APARTMENTS[0]!;
  const secondProperty = STAYS_NET_APARTMENTS[1]!;
  const firstListingId = firstProperty.staysListingId || firstProperty.id;
  const secondListingId = secondProperty.staysListingId || secondProperty.id;
  const calendar = Array.from({ length: 5 }, (_, index) => ({
    date: `2026-11-${String(11 + index).padStart(2, '0')}`,
    avail: 1,
  }));
  let resolveGuestQuote: ((quote: CalculatedPriceResponse) => void) | undefined;
  let resolveSecondPropertyCalendar: ((days: typeof calendar) => void) | undefined;
  let resolveSecondPropertyQuote: ((quote: CalculatedPriceResponse) => void) | undefined;
  const guestQuote = new Promise<CalculatedPriceResponse>((resolve) => {
    resolveGuestQuote = resolve;
  });
  const secondPropertyCalendar = new Promise<typeof calendar>((resolve) => {
    resolveSecondPropertyCalendar = resolve;
  });
  const secondPropertyQuote = new Promise<CalculatedPriceResponse>((resolve) => {
    resolveSecondPropertyQuote = resolve;
  });
  const makeQuote = (listingId: string, total: number): CalculatedPriceResponse => ({
    success: true,
    listingId,
    staysListingId: listingId,
    nights: 4,
    dailyRate: total / 4,
    baseTotal: total,
    cleaningFee: 0,
    serviceFee: 0,
    discount: 0,
    total,
    currency: 'BRL',
    source: 'stays-live',
    breakdown: {
      dailyRateText: 'Diária',
      cleaningFeeText: 'Limpeza',
      serviceFeeText: 'Serviço',
      totalText: 'Total',
    },
  });

  crcnBackendApi.getAccommodationCalendar = async (listingId) =>
    listingId === firstListingId ? calendar : secondPropertyCalendar;
  crcnBackendApi.calculatePrice = async (request) => {
    if (request.listingId === firstListingId && request.guests === 2) {
      return makeQuote(firstListingId, 850);
    }
    if (request.listingId === firstListingId && request.guests === 3) return guestQuote;
    return secondPropertyQuote;
  };

  function Probe({
    property,
    guests,
  }: {
    property: (typeof STAYS_NET_APARTMENTS)[number];
    guests: number;
  }) {
    const result = usePropertyAvailability({
      property,
      checkIn: '2026-11-11',
      checkOut: '2026-11-15',
      guests,
      todayIso: '2026-10-13',
    });
    return React.createElement(
      'output',
      null,
      JSON.stringify({
        calendarAvailable: result.calendarAvailable,
        isLoadingCalendar: result.isLoadingCalendar,
        isCalculatingPrice: result.isCalculatingPrice,
        staysPrice: result.staysPrice,
      }),
    );
  }

  try {
    const { container, rerender } = render(
      React.createElement(Probe, { property: firstProperty, guests: 2 }),
    );
    const readState = () => JSON.parse(container.querySelector('output')?.textContent || '{}');
    await waitFor(() => {
      assert.equal(readState().calendarAvailable, true);
      assert.equal(readState().staysPrice?.total, 850);
    });

    rerender(React.createElement(Probe, { property: firstProperty, guests: 3 }));
    assert.equal(readState().staysPrice, null);
    assert.equal(readState().isCalculatingPrice, true);
    assert.equal(readState().calendarAvailable, true);

    await act(async () => {
      resolveGuestQuote?.(makeQuote(firstListingId, 930));
      await guestQuote;
    });
    await waitFor(() => assert.equal(readState().staysPrice?.total, 930));

    rerender(React.createElement(Probe, { property: secondProperty, guests: 4 }));
    assert.equal(readState().calendarAvailable, false);
    assert.equal(readState().isLoadingCalendar, true);
    assert.equal(readState().staysPrice, null);
    assert.equal(readState().isCalculatingPrice, true);

    await act(async () => {
      resolveSecondPropertyCalendar?.(calendar);
      resolveSecondPropertyQuote?.(makeQuote(secondListingId, 1200));
      await Promise.all([secondPropertyCalendar, secondPropertyQuote]);
    });
    await waitFor(() => {
      assert.equal(readState().calendarAvailable, true);
      assert.equal(readState().staysPrice?.listingId, secondListingId);
    });
  } finally {
    crcnBackendApi.getAccommodationCalendar = originalGetCalendar;
    crcnBackendApi.calculatePrice = originalCalculatePrice;
  }
});

test('changing arrival retains earlier future days without requesting a new calendar', async () => {
  const original = crcnBackendApi.getAccommodationCalendar;
  let requests = 0;
  crcnBackendApi.getAccommodationCalendar = async () => {
    requests += 1;
    return [
      { date: '2026-11-03', avail: 1 },
      { date: '2026-11-17', avail: 1 },
    ];
  };
  function Probe({ checkIn }: { checkIn: string }) {
    const result = usePropertyAvailability({
      property: STAYS_NET_APARTMENTS[0]!,
      checkIn,
      checkOut: '',
      guests: 2,
      todayIso: '2026-11-03',
    });
    return React.createElement('output', null, JSON.stringify(result.calendarDays));
  }
  try {
    const { container, rerender } = render(React.createElement(Probe, { checkIn: '' }));
    await waitFor(() => assert.match(container.textContent || '', /2026-11-03/));
    rerender(React.createElement(Probe, { checkIn: '2026-11-17' }));
    assert.match(container.textContent || '', /2026-11-03/);
    assert.equal(requests, 1);
  } finally {
    crcnBackendApi.getAccommodationCalendar = original;
  }
});

test('simultaneous consumers deduplicate calendar requests and expose incomplete coverage', async () => {
  const original = crcnBackendApi.getAccommodationCalendar;
  let requests = 0;
  let resolve!: (days: Array<{ date: string; avail: number }>) => void;
  const pending = new Promise<Array<{ date: string; avail: number }>>((done) => {
    resolve = done;
  });
  crcnBackendApi.getAccommodationCalendar = async () => {
    requests += 1;
    return pending;
  };
  function Probe() {
    const result = usePropertyAvailability({
      property: STAYS_NET_APARTMENTS[0]!,
      checkIn: '',
      checkOut: '',
      guests: 2,
      todayIso: '2026-11-04',
    });
    return React.createElement('output', null, result.calendarExtensionMessage);
  }
  try {
    const { container } = render(
      React.createElement('div', null, React.createElement(Probe), React.createElement(Probe)),
    );
    assert.equal(requests, 1);
    await act(async () => {
      resolve([{ date: '2026-11-04', avail: 1 }]);
      await pending;
    });
    await waitFor(() =>
      assert.match(container.textContent || '', /não têm disponibilidade confirmada/),
    );
  } finally {
    crcnBackendApi.getAccommodationCalendar = original;
  }
});

test('calendar expiration blocks old availability and refreshes an open consumer', async (context) => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.UTC(2026, 10, 3) });
  const originalFetch = globalThis.fetch;
  let requests = 0;
  let resolveRefresh!: (response: Response) => void;
  globalThis.fetch = async () => {
    requests += 1;
    if (requests > 1)
      return new Promise<Response>((resolve) => {
        resolveRefresh = resolve;
      });
    return new Response(
      JSON.stringify({
        data: [{ date: '2026-12-03', avail: 1 }],
        meta: { expiresAt: new Date(Date.now() + 80).toISOString() },
      }),
      { status: 200 },
    );
  };
  function Probe() {
    const result = usePropertyAvailability({
      property: STAYS_NET_APARTMENTS[0]!,
      checkIn: '',
      checkOut: '',
      guests: 2,
      todayIso: '2026-12-03',
    });
    return React.createElement(
      'output',
      null,
      JSON.stringify({ available: result.calendarAvailable, loading: result.isLoadingCalendar }),
    );
  }
  try {
    let container!: HTMLElement;
    await act(async () => {
      container = render(React.createElement(Probe)).container;
    });
    assert.match(container.textContent || '', /"available":true/);
    await act(async () => {
      context.mock.timers.tick(79);
    });
    assert.equal(requests, 1);
    await act(async () => {
      context.mock.timers.tick(1);
    });
    assert.equal(requests, 2);
    assert.match(container.textContent || '', /"available":false/);
    await act(async () => {
      resolveRefresh(
        new Response(JSON.stringify({ data: [{ date: '2026-12-03', avail: 0 }] }), { status: 200 }),
      );
    });
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
    context.mock.timers.reset();
  }
});

test('an expired server cache boundary recovers automatically without exposing expired dates', async (context) => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.UTC(2026, 10, 3) });
  const originalFetch = globalThis.fetch;
  let requests = 0;
  let state!: ReturnType<typeof usePropertyAvailability>;
  globalThis.fetch = async () => {
    requests += 1;
    return new Response(
      JSON.stringify({
        data: [{ date: '2026-12-09', avail: 1 }],
        meta: { expiresAt: new Date(Date.now() + (requests === 1 ? -1 : 40_000)).toISOString() },
      }),
    );
  };
  function Probe() {
    state = usePropertyAvailability({
      property: STAYS_NET_APARTMENTS[0]!,
      checkIn: '',
      checkOut: '',
      guests: 1,
      todayIso: '2026-12-09',
    });
    return null;
  }
  try {
    await act(async () => {
      render(React.createElement(Probe));
    });
    assert.equal(requests, 1);
    assert.equal(state.calendarAvailable, false);
    await act(async () => {
      context.mock.timers.tick(1249);
    });
    assert.equal(requests, 1);
    assert.equal(state.calendarAvailable, false);
    await act(async () => {
      context.mock.timers.tick(1);
    });
    assert.equal(state.calendarAvailable, true);
    assert.equal(requests, 2);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
    context.mock.timers.reset();
  }
});

test('persistently expired calendars stay blocked and do not cause an unlimited retry loop', async (context) => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.UTC(2026, 10, 3) });
  const originalFetch = globalThis.fetch;
  let requests = 0;
  let state!: ReturnType<typeof usePropertyAvailability>;
  globalThis.fetch = async () => {
    requests += 1;
    return new Response(
      JSON.stringify({
        data: [{ date: '2026-12-10', avail: 1 }],
        meta: { expiresAt: new Date(Date.now() - 1).toISOString() },
      }),
    );
  };
  function Probe() {
    state = usePropertyAvailability({
      property: STAYS_NET_APARTMENTS[0]!,
      checkIn: '',
      checkOut: '',
      guests: 1,
      todayIso: '2026-12-10',
    });
    return null;
  }
  try {
    await act(async () => {
      render(React.createElement(Probe));
    });
    assert.equal(state.calendarAvailable, false);
    await act(async () => {
      context.mock.timers.tick(1250);
    });
    assert.equal(state.isLoadingCalendar, false);
    assert.equal(state.calendarAvailable, false);
    assert.equal(requests, 2);
    assert.match(state.calendarMessage, /Não foi possível confirmar/);
    await act(async () => {
      context.mock.timers.tick(60_000);
    });
    assert.equal(requests, 2);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
    context.mock.timers.reset();
  }
});

test('retry after navigating beyond an incomplete initial window repairs that initial window', async () => {
  const original = crcnBackendApi.getAccommodationCalendar;
  const starts: Array<string | undefined> = [];
  crcnBackendApi.getAccommodationCalendar = async (_id, from) => {
    starts.push(from);
    return [{ date: from!, avail: 1 }];
  };
  let state!: ReturnType<typeof usePropertyAvailability>;
  function Probe() {
    state = usePropertyAvailability({
      property: STAYS_NET_APARTMENTS[0]!,
      checkIn: '',
      checkOut: '',
      guests: 2,
      todayIso: '2026-12-04',
    });
    return null;
  }
  try {
    render(React.createElement(Probe));
    await waitFor(() => assert.equal(state.calendarAvailable, true));
    await act(async () => {
      await state.loadCalendarThrough('2027-06-01');
    });
    await act(async () => {
      state.retryCalendarExtension();
    });
    await waitFor(() => assert.equal(starts.length, 3));
    assert.equal(starts[2], '2026-12-04');
  } finally {
    crcnBackendApi.getAccommodationCalendar = original;
  }
});

test('an extension expiring before the initial window triggers revalidation', async (context) => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.UTC(2026, 10, 3) });
  const originalFetch = globalThis.fetch;
  let extensionRequests = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), 'http://localhost');
    const from = url.searchParams.get('from')!;
    const to = url.searchParams.get('to')!;
    const days = [];
    for (
      const day = new Date(`${from}T00:00:00Z`);
      day.toISOString().slice(0, 10) <= to;
      day.setUTCDate(day.getUTCDate() + 1)
    ) {
      days.push({ date: day.toISOString().slice(0, 10), avail: 1 });
    }
    if (from !== '2026-12-05') extensionRequests += 1;
    const ttl = from === '2026-12-05' || extensionRequests > 1 ? 10_000 : 80;
    return new Response(
      JSON.stringify({ data: days, meta: { expiresAt: new Date(Date.now() + ttl).toISOString() } }),
      { status: 200 },
    );
  };
  let state!: ReturnType<typeof usePropertyAvailability>;
  function Probe() {
    state = usePropertyAvailability({
      property: STAYS_NET_APARTMENTS[0]!,
      checkIn: '',
      checkOut: '',
      guests: 2,
      todayIso: '2026-12-05',
    });
    return null;
  }
  try {
    await act(async () => {
      render(React.createElement(Probe));
    });
    assert.equal(state.calendarAvailable, true);
    await act(async () => {
      await state.loadCalendarThrough('2027-04-01');
    });
    assert.ok(state.calendarDays.some((day) => day.date === '2027-04-01'));
    assert.equal(extensionRequests, 1);
    await act(async () => {
      context.mock.timers.tick(79);
    });
    assert.equal(extensionRequests, 1);
    await act(async () => {
      context.mock.timers.tick(1);
    });
    assert.equal(extensionRequests, 2);
    assert.ok(state.calendarDays.some((day) => day.date === '2027-04-01'));
    assert.equal(state.calendarAvailable, true);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
    context.mock.timers.reset();
  }
});

test('a partial extension does not automatically retry after its merged days rerender', async () => {
  const original = crcnBackendApi.getAccommodationCalendar;
  let requests = 0;
  crcnBackendApi.getAccommodationCalendar = async (_id, from) => {
    requests += 1;
    return [{ date: from!, avail: 1 }];
  };
  let state!: ReturnType<typeof usePropertyAvailability>;
  function Probe() {
    const result = usePropertyAvailability({
      property: STAYS_NET_APARTMENTS[0]!,
      checkIn: '',
      checkOut: '',
      guests: 2,
      todayIso: '2026-12-06',
    });
    state = result;
    const { calendarCoverageEnd, loadCalendarThrough } = result;
    React.useEffect(() => {
      if (calendarCoverageEnd) void loadCalendarThrough('2027-06-01');
    }, [loadCalendarThrough, calendarCoverageEnd]);
    return null;
  }
  try {
    render(React.createElement(Probe));
    await waitFor(() => assert.match(state.calendarExtensionMessage, /Não foi possível consultar/));
    assert.equal(requests, 2);
    await act(async () => {
      await state.loadCalendarThrough('2027-06-01');
    });
    assert.equal(requests, 2);
  } finally {
    crcnBackendApi.getAccommodationCalendar = original;
  }
});

test('unpriced and unconfirmed days retain their states through cached windows and extensions', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  const statuses = ['available', 'unavailable', 'unpriced', 'unconfirmed'] as const;
  globalThis.fetch = async (input) => {
    requests += 1;
    const url = new URL(String(input), 'http://localhost');
    const from = url.searchParams.get('from')!;
    const to = url.searchParams.get('to')!;
    const days: import('../src/utils/staysAvailability.ts').StaysCalendarDay[] = [];
    for (
      const date = new Date(`${from}T00:00:00Z`);
      date.toISOString().slice(0, 10) <= to;
      date.setUTCDate(date.getUTCDate() + 1)
    ) {
      const availabilityStatus = statuses[days.length % statuses.length]!;
      days.push({
        date: date.toISOString().slice(0, 10),
        avail: availabilityStatus === 'available' ? 1 : 0,
        availabilityStatus,
      });
    }
    return new Response(
      JSON.stringify({
        data: days,
        meta: { expiresAt: new Date(Date.now() + 40_000).toISOString() },
      }),
      { status: 200 },
    );
  };
  let state!: ReturnType<typeof usePropertyAvailability>;
  function Probe() {
    state = usePropertyAvailability({
      property: STAYS_NET_APARTMENTS[0]!,
      checkIn: '',
      checkOut: '',
      guests: 2,
      todayIso: '2026-12-07',
    });
    return null;
  }
  try {
    render(React.createElement(Probe));
    await waitFor(() => assert.equal(state.calendarAvailable, true));
    assert.equal(state.calendarExtensionMessage, '');
    assert.deepEqual(
      state.calendarDays.slice(0, 4).map((day) => day.availabilityStatus),
      statuses,
    );
    await act(async () => {
      await state.loadCalendarThrough('2027-04-01');
    });
    const extendedDays = state.calendarDays;
    assert.ok(extendedDays.length > 91);
    assert.equal(state.calendarExtensionMessage, '');
    await act(async () => {
      state.revalidateCalendar();
    });
    await waitFor(() => assert.equal(state.calendarAvailable, true));
    await act(async () => {
      await state.loadCalendarThrough('2027-04-01');
    });
    assert.deepEqual(state.calendarDays, extendedDays);
    assert.equal(requests, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fresh reopen and equivalent property identity retain data; failed background refresh keeps the visible snapshot', async () => {
  const original = crcnBackendApi.getAccommodationCalendar;
  const property = STAYS_NET_APARTMENTS[0]!;
  const days = Array.from({ length: 91 }, (_, offset) => ({
    date: new Date(Date.UTC(2026, 11, 8 + offset)).toISOString().slice(0, 10),
    avail: 1,
  }));
  let requests = 0;
  let resolveRefresh!: (result: typeof days) => void;
  crcnBackendApi.getAccommodationCalendar = async () => {
    requests += 1;
    return requests === 1
      ? days
      : new Promise((resolve) => {
          resolveRefresh = resolve;
        });
  };
  let state!: ReturnType<typeof usePropertyAvailability>;
  function Probe({ clone = false }: { clone?: boolean }) {
    state = usePropertyAvailability({
      property: clone ? { ...property } : property,
      checkIn: '',
      checkOut: '',
      guests: 2,
      todayIso: '2026-12-08',
    });
    return null;
  }
  try {
    const view = render(React.createElement(Probe));
    await waitFor(() => assert.equal(state.calendarAvailable, true));
    view.rerender(React.createElement(Probe, { clone: true }));
    await act(async () => state.revalidateCalendar());
    assert.equal(requests, 1);
    const snapshot = state.calendarDays;
    await act(async () => state.retryCalendar());
    assert.equal(state.isRefreshingCalendar, true);
    assert.equal(state.isLoadingCalendar, false);
    assert.equal(state.calendarDays, snapshot);
    await act(async () => resolveRefresh([]));
    assert.equal(state.calendarDays, snapshot);
    assert.equal(state.calendarAvailable, false);
    assert.equal(state.isRefreshingCalendar, false);
    assert.match(state.calendarMessage, /Não foi possível confirmar/);
  } finally {
    crcnBackendApi.getAccommodationCalendar = original;
  }
});

test('an older extension cannot overwrite a refreshed snapshot for the same listing', async () => {
  const original = crcnBackendApi.getAccommodationCalendar;
  const initial = Array.from({ length: 91 }, (_, offset) => ({
    date: new Date(Date.UTC(2026, 11, 9 + offset)).toISOString().slice(0, 10),
    avail: 1,
  }));
  let requests = 0;
  let resolveExtension!: (result: typeof initial) => void;
  crcnBackendApi.getAccommodationCalendar = async () => {
    requests += 1;
    if (requests === 1) return initial;
    if (requests === 2)
      return new Promise((resolve) => {
        resolveExtension = resolve;
      });
    return initial.map((day) => ({ ...day, avail: 0 }));
  };
  let state!: ReturnType<typeof usePropertyAvailability>;
  function Probe() {
    state = usePropertyAvailability({
      property: STAYS_NET_APARTMENTS[0]!,
      checkIn: '',
      checkOut: '',
      guests: 2,
      todayIso: '2026-12-09',
    });
    return null;
  }
  try {
    render(React.createElement(Probe));
    await waitFor(() => assert.equal(state.calendarAvailable, true));
    let pending!: Promise<void>;
    await act(async () => {
      pending = state.loadCalendarThrough('2027-06-01');
    });
    await act(async () => state.retryCalendar());
    await waitFor(() => assert.equal(state.calendarDays[0]?.avail, 0));
    await act(async () => {
      resolveExtension([{ date: '2027-03-10', avail: 1 }]);
      await pending;
    });
    assert.equal(state.calendarDays[0]?.avail, 0);
    assert.equal(state.calendarDays.length, 91);
  } finally {
    crcnBackendApi.getAccommodationCalendar = original;
  }
});
