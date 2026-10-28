import { useMemo } from 'react';
import type { Property, SearchFilters } from '../types';
import { CATEGORIES } from '../data/mockProperties';
import { buildCondominiumCatalog } from '../utils/condominiumCatalog';
import { matchesPropertyCategory } from '../utils/propertyCategories';
import {
  countActivePropertyFilters,
  filterPropertiesBySearchFilters,
} from '../utils/propertySearchFilters';

interface UseExploreCatalogViewModelOptions {
  properties: Property[];
  filters: SearchFilters;
  savedPropertyIds: string[];
  catalogLoading: boolean;
  catalogLoadError: boolean;
}

export function useExploreCatalogViewModel({
  properties,
  filters,
  savedPropertyIds,
  catalogLoading,
  catalogLoadError,
}: UseExploreCatalogViewModelOptions) {
  const filteredProperties = useMemo(
    () => filterPropertiesBySearchFilters(properties, filters),
    [properties, filters],
  );
  const availableCategories = useMemo(
    () =>
      CATEGORIES.filter(
        (category) =>
          category.id === 'all' ||
          category.id === 'condominiums' ||
          category.id === 'pools_24h' ||
          category.id === filters.category ||
          properties.some((property) => matchesPropertyCategory(property, category.id)),
      ),
    [properties, filters.category],
  );
  const isCondominiumView = filters.category === 'condominiums';
  const condominiums = useMemo(
    () => buildCondominiumCatalog(isCondominiumView ? filteredProperties : properties),
    [filteredProperties, isCondominiumView, properties],
  );
  const catalogStatus: 'loading' | 'error' | 'stale' | 'ready' = catalogLoading
    ? properties.length === 0
      ? 'loading'
      : 'stale'
    : catalogLoadError
      ? properties.length === 0
        ? 'error'
        : 'stale'
      : 'ready';
  const activeFilterCount = useMemo(() => countActivePropertyFilters(filters), [filters]);
  const savedPropertiesList = useMemo(
    () => properties.filter((property) => savedPropertyIds.includes(property.id)),
    [properties, savedPropertyIds],
  );

  return {
    filteredProperties,
    availableCategories,
    condominiums,
    isCondominiumView,
    catalogStatus,
    activeFilterCount,
    savedPropertiesList,
  };
}
