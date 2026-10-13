import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Property, SearchFilters } from '../types';
import type { AppOverlayBookingPayload } from '../types/booking';
import { scrollIntoViewRespectingMotion } from '../utils/motion';

export interface AppOverlaySuggestedFilters {
  destination?: string;
  guests?: number;
}

interface UseAppOverlayActionsOptions {
  setProperties: Dispatch<SetStateAction<Property[]>>;
  setFilters: Dispatch<SetStateAction<SearchFilters>>;
  setIsSofiaOpen: Dispatch<SetStateAction<boolean>>;
  setBookingPayload: Dispatch<SetStateAction<AppOverlayBookingPayload | null>>;
  onClosePropertyDetail: () => void;
  onSelectProperty: (property: Property) => void;
  scrollCatalog?: () => void;
}

const scrollToAccommodationCatalog = () => {
  const catalogElement = document.getElementById('stays-apartments-catalog');
  if (catalogElement) scrollIntoViewRespectingMotion(catalogElement);
};

export function useAppOverlayActions({
  setProperties,
  setFilters,
  setIsSofiaOpen,
  setBookingPayload,
  onClosePropertyDetail,
  onSelectProperty,
  scrollCatalog = scrollToAccommodationCatalog,
}: UseAppOverlayActionsOptions) {
  const handleAddNewProperty = useCallback(
    (property: Property) => {
      setProperties((current) => [property, ...current]);
    },
    [setProperties],
  );

  const handleStartBooking = useCallback(
    (payload: AppOverlayBookingPayload) => {
      onClosePropertyDetail();
      setBookingPayload(payload);
    },
    [onClosePropertyDetail, setBookingPayload],
  );

  const handleAssistantApplyFilters = useCallback(
    (suggested: AppOverlaySuggestedFilters) => {
      if (suggested.destination || suggested.guests) {
        setFilters((previous) => ({
          ...previous,
          ...(suggested.destination ? { destination: suggested.destination } : {}),
          ...(suggested.guests ? { guests: { ...previous.guests, adults: suggested.guests } } : {}),
        }));
      }
      setIsSofiaOpen(false);
      scrollCatalog();
    },
    [scrollCatalog, setFilters, setIsSofiaOpen],
  );

  const handleSelectPropertyFromSofia = useCallback(
    (property: Property) => {
      setIsSofiaOpen(false);
      onSelectProperty(property);
    },
    [onSelectProperty, setIsSofiaOpen],
  );

  return {
    handleAddNewProperty,
    handleStartBooking,
    handleAssistantApplyFilters,
    handleSelectPropertyFromSofia,
  };
}
