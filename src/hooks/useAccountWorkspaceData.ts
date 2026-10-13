import { useEffect, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Reservation } from '../types';
import { crcnBackendApi } from '../services/crcnBackendApi';
import type { MainView } from '../components/MobileBottomNavigation';

export type OwnerAccessStatus =
  'loading' | 'unavailable' | 'none' | 'pending' | 'approved' | 'suspended';

interface UseAccountWorkspaceDataOptions {
  accessToken: string | undefined;
  currentViewRef: MutableRefObject<MainView>;
  setCurrentView: Dispatch<SetStateAction<MainView>>;
}

export function useAccountWorkspaceData({
  accessToken,
  currentViewRef,
  setCurrentView,
}: UseAccountWorkspaceDataOptions) {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [ownerAccessStatus, setOwnerAccessStatus] = useState<OwnerAccessStatus>('none');
  const [isOwnerAdmin, setIsOwnerAdmin] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      setReservations([]);
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
    ownerAccessStatus,
    setOwnerAccessStatus,
    isOwnerAdmin,
  };
}
