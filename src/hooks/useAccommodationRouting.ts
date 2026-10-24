import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Property, SearchFilters } from '../types';
import { crcnBackendApi } from '../services/crcnBackendApi';
import { getAccommodationIdFromPath, parseSearchFilters } from '../utils/searchUrlState';

interface UseAccommodationRoutingOptions {
  properties: Property[];
  selectedProperty: Property | null;
  setSelectedProperty: Dispatch<SetStateAction<Property | null>>;
  setFilters: Dispatch<SetStateAction<SearchFilters>>;
  restoreSearchFromUrlRef: MutableRefObject<
    (filters: SearchFilters, options?: { scrollCatalog?: boolean }) => void | Promise<void>
  >;
}

export type PropertyRouteStatus = 'idle' | 'loading' | 'unavailable';

const PROPERTY_DETAIL_ENTRY = '__crcnPropertyDetailEntry';
const PROPERTY_DETAIL_RETURN_SCROLL = '__crcnPropertyDetailReturnScroll';
export const PROPERTY_DETAIL_RETURN_FOCUS_PROPERTY = '__crcnPropertyDetailReturnFocusProperty';

function historyStateRecord(): Record<string, unknown> {
  const state: unknown = window.history.state;
  return state && typeof state === 'object' ? { ...state } : {};
}

function getSavedReturnScrollY(): number | null {
  const value = historyStateRecord()[PROPERTY_DETAIL_RETURN_SCROLL];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getLocalePrefix(pathname: string): string {
  return pathname.match(/^\/([a-z]{2})(?:\/|$)/i)?.[0].replace(/\/$/, '') ?? '';
}

function getPropertyDetailPath(pathname: string, propertyId: string): string {
  const localePrefix = getLocalePrefix(pathname);
  const apartmentRoute = localePrefix ? 'apartment' : 'apartamento';
  return `${localePrefix}/${apartmentRoute}/${propertyId}`;
}

function getCatalogPath(pathname: string): string {
  const localePrefix = getLocalePrefix(pathname);
  return localePrefix ? `${localePrefix}/search` : '/';
}

export function useAccommodationRouting({
  properties,
  selectedProperty,
  setSelectedProperty,
  setFilters,
  restoreSearchFromUrlRef,
}: UseAccommodationRoutingOptions) {
  const selectedPropertyRef = useRef(selectedProperty);
  selectedPropertyRef.current = selectedProperty;
  const [propertyRouteStatus, setPropertyRouteStatus] = useState<PropertyRouteStatus>(() =>
    getAccommodationIdFromPath(window.location.pathname) ? 'loading' : 'idle',
  );
  const [propertyRouteRetryToken, setPropertyRouteRetryToken] = useState(0);
  const refreshSelectedProperty = useCallback(
    (property: Property) => {
      const propertyId = property.id;
      const staysListingId = property.staysListingId || property.id;

      void crcnBackendApi.getAccommodationById(staysListingId).then((detail) => {
        if (!detail) return;
        setSelectedProperty((current) =>
          current?.id === propertyId ? { ...current, ...detail } : current,
        );
      });
    },
    [setSelectedProperty],
  );

  useEffect(() => {
    let isEffectActive = true;

    const selectPropertyFromRoute = (targetId: string) => {
      setPropertyRouteStatus('loading');
      const found = properties.find(
        (property) => property.id === targetId || property.staysListingId === targetId,
      );
      if (found) {
        setSelectedProperty(found);
        setPropertyRouteStatus('idle');
        refreshSelectedProperty(found);
        return;
      }

      setSelectedProperty(null);
      void crcnBackendApi.getAccommodationById(targetId).then((property) => {
        if (!isEffectActive) return;
        if (getAccommodationIdFromPath(window.location.pathname) !== targetId) return;
        if (property) {
          setSelectedProperty(property);
          setPropertyRouteStatus('idle');
        } else {
          setPropertyRouteStatus('unavailable');
        }
      });
    };

    const parseUrlAndSelect = () => {
      const targetId = getAccommodationIdFromPath(window.location.pathname);
      if (targetId) {
        setFilters(parseSearchFilters(window.location.search));
        const currentProperty = selectedPropertyRef.current;
        if (
          currentProperty &&
          (currentProperty.id === targetId || currentProperty.staysListingId === targetId)
        ) {
          setPropertyRouteStatus('idle');
          return;
        }
        selectPropertyFromRoute(targetId);
      } else {
        setPropertyRouteStatus('idle');
      }
    };

    parseUrlAndSelect();

    const handlePopState = () => {
      const restoredFilters = parseSearchFilters(window.location.search);
      setFilters(restoredFilters);
      const targetId = getAccommodationIdFromPath(window.location.pathname);
      if (targetId) {
        const currentProperty = selectedPropertyRef.current;
        if (
          currentProperty &&
          (currentProperty.id === targetId || currentProperty.staysListingId === targetId)
        ) {
          return;
        }
        selectPropertyFromRoute(targetId);
        window.scrollTo(0, 0);
      } else {
        setPropertyRouteStatus('idle');
        setSelectedProperty(null);
        const returnScrollY = getSavedReturnScrollY();
        const restoreScroll = () => {
          if (returnScrollY === null) return;
          window.scrollTo(0, returnScrollY);
        };
        const restoreAfterRender = () => {
          if (returnScrollY === null) return;
          if (typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(restoreScroll);
          } else {
            window.setTimeout(restoreScroll, 0);
          }
        };

        if (restoredFilters.checkIn && restoredFilters.checkOut) {
          const searchRestore = restoreSearchFromUrlRef.current(
            restoredFilters,
            returnScrollY === null ? undefined : { scrollCatalog: false },
          );
          if (returnScrollY !== null && searchRestore && typeof searchRestore.then === 'function') {
            void searchRestore.then(restoreAfterRender, restoreAfterRender);
          } else if (returnScrollY !== null) {
            restoreAfterRender();
          }
        } else {
          restoreAfterRender();
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      isEffectActive = false;
      window.removeEventListener('popstate', handlePopState);
    };
  }, [
    properties,
    refreshSelectedProperty,
    restoreSearchFromUrlRef,
    setFilters,
    setSelectedProperty,
    propertyRouteRetryToken,
  ]);

  const handleSelectProperty = (property: Property) => {
    setPropertyRouteStatus('idle');
    setSelectedProperty(property);
    refreshSelectedProperty(property);
    const slug = property.staysListingId || property.id;
    const detailPath = getPropertyDetailPath(window.location.pathname, slug);
    const nextPath = `${detailPath}${window.location.search}${window.location.hash}`;
    if (getAccommodationIdFromPath(window.location.pathname)) {
      if (window.location.pathname !== detailPath) {
        window.history.replaceState(historyStateRecord(), '', nextPath);
      }
      window.scrollTo(0, 0);
      return;
    }

    if (window.location.pathname !== detailPath) {
      const activeElement = document.activeElement;
      const focusedPropertyId =
        activeElement instanceof HTMLElement
          ? activeElement.dataset.propertyDetailTrigger
          : undefined;
      window.history.replaceState(
        {
          ...historyStateRecord(),
          [PROPERTY_DETAIL_RETURN_SCROLL]: window.scrollY,
          [PROPERTY_DETAIL_RETURN_FOCUS_PROPERTY]:
            focusedPropertyId === property.id ? property.id : null,
        },
        '',
      );
      window.history.pushState({ [PROPERTY_DETAIL_ENTRY]: true }, '', nextPath);
      window.scrollTo(0, 0);
    }
  };

  const handleClosePropertyDetail = () => {
    const isPropertyRoute = Boolean(getAccommodationIdFromPath(window.location.pathname));
    if (isPropertyRoute && historyStateRecord()[PROPERTY_DETAIL_ENTRY] === true) {
      window.history.back();
      return;
    }

    setPropertyRouteStatus('idle');
    setSelectedProperty(null);
    if (isPropertyRoute) {
      window.history.replaceState(
        null,
        '',
        `${getCatalogPath(window.location.pathname)}${window.location.search}${window.location.hash}`,
      );
      const restoredFilters = parseSearchFilters(window.location.search);
      if (restoredFilters.checkIn && restoredFilters.checkOut) {
        restoreSearchFromUrlRef.current(restoredFilters);
      }
    }
  };

  const retryPropertyRoute = useCallback(() => {
    setPropertyRouteRetryToken((token) => token + 1);
  }, []);

  return {
    handleSelectProperty,
    handleClosePropertyDetail,
    propertyRouteStatus,
    retryPropertyRoute,
  };
}
