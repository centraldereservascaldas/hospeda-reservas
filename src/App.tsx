/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Property, SearchFilters, Currency } from './types';
import type { CalculatedPriceResponse } from './services/crcnBackendApi';
import { CATEGORIES } from './data/mockProperties';
import { matchesPropertyCategory } from './utils/propertyCategories';
import { Header } from './components/Header';
import { CategoryBar } from './components/CategoryBar';
import { CondominiumDirectory } from './components/CondominiumDirectory';
import { StaysSearchWidget } from './components/StaysSearchWidget';
import { ActiveSearchFilters } from './components/ActiveSearchFilters';
import { PropertyCatalogGrid } from './components/property/PropertyCatalogGrid';
import { MobileBottomNavigation, resolveMobileNavigationTarget } from './components/MobileBottomNavigation';
import type { MainView } from './components/MobileBottomNavigation';
import { AppFooter } from './components/AppFooter';
import { SofiaAssistantTrigger } from './components/SofiaAssistantTrigger';
import { getAuthCallbackError } from './utils/authCallback';
import { buildCondominiumCatalog } from './utils/condominiumCatalog';
import { createDefaultSearchFilters, parseSearchFilters } from './utils/searchUrlState';
import { useSearchUrlSync } from './hooks/useSearchUrlSync';
import { countActivePropertyFilters, filterPropertiesBySearchFilters } from './utils/propertySearchFilters';
import { scrollIntoViewRespectingMotion } from './utils/motion';
import type { CondominiumSummary } from './utils/condominiumCatalog';
import { useAccommodationCatalog } from './hooks/useAccommodationCatalog';
import { useAccommodationRouting } from './hooks/useAccommodationRouting';
import { useAccountWorkspaceData } from './hooks/useAccountWorkspaceData';
import { useSupabaseSession } from './hooks/useSupabaseSession';
import { useAccommodationSearch } from './hooks/useAccommodationSearch';
import { useAccountActions } from './hooks/useAccountActions';
import { readSavedPropertyIds } from './utils/savedPropertyIds';

const initialAuthCallbackError = getAuthCallbackError(window.location.search, window.location.hash);

const InteractiveMap = React.lazy(() => import('./components/InteractiveMap').then(({ InteractiveMap }) => ({ default: InteractiveMap })));
const PropertyDetailModal = React.lazy(() => import('./components/property/PropertyDetailModal').then(({ PropertyDetailModal }) => ({ default: PropertyDetailModal })));
const CondominiumDetailModal = React.lazy(() => import('./components/CondominiumDetailModal').then(({ CondominiumDetailModal }) => ({ default: CondominiumDetailModal })));
const CheckoutModal = React.lazy(() => import('./components/CheckoutModal').then(({ CheckoutModal }) => ({ default: CheckoutModal })));
const GuestAccountModal = React.lazy(() => import('./components/GuestAccountModal').then(({ GuestAccountModal }) => ({ default: GuestAccountModal })));
const SearchModal = React.lazy(() => import('./components/SearchModal').then(({ SearchModal }) => ({ default: SearchModal })));
const FilterModal = React.lazy(() => import('./components/FilterModal').then(({ FilterModal }) => ({ default: FilterModal })));
const TripsView = React.lazy(() => import('./components/TripsView').then(({ TripsView }) => ({ default: TripsView })));
const WishlistsView = React.lazy(() => import('./components/WishlistsView').then(({ WishlistsView }) => ({ default: WishlistsView })));
const HostDashboardView = React.lazy(() => import('./components/HostDashboardView').then(({ HostDashboardView }) => ({ default: HostDashboardView })));
const OwnerAccessAdminView = React.lazy(() => import('./components/OwnerAccessAdminView').then(({ OwnerAccessAdminView }) => ({ default: OwnerAccessAdminView })));
const CreateListingModal = React.lazy(() => import('./components/CreateListingModal').then(({ CreateListingModal }) => ({ default: CreateListingModal })));
const SofiaAssistantModal = React.lazy(() => import('./components/SofiaAssistantModal').then(({ SofiaAssistantModal }) => ({ default: SofiaAssistantModal })));

class LazyFeatureBoundary extends React.Component<
  { children: React.ReactNode; overlay?: boolean; visible?: boolean },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render() {
    const message = this.state.hasError
      ? 'Não foi possível carregar esta parte da página.'
      : 'Carregando…';
    const content = (
      <div role={this.state.hasError ? 'alert' : 'status'} className="rounded-2xl bg-white px-6 py-5 text-center shadow-lg">
        <p className="font-semibold text-neutral-800">{message}</p>
        {this.state.hasError && (
          <button type="button" onClick={() => window.location.reload()} className="mt-3 rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500">
            Recarregar página
          </button>
        )}
      </div>
    );
    const fallback = this.props.overlay
      ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">{content}</div>
      : <div className="flex min-h-48 items-center justify-center p-6">{content}</div>;

    if (this.state.hasError) return this.props.visible === false ? null : fallback;
    return <React.Suspense fallback={fallback}>{this.props.children}</React.Suspense>;
  }
}

const DeferredModal: React.FC<{ active: boolean; children: React.ReactNode }> = ({ active, children }) => {
  const [hasOpened, setHasOpened] = useState(active);
  useEffect(() => {
    if (active) setHasOpened(true);
  }, [active]);
  return hasOpened ? <LazyFeatureBoundary overlay={active} visible={active}>{children}</LazyFeatureBoundary> : null;
};

export default function App() {
  const { properties, setProperties, catalogLoading, catalogLoadError } =
    useAccommodationCatalog();

  // Persistent saved accommodation IDs
  const [savedPropertyIds, setSavedPropertyIds] = useState<string[]>(() =>
    readSavedPropertyIds(localStorage.getItem('hospeda_wishlist')),
  );

  // Currency & Display preferences
  const [currency, setCurrency] = useState<Currency>('BRL');
  const [showTotalWithTaxes, setShowTotalWithTaxes] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [currentView, setCurrentView] = useState<MainView>('explore');
  const currentViewRef = useRef(currentView);
  currentViewRef.current = currentView;
  const {
    accountSession,
    accountModalMode,
    setAccountModalMode,
    authCallbackNotice,
    setAuthCallbackNotice,
  } = useSupabaseSession({
    isConfigured: Boolean(import.meta.env.VITE_SUPABASE_URL?.trim() && import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()),
    initialHash: window.location.hash,
    initialAuthCallbackError,
  });
  const { reservations, setReservations, ownerAccessStatus, setOwnerAccessStatus, isOwnerAdmin } =
    useAccountWorkspaceData({
      accessToken: accountSession?.access_token,
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
  const [selectedCondominium, setSelectedCondominium] = useState<CondominiumSummary | null>(null);
  const restoreSearchFromUrlRef = useRef<(filters: SearchFilters) => void>(() => {});
  const [bookingPayload, setBookingPayload] = useState<{
    property: Property;
    checkIn: string;
    checkOut: string;
    guests: { adults: number; children: number; infants: number; pets: number };
    nights: number;
    totalAmount: number;
    cleaningFee: number;
    serviceFee: number;
    discount: number;
    quote: CalculatedPriceResponse;
  } | null>(null);

  useEffect(() => {
    localStorage.setItem('hospeda_wishlist', JSON.stringify(savedPropertyIds));
  }, [savedPropertyIds]);

  // Search & Filter State
  const [filters, setFilters] = useState<SearchFilters>(() => parseSearchFilters(window.location.search));
  const defaultFilters = createDefaultSearchFilters();
  useSearchUrlSync(filters);
  const { handleSelectProperty, handleClosePropertyDetail } = useAccommodationRouting({
    properties,
    setSelectedProperty,
    setFilters,
    restoreSearchFromUrlRef,
  });

  // Toggle Save Property
  const handleToggleSave = (propertyId: string) => {
    if (savedPropertyIds.includes(propertyId)) {
      setSavedPropertyIds(savedPropertyIds.filter((id) => id !== propertyId));
    } else {
      setSavedPropertyIds([...savedPropertyIds, propertyId]);
    }
  };

  // Filter Properties Logic
  const filteredProperties = useMemo(() => {
    return filterPropertiesBySearchFilters(properties, filters);
  }, [properties, filters]);

  const availableCategories = useMemo(() =>
    CATEGORIES.filter((category) => category.id === 'all'
      || category.id === 'condominiums'
      || category.id === 'pools_24h'
      || category.id === filters.category
      || properties.some((property) => matchesPropertyCategory(property, category.id))),
  [properties, filters.category]);

  const condominiums = useMemo(() => buildCondominiumCatalog(properties), [properties]);
  const isCondominiumView = filters.category === 'condominiums';
  const catalogStatus = catalogLoading && properties.length === 0
    ? 'loading'
    : catalogLoadError && properties.length === 0
      ? 'error'
      : 'ready';

  // Active filter count
  const activeFilterCount = useMemo(() => countActivePropertyFilters(filters), [filters]);

  // Handlers
  const handleAddNewProperty = (newProp: Property) => {
    setProperties([newProp, ...properties]);
  };

  const { handleStaysWidgetSearch } = useAccommodationSearch({
    setProperties,
    setFilters,
    restoreSearchFromUrlRef,
  });

  const savedPropertiesList = useMemo(() => {
    return properties.filter((p) => savedPropertyIds.includes(p.id));
  }, [properties, savedPropertyIds]);

  return (
    <div className="min-h-screen flex flex-col bg-transparent text-neutral-900 selection:bg-orange-500/20 selection:text-orange-950">
      {authCallbackNotice && (
        <div role={initialAuthCallbackError ? 'alert' : 'status'} aria-live="polite" className={`fixed left-1/2 top-24 z-[120] flex w-[min(92vw,560px)] -translate-x-1/2 items-start gap-3 rounded-2xl border bg-white/95 px-5 py-4 text-sm font-semibold shadow-xl backdrop-blur-xl ${initialAuthCallbackError ? 'border-red-200 text-red-900' : 'border-emerald-200 text-emerald-900'}`}>
          <span className="flex-1">{authCallbackNotice}</span>
          <button type="button" aria-label="Fechar aviso" onClick={() => setAuthCallbackNotice('')} className="-mt-1 rounded-full px-2 py-1 text-lg leading-none text-emerald-800 hover:bg-emerald-100">×</button>
        </div>
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
        accountName={String(accountSession?.user.user_metadata?.full_name || accountSession?.user.user_metadata?.name || '')}
        accountEmail={accountSession?.user.email || ''}
        isAccountConnected={Boolean(accountSession?.user.email_confirmed_at)}
        onOpenAccount={setAccountModalMode}
        onSignOut={handleSignOut}
        ownerAccessStatus={ownerAccessStatus}
        ownerRequestLoading={ownerRequestLoading}
        onRequestOwnerAccess={handleRequestOwnerAccess}
        isOwnerAdmin={isOwnerAdmin}
      />

      {/* Category Bar & Controls (Visible only on Explore view) */}
      {currentView === 'explore' && (
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

      {/* Main Content Router */}
      <main ref={catalogFocusRef} tabIndex={-1} className="flex-1 pb-24 sm:pb-12">
        {/* EXPLORE VIEW */}
        {currentView === 'explore' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            
            {/* Search accommodation and dates */}
            {!isCondominiumView && <div className="mb-8">
              <StaysSearchWidget
                variant="hero"
                currentFilters={filters}
                onSearchInApp={handleStaysWidgetSearch}
              />
            </div>}

            {!isCondominiumView && (
              <ActiveSearchFilters
                filters={filters}
                activeFilterCount={activeFilterCount}
                defaultFilters={defaultFilters}
                onChange={setFilters}
              />
            )}

            {/* View Mode: Grid or Interactive Map */}
            <div id="stays-apartments-catalog" className="scroll-mt-24">
            {isCondominiumView ? (
              <CondominiumDirectory condominiums={condominiums} onSelectCondominium={setSelectedCondominium} />
            ) : viewMode === 'grid' ? (
              <PropertyCatalogGrid
                status={catalogStatus}
                properties={filteredProperties}
                currency={currency}
                savedPropertyIds={savedPropertyIds}
                showTotalWithTaxes={showTotalWithTaxes}
                onToggleSave={handleToggleSave}
                onSelectProperty={handleSelectProperty}
                onResetFilters={() => setFilters(defaultFilters)}
              />
            ) : (
              <LazyFeatureBoundary>
              <InteractiveMap
                properties={filteredProperties}
                currency={currency}
                onSelectProperty={handleSelectProperty}
                selectedProperty={selectedProperty}
              />
              </LazyFeatureBoundary>
            )}
            </div>

          </div>
        )}

        {/* TRIPS VIEW */}
        {currentView === 'trips' && (
          <LazyFeatureBoundary>
          <TripsView
            reservations={reservations}
            currency={currency}
            onCancelReservation={handleCancelReservation}
            onExploreMore={() => setCurrentView('explore')}
          />
          </LazyFeatureBoundary>
        )}

        {/* WISHLISTS VIEW */}
        {currentView === 'wishlists' && (
          <LazyFeatureBoundary>
          <WishlistsView
            savedProperties={savedPropertiesList}
            currency={currency}
            onToggleSave={handleToggleSave}
            onSelectProperty={handleSelectProperty}
            onExploreMore={() => setCurrentView('explore')}
            showTotalWithTaxes={showTotalWithTaxes}
          />
          </LazyFeatureBoundary>
        )}

        {/* HOST DASHBOARD VIEW */}
        {currentView === 'host' && (
          <LazyFeatureBoundary>
          <HostDashboardView
            accessToken={accountSession?.access_token || ''}
          />
          </LazyFeatureBoundary>
        )}

        {currentView === 'ownerAdmin' && isOwnerAdmin && accountSession?.access_token && (
          <LazyFeatureBoundary>
          <OwnerAccessAdminView accessToken={accountSession.access_token} />
          </LazyFeatureBoundary>
        )}
      </main>

      <MobileBottomNavigation
        currentView={currentView}
        onNavigate={(view) => setCurrentView(resolveMobileNavigationTarget(view, ownerAccessStatus === 'approved'))}
        showHost={ownerAccessStatus === 'approved'}
        hasSavedProperties={savedPropertyIds.length > 0}
        hasConfirmedReservations={reservations.some((reservation) => reservation.status === 'confirmed')}
      />

      <AppFooter currency={currency} onCreateListing={() => setIsCreateListingOpen(true)} />

      <SofiaAssistantTrigger onOpen={() => setIsSofiaOpen(true)} />

      {/* ALL INTERACTIVE MODALS */}
      
      {/* 1. Property Detail Modal */}
      <DeferredModal active={selectedProperty !== null}>
      <PropertyDetailModal
        property={selectedProperty}
        initialCheckIn={filters.checkIn}
        initialCheckOut={filters.checkOut}
        initialGuests={filters.guests}
        onClose={handleClosePropertyDetail}
        returnFocusRef={catalogFocusRef}
        currency={currency}
        isSaved={selectedProperty ? savedPropertyIds.includes(selectedProperty.id) : false}
        onToggleSave={handleToggleSave}
        onStartBooking={(bookingData) => {
          handleClosePropertyDetail();
          setBookingPayload(bookingData);
        }}
      />
      </DeferredModal>

      <DeferredModal active={selectedCondominium !== null}>
      <CondominiumDetailModal
        condominium={selectedCondominium}
        onClose={() => setSelectedCondominium(null)}
      />
      </DeferredModal>

      {/* 2. Sofia Concierge Assistant Modal */}
      <DeferredModal active={isSofiaOpen}>
      <SofiaAssistantModal
        isOpen={isSofiaOpen}
        onClose={() => setIsSofiaOpen(false)}
        currency={currency}
        onSelectProperty={(p) => {
          setIsSofiaOpen(false);
          handleSelectProperty(p);
        }}
        onApplyFilters={(suggested) => {
          if (suggested.destination) {
            setFilters((prev) => ({ ...prev, destination: suggested.destination! }));
          }
          if (suggested.guests) {
            setFilters((prev) => ({
              ...prev,
              guests: { ...prev.guests, adults: suggested.guests! },
            }));
          }
          setIsSofiaOpen(false);
          const catalogEl = document.getElementById('stays-apartments-catalog');
          if (catalogEl) scrollIntoViewRespectingMotion(catalogEl);
        }}
      />
      </DeferredModal>

      {/* 2. Checkout Modal */}
      <DeferredModal active={bookingPayload !== null}>
      <CheckoutModal
        isOpen={!!bookingPayload}
        onClose={() => setBookingPayload(null)}
        bookingData={bookingPayload}
        currency={currency}
      />
      </DeferredModal>

      <DeferredModal active={accountModalMode !== null}>
      <GuestAccountModal
        isOpen={accountModalMode !== null}
        initialMode={accountModalMode || 'login'}
        onClose={() => setAccountModalMode(null)}
      />
      </DeferredModal>

      {/* 3. Search Modal */}
      <DeferredModal active={isSearchOpen}>
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        filters={filters}
        onApplyFilters={(newFilters) => setFilters(newFilters)}
        onResetFilters={() => setFilters(defaultFilters)}
        onSearchInApp={handleStaysWidgetSearch}
      />
      </DeferredModal>

      {/* 4. Filter Modal */}
      <DeferredModal active={isFilterOpen}>
      <FilterModal
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filters={filters}
        onApplyFilters={(newFilters) => setFilters(newFilters)}
        onResetFilters={() => setFilters(defaultFilters)}
        currency={currency}
        matchingCount={filteredProperties.length}
      />
      </DeferredModal>

      {/* 5. Create Listing Modal */}
      <DeferredModal active={isCreateListingOpen}>
      <CreateListingModal
        isOpen={isCreateListingOpen}
        onClose={() => setIsCreateListingOpen(false)}
        onAddProperty={handleAddNewProperty}
        currency={currency}
      />
      </DeferredModal>

    </div>
  );
}
