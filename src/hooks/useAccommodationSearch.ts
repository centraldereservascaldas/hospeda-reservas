import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Property, SearchFilters } from '../types';
import { crcnBackendApi } from '../services/crcnBackendApi';
import type {
  AccommodationSearchPage,
  SearchAccommodationsParams,
} from '../services/crcnBackendApi';
import { getSurpriseDateCandidates } from '../utils/surpriseDates';
import type { SurpriseDateOption } from '../utils/surpriseDates';
import { getAccommodationIdFromPath, parseSearchFilters } from '../utils/searchUrlState';
import { scrollIntoViewRespectingMotion } from '../utils/motion';
import { countOccupancyGuests } from '../utils/guestCounts';
import { isIsoDate } from '../utils/apiValidation';

type SearchResultProperty = Property & { calculatedPrice?: { totalAmount?: number } };

export interface AccommodationWidgetSearchParams {
  checkIn: string;
  checkOut: string;
  persons: number;
  guests?: SearchFilters['guests'];
  destination?: string;
  propertyId?: string;
  surpriseMe?: boolean;
}

export type AvailabilitySearchState =
  'idle' | 'loading' | 'refreshing' | 'success' | 'partial' | 'expired' | 'error' | 'invalid-dates';

interface UseAccommodationSearchOptions {
  setProperties: Dispatch<SetStateAction<Property[]>>;
  setFilters: Dispatch<SetStateAction<SearchFilters>>;
  restoreSearchFromUrlRef: MutableRefObject<
    (filters: SearchFilters, options?: { scrollCatalog?: boolean }) => void | Promise<void>
  >;
  searchAccommodations?: (
    params: SearchAccommodationsParams,
    options?: { signal?: AbortSignal },
  ) => Promise<{
    total: number;
    data: Property[];
    unquotedCount?: number;
    pagination?: AccommodationSearchPage['pagination'];
    expiresAt?: number;
  }>;
  getSurpriseCandidates?: () => SurpriseDateOption[];
  random?: () => number;
  scrollCatalog?: () => void;
}

export interface SearchPaginationState {
  active: boolean;
  hasMore: boolean;
  isLoading: boolean;
  error: boolean;
  loadedCount: number;
}

const emptyPagination: SearchPaginationState = {
  active: false,
  hasMore: false,
  isLoading: false,
  error: false,
  loadedCount: 0,
};

const searchAccommodations = (
  params: SearchAccommodationsParams,
  options?: { signal?: AbortSignal },
) => crcnBackendApi.searchAccommodationsPage(params, options);

const scrollToAccommodationCatalog = () => {
  const catalogElement = document.getElementById('stays-apartments-catalog');
  if (catalogElement) scrollIntoViewRespectingMotion(catalogElement);
};

const getSearchContextKey = (params: AccommodationWidgetSearchParams) =>
  JSON.stringify([
    params.checkIn,
    params.checkOut,
    params.persons,
    params.destination || '',
    params.propertyId || '',
  ]);

const getTodayIsoDate = () => {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${today.getFullYear()}-${month}-${day}`;
};

export function useAccommodationSearch({
  setProperties,
  setFilters,
  restoreSearchFromUrlRef,
  searchAccommodations: searchAccommodationsOverride = searchAccommodations,
  getSurpriseCandidates = getSurpriseDateCandidates,
  random = Math.random,
  scrollCatalog = scrollToAccommodationCatalog,
}: UseAccommodationSearchOptions) {
  const initialLocationRef = useRef(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
  const initialUrlSearchHandledRef = useRef(false);
  const searchGenerationRef = useRef(0);
  const lastSearchParamsRef = useRef<AccommodationWidgetSearchParams | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const continuationRef = useRef<{
    params: SearchAccommodationsParams;
    nextSkip: number;
    generation: number;
    loading: boolean;
  } | null>(null);
  const loadedIdsRef = useRef(new Set<string>());
  const hasUnquotedRef = useRef(false);
  const completedContextRef = useRef<string | null>(null);
  const expirationsRef = useRef(new Map<string, number>());
  const hasExpiredResultsRef = useRef(false);
  const [nextExpiration, setNextExpiration] = useState<number | null>(null);
  const rememberPageExpiry = useCallback(
    (properties: Property[], deadline: number, offset: number, replace: boolean) => {
      if (replace) expirationsRef.current.clear();
      expirationsRef.current.set(`page:${offset}`, deadline);
      for (const property of properties) {
        if (property.calculatedPrice) {
          expirationsRef.current.set(
            `quote:${property.id}`,
            Math.min(property.calculatedPrice.expiresAt ?? Infinity, deadline),
          );
        }
      }
      setNextExpiration(Math.min(...expirationsRef.current.values()));
    },
    [],
  );

  useEffect(() => {
    if (nextExpiration === null) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      if (timer !== undefined) clearTimeout(timer);
      if (!active || expirationsRef.current.size === 0) return;
      const deadline = Math.min(...expirationsRef.current.values());
      timer = setTimeout(check, Math.max(1, deadline - Date.now()));
    };
    const check = () => {
      if (!active) return;
      const expiredQuotes = new Map<string, number>();
      let expired = false;
      for (const [key, deadline] of expirationsRef.current) {
        if (deadline > Date.now()) continue;
        expired = true;
        expirationsRef.current.delete(key);
        if (key.startsWith('quote:')) expiredQuotes.set(key.slice(6), deadline);
      }
      if (expired) {
        hasExpiredResultsRef.current = true;
        setProperties((previous) =>
          previous.map((property) => {
            const deadline = expiredQuotes.get(property.id);
            return deadline !== undefined && property.calculatedPrice
              ? {
                  ...property,
                  calculatedPrice: { ...property.calculatedPrice, expiresAt: deadline },
                }
              : property;
          }),
        );
        setAvailabilitySearchState((previous) =>
          previous === 'loading' || previous === 'refreshing' ? previous : 'expired',
        );
      }
      arm();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    arm();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [nextExpiration, setProperties]);

  const [searchPagination, setSearchPagination] = useState<SearchPaginationState>(emptyPagination);
  const [availabilitySearchState, setAvailabilitySearchState] = useState<AvailabilitySearchState>(
    () => {
      const initialUrl = new URL(initialLocationRef.current, window.location.origin);
      const initialFilters = parseSearchFilters(initialUrl.search);
      return initialFilters.checkIn && initialFilters.checkOut ? 'loading' : 'idle';
    },
  );

  const handleStaysWidgetSearch = useCallback(
    async (
      searchParams: AccommodationWidgetSearchParams,
      { scrollCatalogAfterSearch = true }: { scrollCatalogAfterSearch?: boolean } = {},
    ) => {
      const retainSnapshot =
        !searchParams.surpriseMe &&
        Boolean(searchParams.checkIn && searchParams.checkOut) &&
        completedContextRef.current === getSearchContextKey(searchParams) &&
        loadedIdsRef.current.size > 0;
      const retainedIds = new Set(loadedIdsRef.current);
      const searchGeneration = ++searchGenerationRef.current;
      requestControllerRef.current?.abort();
      const controller = new AbortController();
      requestControllerRef.current = controller;
      continuationRef.current = null;
      loadedIdsRef.current = new Set();
      hasUnquotedRef.current = false;
      if (!retainSnapshot) {
        completedContextRef.current = null;
        expirationsRef.current.clear();
        hasExpiredResultsRef.current = false;
        setNextExpiration(null);
      }
      setSearchPagination(emptyPagination);
      lastSearchParamsRef.current = searchParams;

      const hasAnySearchDate = Boolean(searchParams.checkIn || searchParams.checkOut);
      const hasSearchDates = Boolean(
        isIsoDate(searchParams.checkIn) &&
        isIsoDate(searchParams.checkOut) &&
        searchParams.checkIn &&
        searchParams.checkOut &&
        searchParams.checkIn >= getTodayIsoDate() &&
        searchParams.checkOut > searchParams.checkIn,
      );
      if (!searchParams.surpriseMe && hasAnySearchDate && !hasSearchDates) {
        setFilters((previous) => ({
          ...previous,
          checkIn: searchParams.checkIn,
          checkOut: searchParams.checkOut,
          destination: searchParams.destination || '',
          destinationPropertyId: searchParams.propertyId || '',
          guests: searchParams.guests ?? {
            adults: searchParams.persons,
            children: 0,
            infants: 0,
            pets: 0,
          },
        }));
        setProperties([]);
        setAvailabilitySearchState('invalid-dates');
        if (scrollCatalogAfterSearch) scrollCatalog();
        return;
      }

      setAvailabilitySearchState(retainSnapshot ? 'refreshing' : 'loading');
      let searchedProperties: SearchResultProperty[] | null = null;
      setFilters((previous) => ({
        ...previous,
        checkIn: searchParams.surpriseMe ? '' : searchParams.checkIn,
        checkOut: searchParams.surpriseMe ? '' : searchParams.checkOut,
        destination: searchParams.surpriseMe ? '' : searchParams.destination || '',
        destinationPropertyId: searchParams.surpriseMe ? '' : searchParams.propertyId || '',
        guests: searchParams.guests ?? {
          adults: searchParams.persons,
          children: 0,
          infants: 0,
          pets: 0,
        },
      }));

      const dateOptions = searchParams.surpriseMe
        ? getSurpriseCandidates().slice(0, 3)
        : [
            {
              checkIn: searchParams.checkIn,
              checkOut: searchParams.checkOut,
              occasion: '',
              kind: 'holiday' as const,
              weight: 1,
            },
          ];
      let resultDeadline: number | null = null;
      let selectedDateOption: (typeof dateOptions)[number] | null = null;
      let successfulSearchCount = 0;
      let hasUnquotedResults = false;
      let hasUnresolvedSurpriseResults = false;

      for (const dateOption of dateOptions) {
        try {
          const searchResult = await searchAccommodationsOverride(
            {
              from: dateOption.checkIn,
              to: dateOption.checkOut,
              guests: searchParams.persons,
              destination: searchParams.destination,
              propertyId: searchParams.propertyId,
              limit: 12,
              skip: 0,
            },
            { signal: controller.signal },
          );
          if (searchGeneration !== searchGenerationRef.current) return;
          const deadline =
            dateOption.checkIn && dateOption.checkOut
              ? Math.min(searchResult.expiresAt ?? Infinity, Date.now() + 45_000)
              : null;
          if (deadline !== null && (!Number.isFinite(deadline) || deadline <= Date.now()))
            throw new Error('A cotação expirou.');
          successfulSearchCount += 1;
          hasUnquotedResults = (searchResult.unquotedCount ?? 0) > 0;
          const results = searchResult?.data || [];
          if (searchParams.surpriseMe) {
            hasUnresolvedSurpriseResults ||=
              hasUnquotedResults || Boolean(searchResult.pagination?.hasMore);
            const confirmedQuotes = results.filter(
              (property) =>
                Number((property as SearchResultProperty).calculatedPrice?.totalAmount) > 0,
            ) as SearchResultProperty[];
            if (confirmedQuotes.length) {
              searchedProperties = confirmedQuotes;
              selectedDateOption = dateOption;
              resultDeadline = deadline;
              break;
            }
            if (deadline !== null) resultDeadline = Math.min(resultDeadline ?? Infinity, deadline);
          } else {
            searchedProperties = results;
            resultDeadline = deadline;
            loadedIdsRef.current = new Set(results.map((property) => property.id));
            hasUnquotedRef.current = hasUnquotedResults;
            const pagination = searchResult.pagination;
            continuationRef.current = pagination?.hasMore
              ? {
                  params: {
                    from: dateOption.checkIn,
                    to: dateOption.checkOut,
                    guests: searchParams.persons,
                    destination: searchParams.destination,
                    propertyId: searchParams.propertyId,
                    limit: 12,
                  },
                  nextSkip: pagination.nextSkip,
                  generation: searchGeneration,
                  loading: false,
                }
              : null;
            setSearchPagination({
              active: true,
              hasMore: Boolean(pagination?.hasMore),
              isLoading: false,
              error: false,
              loadedCount: loadedIdsRef.current.size,
            });
            break;
          }
        } catch (error) {
          if (searchGeneration !== searchGenerationRef.current) return;
          console.warn('Backend search error:', error);
        }
      }

      if (searchParams.surpriseMe) {
        const quoted = (searchedProperties || []).filter(
          (property) => Number(property.calculatedPrice?.totalAmount) > 0,
        );
        const score = (property: SearchResultProperty) =>
          (Number(property.rating) || 0) * 10 +
          Math.log10((Number(property.reviewCount) || 0) + 1) * 3 +
          (property.isGuestFavorite ? 5 : 0) +
          (property.isSuperhost ? 2 : 0);
        const topCandidates = [...quoted]
          .sort(
            (first, second) =>
              score(second) - score(first) ||
              Number(first.calculatedPrice?.totalAmount) -
                Number(second.calculatedPrice?.totalAmount),
          )
          .slice(0, 10);
        const randomizedCandidates = [...topCandidates];
        for (let index = randomizedCandidates.length - 1; index > 0; index -= 1) {
          const swapIndex = Math.floor(random() * (index + 1));
          [randomizedCandidates[index], randomizedCandidates[swapIndex]] = [
            randomizedCandidates[swapIndex]!,
            randomizedCandidates[index]!,
          ];
        }
        const chosenProperties = randomizedCandidates.slice(0, 5);
        setProperties(chosenProperties);
        if (resultDeadline !== null) {
          hasExpiredResultsRef.current = false;
          rememberPageExpiry(chosenProperties, resultDeadline, 0, true);
        }
        const completedAllDateOptions =
          dateOptions.length > 0 &&
          successfulSearchCount === dateOptions.length &&
          !hasUnresolvedSurpriseResults;
        setAvailabilitySearchState(
          chosenProperties.length > 0
            ? hasUnquotedResults
              ? 'partial'
              : 'success'
            : completedAllDateOptions
              ? 'success'
              : 'error',
        );
        if (chosenProperties.length) {
          const suggestedDates = selectedDateOption!;
          loadedIdsRef.current = new Set(chosenProperties.map((property) => property.id));
          lastSearchParamsRef.current = {
            ...searchParams,
            checkIn: suggestedDates.checkIn,
            checkOut: suggestedDates.checkOut,
            destination: '',
            propertyId: undefined,
            surpriseMe: false,
          };
          completedContextRef.current = getSearchContextKey({
            ...searchParams,
            checkIn: suggestedDates.checkIn,
            checkOut: suggestedDates.checkOut,
            destination: '',
            propertyId: '',
          });
          setFilters((previous) => ({
            ...previous,
            checkIn: suggestedDates.checkIn,
            checkOut: suggestedDates.checkOut,
          }));
        }
      } else if (searchedProperties) {
        completedContextRef.current = getSearchContextKey(searchParams);
        hasExpiredResultsRef.current = false;
        if (hasSearchDates && resultDeadline !== null)
          rememberPageExpiry(searchedProperties, resultDeadline, 0, true);
        setProperties(
          hasSearchDates
            ? searchedProperties
            : searchedProperties.map((property) => ({ ...property, calculatedPrice: undefined })),
        );
        setAvailabilitySearchState(
          hasSearchDates ? (hasUnquotedResults ? 'partial' : 'success') : 'idle',
        );
      } else {
        if (retainSnapshot) loadedIdsRef.current = retainedIds;
        else setProperties([]);
        setAvailabilitySearchState('error');
      }

      if (scrollCatalogAfterSearch) scrollCatalog();
    },
    [
      getSurpriseCandidates,
      random,
      rememberPageExpiry,
      searchAccommodationsOverride,
      scrollCatalog,
      setFilters,
      setProperties,
    ],
  );

  const loadMoreSearchResults = useCallback(async () => {
    const continuation = continuationRef.current;
    if (!continuation || continuation.loading) return;
    continuation.loading = true;
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setSearchPagination((previous) => ({ ...previous, isLoading: true, error: false }));
    try {
      const page = await searchAccommodationsOverride(
        { ...continuation.params, skip: continuation.nextSkip },
        { signal: controller.signal },
      );
      if (continuation.generation !== searchGenerationRef.current) return;
      const pagination = page.pagination;
      if (pagination?.hasMore && pagination.nextSkip <= continuation.nextSkip)
        throw new Error('A paginação não avançou.');
      const incoming = page.data.filter((property) => !loadedIdsRef.current.has(property.id));
      const unique = [...new Map(incoming.map((property) => [property.id, property])).values()];
      const hasDates = Boolean(continuation.params.from && continuation.params.to);
      if (hasDates) {
        const deadline = Math.min(page.expiresAt ?? Infinity, Date.now() + 45_000);
        if (!Number.isFinite(deadline) || deadline <= Date.now())
          throw new Error('A cotação expirou.');
        rememberPageExpiry(unique, deadline, continuation.nextSkip, false);
      }
      unique.forEach((property) => loadedIdsRef.current.add(property.id));
      setProperties((previous) => [
        ...previous,
        ...unique.map((property) =>
          hasDates ? property : { ...property, calculatedPrice: undefined },
        ),
      ]);
      hasUnquotedRef.current ||= (page.unquotedCount ?? 0) > 0;
      if (hasDates && hasUnquotedRef.current && !hasExpiredResultsRef.current)
        setAvailabilitySearchState('partial');
      continuationRef.current = pagination?.hasMore
        ? { ...continuation, nextSkip: pagination.nextSkip, loading: false }
        : null;
      setSearchPagination({
        active: true,
        hasMore: Boolean(pagination?.hasMore),
        isLoading: false,
        error: false,
        loadedCount: loadedIdsRef.current.size,
      });
    } catch (error) {
      if (continuation.generation !== searchGenerationRef.current) return;
      console.warn('Unable to load the next search page:', error);
      continuation.loading = false;
      setSearchPagination((previous) => ({ ...previous, isLoading: false, error: true }));
    }
  }, [rememberPageExpiry, searchAccommodationsOverride, setProperties]);

  const retryLastSearch = useCallback(async () => {
    if (lastSearchParamsRef.current) {
      await handleStaysWidgetSearch(lastSearchParamsRef.current);
    }
  }, [handleStaysWidgetSearch]);

  restoreSearchFromUrlRef.current = (restoredFilters, options) => {
    const restoredParams = {
      checkIn: restoredFilters.checkIn,
      checkOut: restoredFilters.checkOut,
      persons: countOccupancyGuests(restoredFilters.guests),
      guests: restoredFilters.guests,
      destination: restoredFilters.destination,
      propertyId: restoredFilters.destinationPropertyId,
    };
    if (
      options?.scrollCatalog === false &&
      completedContextRef.current === getSearchContextKey(restoredParams)
    )
      return;
    return handleStaysWidgetSearch(restoredParams, {
      scrollCatalogAfterSearch: options?.scrollCatalog !== false,
    });
  };

  useEffect(() => {
    if (initialUrlSearchHandledRef.current) return;
    initialUrlSearchHandledRef.current = true;

    const initialUrl = new URL(initialLocationRef.current, window.location.origin);
    if (getAccommodationIdFromPath(initialUrl.pathname)) return;
    const initialFilters = parseSearchFilters(initialUrl.search);
    if (!initialFilters.checkIn || !initialFilters.checkOut) return;

    void handleStaysWidgetSearch({
      checkIn: initialFilters.checkIn,
      checkOut: initialFilters.checkOut,
      persons: countOccupancyGuests(initialFilters.guests),
      guests: initialFilters.guests,
      destination: initialFilters.destination,
      propertyId: initialFilters.destinationPropertyId,
    });
  }, [handleStaysWidgetSearch]);

  useEffect(
    () => () => {
      searchGenerationRef.current += 1;
      requestControllerRef.current?.abort();
      continuationRef.current = null;
      expirationsRef.current.clear();
      initialUrlSearchHandledRef.current = false;
    },
    [],
  );

  return {
    handleStaysWidgetSearch,
    retryLastSearch,
    availabilitySearchState,
    searchPagination,
    loadMoreSearchResults,
  };
}
