import { useCallback, useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Property, SearchFilters } from '../types';
import { crcnBackendApi } from '../services/crcnBackendApi';
import { getAccommodationIdFromPath, parseSearchFilters } from '../utils/searchUrlState';

interface UseAccommodationRoutingOptions {
  properties: Property[];
  setSelectedProperty: Dispatch<SetStateAction<Property | null>>;
  setFilters: Dispatch<SetStateAction<SearchFilters>>;
  restoreSearchFromUrlRef: MutableRefObject<(filters: SearchFilters) => void>;
}

export function useAccommodationRouting({
  properties,
  setSelectedProperty,
  setFilters,
  restoreSearchFromUrlRef,
}: UseAccommodationRoutingOptions) {
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
    const parseUrlAndSelect = () => {
      const targetId = getAccommodationIdFromPath(window.location.pathname);
      if (targetId) {
        setFilters(parseSearchFilters(window.location.search));
        const found = properties.find(
          (property) => property.id === targetId || property.staysListingId === targetId,
        );
        if (found) {
          setSelectedProperty(found);
          refreshSelectedProperty(found);
        } else {
          crcnBackendApi.getAccommodationById(targetId).then((property) => {
            if (property) setSelectedProperty(property);
          });
        }
      }
    };

    parseUrlAndSelect();

    const handlePopState = () => {
      const restoredFilters = parseSearchFilters(window.location.search);
      setFilters(restoredFilters);
      const targetId = getAccommodationIdFromPath(window.location.pathname);
      if (targetId) {
        const found = properties.find(
          (property) => property.id === targetId || property.staysListingId === targetId,
        );
        if (found) {
          setSelectedProperty(found);
          refreshSelectedProperty(found);
        }
      } else {
        setSelectedProperty(null);
        if (restoredFilters.checkIn && restoredFilters.checkOut) {
          restoreSearchFromUrlRef.current(restoredFilters);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [
    properties,
    refreshSelectedProperty,
    restoreSearchFromUrlRef,
    setFilters,
    setSelectedProperty,
  ]);

  const handleSelectProperty = (property: Property) => {
    setSelectedProperty(property);
    refreshSelectedProperty(property);
    const slug = property.staysListingId || property.id;
    if (window.location.pathname !== `/apartamento/${slug}`) {
      window.history.pushState(
        null,
        '',
        `/apartamento/${slug}${window.location.search}${window.location.hash}`,
      );
    }
  };

  const handleClosePropertyDetail = () => {
    setSelectedProperty(null);
    if (getAccommodationIdFromPath(window.location.pathname)) {
      window.history.pushState(null, '', `/${window.location.search}${window.location.hash}`);
    }
  };

  return { handleSelectProperty, handleClosePropertyDetail };
}
