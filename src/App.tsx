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
import { CategoryBar } from './components/search/CategoryBar';
import { MobileBottomNavigation, resolveMobileNavigationTarget } from './components/MobileBottomNavigation';
import type { MainView } from './components/MobileBottomNavigation';
import { AppFooter } from './components/AppFooter';
import { SofiaAssistantTrigger } from './components/assistant/SofiaAssistantTrigger';
import { getAuthCallbackError } from './utils/authCallback';
import { MainContentRouter } from './components/MainContentRouter';
import { LazyFeatureBoundary } from './components/LazyFeatureBoundary';
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
import { useSavedPropertyIds } from './hooks/useSavedPropertyIds';

const initialAuthCallbackError = getAuthCallbackError(window.location.search, window.location.hash);

const PropertyDetailModal = React.lazy(() => import('./components/property/PropertyDetailModal').then(({ PropertyDetailModal }) => ({ default: PropertyDetailModal })));
const CondominiumDetailModal = React.lazy(() => import('./components/condominium/CondominiumDetailModal').then(({ CondominiumDetailModal }) => ({ default: CondominiumDetailModal })));
const CheckoutModal = React.lazy(() => import('./components/booking/CheckoutModal').then(({ CheckoutModal }) => ({ default: CheckoutModal })));
const GuestAccountModal = React.lazy(() => import('./components/account/GuestAccountModal').then(({ GuestAccountModal }) => ({ default: GuestAccountModal })));
const SearchModal = React.lazy(() => import('./components/search/SearchModal').then(({ SearchModal }) => ({ default: SearchModal })));
const FilterModal = React.lazy(() => import('./components/search/FilterModal').then(({ FilterModal }) => ({ default: FilterModal })));
const CreateListingModal = React.lazy(() => import('./components/owner/CreateListingModal').then(({ CreateListingModal }) => ({ default: CreateListingModal })));
const SofiaAssistantModal = React.lazy(() => import('./components/assistant/SofiaAssistantModal').then(({ SofiaAssistantModal }) => ({ default: SofiaAssistantModal })));

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

  const { savedPropertyIds, toggleSavedProperty } = useSavedPropertyIds();

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
        savedPropertyIds={savedPropertyIds}
        savedProperties={savedPropertiesList}
        showTotalWithTaxes={showTotalWithTaxes}
        condominiums={condominiums}
        reservations={reservations}
        selectedProperty={selectedProperty}
        accessToken={accountSession?.access_token}
        isOwnerAdmin={isOwnerAdmin}
        onFiltersChange={setFilters}
        onSearchInApp={handleStaysWidgetSearch}
        onOpenAssistant={() => setIsSofiaOpen(true)}
        onSelectCondominium={setSelectedCondominium}
        onToggleSave={toggleSavedProperty}
        onSelectProperty={handleSelectProperty}
        onResetFilters={() => setFilters(defaultFilters)}
        onCancelReservation={handleCancelReservation}
        onExploreMore={() => setCurrentView('explore')}
      />

      <MobileBottomNavigation
        currentView={currentView}
        onNavigate={(view) => setCurrentView(resolveMobileNavigationTarget(view, ownerAccessStatus === 'approved'))}
        showHost={ownerAccessStatus === 'approved'}
        hasSavedProperties={savedPropertyIds.length > 0}
        hasConfirmedReservations={reservations.some((reservation) => reservation.status === 'confirmed')}
      />

      <AppFooter currency={currency} onCreateListing={() => setIsCreateListingOpen(true)} />

      <SofiaAssistantTrigger
        onOpen={() => setIsSofiaOpen(true)}
        showMobileFloating={currentView !== 'explore' || isCondominiumView}
      />

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
        onToggleSave={toggleSavedProperty}
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
