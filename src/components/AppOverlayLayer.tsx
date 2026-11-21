import React from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { Currency, Property, SearchFilters } from '../types';
import type { AccommodationWidgetSearchParams } from '../hooks/useAccommodationSearch';
import type { CondominiumSummary } from '../utils/condominiumCatalog';
import type { AccountModalMode } from '../hooks/useSupabaseSession';
import type { AppOverlayBookingPayload } from '../types/booking';
import { DeferredModal } from './DeferredModal';
import { apiFetch } from '../services/apiFetch';
import { isProperty, isRecord } from '../utils/apiValidation';

const CondominiumDetailModal = React.lazy(() =>
  import('./condominium/CondominiumDetailModal').then(({ CondominiumDetailModal }) => ({
    default: CondominiumDetailModal,
  })),
);
const PropertyDetailModal = React.lazy(() =>
  import('./property/PropertyDetailModal').then(({ PropertyDetailModal }) => ({
    default: PropertyDetailModal,
  })),
);
const CheckoutEntry = React.lazy(() =>
  import('./booking/CheckoutEntry').then(({ CheckoutEntry }) => ({
    default: CheckoutEntry,
  })),
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

function SearchModalLoadingFallback() {
  return (
    <div
      role="status"
      aria-label="Carregando busca de hospedagens"
      aria-busy="true"
      className="fixed inset-0 z-[100] flex bg-neutral-100 sm:items-start sm:justify-center sm:bg-neutral-950/70 sm:p-4 sm:pt-16"
    >
      <div className="flex h-dvh w-full max-w-3xl flex-col sm:h-auto sm:max-h-[85vh] sm:overflow-hidden sm:rounded-3xl sm:bg-white sm:shadow-2xl">
        <header className="flex h-20 shrink-0 items-center justify-between px-5 sm:border-b sm:border-neutral-200">
          <span className="text-base font-bold text-neutral-900">Buscar hospedagens</span>
          <span className="h-11 w-11 rounded-full border border-neutral-200 bg-white shadow-sm" />
        </header>
        <main className="min-h-0 flex-1 space-y-3 overflow-hidden px-3 pb-4 sm:overflow-y-auto sm:p-5">
          <section className="space-y-5 rounded-3xl bg-white p-6 shadow-lg">
            <div className="h-8 w-28 rounded-lg bg-neutral-200 motion-safe:animate-pulse" />
            <div className="h-14 rounded-xl bg-neutral-100 motion-safe:animate-pulse" />
            <div className="space-y-3">
              {Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="flex h-[68px] items-center gap-3 rounded-xl bg-neutral-50 px-3"
                >
                  <span className="h-12 w-12 shrink-0 rounded-xl bg-orange-100 motion-safe:animate-pulse" />
                  <span className="min-w-0 flex-1 space-y-2">
                    <span className="block h-4 w-2/3 rounded bg-neutral-200 motion-safe:animate-pulse" />
                    <span className="block h-3 w-1/2 rounded bg-neutral-100 motion-safe:animate-pulse" />
                  </span>
                </div>
              ))}
            </div>
          </section>
          <div className="flex h-16 items-center justify-between rounded-2xl bg-white px-5 shadow-sm sm:hidden">
            <span className="h-4 w-20 rounded bg-neutral-200 motion-safe:animate-pulse" />
            <span className="h-12 w-28 rounded-xl bg-neutral-300 motion-safe:animate-pulse" />
          </div>
        </main>
        <span className="sr-only">Preparando os campos de destino, datas e hóspedes.</span>
      </div>
    </div>
  );
}

export interface AppOverlayLayerProps {
  currency: Currency;
  filters: SearchFilters;
  defaultFilters: SearchFilters;
  setFilters: Dispatch<SetStateAction<SearchFilters>>;
  selectedProperty: Property | null;
  selectedCondominium: CondominiumSummary | null;
  bookingPayload: AppOverlayBookingPayload | null;
  checkoutGuestPrefill: { fullName: string; email: string; phone: string };
  accountModalMode: AccountModalMode;
  accountReturnFocusRef?: RefObject<HTMLButtonElement | null>;
  catalogFocusRef: RefObject<HTMLElement | null>;
  savedPropertyIds: string[];
  properties: Property[];
  catalogProperties: Property[];
  hasMoreSearchResults?: boolean;
  isSofiaOpen: boolean;
  isSearchOpen: boolean;
  isFilterOpen: boolean;
  isCreateListingOpen: boolean;
  onClosePropertyDetail: () => void;
  onStartBooking: (payload: AppOverlayBookingPayload) => void;
  onToggleSave: (propertyId: string) => void;
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
  selectedProperty,
  selectedCondominium,
  bookingPayload,
  checkoutGuestPrefill,
  accountModalMode,
  accountReturnFocusRef,
  catalogFocusRef,
  savedPropertyIds,
  properties,
  catalogProperties,
  hasMoreSearchResults = false,
  isSofiaOpen,
  isSearchOpen,
  isFilterOpen,
  isCreateListingOpen,
  onClosePropertyDetail,
  onStartBooking,
  onToggleSave,
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
  const [partnerResult, setPartnerResult] = React.useState<{
    property: Property;
    from: string;
    to: string;
    guests: number;
  } | null>(null);
  const [partnerSearchState, setPartnerSearchState] = React.useState({
    loading: false,
    message: '',
  });
  const partnerGeneration = React.useRef(0);
  React.useEffect(() => {
    partnerGeneration.current += 1;
    setPartnerResult(null);
    setPartnerSearchState({ loading: false, message: '' });
    return () => {
      partnerGeneration.current += 1;
    };
  }, [selectedProperty?.id]);

  const searchPartner = async (from: string, to: string, guests: number) => {
    if (!selectedProperty || selectedProperty.dataSource !== 'imobsys-live') return;
    const id = selectedProperty.id;
    const generation = ++partnerGeneration.current;
    setPartnerSearchState({ loading: true, message: '' });
    try {
      const params = new URLSearchParams({ from, to, guests: String(guests), propertyId: id });
      const response = await apiFetch(`/api/imobsys/offers?${params}`);
      if (!response.ok) throw new Error('Consulta indisponível');
      const body: unknown = await response.json();
      if (generation !== partnerGeneration.current) return;
      if (!isRecord(body) || !Array.isArray(body.data)) throw new Error('Resposta inválida');
      const found = body.data.find((item: unknown) => isProperty(item) && item.id === id);
      if (!isProperty(found)) {
        setPartnerSearchState({
          loading: false,
          message: 'Não encontramos uma oferta para as datas e hóspedes escolhidos.',
        });
        return;
      }
      setPartnerResult({ property: found, from, to, guests });
      setPartnerSearchState({ loading: false, message: '' });
    } catch {
      if (generation === partnerGeneration.current)
        setPartnerSearchState({
          loading: false,
          message: 'Não foi possível consultar a oferta agora. Tente novamente.',
        });
    }
  };
  const currentPartner = partnerResult?.property.id === selectedProperty?.id ? partnerResult : null;
  return (
    <>
      <DeferredModal active={selectedProperty !== null}>
        <PropertyDetailModal
          property={currentPartner?.property ?? selectedProperty}
          initialCheckIn={currentPartner?.from ?? filters.checkIn}
          initialCheckOut={currentPartner?.to ?? filters.checkOut}
          initialGuests={
            currentPartner
              ? { adults: currentPartner.guests, children: 0, infants: 0, pets: 0 }
              : filters.guests
          }
          onClose={onClosePropertyDetail}
          returnFocusRef={catalogFocusRef}
          currency={currency}
          isSaved={selectedProperty ? savedPropertyIds.includes(selectedProperty.id) : false}
          onToggleSave={onToggleSave}
          onStartBooking={onStartBooking}
          onImobSysSearch={
            selectedProperty?.dataSource === 'imobsys-live' ? searchPartner : undefined
          }
          imobSysSearchState={
            selectedProperty?.dataSource === 'imobsys-live' ? partnerSearchState : undefined
          }
        />
      </DeferredModal>

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
        <CheckoutEntry
          isOpen={bookingPayload !== null}
          onClose={onCloseCheckout}
          bookingData={bookingPayload}
          guestPrefill={checkoutGuestPrefill}
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

      <DeferredModal active={isSearchOpen} fallback={<SearchModalLoadingFallback />}>
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
          hasMoreSearchResults={hasMoreSearchResults}
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
          amenityProperties={catalogProperties}
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
