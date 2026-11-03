import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Reservation } from '../types';
import { crcnBackendApi } from '../services/crcnBackendApi';
import type { DirectBookingOrderListItem } from '../services/checkoutApi';
import type { MainView } from '../components/MobileBottomNavigation';

export type OwnerAccessStatus =
  'loading' | 'unavailable' | 'none' | 'pending' | 'approved' | 'suspended' | 'rejected';

interface DirectBookingOrdersState {
  accessToken: string | undefined;
  items: DirectBookingOrderListItem[];
  error: string;
  isLoading: boolean;
}

interface ReservationsState {
  accessToken: string | undefined;
  items: Reservation[];
  error: string;
  isLoading: boolean;
}

interface OwnerAccessState {
  accessToken: string | undefined;
  status: OwnerAccessStatus;
}

interface OwnerAdminState {
  accessToken: string | undefined;
  isAdmin: boolean;
  canManagePayments: boolean;
}

interface UseAccountWorkspaceDataOptions {
  accessToken: string | undefined;
  currentView?: MainView;
  currentViewRef: MutableRefObject<MainView>;
  setCurrentView: Dispatch<SetStateAction<MainView>>;
}

export function useAccountWorkspaceData({
  accessToken,
  currentView,
  currentViewRef,
  setCurrentView,
}: UseAccountWorkspaceDataOptions) {
  const [reservationsState, setReservationsState] = useState<ReservationsState>({
    accessToken: undefined,
    items: [],
    error: '',
    isLoading: false,
  });
  const reservations =
    accessToken && reservationsState.accessToken === accessToken ? reservationsState.items : [];
  const reservationsError =
    accessToken && reservationsState.accessToken === accessToken ? reservationsState.error : '';
  const reservationsLoading = Boolean(
    accessToken && (reservationsState.accessToken !== accessToken || reservationsState.isLoading),
  );
  const setReservations = useCallback<Dispatch<SetStateAction<Reservation[]>>>(
    (update) => {
      setReservationsState((currentState) => {
        const currentStateMatchesAccessToken = currentState.accessToken === accessToken;
        const currentItems = currentStateMatchesAccessToken ? currentState.items : [];
        const items = typeof update === 'function' ? update(currentItems) : update;

        return {
          accessToken,
          items,
          error: currentStateMatchesAccessToken ? currentState.error : '',
          isLoading: currentStateMatchesAccessToken ? currentState.isLoading : false,
        };
      });
    },
    [accessToken],
  );
  const [directBookingOrdersState, setDirectBookingOrdersState] =
    useState<DirectBookingOrdersState>({
      accessToken: undefined,
      items: [],
      error: '',
      isLoading: false,
    });
  const directBookingOrders =
    accessToken && directBookingOrdersState.accessToken === accessToken
      ? directBookingOrdersState.items
      : [];
  const directBookingOrdersError =
    accessToken && directBookingOrdersState.accessToken === accessToken
      ? directBookingOrdersState.error
      : '';
  const directBookingOrdersLoading = Boolean(
    accessToken &&
    (currentView === undefined || currentView === 'trips') &&
    (directBookingOrdersState.accessToken !== accessToken || directBookingOrdersState.isLoading),
  );
  const [accountDataRefreshKey, setAccountDataRefreshKey] = useState(0);
  const refreshAccountData = useCallback((): void => {
    setAccountDataRefreshKey((currentKey) => currentKey + 1);
  }, []);
  const [ownerAccessState, setOwnerAccessState] = useState<OwnerAccessState>({
    accessToken: undefined,
    status: 'none',
  });
  const ownerAccessStatus =
    ownerAccessState.accessToken === accessToken
      ? ownerAccessState.status
      : accessToken
        ? 'loading'
        : 'none';
  const setOwnerAccessStatus = useCallback<Dispatch<SetStateAction<OwnerAccessStatus>>>(
    (update) => {
      setOwnerAccessState((currentState) => {
        const currentStatus =
          currentState.accessToken === accessToken
            ? currentState.status
            : accessToken
              ? 'loading'
              : 'none';
        const status = typeof update === 'function' ? update(currentStatus) : update;

        return { accessToken, status };
      });
    },
    [accessToken],
  );
  const [ownerAdminState, setOwnerAdminState] = useState<OwnerAdminState>({
    accessToken: undefined,
    isAdmin: false,
    canManagePayments: false,
  });
  const isOwnerAdmin = ownerAdminState.accessToken === accessToken && ownerAdminState.isAdmin;
  const canManagePayments =
    ownerAdminState.accessToken === accessToken && ownerAdminState.canManagePayments;

  useEffect(() => {
    if (!accessToken) {
      setReservationsState({ accessToken: undefined, items: [], error: '', isLoading: false });
      setDirectBookingOrdersState({
        accessToken: undefined,
        items: [],
        error: '',
        isLoading: false,
      });
      return;
    }
    let cancelled = false;
    setReservationsState((currentState) => ({
      accessToken,
      items: currentState.accessToken === accessToken ? currentState.items : [],
      error: '',
      isLoading: true,
    }));
    void crcnBackendApi
      .getMyReservations(accessToken)
      .then((items) => {
        if (!cancelled) setReservationsState({ accessToken, items, error: '', isLoading: false });
      })
      .catch((error) => {
        if (!cancelled) {
          setReservationsState({
            accessToken,
            items: [],
            error: 'Não foi possível carregar suas reservas. Tente novamente.',
            isLoading: false,
          });
          console.warn('Unable to load guest reservations:', error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, accountDataRefreshKey]);

  useEffect(() => {
    if (!accessToken) {
      setDirectBookingOrdersState({
        accessToken: undefined,
        items: [],
        error: '',
        isLoading: false,
      });
      return;
    }
    if (currentView !== undefined && currentView !== 'trips') {
      return;
    }
    let cancelled = false;
    setDirectBookingOrdersState((currentState) =>
      currentState.accessToken === accessToken
        ? { ...currentState, error: '', isLoading: true }
        : { accessToken, items: [], error: '', isLoading: true },
    );
    void crcnBackendApi
      .getMyDirectBookingOrders(accessToken)
      .then((items) => {
        if (!cancelled) {
          setDirectBookingOrdersState({ accessToken, items, error: '', isLoading: false });
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setDirectBookingOrdersState({
          accessToken,
          items: [],
          error: 'Não foi possível carregar suas compras. Tente novamente.',
          isLoading: false,
        });
        console.warn('Unable to load guest direct booking orders:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, accountDataRefreshKey, currentView]);

  useEffect(() => {
    if (!accessToken) {
      setOwnerAccessState({ accessToken: undefined, status: 'none' });
      setOwnerAdminState({ accessToken: undefined, isAdmin: false, canManagePayments: false });
      if (currentViewRef.current === 'host' || currentViewRef.current === 'ownerAdmin') {
        setCurrentView('explore');
      }
      return;
    }
    let cancelled = false;
    setOwnerAccessState({ accessToken, status: 'loading' });
    void crcnBackendApi
      .getOwnerAccess(accessToken)
      .then((status) => {
        if (!cancelled) setOwnerAccessState({ accessToken, status });
      })
      .catch((error) => {
        if (!cancelled) {
          setOwnerAccessState({ accessToken, status: 'unavailable' });
          console.warn('Unable to verify owner access:', error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, currentViewRef, setCurrentView]);

  useEffect(() => {
    if (!accessToken) {
      setOwnerAdminState({ accessToken: undefined, isAdmin: false, canManagePayments: false });
      return;
    }
    let cancelled = false;
    setOwnerAdminState({ accessToken, isAdmin: false, canManagePayments: false });
    void crcnBackendApi
      .getOwnerAdminStatus(accessToken)
      .then(({ isAdmin, canManagePayments }) => {
        if (cancelled) return;
        setOwnerAdminState({ accessToken, isAdmin, canManagePayments });
        if (!isAdmin && currentViewRef.current === 'ownerAdmin') {
          setCurrentView('explore');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setOwnerAdminState({ accessToken, isAdmin: false, canManagePayments: false });
        if (currentViewRef.current === 'ownerAdmin') setCurrentView('explore');
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, currentViewRef, setCurrentView]);

  return {
    reservations,
    reservationsError,
    reservationsLoading,
    setReservations,
    directBookingOrders,
    directBookingOrdersError,
    directBookingOrdersLoading,
    refreshAccountData,
    ownerAccessStatus,
    setOwnerAccessStatus,
    isOwnerAdmin,
    canManagePayments,
  };
}
