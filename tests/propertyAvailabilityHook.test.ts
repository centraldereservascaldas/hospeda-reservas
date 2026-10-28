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
      [property.staysListingId || property.id, '2026-11-11', '2027-02-09'],
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
