import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import type { Dispatch, SetStateAction } from 'react';
import { STAYS_NET_APARTMENTS } from '../src/data/staysApartments.ts';
import type { AppOverlayBookingPayload } from '../src/types/booking.ts';
import { createDefaultSearchFilters } from '../src/utils/searchUrlState.ts';

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

const { act, cleanup, renderHook } = await import('@testing-library/react');
const { useState } = await import('react');
const { useAppOverlayActions } = await import('../src/hooks/useAppOverlayActions.ts');

afterEach(cleanup);

function renderOverlayActions(options: { scrollCatalog?: () => void } = {}) {
  const [firstProperty, secondProperty] = STAYS_NET_APARTMENTS;
  assert.ok(firstProperty);
  assert.ok(secondProperty);
  const calls: string[] = [];

  return renderHook(() => {
    const [properties, setProperties] = useState([firstProperty]);
    const [filters, setFilters] = useState(createDefaultSearchFilters());
    const [isSofiaOpen, setIsSofiaOpen] = useState(true);
    const [bookingPayload, setBookingPayload] = useState<AppOverlayBookingPayload | null>(null);
    const setIsSofiaOpenWithTracking: Dispatch<SetStateAction<boolean>> = (action) => {
      calls.push('close-sofia');
      setIsSofiaOpen(action);
    };
    const setBookingPayloadWithTracking: Dispatch<
      SetStateAction<AppOverlayBookingPayload | null>
    > = (action) => {
      calls.push('set-booking-payload');
      setBookingPayload(action);
    };
    const actions = useAppOverlayActions({
      setProperties,
      setFilters,
      setIsSofiaOpen: setIsSofiaOpenWithTracking,
      setBookingPayload: setBookingPayloadWithTracking,
      onSelectProperty: (property) => calls.push(`select:${property.id}`),
      scrollCatalog: options.scrollCatalog,
    });

    return {
      ...actions,
      properties,
      filters,
      isSofiaOpen,
      bookingPayload,
      secondProperty,
      calls,
    };
  });
}

test('applies Sofia destination and guests without resetting other filters', async () => {
  let scrollCalls = 0;
  const hook = renderOverlayActions({ scrollCatalog: () => (scrollCalls += 1) });
  const initialCheckIn = hook.result.current.filters.checkIn;

  await act(async () => {
    hook.result.current.handleAssistantApplyFilters({ destination: 'Caldas Novas', guests: 4 });
  });

  assert.equal(hook.result.current.filters.destination, 'Caldas Novas');
  assert.equal(hook.result.current.filters.guests.adults, 4);
  assert.equal(hook.result.current.filters.checkIn, initialCheckIn);
  assert.equal(hook.result.current.isSofiaOpen, false);
  assert.equal(scrollCalls, 1);
});

test('selects the Sofia property only after closing its assistant', () => {
  const hook = renderOverlayActions();
  const property = hook.result.current.secondProperty;

  act(() => hook.result.current.handleSelectPropertyFromSofia(property));

  assert.deepEqual(hook.result.current.calls, ['close-sofia', `select:${property.id}`]);
  assert.equal(hook.result.current.isSofiaOpen, false);
});

test('closes property detail before handing the booking payload to checkout state', () => {
  const hook = renderOverlayActions();
  const property = hook.result.current.secondProperty;
  const payload: AppOverlayBookingPayload = {
    property,
    checkIn: '2027-03-01',
    checkOut: '2027-03-03',
    guests: { adults: 2, children: 0, infants: 0, pets: 0 },
    nights: 2,
    totalAmount: 200,
    cleaningFee: 0,
    serviceFee: 0,
    discount: 0,
    quote: {
      success: true,
      listingId: property.id,
      staysListingId: property.staysListingId,
      nights: 2,
      dailyRate: 100,
      baseTotal: 200,
      cleaningFee: 0,
      serviceFee: 0,
      discount: 0,
      total: 200,
      currency: 'BRL',
      source: 'stays-live',
      breakdown: {
        dailyRateText: 'R$ 100 x 2 noites',
        cleaningFeeText: 'Sem taxa de limpeza',
        serviceFeeText: 'Sem taxa de serviço',
        totalText: 'R$ 200',
      },
    },
  };

  act(() => hook.result.current.handleStartBooking(payload));

  assert.deepEqual(hook.result.current.calls, ['set-booking-payload']);
  assert.equal(hook.result.current.bookingPayload, payload);
});

test('prepends a new listing using a functional catalog update', () => {
  const hook = renderOverlayActions();
  const property = hook.result.current.secondProperty;

  act(() => hook.result.current.handleAddNewProperty(property));

  assert.deepEqual(
    hook.result.current.properties.map((item) => item.id),
    [property.id, STAYS_NET_APARTMENTS[0]?.id],
  );
});
