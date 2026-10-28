import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Property } from '../types';
import { crcnBackendApi } from '../services/crcnBackendApi';
import { isProperty } from '../utils/apiValidation';
import { sanitizePropertyMedia } from '../utils/propertyMedia';

function readCachedProperties(): Property[] {
  try {
    const saved = localStorage.getItem('hospeda_properties');
    if (!saved) return [];
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];

    // Remove synthetic demo IDs and use persisted listing data only when it
    // was last synchronized from the live Stays-backed catalogue.
    const cleaned = parsed
      .filter(isProperty)
      .filter((property) => !property.id.startsWith('prop-'))
      .map(sanitizePropertyMedia);
    if (
      cleaned.length === 0 ||
      localStorage.getItem('hospeda_properties_source') !== 'stays-live'
    ) {
      return [];
    }

    // Refresh galleries from the backend on startup instead of trusting stale
    // cached image lists.
    return cleaned;
  } catch {
    return [];
  }
}

export function useAccommodationCatalog() {
  const [properties, setCatalogProperties] = useState<Property[]>(readCachedProperties);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogLoadError, setCatalogLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const externallyUpdated = useRef(false);

  const setProperties: Dispatch<SetStateAction<Property[]>> = useCallback((value) => {
    externallyUpdated.current = true;
    setCatalogLoadError(false);
    setCatalogProperties(value);
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
        if (!externallyUpdated.current) setCatalogProperties(list);
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

  return { properties, setProperties, catalogLoading, catalogLoadError, retryCatalog };
}
