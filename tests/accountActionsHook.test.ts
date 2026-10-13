import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import type { Reservation } from '../src/types/index.ts';
import type { OwnerAccessStatus as ApiOwnerAccessStatus } from '../src/services/crcnBackendApi.ts';
import type { OwnerAccessStatus } from '../src/hooks/useAccountWorkspaceData.ts';

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
const { useAccountActions } = await import('../src/hooks/useAccountActions.ts');
type AccountModalMode = import('../src/hooks/useSupabaseSession.ts').AccountModalMode;

const reservation = { id: 'reservation-1', status: 'confirmed' } as Reservation;

function renderAccountActions(
  options: {
    accessToken?: string;
    ownerAccessStatus?: OwnerAccessStatus;
    isOwnerAdmin?: boolean;
    api?: {
      cancelMyReservation: (id: string, token: string) => Promise<void>;
      getMyReservations: (token: string) => Promise<Reservation[]>;
      requestOwnerAccess: (token: string) => Promise<ApiOwnerAccessStatus>;
    };
    signOut?: () => Promise<void>;
  } = {},
) {
  return renderHook(() => {
    const [reservations, setReservations] = useState<Reservation[]>([reservation]);
    const [ownerAccessStatus, setOwnerAccessStatus] = useState<OwnerAccessStatus>(
      options.ownerAccessStatus ?? 'none',
    );
    const [accountModalMode, setAccountModalMode] = useState<AccountModalMode>(null);
    const [authCallbackNotice, setAuthCallbackNotice] = useState('');
    const [currentView, setCurrentView] = useState<
      'explore' | 'trips' | 'wishlists' | 'host' | 'ownerAdmin'
    >('explore');
    const actions = useAccountActions({
      accessToken: options.accessToken,
      ownerAccessStatus: ownerAccessStatus,
      isOwnerAdmin: options.isOwnerAdmin ?? false,
      setReservations,
      setOwnerAccessStatus,
      setAccountModalMode,
      setAuthCallbackNotice,
      setCurrentView,
      api: options.api,
      signOut: options.signOut,
    });
    return {
      ...actions,
      reservations,
      ownerAccessStatus,
      accountModalMode,
      authCallbackNotice,
      currentView,
    };
  });
}

afterEach(() => cleanup());

test('cancels a reservation, preserves the confirmed status if refresh fails, and uses the session token', async () => {
  const calls: string[] = [];
  const hook = renderAccountActions({
    accessToken: 'session-token',
    api: {
      cancelMyReservation: async (id, token) => {
        calls.push(`cancel:${id}:${token}`);
      },
      getMyReservations: async (token) => {
        calls.push(`refresh:${token}`);
        throw new Error('refresh unavailable');
      },
      requestOwnerAccess: async () => 'pending',
    },
  });

  await act(async () => hook.result.current.handleCancelReservation(reservation.id));

  assert.deepEqual(calls, ['cancel:reservation-1:session-token', 'refresh:session-token']);
  assert.equal(hook.result.current.reservations[0]?.status, 'cancelled');
});

test('requires a session to cancel and opens login when requesting owner access', async () => {
  const hook = renderAccountActions();
  await assert.rejects(
    hook.result.current.handleCancelReservation(reservation.id),
    /Entre na sua conta/,
  );

  await act(async () => hook.result.current.handleRequestOwnerAccess());

  assert.equal(hook.result.current.accountModalMode, 'login');
  assert.equal(hook.result.current.ownerRequestLoading, false);
});

test('records a pending owner request and reports failures', async () => {
  const pending = renderAccountActions({
    accessToken: 'session-token',
    api: {
      cancelMyReservation: async () => undefined,
      getMyReservations: async () => [],
      requestOwnerAccess: async (token) => {
        assert.equal(token, 'session-token');
        return 'pending';
      },
    },
  });
  await act(async () => pending.result.current.handleRequestOwnerAccess());
  assert.equal(pending.result.current.ownerAccessStatus, 'pending');
  assert.match(pending.result.current.authCallbackNotice, /enviada para análise/);

  pending.unmount();
  const failed = renderAccountActions({
    accessToken: 'session-token',
    api: {
      cancelMyReservation: async () => undefined,
      getMyReservations: async () => [],
      requestOwnerAccess: async () => {
        throw new Error('request unavailable');
      },
    },
  });
  await act(async () => failed.result.current.handleRequestOwnerAccess());
  assert.equal(failed.result.current.ownerAccessStatus, 'unavailable');
  assert.equal(failed.result.current.authCallbackNotice, 'request unavailable');
  assert.equal(failed.result.current.ownerRequestLoading, false);
});

test('restricts host/admin views and delegates sign-out', async () => {
  let signOutCalls = 0;
  const hook = renderAccountActions({
    signOut: async () => {
      signOutCalls += 1;
    },
  });

  await act(async () => {
    hook.result.current.handleSetCurrentView('host');
    hook.result.current.handleSetCurrentView('ownerAdmin');
  });
  assert.equal(hook.result.current.currentView, 'explore');

  await act(async () => hook.result.current.handleSetCurrentView('trips'));
  assert.equal(hook.result.current.currentView, 'trips');
  await act(async () => hook.result.current.handleSignOut());
  assert.equal(signOutCalls, 1);
});
