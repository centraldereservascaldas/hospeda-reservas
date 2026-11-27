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
  catalogProperties: Property[];
  filters: SearchFilters;
  savedPropertyIds: string[];
  catalogLoading: boolean;
  catalogLoadError: boolean;
  catalogPropertiesLoadError: boolean;
  hasMoreSearchResults?: boolean;
}

export function useExploreCatalogViewModel({
  properties,
  catalogProperties,
  filters,
  savedPropertyIds,
  catalogLoading,
  catalogLoadError,
  catalogPropertiesLoadError,
  hasMoreSearchResults = false,
}: UseExploreCatalogViewModelOptions) {
  const filteredProperties = useMemo(
    () => filterPropertiesBySearchFilters(properties, filters),
    [properties, filters],
  );
  const availableCategories = useMemo(
    () =>
      CATEGORIES.filter(
        (category) =>
          hasMoreSearchResults ||
          category.id === 'all' ||
          category.id === 'condominiums' ||
          category.id === 'pools_24h' ||
          category.id === filters.category ||
          properties.some((property) => matchesPropertyCategory(property, category.id)),
      ),
    [properties, filters.category, hasMoreSearchResults],
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
  const savedPropertiesList = useMemo(() => {
    const availableProperties = new Map<string, Property>();
    for (const property of catalogProperties) availableProperties.set(property.id, property);
    for (const property of properties) availableProperties.set(property.id, property);
    return savedPropertyIds.flatMap((id) => {
      const property = availableProperties.get(id);
      return property ? [property] : [];
    });
  }, [catalogProperties, properties, savedPropertyIds]);
  const savedPropertiesState: 'loading' | 'error' | 'stale' | 'ready' = catalogPropertiesLoadError
    ? 'error'
    : catalogLoading
      ? savedPropertiesList.length === 0
        ? 'loading'
        : 'stale'
      : 'ready';
  const savedPropertyIdsInCatalog = new Set(savedPropertiesList.map((property) => property.id));
  const missingSavedPropertyIds =
    savedPropertiesState === 'ready'
      ? savedPropertyIds.filter((id) => !savedPropertyIdsInCatalog.has(id))
      : [];

  return {
    filteredProperties,
    availableCategories,
    condominiums,
    isCondominiumView,
    catalogStatus,
    activeFilterCount,
    savedPropertiesList,
    savedPropertiesState,
    missingSavedPropertyIds,
  };
}
