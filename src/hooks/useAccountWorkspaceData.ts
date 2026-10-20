import { useEffect, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Reservation } from '../types';
import { crcnBackendApi } from '../services/crcnBackendApi';
import type { DirectBookingOrderSummary } from '../services/crcnBackendApi';
import type { MainView } from '../components/MobileBottomNavigation';

export type OwnerAccessStatus =
  'loading' | 'unavailable' | 'none' | 'pending' | 'approved' | 'suspended';

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
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [directBookingOrders, setDirectBookingOrders] = useState<DirectBookingOrderSummary[]>([]);
  const [directBookingOrdersError, setDirectBookingOrdersError] = useState('');
  const [ownerAccessStatus, setOwnerAccessStatus] = useState<OwnerAccessStatus>('none');
  const [isOwnerAdmin, setIsOwnerAdmin] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      setReservations([]);
      setDirectBookingOrders([]);
      setDirectBookingOrdersError('');
      return;
    }
    let cancelled = false;
    void crcnBackendApi
      .getMyReservations(accessToken)
      .then((items) => {
        if (!cancelled) setReservations(items);
      })
      .catch((error) => {
        if (!cancelled) {
          setReservations([]);
          console.warn('Unable to load guest reservations:', error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      setDirectBookingOrders([]);
      setDirectBookingOrdersError('');
      return;
    }
    if (currentView !== undefined && currentView !== 'trips') {
      return;
    }
    let cancelled = false;
    setDirectBookingOrdersError('');
    void crcnBackendApi
      .getMyDirectBookingOrders(accessToken)
      .then((items) => {
        if (!cancelled) setDirectBookingOrders(items);
      })
      .catch((error) => {
        if (cancelled) return;
        setDirectBookingOrders([]);
        setDirectBookingOrdersError(
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar suas compras no site.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, currentView]);

  useEffect(() => {
    if (!accessToken) {
      setOwnerAccessStatus('none');
      setIsOwnerAdmin(false);
      if (currentViewRef.current === 'host' || currentViewRef.current === 'ownerAdmin') {
        setCurrentView('explore');
      }
      return;
    }
    let cancelled = false;
    setOwnerAccessStatus('loading');
    void crcnBackendApi
      .getOwnerAccess(accessToken)
      .then((status) => {
        if (!cancelled) setOwnerAccessStatus(status);
      })
      .catch((error) => {
        if (!cancelled) {
          setOwnerAccessStatus('unavailable');
          console.warn('Unable to verify owner access:', error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, currentViewRef, setCurrentView]);

  useEffect(() => {
    if (!accessToken) {
      setIsOwnerAdmin(false);
      return;
    }
    let cancelled = false;
    void crcnBackendApi
      .getOwnerAdminStatus(accessToken)
      .then((isAdmin) => {
        if (cancelled) return;
        setIsOwnerAdmin(isAdmin);
        if (!isAdmin && currentViewRef.current === 'ownerAdmin') {
          setCurrentView('explore');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setIsOwnerAdmin(false);
        if (currentViewRef.current === 'ownerAdmin') setCurrentView('explore');
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, currentViewRef, setCurrentView]);

  return {
    reservations,
    setReservations,
    directBookingOrders,
    directBookingOrdersError,
    ownerAccessStatus,
    setOwnerAccessStatus,
    isOwnerAdmin,
  };
}
