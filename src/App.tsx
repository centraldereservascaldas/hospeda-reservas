/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef } from 'react';
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
import { useAccommodationRouting } from './hooks/useAccommodationRouting';
import { useAccountWorkspaceData } from './hooks/useAccountWorkspaceData';
import { useSupabaseSession } from './hooks/useSupabaseSession';
import { useAccommodationSearch } from './hooks/useAccommodationSearch';
import { useAccountActions } from './hooks/useAccountActions';
import { useSavedPropertyIds } from './hooks/useSavedPropertyIds';
import { useAppOverlayActions } from './hooks/useAppOverlayActions';

const initialAuthCallbackError = getAuthCallbackError(window.location.search, window.location.hash);

export default function App() {
  const { properties, setProperties, catalogLoading, catalogLoadError } = useAccommodationCatalog();

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
    isConfigured: Boolean(
      import.meta.env.VITE_SUPABASE_URL?.trim() && import.meta.env.VITE_SUPABASE_ANON_KEY?.trim(),
    ),
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
  const [bookingPayload, setBookingPayload] = useState<AppOverlayBookingPayload | null>(null);

  // Search & Filter State
  const [filters, setFilters] = useState<SearchFilters>(() =>
    parseSearchFilters(window.location.search),
  );
  const defaultFilters = createDefaultSearchFilters();
  useSearchUrlSync(filters);
  const { handleSelectProperty, handleClosePropertyDetail } = useAccommodationRouting({
    properties,
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

  const { handleStaysWidgetSearch } = useAccommodationSearch({
    setProperties,
    setFilters,
    restoreSearchFromUrlRef,
  });

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
    onClosePropertyDetail: handleClosePropertyDetail,
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
        onNavigate={(view) =>
          setCurrentView(resolveMobileNavigationTarget(view, ownerAccessStatus === 'approved'))
        }
        showHost={ownerAccessStatus === 'approved'}
        hasSavedProperties={savedPropertyIds.length > 0}
        hasConfirmedReservations={reservations.some(
          (reservation) => reservation.status === 'confirmed',
        )}
      />

      <AppFooter currency={currency} onCreateListing={() => setIsCreateListingOpen(true)} />

      <SofiaAssistantTrigger
        onOpen={() => setIsSofiaOpen(true)}
        showMobileFloating={currentView !== 'explore' || isCondominiumView}
      />

      <AppOverlayLayer
        currency={currency}
        filters={filters}
        defaultFilters={defaultFilters}
        setFilters={setFilters}
        selectedProperty={selectedProperty}
        selectedCondominium={selectedCondominium}
        bookingPayload={bookingPayload}
        accountModalMode={accountModalMode}
        savedPropertyIds={savedPropertyIds}
        catalogFocusRef={catalogFocusRef}
        filteredPropertiesCount={filteredProperties.length}
        isSofiaOpen={isSofiaOpen}
        isSearchOpen={isSearchOpen}
        isFilterOpen={isFilterOpen}
        isCreateListingOpen={isCreateListingOpen}
        onClosePropertyDetail={handleClosePropertyDetail}
        onStartBooking={handleStartBooking}
        onToggleSave={toggleSavedProperty}
        onCloseCondominium={() => setSelectedCondominium(null)}
        onCloseSofia={() => setIsSofiaOpen(false)}
        onSelectPropertyFromSofia={handleSelectPropertyFromSofia}
        onApplySofiaFilters={handleAssistantApplyFilters}
        onCloseCheckout={() => setBookingPayload(null)}
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
