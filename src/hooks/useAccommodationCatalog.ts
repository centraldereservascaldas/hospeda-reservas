import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Property } from '../types';
import { crcnBackendApi } from '../services/crcnBackendApi';
import { readAccommodationCatalogCache } from '../utils/accommodationCatalogCache';

export function useAccommodationCatalog() {
  const [catalogProperties, setCatalogProperties] = useState<Property[]>(
    readAccommodationCatalogCache,
  );
  const [properties, setDisplayedProperties] = useState<Property[]>(() => catalogProperties);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogLoadError, setCatalogLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const externallyUpdated = useRef(false);

  const setProperties: Dispatch<SetStateAction<Property[]>> = useCallback((value) => {
    externallyUpdated.current = true;
    setCatalogLoadError(false);
    setDisplayedProperties(value);
  }, []);

  const retryCatalog = useCallback(() => {
    setCatalogLoading(true);
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void crcnBackendApi
      .getAccommodations()
      .then((list) => {
        if (cancelled) return;
        setCatalogProperties(list);
        if (!externallyUpdated.current) setDisplayedProperties(list);
        setCatalogLoadError(false);
      })
      .catch((error) => {
        console.warn('Unable to load accommodation catalogue:', error);
        if (!cancelled && !externallyUpdated.current) setCatalogLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  return {
    properties,
    catalogProperties,
    setProperties,
    catalogLoading,
    catalogLoadError,
    retryCatalog,
  };
}
