import { useEffect, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';

export type AccountModalMode = 'login' | 'signup' | 'recovery' | null;

interface UseSupabaseSessionOptions {
  isConfigured: boolean;
  initialHash: string;
  initialAuthCallbackError: string;
  loadClient?: () => Promise<{ supabase: SupabaseClient | null }>;
}

const loadConfiguredClient = () => import('../services/supabase');

export function useSupabaseSession({
  isConfigured,
  initialHash,
  initialAuthCallbackError,
  loadClient = loadConfiguredClient,
}: UseSupabaseSessionOptions) {
  const [accountSession, setAccountSession] = useState<Session | null>(null);
  const [accountModalMode, setAccountModalMode] = useState<AccountModalMode>(null);
  const [authCallbackNotice, setAuthCallbackNotice] = useState('');

  useEffect(() => {
    if (!authCallbackNotice) return;

    const dismissTimer = window.setTimeout(() => setAuthCallbackNotice(''), 7000);
    return () => window.clearTimeout(dismissTimer);
  }, [authCallbackNotice]);

  useEffect(() => {
    const authHash = new URLSearchParams(initialHash.slice(1));
    if (authHash.get('type') === 'recovery') setAccountModalMode('recovery');
    if (initialAuthCallbackError) {
      const expiredLink = /otp_expired|link is invalid|has expired/i.test(initialAuthCallbackError);
      setAuthCallbackNotice(
        expiredLink
          ? 'Este link expirou ou já foi usado. Solicite um novo e-mail de recuperação e abra o link mais recente.'
          : `Não foi possível concluir o acesso: ${initialAuthCallbackError}`,
      );
    }
    if (!isConfigured) return;

    let isMounted = true;
    let unsubscribeAuth: (() => void) | undefined;

    const handleConfirmedSession = (session: Session | null) => {
      if (!isMounted) return;
      if (localStorage.getItem('hospeda_pending_email_confirmation') !== 'true') return;
      if (!session?.user.email_confirmed_at) return;
      localStorage.removeItem('hospeda_pending_email_confirmation');
      setAuthCallbackNotice(
        'E-mail confirmado! Volte à reserva e entre na sua conta para continuar.',
      );
    };

    const bootstrapTimer = window.setTimeout(() => {
      void (async () => {
        try {
          const { supabase } = await loadClient();
          if (!isMounted || !supabase) return;
          const {
            data: { subscription },
          } = supabase.auth.onAuthStateChange((event, session) => {
            if (!isMounted) return;
            setAccountSession(session);
            if (event === 'PASSWORD_RECOVERY') setAccountModalMode('recovery');
            if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
              handleConfirmedSession(session);
            }
          });
          unsubscribeAuth = () => subscription.unsubscribe();
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (!isMounted) return;
          setAccountSession(session);
          handleConfirmedSession(session);
        } catch {
          if (isMounted) {
            setAuthCallbackNotice(
              'Não foi possível verificar sua sessão. Tente atualizar a página.',
            );
          }
        }
      })();
    }, 0);

    return () => {
      isMounted = false;
      window.clearTimeout(bootstrapTimer);
      unsubscribeAuth?.();
    };
  }, [initialAuthCallbackError, initialHash, isConfigured, loadClient]);

  return {
    accountSession,
    accountModalMode,
    setAccountModalMode,
    authCallbackNotice,
    setAuthCallbackNotice,
  };
}
