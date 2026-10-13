import { useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Property, SearchFilters } from '../types';
import { crcnBackendApi } from '../services/crcnBackendApi';
import { parseSearchFilters } from '../utils/searchUrlState';

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
  useEffect(() => {
    const parseUrlAndSelect = () => {
      const match = window.location.pathname.match(/\/apartamento\/([a-zA-Z0-9_-]+)/);
      if (match) {
        const targetId = match[1];
        const found = properties.find(
          (property) => property.id === targetId || property.staysListingId === targetId,
        );
        if (found) {
          setSelectedProperty(found);
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
      const match = window.location.pathname.match(/\/apartamento\/([a-zA-Z0-9_-]+)/);
      if (match) {
        const targetId = match[1];
        const found = properties.find(
          (property) => property.id === targetId || property.staysListingId === targetId,
        );
        if (found) setSelectedProperty(found);
      } else {
        setSelectedProperty(null);
        if (restoredFilters.checkIn && restoredFilters.checkOut) {
          restoreSearchFromUrlRef.current(restoredFilters);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [properties, restoreSearchFromUrlRef, setFilters, setSelectedProperty]);

  const handleSelectProperty = (property: Property) => {
    setSelectedProperty(property);
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
    if (window.location.pathname.startsWith('/apartamento/')) {
      window.history.pushState(null, '', `/${window.location.search}${window.location.hash}`);
    }
  };

  return { handleSelectProperty, handleClosePropertyDetail };
}
