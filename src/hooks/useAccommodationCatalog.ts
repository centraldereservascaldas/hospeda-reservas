import { useEffect, useState } from 'react';
import type { Property } from '../types';
import { crcnBackendApi } from '../services/crcnBackendApi';
import { staysApi } from '../services/staysApi';
import { isProperty } from '../utils/apiValidation';

function readCachedProperties(): Property[] {
  const saved = localStorage.getItem('hospeda_properties');
  if (!saved) return [];

  try {
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];

    // Remove synthetic demo IDs and use persisted listing data only when it
    // was last synchronized from the live Stays-backed catalogue.
    const cleaned = parsed
      .filter(isProperty)
      .filter((property) => !property.id.startsWith('prop-'));
    if (
      cleaned.length === 0 ||
      localStorage.getItem('hospeda_properties_source') !== 'stays-live'
    ) {
      return [];
    }

    // Refresh galleries from the backend on startup instead of trusting stale
    // cached image lists.
    return cleaned.map((property) => ({
      ...property,
      images: Array.isArray(property.images)
        ? property.images.filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url))
        : [],
    }));
  } catch {
    return [];
  }
}

export function useAccommodationCatalog() {
  const [properties, setProperties] = useState<Property[]>(readCachedProperties);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogLoadError, setCatalogLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void staysApi
      .fetchListings()
      .then((result) => {
        if (cancelled || !result.success || result.listings.length === 0) return;
        setProperties(result.listings);
        setCatalogLoading(false);
        setCatalogLoadError(false);
        localStorage.setItem('hospeda_properties', JSON.stringify(result.listings));
        localStorage.setItem('hospeda_properties_source', 'stays-live');
      })
      .catch(() => {
        // Keep the cached or fallback catalogue when refreshing fails.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void crcnBackendApi
      .getAccommodations()
      .then(async (list) => {
        if (cancelled) return;
        if (list.length > 0) {
          setProperties(list);
          localStorage.setItem('hospeda_properties', JSON.stringify(list));
          localStorage.setItem('hospeda_properties_source', 'stays-live');
          return;
        }

        // The bundled catalogue is only used when the API and synchronized
        // cache have no listings; keep it outside the initial application chunk.
        const { STAYS_NET_APARTMENTS } = await import('../data/staysApartments');
        if (!cancelled) {
          setProperties((current) => (current.length > 0 ? current : STAYS_NET_APARTMENTS));
        }
      })
      .catch((error) => {
        console.warn('Unable to load accommodation catalogue:', error);
        if (!cancelled) setCatalogLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('hospeda_properties', JSON.stringify(properties));
  }, [properties]);

  return { properties, setProperties, catalogLoading, catalogLoadError };
}
