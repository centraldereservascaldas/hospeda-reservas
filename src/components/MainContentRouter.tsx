import React from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { Currency, Property, Reservation, ReservationCancellationResult, SearchFilters } from '../types';
import type { AccommodationWidgetSearchParams } from '../hooks/useAccommodationSearch';
import type { CondominiumSummary } from '../utils/condominiumCatalog';
import type { MainView } from './MobileBottomNavigation';
import { CondominiumDirectory } from './condominium/CondominiumDirectory';
import { ActiveSearchFilters } from './search/ActiveSearchFilters';
import { StaysSearchWidget } from './search/StaysSearchWidget';
import { PropertyCatalogGrid } from './property/PropertyCatalogGrid';
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
  savedPropertyIds: string[];
  savedProperties: Property[];
  showTotalWithTaxes: boolean;
  condominiums: CondominiumSummary[];
  reservations: Reservation[];
  selectedProperty: Property | null;
  accessToken: string | undefined;
  isOwnerAdmin: boolean;
  onFiltersChange: Dispatch<SetStateAction<SearchFilters>>;
  onSearchInApp: (params: AccommodationWidgetSearchParams) => void | Promise<void>;
  onOpenAssistant: () => void;
  onSelectCondominium: (condominium: CondominiumSummary) => void;
  onToggleSave: (propertyId: string) => void;
  onSelectProperty: (property: Property) => void;
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
  savedPropertyIds,
  savedProperties,
  showTotalWithTaxes,
  condominiums,
  reservations,
  selectedProperty,
  accessToken,
  isOwnerAdmin,
  onFiltersChange,
  onSearchInApp,
  onOpenAssistant,
  onSelectCondominium,
  onToggleSave,
  onSelectProperty,
  onResetFilters,
  onCancelReservation,
  onExploreMore,
}: MainContentRouterProps) {
  return (
    <main ref={catalogFocusRef} tabIndex={-1} className="flex-1 pb-24 sm:pb-12">
      {currentView === 'explore' && (
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {!isCondominiumView && (
            <div className="mb-8">
              <StaysSearchWidget
                variant="hero"
                currentFilters={filters}
                onSearchInApp={onSearchInApp}
                onOpenAssistant={onOpenAssistant}
              />
            </div>
          )}

          {!isCondominiumView && (
            <ActiveSearchFilters
              filters={filters}
              activeFilterCount={activeFilterCount}
              defaultFilters={defaultFilters}
              onChange={onFiltersChange}
            />
          )}

          <div id="stays-apartments-catalog" className="scroll-mt-24">
            {isCondominiumView ? (
              <CondominiumDirectory
                condominiums={condominiums}
                onSelectCondominium={onSelectCondominium}
              />
            ) : viewMode === 'grid' ? (
              <PropertyCatalogGrid
                status={catalogStatus}
                properties={filteredProperties}
                currency={currency}
                savedPropertyIds={savedPropertyIds}
                showTotalWithTaxes={showTotalWithTaxes}
                onToggleSave={onToggleSave}
                onSelectProperty={onSelectProperty}
                onResetFilters={onResetFilters}
              />
            ) : (
              <LazyFeatureBoundary>
                <InteractiveMap
                  properties={filteredProperties}
                  currency={currency}
                  onSelectProperty={onSelectProperty}
                  selectedProperty={selectedProperty}
                />
              </LazyFeatureBoundary>
            )}
          </div>
        </div>
      )}

      {currentView === 'trips' && (
        <LazyFeatureBoundary>
          <TripsView
            reservations={reservations}
            currency={currency}
            onCancelReservation={onCancelReservation}
            onExploreMore={onExploreMore}
          />
        </LazyFeatureBoundary>
      )}

      {currentView === 'wishlists' && (
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

      {currentView === 'host' && (
        <LazyFeatureBoundary>
          <HostDashboardView accessToken={accessToken || ''} />
        </LazyFeatureBoundary>
      )}

      {currentView === 'ownerAdmin' && isOwnerAdmin && accessToken && (
        <LazyFeatureBoundary>
          <OwnerAccessAdminView accessToken={accessToken} />
        </LazyFeatureBoundary>
      )}
    </main>
  );
}
