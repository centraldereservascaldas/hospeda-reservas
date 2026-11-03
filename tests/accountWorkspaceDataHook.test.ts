import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import type { Reservation } from '../src/types';
import type { MainView } from '../src/components/MobileBottomNavigation';

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
const { act, cleanup, renderHook, waitFor } = await import('@testing-library/react');
const { useAccountWorkspaceData } = await import('../src/hooks/useAccountWorkspaceData.ts');
const { crcnBackendApi } = await import('../src/services/crcnBackendApi.ts');

const reservation = (id: string) =>
  ({
    id,
    code: id,
    propertyId: 'JQ08G',
    propertyTitle: 'Lacqua DiRoma IV',
    propertyLocation: 'Caldas Novas',
    propertyImage: 'https://example.test/property.jpg',
    checkIn: '2026-11-11',
    checkOut: '2026-11-13',
    nights: 2,
    guests: { adults: 1, children: 0, infants: 0, pets: 0 },
    pricePerNight: 350,
    cleaningFee: 150,
    serviceFee: 0,
    discount: 0,
    totalAmount: 850,
    paymentMethod: 'pix',
    status: 'confirmed',
    createdAt: '2026-10-01T12:00:00Z',
    hostName: 'CRCN',
    guestName: 'Guest',
    guestEmail: 'guest@example.test',
    guestPhone: '',
    staysReservationId: id,
    staysSyncStatus: 'synced',
  }) as Reservation;

const renderWorkspace = (token: string | undefined, initialView: MainView = 'explore') =>
  renderHook(
    ({ accessToken, view }: { accessToken: string | undefined; view: MainView }) => {
      const [currentView, setCurrentView] = React.useState<MainView>(view);
      const currentViewRef = React.useRef(currentView);
      currentViewRef.current = currentView;
      const result = useAccountWorkspaceData({
        accessToken,
        currentViewRef,
        setCurrentView,
      });
      return { ...result, currentView, setCurrentView };
    },
    { initialProps: { accessToken: token, view: initialView } },
  );

afterEach(() => {
  cleanup();
});

test('loads reservations and owner permissions with the current access token', async () => {
  const originals = {
    reservations: crcnBackendApi.getMyReservations,
    ownerAccess: crcnBackendApi.getOwnerAccess,
    ownerAdmin: crcnBackendApi.getOwnerAdminStatus,
  };
  const calls: string[] = [];
  crcnBackendApi.getMyReservations = async (token) => {
    calls.push(`reservations:${token}`);
    return [reservation('reservation-live')];
  };
  crcnBackendApi.getOwnerAccess = async (token) => {
    calls.push(`owner:${token}`);
    return 'approved';
  };
  crcnBackendApi.getOwnerAdminStatus = async (token) => {
    calls.push(`admin:${token}`);
    return { isAdmin: true, canManagePayments: false };
  };

  try {
    const { result } = renderWorkspace('access-token');
    await waitFor(() => {
      assert.equal(result.current.reservations[0]?.id, 'reservation-live');
      assert.equal(result.current.ownerAccessStatus, 'approved');
      assert.equal(result.current.isOwnerAdmin, true);
    });
    assert.deepEqual(calls.sort(), [
      'admin:access-token',
      'owner:access-token',
      'reservations:access-token',
    ]);
  } finally {
    crcnBackendApi.getMyReservations = originals.reservations;
    crcnBackendApi.getOwnerAccess = originals.ownerAccess;
    crcnBackendApi.getOwnerAdminStatus = originals.ownerAdmin;
  }
});

test('ignores responses from a previous account after the access token changes', async () => {
  const originals = {
    reservations: crcnBackendApi.getMyReservations,
    ownerAccess: crcnBackendApi.getOwnerAccess,
    ownerAdmin: crcnBackendApi.getOwnerAdminStatus,
  };
  const oldReservations = deferred<Reservation[]>();
  const newReservations = deferred<Reservation[]>();
  const oldOwnerAccess = deferred<'approved' | 'pending'>();
  const newOwnerAccess = deferred<'approved' | 'pending'>();
  const oldOwnerAdmin = deferred<{ isAdmin: boolean; canManagePayments: boolean }>();
  const newOwnerAdmin = deferred<{ isAdmin: boolean; canManagePayments: boolean }>();
  crcnBackendApi.getMyReservations = (token) =>
    token === 'old-token' ? oldReservations.promise : newReservations.promise;
  crcnBackendApi.getOwnerAccess = (token) =>
    token === 'old-token' ? oldOwnerAccess.promise : newOwnerAccess.promise;
  crcnBackendApi.getOwnerAdminStatus = (token) =>
    token === 'old-token' ? oldOwnerAdmin.promise : newOwnerAdmin.promise;

  try {
    const { result, rerender } = renderWorkspace('old-token');
    rerender({ accessToken: 'new-token', view: 'explore' });

    await act(async () => {
      newReservations.resolve([reservation('new-account')]);
      newOwnerAccess.resolve('pending');
      newOwnerAdmin.resolve({ isAdmin: false, canManagePayments: false });
    });
    await waitFor(() => {
      assert.equal(result.current.reservations[0]?.id, 'new-account');
      assert.equal(result.current.ownerAccessStatus, 'pending');
      assert.equal(result.current.isOwnerAdmin, false);
    });

    await act(async () => {
      oldReservations.resolve([reservation('old-account')]);
      oldOwnerAccess.resolve('approved');
      oldOwnerAdmin.resolve({ isAdmin: true, canManagePayments: true });
    });
    assert.equal(result.current.reservations[0]?.id, 'new-account');
    assert.equal(result.current.ownerAccessStatus, 'pending');
    assert.equal(result.current.isOwnerAdmin, false);
  } finally {
    crcnBackendApi.getMyReservations = originals.reservations;
    crcnBackendApi.getOwnerAccess = originals.ownerAccess;
    crcnBackendApi.getOwnerAdminStatus = originals.ownerAdmin;
  }
});

test('clears signed-out data and redirects from owner views; admin denial redirects too', async () => {
  const originals = {
    reservations: crcnBackendApi.getMyReservations,
    ownerAccess: crcnBackendApi.getOwnerAccess,
    ownerAdmin: crcnBackendApi.getOwnerAdminStatus,
  };
  crcnBackendApi.getMyReservations = async () => [reservation('reservation-live')];
  crcnBackendApi.getOwnerAccess = async () => 'approved';
  crcnBackendApi.getOwnerAdminStatus = async () => ({ isAdmin: false, canManagePayments: false });

  try {
    const { result, rerender } = renderWorkspace('access-token', 'ownerAdmin');
    await waitFor(() => assert.equal(result.current.currentView, 'explore'));
    assert.equal(result.current.ownerAccessStatus, 'approved');

    act(() => result.current.setCurrentView('host'));
    rerender({ accessToken: undefined, view: 'host' });
    await waitFor(() => {
      assert.equal(result.current.currentView, 'explore');
      assert.deepEqual(result.current.reservations, []);
      assert.equal(result.current.ownerAccessStatus, 'none');
      assert.equal(result.current.isOwnerAdmin, false);
    });
  } finally {
    crcnBackendApi.getMyReservations = originals.reservations;
    crcnBackendApi.getOwnerAccess = originals.ownerAccess;
    crcnBackendApi.getOwnerAdminStatus = originals.ownerAdmin;
  }
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
