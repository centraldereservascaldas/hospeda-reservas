import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import { STAYS_NET_APARTMENTS } from '../src/data/staysApartments.ts';
import { crcnBackendApi } from '../src/services/crcnBackendApi.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/checkout/nova',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle,
});
const { cleanup, renderHook, waitFor } = await import('@testing-library/react');
const { useCheckoutDraftRecovery } = await import('../src/hooks/useCheckoutDraftRecovery.ts');
const originalProperty = crcnBackendApi.getAccommodationById;
const originalCatalog = crcnBackendApi.getAccommodations;
const originalCalendar = crcnBackendApi.getAccommodationCalendar;
const originalPrice = crcnBackendApi.calculatePrice;
afterEach(() => {
  cleanup();
  crcnBackendApi.getAccommodationById = originalProperty;
  crcnBackendApi.getAccommodations = originalCatalog;
  crcnBackendApi.getAccommodationCalendar = originalCalendar;
  crcnBackendApi.calculatePrice = originalPrice;
  window.sessionStorage.clear();
});

const property = { ...STAYS_NET_APARTMENTS[0]!, simulatedData: false };
const guests = { adults: 2, children: 0, infants: 0, pets: 0 };
const draft = { propertyId: property.id, checkIn: '2027-03-01', checkOut: '2027-03-03', guests };
const quote = {
  success: true,
  listingId: property.id,
  nights: 2,
  dailyRate: 100,
  baseTotal: 200,
  cleaningFee: 0,
  serviceFee: 0,
  discount: 0,
  total: 200,
  currency: 'BRL' as const,
  source: 'stays-live' as const,
  breakdown: { dailyRateText: '', cleaningFeeText: '', serviceFeeText: '', totalText: '' },
};
const calendar = ['2027-03-01', '2027-03-02', '2027-03-03'].map((date) => ({ date, avail: 1 }));

test('reload revalidates calendar and price before restoring the checkout', async () => {
  window.history.replaceState(
    { __crcnCheckoutDraftId: '12345678-1234-1234-1234-123456789abc' },
    '',
    '/checkout/nova',
  );
  window.sessionStorage.setItem(
    'crcn.checkout.draft.v1.12345678-1234-1234-1234-123456789abc',
    JSON.stringify(draft),
  );
  let calendarCalls = 0,
    priceCalls = 0;
  crcnBackendApi.getAccommodationCalendar = async () => {
    calendarCalls++;
    return calendar;
  };
  crcnBackendApi.calculatePrice = async () => {
    priceCalls++;
    return quote;
  };
  let restored: unknown = null;
  let propertyCalls = 0;
  crcnBackendApi.getAccommodationById = async () => {
    propertyCalls++;
    return property;
  };
  const setPayload = (payload: unknown) => {
    restored = payload;
  };
  renderHook(() => useCheckoutDraftRecovery(null, setPayload, 0));
  await waitFor(() => assert.ok(restored));
  assert.equal(propertyCalls, 1);
  assert.equal(calendarCalls, 1);
  assert.equal(priceCalls, 1);
  assert.equal((restored as { totalAmount: number }).totalAmount, 200);
});

test('unavailable dates fail closed and do not restore checkout', async () => {
  window.history.replaceState(
    { __crcnCheckoutDraftId: '12345678-1234-1234-1234-123456789abc' },
    '',
    '/checkout/nova',
  );
  window.sessionStorage.setItem(
    'crcn.checkout.draft.v1.12345678-1234-1234-1234-123456789abc',
    JSON.stringify(draft),
  );
  crcnBackendApi.getAccommodationCalendar = async () => [{ date: '2027-03-01', avail: 0 }];
  crcnBackendApi.calculatePrice = async () => quote;
  crcnBackendApi.getAccommodationById = async () => property;
  let restored: unknown = null;
  const setPayload = (payload: unknown) => {
    restored = payload;
  };
  const { result } = renderHook(() => useCheckoutDraftRecovery(null, setPayload, 0));
  await waitFor(() => assert.equal(result.current.status, 'error'));
  assert.equal(restored, null);
});

test('fetches a property absent from the loaded catalog', async () => {
  window.history.replaceState(
    { __crcnCheckoutDraftId: '12345678-1234-1234-1234-123456789abc' },
    '',
    '/checkout/nova',
  );
  window.sessionStorage.setItem(
    'crcn.checkout.draft.v1.12345678-1234-1234-1234-123456789abc',
    JSON.stringify(draft),
  );
  let requested = '';
  crcnBackendApi.getAccommodationById = async (id) => {
    requested = id;
    return property;
  };
  crcnBackendApi.getAccommodationCalendar = async () => calendar;
  crcnBackendApi.calculatePrice = async () => quote;
  let restored: unknown = null;
  const setPayload = (payload: unknown) => {
    restored = payload;
  };
  renderHook(() => useCheckoutDraftRecovery(null, setPayload, 0));
  await waitFor(() => assert.ok(restored));
  assert.equal(requested, property.id);
});

test('retry fetches the missing property again after a failed lookup', async () => {
  window.history.replaceState(
    { __crcnCheckoutDraftId: '12345678-1234-1234-1234-123456789abc' },
    '',
    '/checkout/nova',
  );
  window.sessionStorage.setItem(
    'crcn.checkout.draft.v1.12345678-1234-1234-1234-123456789abc',
    JSON.stringify(draft),
  );
  let calls = 0;
  crcnBackendApi.getAccommodationById = async () => (++calls === 1 ? null : property);
  crcnBackendApi.getAccommodationCalendar = async () => calendar;
  crcnBackendApi.calculatePrice = async () => quote;
  let restored: unknown = null;
  const setPayload = (payload: unknown) => {
    restored = payload;
  };
  const { result } = renderHook(() => useCheckoutDraftRecovery(null, setPayload, 0));
  await waitFor(() => assert.equal(result.current.status, 'error'));
  result.current.retry();
  await waitFor(() => assert.ok(restored));
  assert.equal(calls, 2);
});

test('direct checkout starts property recovery without loading the catalog and accepts a trailing slash', async () => {
  window.history.replaceState(
    null,
    '',
    `/checkout/?accommodation=${property.id}&checkin=2027-03-01&checkout=2027-03-03&adults=2`,
  );
  let propertyRequested = '';
  let catalogCalls = 0;
  crcnBackendApi.getAccommodationById = async (id) => {
    propertyRequested = id;
    return property;
  };
  crcnBackendApi.getAccommodations = async () => {
    catalogCalls++;
    throw new Error('O checkout direto não deve carregar o catálogo completo.');
  };
  crcnBackendApi.getAccommodationCalendar = async () => calendar;
  crcnBackendApi.calculatePrice = async () => quote;
  let restored: unknown = null;
  const setPayload = (payload: unknown) => {
    restored = payload;
  };

  const { result } = renderHook(() => useCheckoutDraftRecovery(null, setPayload, 0));
  assert.equal(result.current.status, 'loading');
  await waitFor(() => assert.ok(restored));
  assert.equal(propertyRequested, property.id);
  assert.equal(catalogCalls, 0);
});
