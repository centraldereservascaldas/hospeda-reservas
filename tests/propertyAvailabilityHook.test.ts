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
const { render, cleanup, waitFor } = await import('@testing-library/react');
const { usePropertyAvailability } =
  await import('../src/components/property/usePropertyAvailability.ts');
const { crcnBackendApi } = await import('../src/services/crcnBackendApi.ts');

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
        staysPrice: result.staysPrice,
      }),
    );
  }

  try {
    const { container } = render(React.createElement(Probe));
    await waitFor(() => {
      assert.match(container.textContent || '', /Não foi possível confirmar a disponibilidade/);
      assert.match(container.textContent || '', /"isCalculatingPrice":false/);
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
