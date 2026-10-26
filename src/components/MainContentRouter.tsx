import React from 'react';
import { LoaderCircle, RefreshCw, Search, Sparkles } from 'lucide-react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type {
  Currency,
  Property,
  Reservation,
  ReservationCancellationResult,
  SearchFilters,
} from '../types';
import type {
  AccommodationWidgetSearchParams,
  AvailabilitySearchState,
} from '../hooks/useAccommodationSearch';
import type { PropertyRouteStatus } from '../hooks/useAccommodationRouting';
import type { CondominiumSummary } from '../utils/condominiumCatalog';
import type { MainView } from './MobileBottomNavigation';
import type { DirectBookingOrderListItem } from '../services/checkoutApi';
import type { OwnerAccessStatus } from '../hooks/useAccountWorkspaceData';
import type { AppOverlayBookingPayload } from '../types/booking';
import { countOccupancyGuests } from '../utils/guestCounts';
import { CondominiumDirectory } from './condominium/CondominiumDirectory';
import { ActiveSearchFilters } from './search/ActiveSearchFilters';
import { AvailabilitySearchState as AvailabilitySearchStateView } from './search/AvailabilitySearchState';
import { StaysSearchWidget } from './search/StaysSearchWidget';
import { PropertyCatalogGrid } from './property/PropertyCatalogGrid';
import { CatalogLoadNotice } from './property/CatalogLoadNotice';
import { LazyFeatureBoundary } from './LazyFeatureBoundary';

const InteractiveMap = React.lazy(() =>
  import('./location/InteractiveMap').then(({ InteractiveMap }) => ({ default: InteractiveMap })),
);
const TripsView = React.lazy(() =>
  import('./booking/TripsView').then(({ TripsView }) => ({ default: TripsView })),
);
const WishlistsView = React.lazy(() =>
  import('./account/WishlistsView').then(({ WishlistsView }) => ({ default: WishlistsView })),
);
const HostDashboardView = React.lazy(() =>
  import('./owner/HostDashboardView').then(({ HostDashboardView }) => ({
    default: HostDashboardView,
  })),
);
const OwnerAccessAdminView = React.lazy(() =>
  import('./owner/OwnerAccessAdminView').then(({ OwnerAccessAdminView }) => ({
    default: OwnerAccessAdminView,
  })),
);
const PropertyDetailPage = React.lazy(() =>
  import('./property/PropertyDetailModal').then(({ PropertyDetailPage }) => ({
    default: PropertyDetailPage,
  })),
);

type PropertyCatalogStatus = 'loading' | 'error' | 'stale' | 'ready';

interface MainContentRouterProps {
  currentView: MainView;
  catalogFocusRef: RefObject<HTMLElement | null>;
  isCondominiumView: boolean;
  viewMode: 'grid' | 'map';
  filters: SearchFilters;
  activeFilterCount: number;
  defaultFilters: SearchFilters;
  currency: Currency;
  filteredProperties: Property[];
  catalogStatus: PropertyCatalogStatus;
  catalogLoading: boolean;
  onRetryCatalog: () => void;
  availabilitySearchState: AvailabilitySearchState;
  hasAvailableSearchResults: boolean;
  onRetryAvailabilitySearch: () => void;
  savedPropertyIds: string[];
  savedProperties: Property[];
  showTotalWithTaxes: boolean;
  condominiums: CondominiumSummary[];
  reservations: Reservation[];
  directBookingOrders?: DirectBookingOrderListItem[];
  directBookingOrdersError?: string;
  reservationsError?: string;
  reservationsLoading?: boolean;
  directBookingOrdersLoading?: boolean;
  onRetryAccountData?: () => void;
  onOpenAccount?: (mode: 'login' | 'signup') => void;
  selectedProperty: Property | null;
  propertyRouteStatus: PropertyRouteStatus;
  onRetryPropertyRoute: () => void;
  accessToken: string | undefined;
  ownerAccessStatus?: OwnerAccessStatus;
  isOwnerAdmin: boolean;
  onFiltersChange: Dispatch<SetStateAction<SearchFilters>>;
  onRemoveDestinationFilter: () => void;
  onRemoveDateFilter: () => void;
  onRemoveGuestFilter: () => void;
  onClearPropertyRefinements: () => void;
  onClearCatalogFilters: () => void;
  onOpenSearch: () => void;
  onSearchInApp: (params: AccommodationWidgetSearchParams) => void | Promise<void>;
  onOpenAssistant: () => void;
  onSelectCondominium: (condominium: CondominiumSummary) => void;
  onToggleSave: (propertyId: string) => void;
  onSelectProperty: (property: Property) => void;
  onStartBooking: (payload: AppOverlayBookingPayload) => void;
  onClosePropertyDetail: () => void;
  onResetFilters: () => void;
  onCancelReservation: (reservationId: string) => Promise<void | ReservationCancellationResult>;
  onExploreMore: () => void;
}

export function MainContentRouter({
  currentView,
  catalogFocusRef,
  isCondominiumView,
  viewMode,
  filters,
  activeFilterCount,
  defaultFilters,
  currency,
  filteredProperties,
  catalogStatus,
  catalogLoading,
  onRetryCatalog,
  availabilitySearchState,
  hasAvailableSearchResults,
  onRetryAvailabilitySearch,
  savedPropertyIds,
  savedProperties,
  showTotalWithTaxes,
  condominiums,
  reservations,
  directBookingOrders = [],
  directBookingOrdersError = '',
  reservationsError = '',
  reservationsLoading = false,
  directBookingOrdersLoading = false,
  onRetryAccountData,
  onOpenAccount,
  selectedProperty,
  propertyRouteStatus,
  onRetryPropertyRoute,
  accessToken,
  ownerAccessStatus = 'none',
  isOwnerAdmin,
  onFiltersChange,
  onRemoveDestinationFilter,
  onRemoveDateFilter,
  onRemoveGuestFilter,
  onClearPropertyRefinements,
  onClearCatalogFilters,
  onOpenSearch,
  onSearchInApp,
  onOpenAssistant,
  onSelectCondominium,
  onToggleSave,
  onSelectProperty,
  onStartBooking,
  onClosePropertyDetail,
  onResetFilters,
  onCancelReservation,
  onExploreMore,
}: MainContentRouterProps) {
  const shouldShowAvailabilityState =
    !isCondominiumView ||
    availabilitySearchState === 'loading' ||
    availabilitySearchState === 'error' ||
    availabilitySearchState === 'invalid-dates' ||
    (availabilitySearchState === 'success' && filteredProperties.length === 0);
  const hasConfirmedSearchAvailability =
    availabilitySearchState === 'success' && Boolean(filters.checkIn && filters.checkOut);
  const visibleCatalogStatus: PropertyCatalogStatus = hasConfirmedSearchAvailability
    ? 'ready'
    : catalogStatus;
  const searchGuestCount = countOccupancyGuests(filters.guests);

  const availabilitySearchStateView = (
    <AvailabilitySearchStateView
      state={availabilitySearchState}
      checkIn={filters.checkIn}
      checkOut={filters.checkOut}
      guests={searchGuestCount}
      resultCount={filteredProperties.length}
      hasResults={filteredProperties.length > 0}
      hasAvailableResults={
        hasAvailableSearchResults &&
        (isCondominiumView || viewMode === 'map' || availabilitySearchState === 'success')
      }
      showEmptyResults={viewMode === 'map' && !isCondominiumView}
      showIdleNotice={isCondominiumView}
      onRetry={onRetryAvailabilitySearch}
      onClearFilters={onClearCatalogFilters}
      onOpenSearch={onOpenSearch}
    />
  );

  return (
    <main
      ref={catalogFocusRef}
      tabIndex={-1}
      className={`flex-1 ${selectedProperty ? 'pb-12' : 'pb-[calc(6rem_+_env(safe-area-inset-bottom,0px))] sm:pb-12'}`}
    >
      {selectedProperty && (
        <LazyFeatureBoundary>
          <PropertyDetailPage
            property={selectedProperty}
            initialCheckIn={filters.checkIn}
            initialCheckOut={filters.checkOut}
            initialGuests={filters.guests}
            onClose={onClosePropertyDetail}
            currency={currency}
            isSaved={savedPropertyIds.includes(selectedProperty.id)}
            onToggleSave={onToggleSave}
            onStartBooking={onStartBooking}
          />
        </LazyFeatureBoundary>
      )}

      {!selectedProperty && propertyRouteStatus === 'loading' && (
        <div
          role="status"
          aria-live="polite"
          className="mx-auto flex min-h-[55vh] max-w-3xl items-center justify-center gap-3 px-6 text-center text-sm font-semibold text-neutral-700"
        >
          <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin text-orange-700" />
          Carregando os detalhes da acomodação…
        </div>
      )}

      {!selectedProperty && propertyRouteStatus === 'unavailable' && (
        <section
          role="alert"
          className="mx-auto flex min-h-[55vh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center"
        >
          <h1 className="text-2xl font-extrabold text-neutral-900">
            Não foi possível abrir esta acomodação
          </h1>
          <p className="text-sm text-neutral-600">
            O link pode estar desatualizado ou a conexão pode ter falhado. Volte à busca para
            continuar.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={onRetryPropertyRoute}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-neutral-950 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={onClosePropertyDetail}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-neutral-300 bg-white px-5 py-2.5 text-sm font-bold text-neutral-800 transition hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
            >
              Voltar à busca
            </button>
          </div>
        </section>
      )}

      {!selectedProperty && propertyRouteStatus === 'idle' && currentView === 'explore' && (
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 [@media(max-height:400px)]:py-0 [@media(max-width:639px)_and_(max-height:400px)]:px-2">
          {filteredProperties.some((property) => property.simulatedData) && (
            <p
              role="status"
              className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 max-[400px]:mb-2 max-[400px]:px-3 max-[400px]:py-2 max-[400px]:text-xs max-[400px]:leading-4 [@media(max-height:400px)]:mb-2 [@media(max-height:400px)]:px-2 [@media(max-height:400px)]:py-1 [@media(max-height:400px)]:text-xs [@media(max-height:400px)]:leading-4 [@media(max-width:639px)_and_(max-height:400px)]:mb-0 [@media(max-width:639px)_and_(max-height:400px)]:py-0 [@media(max-width:639px)_and_(max-height:400px)]:leading-3"
            >
              Ambiente de simulação: preços e disponibilidade são fictícios. Reservas e pagamentos
              não são realizados.
            </p>
          )}
          {!isCondominiumView && (
            <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2 min-[400px]:hidden [@media(max-height:400px)]:mb-1 [@media(max-height:400px)]:grid">
              <button
                type="button"
                onClick={onOpenSearch}
                aria-label="Pesquisar datas e hóspedes"
                className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-2xl border border-orange-200 bg-white/85 px-3 text-sm font-bold text-neutral-800 shadow-sm transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
              >
                <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-orange-700" />
                <span className="truncate">Datas e hóspedes</span>
              </button>
              <button
                type="button"
                onClick={onOpenAssistant}
                aria-label="Falar com Sofia, assistente virtual"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-orange-200 bg-white/85 px-3 text-sm font-bold text-orange-800 shadow-sm transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
              >
                <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span>Sofia</span>
              </button>
            </div>
          )}
          {!isCondominiumView && (
            <div className="mb-4 sm:mb-8 max-[399px]:hidden [@media(max-height:400px)]:hidden">
              <StaysSearchWidget
                variant="hero"
                currentFilters={filters}
                onSearchInApp={onSearchInApp}
                onOpenAssistant={onOpenAssistant}
              />
            </div>
          )}

          <ActiveSearchFilters
            filters={filters}
            activeFilterCount={activeFilterCount}
            defaultFilters={defaultFilters}
            onChange={onFiltersChange}
            onRemoveDestination={onRemoveDestinationFilter}
            onRemoveDates={onRemoveDateFilter}
            onRemoveGuests={onRemoveGuestFilter}
            onClearFilters={onClearPropertyRefinements}
          />

          <div id="stays-apartments-catalog" className="scroll-mt-24">
            {isCondominiumView && !shouldShowAvailabilityState ? (
              <>
                {availabilitySearchStateView}
                {(filteredProperties.length > 0 || !hasAvailableSearchResults) && (
                  <CondominiumDirectory
                    condominiums={condominiums}
                    onSelectCondominium={onSelectCondominium}
                  />
                )}
              </>
            ) : (
              availabilitySearchStateView
            )}

            {!isCondominiumView &&
              (availabilitySearchState === 'idle' ||
                (availabilitySearchState === 'success' && filteredProperties.length > 0)) &&
              (viewMode === 'grid' ? (
                <PropertyCatalogGrid
                  status={visibleCatalogStatus}
                  properties={filteredProperties}
                  currency={currency}
                  savedPropertyIds={savedPropertyIds}
                  showTotalWithTaxes={showTotalWithTaxes}
                  hasSearchDates={Boolean(filters.checkIn && filters.checkOut)}
                  availabilityConfirmed={hasConfirmedSearchAvailability}
                  hasAvailableSearchResults={hasAvailableSearchResults}
                  searchGuestCount={searchGuestCount}
                  isRefreshingCatalog={!hasConfirmedSearchAvailability && catalogLoading}
                  onRetryCatalog={onRetryCatalog}
                  onToggleSave={onToggleSave}
                  onSelectProperty={onSelectProperty}
                  onResetFilters={onResetFilters}
                  onClearCatalogFilters={onClearCatalogFilters}
                />
              ) : (
                <div>
                  <CatalogLoadNotice
                    status={visibleCatalogStatus}
                    isRefreshing={!hasConfirmedSearchAvailability && catalogLoading}
                    onRetry={onRetryCatalog}
                  />
                  {visibleCatalogStatus !== 'loading' &&
                    visibleCatalogStatus !== 'error' &&
                    filteredProperties.length > 0 && (
                      <LazyFeatureBoundary>
                        <InteractiveMap
                          properties={filteredProperties}
                          currency={currency}
                          hasSearchDates={Boolean(filters.checkIn && filters.checkOut)}
                          availabilityConfirmed={hasConfirmedSearchAvailability}
                          searchGuestCount={searchGuestCount}
                          showTotalWithTaxes={showTotalWithTaxes}
                          onSelectProperty={onSelectProperty}
                          selectedProperty={selectedProperty}
                        />
                      </LazyFeatureBoundary>
                    )}
                </div>
              ))}
          </div>
        </div>
      )}

      {!selectedProperty && currentView === 'trips' && (
        <LazyFeatureBoundary>
          <TripsView
            reservations={reservations}
            directBookingOrders={directBookingOrders}
            directBookingOrdersError={directBookingOrdersError}
            reservationsError={reservationsError}
            reservationsLoading={reservationsLoading}
            directBookingOrdersLoading={directBookingOrdersLoading}
            onRetryAccountData={onRetryAccountData}
            onOpenAccount={onOpenAccount}
            accessToken={accessToken}
            currency={currency}
            onCancelReservation={onCancelReservation}
            onExploreMore={onExploreMore}
          />
        </LazyFeatureBoundary>
      )}

      {!selectedProperty && currentView === 'wishlists' && (
        <LazyFeatureBoundary>
          <WishlistsView
            savedProperties={savedProperties}
            currency={currency}
            onToggleSave={onToggleSave}
            onSelectProperty={onSelectProperty}
            onExploreMore={onExploreMore}
            showTotalWithTaxes={showTotalWithTaxes}
          />
        </LazyFeatureBoundary>
      )}

      {!selectedProperty &&
        currentView === 'host' &&
        ownerAccessStatus === 'approved' &&
        accessToken && (
          <LazyFeatureBoundary>
            <HostDashboardView accessToken={accessToken} />
          </LazyFeatureBoundary>
        )}

      {!selectedProperty && currentView === 'ownerAdmin' && isOwnerAdmin && accessToken && (
        <LazyFeatureBoundary>
          <OwnerAccessAdminView accessToken={accessToken} />
        </LazyFeatureBoundary>
      )}
    </main>
  );
}
