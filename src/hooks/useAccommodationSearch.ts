import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Property, SearchFilters } from '../types';
import { crcnBackendApi } from '../services/crcnBackendApi';
import type { SearchAccommodationsParams } from '../services/crcnBackendApi';
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
  'idle' | 'loading' | 'success' | 'partial' | 'error' | 'invalid-dates';

interface UseAccommodationSearchOptions {
  setProperties: Dispatch<SetStateAction<Property[]>>;
  setFilters: Dispatch<SetStateAction<SearchFilters>>;
  restoreSearchFromUrlRef: MutableRefObject<
    (filters: SearchFilters, options?: { scrollCatalog?: boolean }) => void | Promise<void>
  >;
  searchAccommodations?: (
    params: SearchAccommodationsParams,
  ) => Promise<{ total: number; data: Property[]; unquotedCount?: number }>;
  getSurpriseCandidates?: () => SurpriseDateOption[];
  random?: () => number;
  scrollCatalog?: () => void;
}

const searchAccommodations = (params: SearchAccommodationsParams) =>
  crcnBackendApi.searchAccommodations(params);

const scrollToAccommodationCatalog = () => {
  const catalogElement = document.getElementById('stays-apartments-catalog');
  if (catalogElement) scrollIntoViewRespectingMotion(catalogElement);
};

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
      const searchGeneration = ++searchGenerationRef.current;
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

      setAvailabilitySearchState('loading');
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
      let selectedDateOption: (typeof dateOptions)[number] | null = null;
      let successfulSearchCount = 0;
      let hasUnquotedResults = false;

      for (const dateOption of dateOptions) {
        try {
          const searchResult = await searchAccommodationsOverride({
            from: dateOption.checkIn,
            to: dateOption.checkOut,
            guests: searchParams.persons,
            destination: searchParams.destination,
            propertyId: searchParams.propertyId,
          });
          if (searchGeneration !== searchGenerationRef.current) return;
          successfulSearchCount += 1;
          hasUnquotedResults = (searchResult.unquotedCount ?? 0) > 0;
          const results = searchResult?.data || [];
          if (searchParams.surpriseMe) {
            const confirmedQuotes = results.filter(
              (property) =>
                Number((property as SearchResultProperty).calculatedPrice?.totalAmount) > 0,
            ) as SearchResultProperty[];
            if (confirmedQuotes.length) {
              searchedProperties = confirmedQuotes;
              selectedDateOption = dateOption;
              break;
            }
          } else {
            searchedProperties = results;
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
        const completedAllDateOptions =
          dateOptions.length > 0 && successfulSearchCount === dateOptions.length;
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
          setFilters((previous) => ({
            ...previous,
            checkIn: suggestedDates.checkIn,
            checkOut: suggestedDates.checkOut,
          }));
        }
      } else if (searchedProperties) {
        setProperties(
          hasSearchDates
            ? searchedProperties
            : searchedProperties.map((property) => ({ ...property, calculatedPrice: undefined })),
        );
        setAvailabilitySearchState(
          hasSearchDates ? (hasUnquotedResults ? 'partial' : 'success') : 'idle',
        );
      } else {
        setProperties([]);
        setAvailabilitySearchState('error');
      }

      if (scrollCatalogAfterSearch) scrollCatalog();
    },
    [
      getSurpriseCandidates,
      random,
      searchAccommodationsOverride,
      scrollCatalog,
      setFilters,
      setProperties,
    ],
  );

  const retryLastSearch = useCallback(async () => {
    if (lastSearchParamsRef.current) {
      await handleStaysWidgetSearch(lastSearchParamsRef.current);
    }
  }, [handleStaysWidgetSearch]);

  restoreSearchFromUrlRef.current = (restoredFilters, options) =>
    handleStaysWidgetSearch(
      {
        checkIn: restoredFilters.checkIn,
        checkOut: restoredFilters.checkOut,
        persons: countOccupancyGuests(restoredFilters.guests),
        guests: restoredFilters.guests,
        destination: restoredFilters.destination,
        propertyId: restoredFilters.destinationPropertyId,
      },
      { scrollCatalogAfterSearch: options?.scrollCatalog !== false },
    );

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

  return { handleStaysWidgetSearch, retryLastSearch, availabilitySearchState };
}
