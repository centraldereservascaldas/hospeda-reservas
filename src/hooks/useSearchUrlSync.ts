import { useEffect } from 'react';
import type { SearchFilters } from '../types';
import { mergeSearchFiltersIntoUrl } from '../utils/searchUrlState';

export function useSearchUrlSync(filters: SearchFilters): void {
  useEffect(() => {
    const search = mergeSearchFiltersIntoUrl(window.location.search, filters);
    const nextSearch = search ? `?${search}` : '';
    if (nextSearch === window.location.search) return;

    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${nextSearch}${window.location.hash}`,
    );
  }, [filters]);
}
