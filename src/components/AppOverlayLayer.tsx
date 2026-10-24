import React from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { Currency, Property, SearchFilters } from '../types';
import type { AccommodationWidgetSearchParams } from '../hooks/useAccommodationSearch';
import type { CondominiumSummary } from '../utils/condominiumCatalog';
import type { AccountModalMode } from '../hooks/useSupabaseSession';
import type { AppOverlayBookingPayload } from '../types/booking';
import { DeferredModal } from './DeferredModal';

const CondominiumDetailModal = React.lazy(() =>
  import('./condominium/CondominiumDetailModal').then(({ CondominiumDetailModal }) => ({
    default: CondominiumDetailModal,
  })),
);
const CheckoutModal = React.lazy(() =>
  import('./booking/CheckoutModal').then(({ CheckoutModal }) => ({ default: CheckoutModal })),
);
const GuestAccountModal = React.lazy(() =>
  import('./account/GuestAccountModal').then(({ GuestAccountModal }) => ({
    default: GuestAccountModal,
  })),
);
const SearchModal = React.lazy(() =>
  import('./search/SearchModal').then(({ SearchModal }) => ({ default: SearchModal })),
);
const FilterModal = React.lazy(() =>
  import('./search/FilterModal').then(({ FilterModal }) => ({ default: FilterModal })),
);
const CreateListingModal = React.lazy(() =>
  import('./owner/CreateListingModal').then(({ CreateListingModal }) => ({
    default: CreateListingModal,
  })),
);
const SofiaAssistantModal = React.lazy(() =>
  import('./assistant/SofiaAssistantModal').then(({ SofiaAssistantModal }) => ({
    default: SofiaAssistantModal,
  })),
);

export interface AppOverlayLayerProps {
  currency: Currency;
  filters: SearchFilters;
  defaultFilters: SearchFilters;
  setFilters: Dispatch<SetStateAction<SearchFilters>>;
  selectedCondominium: CondominiumSummary | null;
  bookingPayload: AppOverlayBookingPayload | null;
  accountModalMode: AccountModalMode;
  accountReturnFocusRef?: RefObject<HTMLButtonElement | null>;
  properties: Property[];
  isSofiaOpen: boolean;
  isSearchOpen: boolean;
  isFilterOpen: boolean;
  isCreateListingOpen: boolean;
  onCloseCondominium: () => void;
  onCloseSofia: () => void;
  onSelectPropertyFromSofia: (property: Property) => void;
  onApplySofiaFilters: (filters: { destination?: string; guests?: number }) => void;
  onCloseCheckout: () => void;
  onCloseAccount: () => void;
  onCloseSearch: () => void;
  onCloseFilter: () => void;
  onCloseCreateListing: () => void;
  onAddProperty: (property: Property) => void;
  onSearchInApp: (params: AccommodationWidgetSearchParams) => void | Promise<void>;
}

export function AppOverlayLayer({
  currency,
  filters,
  defaultFilters,
  setFilters,
  selectedCondominium,
  bookingPayload,
  accountModalMode,
  accountReturnFocusRef,
  properties,
  isSofiaOpen,
  isSearchOpen,
  isFilterOpen,
  isCreateListingOpen,
  onCloseCondominium,
  onCloseSofia,
  onSelectPropertyFromSofia,
  onApplySofiaFilters,
  onCloseCheckout,
  onCloseAccount,
  onCloseSearch,
  onCloseFilter,
  onCloseCreateListing,
  onAddProperty,
  onSearchInApp,
}: AppOverlayLayerProps) {
  return (
    <>
      <DeferredModal active={selectedCondominium !== null}>
        <CondominiumDetailModal condominium={selectedCondominium} onClose={onCloseCondominium} />
      </DeferredModal>

      <DeferredModal active={isSofiaOpen}>
        <SofiaAssistantModal
          isOpen={isSofiaOpen}
          onClose={onCloseSofia}
          currency={currency}
          onSelectProperty={onSelectPropertyFromSofia}
          onApplyFilters={onApplySofiaFilters}
        />
      </DeferredModal>

      <DeferredModal active={bookingPayload !== null}>
        <CheckoutModal
          isOpen={bookingPayload !== null}
          onClose={onCloseCheckout}
          bookingData={bookingPayload}
          currency={currency}
        />
      </DeferredModal>

      <DeferredModal active={accountModalMode !== null}>
        <GuestAccountModal
          isOpen={accountModalMode !== null}
          initialMode={accountModalMode || 'login'}
          onClose={onCloseAccount}
          returnFocusRef={accountReturnFocusRef}
        />
      </DeferredModal>

      <DeferredModal active={isSearchOpen}>
        <SearchModal
          isOpen={isSearchOpen}
          onClose={onCloseSearch}
          filters={filters}
          onApplyFilters={setFilters}
          onResetFilters={() => setFilters(defaultFilters)}
          onSearchInApp={onSearchInApp}
        />
      </DeferredModal>

      <DeferredModal active={isFilterOpen}>
        <FilterModal
          isOpen={isFilterOpen}
          onClose={onCloseFilter}
          filters={filters}
          onApplyFilters={setFilters}
          onResetFilters={() =>
            setFilters((current) => ({
              ...defaultFilters,
              destination: current.destination,
              destinationPropertyId: current.destinationPropertyId,
              checkIn: current.checkIn,
              checkOut: current.checkOut,
              guests: current.guests,
            }))
          }
          currency={currency}
          properties={properties}
        />
      </DeferredModal>

      <DeferredModal active={isCreateListingOpen}>
        <CreateListingModal
          isOpen={isCreateListingOpen}
          onClose={onCloseCreateListing}
          onAddProperty={onAddProperty}
          currency={currency}
        />
      </DeferredModal>
    </>
  );
}
