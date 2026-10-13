import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Reservation } from '../types';
import { crcnBackendApi } from '../services/crcnBackendApi';
import type { OwnerAccessStatus as ApiOwnerAccessStatus } from '../services/crcnBackendApi';
import type { MainView } from '../components/MobileBottomNavigation';
import type { AccountModalMode } from './useSupabaseSession';
import type { OwnerAccessStatus } from './useAccountWorkspaceData';

interface AccountActionsApi {
  cancelMyReservation(reservationId: string, accessToken: string): Promise<void>;
  getMyReservations(accessToken: string): Promise<Reservation[]>;
  requestOwnerAccess(accessToken: string): Promise<ApiOwnerAccessStatus>;
}

interface UseAccountActionsOptions {
  accessToken?: string;
  ownerAccessStatus: OwnerAccessStatus;
  isOwnerAdmin: boolean;
  setReservations: Dispatch<SetStateAction<Reservation[]>>;
  setOwnerAccessStatus: Dispatch<SetStateAction<OwnerAccessStatus>>;
  setAccountModalMode: Dispatch<SetStateAction<AccountModalMode>>;
  setAuthCallbackNotice: Dispatch<SetStateAction<string>>;
  setCurrentView: Dispatch<SetStateAction<MainView>>;
  api?: AccountActionsApi;
  signOut?: () => Promise<void>;
}

const defaultSignOut = async () => {
  const { supabase } = await import('../services/supabase');
  if (!supabase) throw new Error('Serviço de autenticação indisponível.');
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export function useAccountActions({
  accessToken,
  ownerAccessStatus,
  isOwnerAdmin,
  setReservations,
  setOwnerAccessStatus,
  setAccountModalMode,
  setAuthCallbackNotice,
  setCurrentView,
  api = crcnBackendApi,
  signOut = defaultSignOut,
}: UseAccountActionsOptions) {
  const [ownerRequestLoading, setOwnerRequestLoading] = useState(false);

  const handleCancelReservation = useCallback(
    async (reservationId: string) => {
      if (!accessToken) throw new Error('Entre na sua conta para solicitar o cancelamento.');
      await api.cancelMyReservation(reservationId, accessToken);
      setReservations((current) =>
        current.map((reservation) =>
          reservation.id === reservationId ? { ...reservation, status: 'cancelled' } : reservation,
        ),
      );
      try {
        const refreshed = await api.getMyReservations(accessToken);
        setReservations(
          refreshed.map((reservation) =>
            reservation.id === reservationId
              ? { ...reservation, status: 'cancelled' }
              : reservation,
          ),
        );
      } catch {
        // Keep the PMS-confirmed cancellation visible if the refresh fails.
      }
    },
    [accessToken, api, setReservations],
  );

  const handleRequestOwnerAccess = useCallback(async () => {
    if (!accessToken) {
      setAccountModalMode('login');
      return;
    }
    setOwnerRequestLoading(true);
    try {
      const status = await api.requestOwnerAccess(accessToken);
      setOwnerAccessStatus(status);
      if (status === 'pending') {
        setAuthCallbackNotice(
          'Solicitação de acesso ao painel de proprietário enviada para análise.',
        );
      }
    } catch (error) {
      setAuthCallbackNotice(
        error instanceof Error ? error.message : 'Não foi possível solicitar acesso ao painel.',
      );
      setOwnerAccessStatus('unavailable');
    } finally {
      setOwnerRequestLoading(false);
    }
  }, [accessToken, api, setAccountModalMode, setAuthCallbackNotice, setOwnerAccessStatus]);

  const handleSetCurrentView = useCallback(
    (view: MainView) => {
      if (view === 'host' && ownerAccessStatus !== 'approved') return;
      if (view === 'ownerAdmin' && !isOwnerAdmin) return;
      setCurrentView(view);
    },
    [isOwnerAdmin, ownerAccessStatus, setCurrentView],
  );

  return {
    ownerRequestLoading,
    handleCancelReservation,
    handleRequestOwnerAccess,
    handleSetCurrentView,
    handleSignOut: signOut,
  };
}
