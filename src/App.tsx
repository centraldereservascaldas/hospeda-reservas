/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useEffect, useState, useRef } from 'react';
import { Property, SearchFilters, Currency } from './types';
import { Header } from './components/Header';
import { AuthCallbackNotice } from './components/account/AuthCallbackNotice';
import { CategoryBar } from './components/search/CategoryBar';
import {
  MobileBottomNavigation,
  resolveMobileNavigationTarget,
} from './components/MobileBottomNavigation';
import type { MainView } from './components/MobileBottomNavigation';
import { AppFooter } from './components/AppFooter';
import { SofiaAssistantTrigger } from './components/assistant/SofiaAssistantTrigger';
import { getAuthCallbackError } from './utils/authCallback';
import { MainContentRouter } from './components/MainContentRouter';
import { AppOverlayLayer } from './components/AppOverlayLayer';
import type { AppOverlayBookingPayload } from './types/booking';
import { createDefaultSearchFilters, parseSearchFilters } from './utils/searchUrlState';
import { useSearchUrlSync } from './hooks/useSearchUrlSync';
import type { CondominiumSummary } from './utils/condominiumCatalog';
import { useAccommodationCatalog } from './hooks/useAccommodationCatalog';
import { useExploreCatalogViewModel } from './hooks/useExploreCatalogViewModel';
import {
  PROPERTY_DETAIL_RETURN_FOCUS_PROPERTY,
  useAccommodationRouting,
} from './hooks/useAccommodationRouting';
import { useAccountWorkspaceData } from './hooks/useAccountWorkspaceData';
import { useSupabaseSession } from './hooks/useSupabaseSession';
import { useAccommodationSearch } from './hooks/useAccommodationSearch';
import { useAccountActions } from './hooks/useAccountActions';
import { useSavedPropertyIds } from './hooks/useSavedPropertyIds';
import { CHECKOUT_MODAL_HISTORY_ENTRY, useAppOverlayActions } from './hooks/useAppOverlayActions';
import { focusWithoutScrolling } from './utils/focus';
import { countOccupancyGuests } from './utils/guestCounts';

const CheckoutResumePage = lazy(() =>
  import('./components/booking/CheckoutResumePage').then(({ CheckoutResumePage }) => ({
    default: CheckoutResumePage,
  })),
);

const initialAuthCallbackError = getAuthCallbackError(window.location.search, window.location.hash);

function CheckoutResumeEntry({ reference }: { reference: string }) {
  const { accountSession } = useSupabaseSession({
    isConfigured: Boolean(
      import.meta.env.VITE_SUPABASE_URL?.trim() && import.meta.env.VITE_SUPABASE_ANON_KEY?.trim(),
    ),
    initialHash: window.location.hash,
    initialAuthCallbackError,
  });

  return <CheckoutResumePage reference={reference} accessToken={accountSession?.access_token} />;
}

function MarketplaceApp() {
  const { properties, setProperties, catalogLoading, catalogLoadError, retryCatalog } =
    useAccommodationCatalog();

  const { savedPropertyIds, toggleSavedProperty } = useSavedPropertyIds();

  // Currency & Display preferences
  const [currency, setCurrency] = useState<Currency>('BRL');
  const [showTotalWithTaxes, setShowTotalWithTaxes] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [currentView, setCurrentView] = useState<MainView>('explore');
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const currentViewRef = useRef(currentView);
  currentViewRef.current = currentView;
  const {
    accountSession,
    accountModalMode,
    setAccountModalMode,
    authCallbackNotice,
    setAuthCallbackNotice,
  } = useSupabaseSession({
    isConfigured: Boolean(
      import.meta.env.VITE_SUPABASE_URL?.trim() && import.meta.env.VITE_SUPABASE_ANON_KEY?.trim(),
    ),
    initialHash: window.location.hash,
    initialAuthCallbackError,
  });
  const {
    reservations,
    reservationsError,
    reservationsLoading,
    setReservations,
    directBookingOrders,
    directBookingOrdersError,
    directBookingOrdersLoading,
    refreshAccountData,
    ownerAccessStatus,
    setOwnerAccessStatus,
    isOwnerAdmin,
  } = useAccountWorkspaceData({
    accessToken: accountSession?.access_token,
    currentView,
    currentViewRef,
    setCurrentView,
  });
  const {
    ownerRequestLoading,
    handleCancelReservation,
    handleRequestOwnerAccess,
    handleSetCurrentView,
    handleSignOut,
  } = useAccountActions({
    accessToken: accountSession?.access_token,
    ownerAccessStatus,
    isOwnerAdmin,
    setReservations,
    setOwnerAccessStatus,
    setAccountModalMode,
    setAuthCallbackNotice,
    setCurrentView,
  });

  // Modals & Active selections
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isCreateListingOpen, setIsCreateListingOpen] = useState(false);
  const [isSofiaOpen, setIsSofiaOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const catalogFocusRef = useRef<HTMLElement>(null);
  const previousSelectedPropertyRef = useRef<Property | null>(null);
  useEffect(() => {
    const returnedToCatalog =
      previousSelectedPropertyRef.current !== null && selectedProperty === null;
    previousSelectedPropertyRef.current = selectedProperty;
    if (!returnedToCatalog) return;
    const frame = window.requestAnimationFrame(() => {
      const historyState: unknown = window.history.state;
      const returnFocusPropertyId =
        historyState &&
        typeof historyState === 'object' &&
        PROPERTY_DETAIL_RETURN_FOCUS_PROPERTY in historyState &&
        typeof historyState[PROPERTY_DETAIL_RETURN_FOCUS_PROPERTY] === 'string'
          ? historyState[PROPERTY_DETAIL_RETURN_FOCUS_PROPERTY]
          : null;
      const propertyTrigger = returnFocusPropertyId
        ? Array.from(document.querySelectorAll<HTMLElement>('[data-property-detail-trigger]')).find(
            (element) => element.dataset.propertyDetailTrigger === returnFocusPropertyId,
          )
        : null;
      focusWithoutScrolling(propertyTrigger ?? catalogFocusRef.current);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedProperty]);
  const [selectedCondominium, setSelectedCondominium] = useState<CondominiumSummary | null>(null);
  const restoreSearchFromUrlRef = useRef<(filters: SearchFilters) => void>(() => {});
  const [bookingPayload, setBookingPayload] = useState<AppOverlayBookingPayload | null>(null);
  const bookingPayloadRef = useRef(bookingPayload);
  bookingPayloadRef.current = bookingPayload;
  const lastBookingPayloadRef = useRef<AppOverlayBookingPayload | null>(null);
  if (bookingPayload) lastBookingPayloadRef.current = bookingPayload;

  useEffect(() => {
    const handlePopState = () => {
      const state: unknown = window.history.state;
      const isCheckoutModalEntry =
        state !== null &&
        typeof state === 'object' &&
        CHECKOUT_MODAL_HISTORY_ENTRY in state &&
        (state as Record<string, unknown>)[CHECKOUT_MODAL_HISTORY_ENTRY] === true;

      if (isCheckoutModalEntry && !bookingPayloadRef.current && lastBookingPayloadRef.current) {
        setBookingPayload(lastBookingPayloadRef.current);
      } else if (bookingPayloadRef.current && !isCheckoutModalEntry) {
        setBookingPayload(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleCloseCheckout = () => {
    const state: unknown = window.history.state;
    const hasCheckoutModalEntry =
      state !== null &&
      typeof state === 'object' &&
      CHECKOUT_MODAL_HISTORY_ENTRY in state &&
      (state as Record<string, unknown>)[CHECKOUT_MODAL_HISTORY_ENTRY] === true;

    if (hasCheckoutModalEntry) window.history.back();
    setBookingPayload(null);
  };

  // Search & Filter State
  const [filters, setFilters] = useState<SearchFilters>(() =>
    parseSearchFilters(window.location.search),
  );
  const defaultFilters = createDefaultSearchFilters();
  useSearchUrlSync(filters);
  const {
    handleSelectProperty,
    handleClosePropertyDetail,
    propertyRouteStatus,
    retryPropertyRoute,
  } = useAccommodationRouting({
    properties,
    selectedProperty,
    setSelectedProperty,
    setFilters,
    restoreSearchFromUrlRef,
  });

  const {
    filteredProperties,
    availableCategories,
    condominiums,
    isCondominiumView,
    catalogStatus,
    activeFilterCount,
    savedPropertiesList,
  } = useExploreCatalogViewModel({
    properties,
    filters,
    savedPropertyIds,
    catalogLoading,
    catalogLoadError,
  });

  const { handleStaysWidgetSearch, retryLastSearch, availabilitySearchState } =
    useAccommodationSearch({
      setProperties,
      setFilters,
      restoreSearchFromUrlRef,
    });

  const handleRemoveDestinationFilter = () => {
    void handleStaysWidgetSearch({
      checkIn: filters.checkIn,
      checkOut: filters.checkOut,
      persons: countOccupancyGuests(filters.guests),
      guests: filters.guests,
    });
  };

  const handleRemoveDateFilter = () => {
    void handleStaysWidgetSearch({
      checkIn: '',
      checkOut: '',
      persons: countOccupancyGuests(filters.guests),
      guests: filters.guests,
      destination: filters.destination,
      propertyId: filters.destinationPropertyId,
    });
  };

  const handleRemoveGuestFilter = () => {
    const guests = { ...defaultFilters.guests };
    void handleStaysWidgetSearch({
      checkIn: filters.checkIn,
      checkOut: filters.checkOut,
      persons: countOccupancyGuests(guests),
      guests,
      destination: filters.destination,
      propertyId: filters.destinationPropertyId,
    });
  };

  const handleClearSearchFilters = () => {
    setFilters(defaultFilters);
    void handleStaysWidgetSearch({
      checkIn: '',
      checkOut: '',
      persons: countOccupancyGuests(defaultFilters.guests),
      guests: defaultFilters.guests,
    });
  };

  const handleClearPropertyRefinements = () => {
    setFilters((previous) => ({
      ...previous,
      minPrice: defaultFilters.minPrice,
      maxPrice: defaultFilters.maxPrice,
      propertyTypes: [],
      amenities: [],
      minBedrooms: defaultFilters.minBedrooms,
      minBaths: defaultFilters.minBaths,
      superhostOnly: false,
      instantBookOnly: false,
    }));
  };

  const handleClearCatalogFilters = () => {
    setFilters((previous) => ({
      ...previous,
      category: 'all',
      minPrice: defaultFilters.minPrice,
      maxPrice: defaultFilters.maxPrice,
      propertyTypes: [],
      amenities: [],
      minBedrooms: defaultFilters.minBedrooms,
      minBaths: defaultFilters.minBaths,
      superhostOnly: false,
      instantBookOnly: false,
    }));
  };

  const {
    handleAddNewProperty,
    handleStartBooking,
    handleAssistantApplyFilters,
    handleSelectPropertyFromSofia,
  } = useAppOverlayActions({
    setProperties,
    setFilters,
    setIsSofiaOpen,
    setBookingPayload,
    onSelectProperty: handleSelectProperty,
  });

  return (
    <div className="min-h-screen flex flex-col bg-transparent text-neutral-900 selection:bg-orange-500/20 selection:text-orange-950">
      {authCallbackNotice && (
        <AuthCallbackNotice
          message={authCallbackNotice}
          isError={Boolean(initialAuthCallbackError)}
          onDismiss={() => setAuthCallbackNotice('')}
        />
      )}

      {/* Main Header */}
      <Header
        onOpenSearch={() => setIsSearchOpen(true)}
        currentView={currentView}
        setCurrentView={handleSetCurrentView}
        currency={currency}
        setCurrency={setCurrency}
        tripsCount={reservations.filter((r) => r.status === 'confirmed').length}
        searchSummaryText={filters.destination || undefined}
        accountName={String(
          accountSession?.user.user_metadata?.full_name ||
            accountSession?.user.user_metadata?.name ||
            '',
        )}
        accountEmail={accountSession?.user.email || ''}
        isAccountConnected={Boolean(accountSession?.user.email_confirmed_at)}
        onOpenAccount={setAccountModalMode}
        accountButtonRef={accountButtonRef}
        onSignOut={handleSignOut}
        ownerAccessStatus={ownerAccessStatus}
        ownerRequestLoading={ownerRequestLoading}
        onRequestOwnerAccess={handleRequestOwnerAccess}
        isOwnerAdmin={isOwnerAdmin}
      />

      {/* Category Bar & Controls (Visible only on Explore view) */}
      {currentView === 'explore' && !selectedProperty && (
        <CategoryBar
          availableCategories={availableCategories}
          selectedCategory={filters.category}
          onSelectCategory={(catId) => {
            setFilters({ ...filters, category: catId });
            if (catId === 'condominiums') setViewMode('grid');
          }}
          onOpenFilters={() => setIsFilterOpen(true)}
          activeFilterCount={activeFilterCount}
          showTotalWithTaxes={showTotalWithTaxes}
          setShowTotalWithTaxes={setShowTotalWithTaxes}
          viewMode={viewMode}
          setViewMode={setViewMode}
          isCondominiumView={isCondominiumView}
        />
      )}

      <MainContentRouter
        currentView={currentView}
        catalogFocusRef={catalogFocusRef}
        isCondominiumView={isCondominiumView}
        viewMode={viewMode}
        filters={filters}
        activeFilterCount={activeFilterCount}
        defaultFilters={defaultFilters}
        currency={currency}
        filteredProperties={filteredProperties}
        catalogStatus={catalogStatus}
        catalogLoading={catalogLoading}
        onRetryCatalog={retryCatalog}
        availabilitySearchState={availabilitySearchState}
        hasAvailableSearchResults={properties.length > 0}
        onRetryAvailabilitySearch={retryLastSearch}
        onOpenSearch={() => setIsSearchOpen(true)}
        savedPropertyIds={savedPropertyIds}
        savedProperties={savedPropertiesList}
        showTotalWithTaxes={showTotalWithTaxes}
        condominiums={condominiums}
        reservations={reservations}
        directBookingOrders={directBookingOrders}
        directBookingOrdersError={directBookingOrdersError}
        reservationsError={reservationsError}
        reservationsLoading={reservationsLoading}
        directBookingOrdersLoading={directBookingOrdersLoading}
        onRetryAccountData={refreshAccountData}
        onOpenAccount={setAccountModalMode}
        selectedProperty={selectedProperty}
        propertyRouteStatus={propertyRouteStatus}
        onRetryPropertyRoute={retryPropertyRoute}
        accessToken={accountSession?.access_token}
        ownerAccessStatus={ownerAccessStatus}
        isOwnerAdmin={isOwnerAdmin}
        onFiltersChange={setFilters}
        onRemoveDestinationFilter={handleRemoveDestinationFilter}
        onRemoveDateFilter={handleRemoveDateFilter}
        onRemoveGuestFilter={handleRemoveGuestFilter}
        onClearPropertyRefinements={handleClearPropertyRefinements}
        onClearCatalogFilters={handleClearCatalogFilters}
        onSearchInApp={handleStaysWidgetSearch}
        onOpenAssistant={() => setIsSofiaOpen(true)}
        onSelectCondominium={setSelectedCondominium}
        onToggleSave={toggleSavedProperty}
        onSelectProperty={handleSelectProperty}
        onStartBooking={handleStartBooking}
        onClosePropertyDetail={handleClosePropertyDetail}
        onResetFilters={handleClearSearchFilters}
        onCancelReservation={handleCancelReservation}
        onExploreMore={() => {
          setCurrentView('explore');
          window.scrollTo(0, 0);
        }}
      />

      {!selectedProperty && (
        <MobileBottomNavigation
          currentView={currentView}
          onNavigate={(view) => {
            setCurrentView(resolveMobileNavigationTarget(view, ownerAccessStatus === 'approved'));
            window.scrollTo(0, 0);
          }}
          showHost={ownerAccessStatus === 'approved'}
          hasSavedProperties={savedPropertyIds.length > 0}
          hasConfirmedReservations={reservations.some(
            (reservation) => reservation.status === 'confirmed',
          )}
        />
      )}

      <AppFooter currency={currency} onCreateListing={() => setIsCreateListingOpen(true)} />

      <SofiaAssistantTrigger
        onOpen={() => setIsSofiaOpen(true)}
        showMobileFloating={
          isCondominiumView ||
          (currentView !== 'explore' && currentView !== 'trips' && currentView !== 'wishlists')
        }
        compactMobileFloating={isCondominiumView && filteredProperties.length === 0}
      />

      <AppOverlayLayer
        currency={currency}
        filters={filters}
        defaultFilters={defaultFilters}
        setFilters={setFilters}
        selectedCondominium={selectedCondominium}
        bookingPayload={bookingPayload}
        accountModalMode={accountModalMode}
        accountReturnFocusRef={accountButtonRef}
        properties={properties}
        isSofiaOpen={isSofiaOpen}
        isSearchOpen={isSearchOpen}
        isFilterOpen={isFilterOpen}
        isCreateListingOpen={isCreateListingOpen}
        onCloseCondominium={() => setSelectedCondominium(null)}
        onCloseSofia={() => setIsSofiaOpen(false)}
        onSelectPropertyFromSofia={handleSelectPropertyFromSofia}
        onApplySofiaFilters={handleAssistantApplyFilters}
        onCloseCheckout={handleCloseCheckout}
        onCloseAccount={() => setAccountModalMode(null)}
        onCloseSearch={() => setIsSearchOpen(false)}
        onCloseFilter={() => setIsFilterOpen(false)}
        onCloseCreateListing={() => setIsCreateListingOpen(false)}
        onAddProperty={handleAddNewProperty}
        onSearchInApp={handleStaysWidgetSearch}
      />
    </div>
  );
}

export default function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const checkoutResumeReference = /^\/checkout\/([A-Za-z0-9]{40})$/.exec(pathname)?.[1];

  if (checkoutResumeReference) {
    return (
      <Suspense
        fallback={
          <main className="min-h-screen bg-[#f7f4ee] px-4 py-8 text-neutral-700" role="status">
            Abrindo seu pedido…
          </main>
        }
      >
        <CheckoutResumeEntry reference={checkoutResumeReference} />
      </Suspense>
    );
  }

  return <MarketplaceApp />;
}
