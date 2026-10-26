import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
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
const { useSupabaseSession } = await import('../src/hooks/useSupabaseSession.ts');

const session = {
  access_token: 'session-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 1_900_000_000,
  refresh_token: 'refresh-token',
  user: {
    id: 'user-1',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-10-01T00:00:00Z',
    email: 'guest@example.test',
    email_confirmed_at: '2026-10-01T00:00:00Z',
  },
} as Session;

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function makeSupabaseClient(
  onSubscribe: (callback: (event: AuthChangeEvent, value: Session | null) => void) => void,
  onUnsubscribe: () => void = () => {},
): SupabaseClient {
  return {
    auth: {
      onAuthStateChange: (callback: (event: AuthChangeEvent, session: Session | null) => void) => {
        onSubscribe(callback);
        return { data: { subscription: { unsubscribe: onUnsubscribe } } };
      },
      getSession: async () => ({ data: { session }, error: null }),
    },
  } as unknown as SupabaseClient;
}

test('restores session, subscribes to auth changes, and handles recovery and email confirmation', async () => {
  localStorage.setItem('hospeda_pending_email_confirmation', 'true');
  let authCallback: ((event: AuthChangeEvent, value: Session | null) => void) | undefined;
  const client = makeSupabaseClient((callback) => {
    authCallback = callback;
  });
  const loadClient = async () => ({ supabase: client });

  const { result, unmount } = renderHook(() =>
    useSupabaseSession({
      isConfigured: true,
      initialHash: '#type=recovery',
      initialAuthCallbackError: '',
      loadClient,
    }),
  );

  await waitFor(() => {
    assert.equal(result.current.accountSession, session);
    assert.equal(
      result.current.authCallbackNotice,
      'E-mail confirmado! Volte à reserva e entre na sua conta para continuar.',
    );
    assert.equal(result.current.accountModalMode, 'recovery');
  });
  assert.equal(localStorage.getItem('hospeda_pending_email_confirmation'), null);
  assert.ok(authCallback);

  act(() => authCallback?.('SIGNED_OUT', null));
  assert.equal(result.current.accountSession, null);
  unmount();
});

test('reports session restore failures and skips auth loading when unconfigured', async () => {
  const loadConfiguredClient = async () => {
    throw new Error('session unavailable');
  };
  const configured = renderHook(() =>
    useSupabaseSession({
      isConfigured: true,
      initialHash: '',
      initialAuthCallbackError: 'link expirado',
      loadClient: loadConfiguredClient,
    }),
  );
  await waitFor(() =>
    assert.equal(
      configured.result.current.authCallbackNotice,
      'Não foi possível verificar sua sessão. Tente atualizar a página.',
    ),
  );
  configured.unmount();

  let loadCount = 0;
  const unconfigured = renderHook(() =>
    useSupabaseSession({
      isConfigured: false,
      initialHash: '#type=recovery',
      initialAuthCallbackError: 'link inválido',
      loadClient: async () => {
        loadCount += 1;
        return { supabase: null };
      },
    }),
  );
  await waitFor(() => assert.equal(unconfigured.result.current.accountModalMode, 'recovery'));
  assert.equal(
    unconfigured.result.current.authCallbackNotice,
    'Não foi possível concluir o acesso: link inválido',
  );
  assert.equal(loadCount, 0);
  unconfigured.unmount();
});

test('unsubscribes when unmounted after the auth listener is registered', async () => {
  let subscribeCount = 0;
  let unsubscribeCount = 0;
  const client = makeSupabaseClient(
    () => {
      subscribeCount += 1;
    },
    () => {
      unsubscribeCount += 1;
    },
  );
  const loadClient = async () => ({ supabase: client });
  const { unmount } = renderHook(() =>
    useSupabaseSession({
      isConfigured: true,
      initialHash: '',
      initialAuthCallbackError: '',
      loadClient,
    }),
  );
  await waitFor(() => assert.equal(subscribeCount, 1));
  unmount();
  assert.equal(unsubscribeCount, 1);
});
