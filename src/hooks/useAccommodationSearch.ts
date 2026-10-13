import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Property, SearchFilters } from '../types';
import { crcnBackendApi } from '../services/crcnBackendApi';
import type { SearchAccommodationsParams } from '../services/crcnBackendApi';
import { getSurpriseDateCandidates } from '../utils/surpriseDates';
import type { SurpriseDateOption } from '../utils/surpriseDates';
import { parseSearchFilters } from '../utils/searchUrlState';
import { scrollIntoViewRespectingMotion } from '../utils/motion';

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

interface UseAccommodationSearchOptions {
  setProperties: Dispatch<SetStateAction<Property[]>>;
  setFilters: Dispatch<SetStateAction<SearchFilters>>;
  restoreSearchFromUrlRef: MutableRefObject<(filters: SearchFilters) => void>;
  searchAccommodations?: (
    params: SearchAccommodationsParams,
  ) => Promise<{ total: number; data: Property[] }>;
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

  const handleStaysWidgetSearch = useCallback(
    async (searchParams: AccommodationWidgetSearchParams) => {
      let searchedProperties: SearchResultProperty[] | null = null;
      setFilters((previous) => ({
        ...previous,
        ...(searchParams.surpriseMe
          ? {}
          : { checkIn: searchParams.checkIn, checkOut: searchParams.checkOut }),
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

      for (const dateOption of dateOptions) {
        try {
          const searchResult = await searchAccommodationsOverride({
            from: dateOption.checkIn,
            to: dateOption.checkOut,
            guests: searchParams.persons,
            destination: searchParams.destination,
            propertyId: searchParams.propertyId,
          });
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
        if (chosenProperties.length) {
          const suggestedDates = selectedDateOption!;
          setFilters((previous) => ({
            ...previous,
            checkIn: suggestedDates.checkIn,
            checkOut: suggestedDates.checkOut,
          }));
        }
      } else if (searchedProperties) {
        setProperties(searchedProperties);
      }

      scrollCatalog();
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

  restoreSearchFromUrlRef.current = (restoredFilters) => {
    void handleStaysWidgetSearch({
      checkIn: restoredFilters.checkIn,
      checkOut: restoredFilters.checkOut,
      persons: restoredFilters.guests.adults + restoredFilters.guests.children,
      guests: restoredFilters.guests,
      destination: restoredFilters.destination,
      propertyId: restoredFilters.destinationPropertyId,
    });
  };

  useEffect(() => {
    if (initialUrlSearchHandledRef.current) return;
    initialUrlSearchHandledRef.current = true;

    const initialUrl = new URL(initialLocationRef.current, window.location.origin);
    if (initialUrl.pathname.startsWith('/apartamento/')) return;
    const initialFilters = parseSearchFilters(initialUrl.search);
    if (!initialFilters.checkIn || !initialFilters.checkOut) return;

    void handleStaysWidgetSearch({
      checkIn: initialFilters.checkIn,
      checkOut: initialFilters.checkOut,
      persons: initialFilters.guests.adults + initialFilters.guests.children,
      guests: initialFilters.guests,
      destination: initialFilters.destination,
      propertyId: initialFilters.destinationPropertyId,
    });
  }, [handleStaysWidgetSearch]);

  return { handleStaysWidgetSearch };
}
