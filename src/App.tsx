/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useEffect, useState, useRef } from 'react';
import { flushSync } from 'react-dom';
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
import { MeasurementPreferences } from './components/MeasurementPreferences';
import { SofiaAssistantTrigger } from './components/assistant/SofiaAssistantTrigger';
import { getAuthCallbackError } from './utils/authCallback';
import { MainContentRouter } from './components/MainContentRouter';
import { AppOverlayLayer } from './components/AppOverlayLayer';
import { CheckoutLoadingSkeleton } from './components/booking/CheckoutLoadingSkeleton';
import type { AppOverlayBookingPayload } from './types/booking';
import {
  buildHomeUrl,
  buildCondominiumDirectoryUrl,
  createDefaultSearchFilters,
  getAccommodationIdFromPath,
  parseSearchFilters,
} from './utils/searchUrlState';
import { StaysSearchWidget } from './components/search/StaysSearchWidget';
import { useSearchUrlSync } from './hooks/useSearchUrlSync';
import { PAGE_METADATA_NAVIGATION_EVENT, usePageMetadata } from './hooks/usePageMetadata';
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
import type { AccommodationWidgetSearchParams } from './hooks/useAccommodationSearch';
import { useAccountActions } from './hooks/useAccountActions';
import { useSavedPropertyIds } from './hooks/useSavedPropertyIds';
import { CHECKOUT_MODAL_HISTORY_ENTRY, useAppOverlayActions } from './hooks/useAppOverlayActions';
import { focusWithoutScrolling } from './utils/focus';
import { countOccupancyGuests } from './utils/guestCounts';
import { LegalDocumentPage } from './components/LegalDocumentPage';
import { existingReservationCodeFromPath } from './utils/checkoutUrl';
import { NotFoundPage } from './components/NotFoundPage';
import { isNewCheckoutPath, NEW_CHECKOUT_PATH } from './utils/checkoutDraft';
import { CheckoutRecoveryPage } from './components/booking/CheckoutRecoveryPage';
import { useCheckoutDraftRecovery } from './hooks/useCheckoutDraftRecovery';

const CheckoutResumePage = lazy(() =>
  import('./components/booking/CheckoutResumePage').then(({ CheckoutResumePage }) => ({
    default: CheckoutResumePage,
  })),
);

const ExistingReservationCheckout = lazy(() =>
  import('./components/booking/ExistingReservationCheckout').then(
    ({ ExistingReservationCheckout }) => ({ default: ExistingReservationCheckout }),
  ),
);

const RecoveryLinkConfirmationPage = lazy(() =>
  import('./components/account/RecoveryLinkConfirmationPage').then(
    ({ RecoveryLinkConfirmationPage }) => ({ default: RecoveryLinkConfirmationPage }),
  ),
);

const CieloCheckoutPreviewPage = lazy(() =>
  import('./components/booking/CieloCheckoutPreviewPage').then(({ CieloCheckoutPreviewPage }) => ({
    default: CieloCheckoutPreviewPage,
  })),
);

const PaymentConfirmationPreview = lazy(() =>
  import('./components/booking/PaymentConfirmationPreview').then(
    ({ PaymentConfirmationPreview }) => ({ default: PaymentConfirmationPreview }),
  ),
);

const ImobSysPreviewPage = lazy(() => import('./components/ImobSysPreviewPage'));
const PartnerSandboxCheckout = lazy(() =>
  import('./components/booking/PartnerSandboxCheckout').then(({ PartnerSandboxCheckout }) => ({
    default: PartnerSandboxCheckout,
  })),
);
const PartnerSandboxOperations = lazy(() =>
  import('./components/booking/PartnerSandboxOperations').then(({ PartnerSandboxOperations }) => ({
    default: PartnerSandboxOperations,
  })),
);
const ImobSysPropertyPage = lazy(() => import('./components/ImobSysPropertyPage'));

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
  const {
    properties,
    catalogProperties,
    setProperties,
    catalogLoading,
    catalogLoadError,
    retryCatalog,
  } = useAccommodationCatalog();

  const { savedPropertyIds, toggleSavedProperty } = useSavedPropertyIds();

  // Currency & Display preferences
  const [currency, setCurrency] = useState<Currency>('BRL');
  const showTotalWithTaxes = true;
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
    canManagePayments,
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
  const [checkoutNavigation, setCheckoutNavigation] = useState(0);
  const checkoutRecovery = useCheckoutDraftRecovery(
    properties,
    catalogLoading,
    bookingPayload,
    setBookingPayload,
    checkoutNavigation,
  );

  useEffect(() => {
    const handlePopState = () => {
      const state: unknown = window.history.state;
      const isCheckoutModalEntry =
        state !== null &&
        typeof state === 'object' &&
        CHECKOUT_MODAL_HISTORY_ENTRY in state &&
        (state as Record<string, unknown>)[CHECKOUT_MODAL_HISTORY_ENTRY] === true;

      if (isNewCheckoutPath(window.location.pathname)) {
        setBookingPayload(null);
        setCheckoutNavigation((value) => value + 1);
      } else if (bookingPayloadRef.current && !isCheckoutModalEntry) {
        setBookingPayload(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Search & Filter State
  const [filters, setFilters] = useState<SearchFilters>(() => {
    const initialFilters = parseSearchFilters(window.location.search);
    return window.location.pathname.replace(/\/$/, '') === '/condominios'
      ? { ...initialFilters, category: 'condominiums' }
      : initialFilters;
  });
  const defaultFilters = createDefaultSearchFilters();
  useSearchUrlSync(filters);
  useEffect(() => {
    const restoreFiltersFromLocation = () => {
      const nextFilters = parseSearchFilters(window.location.search);
      setFilters(
        window.location.pathname.replace(/\/$/, '') === '/condominios'
          ? { ...nextFilters, category: 'condominiums' }
          : nextFilters,
      );
    };
    window.addEventListener('popstate', restoreFiltersFromLocation);
    return () => window.removeEventListener('popstate', restoreFiltersFromLocation);
  }, []);
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
    handleStaysWidgetSearch: searchAccommodations,
    retryLastSearch,
    availabilitySearchState,
    searchPagination,
    loadMoreSearchResults,
  } = useAccommodationSearch({
    setProperties,
    setFilters,
    restoreSearchFromUrlRef,
  });

  const handleStaysWidgetSearch: typeof searchAccommodations = (...args) => {
    if (
      window.location.pathname !== '/s/homes' &&
      !getAccommodationIdFromPath(window.location.pathname)
    ) {
      window.history.pushState(window.history.state, '', `/s/homes${window.location.search}`);
      window.dispatchEvent(new Event(PAGE_METADATA_NAVIGATION_EVENT));
    }
    return searchAccommodations(...args);
  };

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
    hasMoreSearchResults: searchPagination.hasMore,
  });

  const handleRemoveDestinationFilter = () => {
    void handleStaysWidgetSearch({
      checkIn: filters.checkIn,
      checkOut: filters.checkOut,
      dateFlexibility: filters.dateFlexibility,
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
      dateFlexibility: filters.dateFlexibility,
      persons: countOccupancyGuests(guests),
      guests,
      destination: filters.destination,
      propertyId: filters.destinationPropertyId,
    });
  };

  const handleSelectCategory = (categoryId: string) => {
    const isCondominiumRoute = window.location.pathname.replace(/\/$/, '') === '/condominios';
    if ((categoryId === 'condominiums') === isCondominiumRoute) {
      setFilters((current) => ({ ...current, category: categoryId }));
      return;
    }

    const navigate = () => {
      window.history.pushState(
        window.history.state,
        '',
        categoryId === 'condominiums'
          ? buildCondominiumDirectoryUrl(window.location.search)
          : buildHomeUrl(window.location.search),
      );
      setFilters({ ...createDefaultSearchFilters(), category: categoryId });
      setViewMode('grid');
      window.dispatchEvent(new Event(PAGE_METADATA_NAVIGATION_EVENT));
    };
    const transitionDocument = document as Document & {
      startViewTransition?: (update: () => void) => unknown;
      activeViewTransition?: unknown;
    };
    if (
      typeof transitionDocument.startViewTransition === 'function' &&
      !transitionDocument.activeViewTransition &&
      !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
    ) {
      try {
        transitionDocument.startViewTransition(() => flushSync(navigate));
        return;
      } catch {
        navigate();
        return;
      }
    }
    navigate();
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
      minBeds: defaultFilters.minBeds ?? 0,
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
      minBeds: defaultFilters.minBeds ?? 0,
      minBaths: defaultFilters.minBaths,
      superhostOnly: false,
      instantBookOnly: false,
    }));
  };

  const {
    handleAddNewProperty,
    handleStartBooking,
    handleCloseBooking,
    handleAssistantApplyFilters,
    handleSelectPropertyFromSofia,
  } = useAppOverlayActions({
    currency,
    setProperties,
    setFilters,
    setIsSofiaOpen,
    setBookingPayload,
    onSelectProperty: handleSelectProperty,
  });

  const handleCloseCheckout = () => handleCloseBooking(bookingPayloadRef.current);

  const handleOpenSuggestedProperty = (
    property: Property,
    params: AccommodationWidgetSearchParams,
  ) => {
    setFilters((current) => ({
      ...current,
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      guests: params.guests ?? current.guests,
    }));
    handleSelectProperty(property);
  };

  if (
    isNewCheckoutPath(window.location.pathname) &&
    !bookingPayload &&
    checkoutRecovery.status !== 'idle'
  ) {
    return (
      <CheckoutRecoveryPage
        status={checkoutRecovery.status}
        hasReturnContext={checkoutRecovery.returnUrl !== null}
        onRetry={checkoutRecovery.retry}
        onBack={() => {
          if (window.history.state?.[CHECKOUT_MODAL_HISTORY_ENTRY]) window.history.back();
          else window.location.assign(checkoutRecovery.returnUrl ?? '/');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-transparent text-neutral-900 [overflow-anchor:none] selection:bg-orange-500/20 selection:text-orange-950">
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
        searchDateSummary={
          filters.checkIn && filters.checkOut
            ? `${new Date(`${filters.checkIn}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} - ${new Date(`${filters.checkOut}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}`
            : 'Qualquer dia'
        }
        searchGuestSummary={`${countOccupancyGuests(filters.guests)} ${countOccupancyGuests(filters.guests) === 1 ? 'hóspede' : 'hóspedes'}`}
        onCreateListing={() => setIsCreateListingOpen(true)}
        categories={availableCategories}
        selectedCategory={filters.category}
        onSelectCategory={handleSelectCategory}
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
        toolbar={(compactSearch) =>
          currentView === 'explore' ? (
            <CategoryBar
              availableCategories={availableCategories}
              selectedCategory={filters.category}
              onSelectCategory={handleSelectCategory}
              onOpenFilters={() => setIsFilterOpen(true)}
              activeFilterCount={activeFilterCount}
              isCondominiumView={isCondominiumView}
              compact={compactSearch}
              searchBar={
                <StaysSearchWidget
                  variant="hero"
                  currentFilters={filters}
                  onSearchInApp={handleStaysWidgetSearch}
                  onOpenAssistant={() => setIsSofiaOpen(true)}
                />
              }
            />
          ) : null
        }
      />

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
        searchPagination={searchPagination}
        onLoadMoreSearchResults={loadMoreSearchResults}
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
        canManagePayments={canManagePayments}
        onFiltersChange={setFilters}
        onRemoveDestinationFilter={handleRemoveDestinationFilter}
        onRemoveDateFilter={handleRemoveDateFilter}
        onRemoveGuestFilter={handleRemoveGuestFilter}
        onClearPropertyRefinements={handleClearPropertyRefinements}
        onClearCatalogFilters={handleClearCatalogFilters}
        onSearchInApp={handleStaysWidgetSearch}
        onOpenSuggestedProperty={handleOpenSuggestedProperty}
        onSelectCondominium={setSelectedCondominium}
        onToggleSave={toggleSavedProperty}
        onSelectProperty={handleSelectProperty}
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
        selectedProperty={selectedProperty}
        selectedCondominium={selectedCondominium}
        bookingPayload={bookingPayload}
        checkoutGuestPrefill={{
          fullName: String(
            accountSession?.user.user_metadata?.full_name ||
              accountSession?.user.user_metadata?.name ||
              '',
          ),
          email: accountSession?.user.email || '',
          phone: String(
            accountSession?.user.phone || accountSession?.user.user_metadata?.phone || '',
          ),
        }}
        accountModalMode={accountModalMode}
        accountReturnFocusRef={accountButtonRef}
        catalogFocusRef={catalogFocusRef}
        savedPropertyIds={savedPropertyIds}
        properties={properties}
        catalogProperties={catalogProperties}
        hasMoreSearchResults={searchPagination.hasMore}
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
  usePageMetadata(pathname);

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const checkoutResumeReference =
    /^\/checkout\/([A-Za-z0-9]{40})(?:\/(?:pagamento-confirmado|pagamento-recusado))?$/.exec(
      pathname,
    )?.[1];
  const existingReservationCode = existingReservationCodeFromPath(pathname);
  const normalizedPathname = pathname.replace(/\/+$/, '') || '/';
  const isPropertyPath =
    /^(?:\/[a-z]{2})?\/(?:apartamento|apartment)\/[a-zA-Z0-9_-]+(?:\/.*)?$/i.test(
      normalizedPathname,
    );
  const isReservationPath = /^\/reservar\/[a-zA-Z0-9_-]+(?:\/.*)?$/i.test(normalizedPathname);
  const isCheckoutPath = /^\/checkout\/[a-zA-Z0-9_-]+(?:\/.*)?$/i.test(normalizedPathname);
  const isLocalizedCatalogPath = /^\/(?:[a-z]{2}(?:\/search)?|search)$/i.test(normalizedPathname);
  const legalSlug =
    normalizedPathname === '/contrato'
      ? 'contrato'
      : normalizedPathname === '/privacidade'
        ? 'privacidade'
        : normalizedPathname === '/termos'
          ? 'termos'
          : normalizedPathname === '/cancelamento'
            ? 'cancelamento'
            : null;

  const checkoutPreviewAllowed =
    import.meta.env.DEV || ['127.0.0.1', 'localhost'].includes(window.location.hostname);

  if (
    import.meta.env.DEV &&
    (normalizedPathname === '/imobsys' || normalizedPathname === '/parceiros')
  ) {
    return (
      <Suspense fallback={<main role="status">Carregando imóveis…</main>}>
        <ImobSysPreviewPage />
      </Suspense>
    );
  }
  if (
    /^\/apartamento\/(?:imobsys|parceiro)-crcn-[1-9]\d*-[1-9]\d*(?:\/[a-z0-9-]+)?$/.test(
      normalizedPathname,
    )
  ) {
    return (
      <Suspense fallback={<main role="status">Carregando imóvel…</main>}>
        <ImobSysPropertyPage />
      </Suspense>
    );
  }

  if (checkoutPreviewAllowed && pathname === '/checkout-preview/pagamento-confirmado') {
    return (
      <Suspense fallback={<main role="status">Carregando prévia…</main>}>
        <PaymentConfirmationPreview />
      </Suspense>
    );
  }

  if (checkoutPreviewAllowed && pathname === '/checkout-preview/cielo') {
    return (
      <Suspense
        fallback={
          <main className="min-h-screen bg-[#f7f4ee] p-8" role="status">
            Carregando prévia…
          </main>
        }
      >
        <CieloCheckoutPreviewPage />
      </Suspense>
    );
  }

  if (import.meta.env?.DEV && pathname === '/checkout-preview/parceiro/operacao') {
    return (
      <Suspense fallback={<main role="status">Carregando prévia…</main>}>
        <PartnerSandboxOperations />
      </Suspense>
    );
  }

  if (import.meta.env?.DEV && pathname === '/checkout-preview/parceiro') {
    return (
      <Suspense fallback={<main role="status">Carregando prévia…</main>}>
        <PartnerSandboxCheckout />
      </Suspense>
    );
  }

  if (legalSlug) {
    return <LegalDocumentPage slug={legalSlug} />;
  }
  if (pathname === '/auth/confirm') {
    return (
      <Suspense
        fallback={
          <main className="min-h-screen bg-[#f7f4ee] px-4 py-8 text-neutral-700" role="status">
            Confirmando seu acesso…
          </main>
        }
      >
        <RecoveryLinkConfirmationPage />
      </Suspense>
    );
  }

  if (existingReservationCode) {
    return (
      <Suspense
        fallback={<CheckoutLoadingSkeleton fullPage label="Consultando os dados da reserva" />}
      >
        <ExistingReservationCheckout code={existingReservationCode} />
      </Suspense>
    );
  }

  if (checkoutResumeReference) {
    return (
      <>
        <MeasurementPreferences showReopenButton />
        <Suspense
          fallback={
            <main className="min-h-screen bg-[#f7f4ee] px-4 py-8 text-neutral-700" role="status">
              Abrindo seu pedido…
            </main>
          }
        >
          <CheckoutResumeEntry reference={checkoutResumeReference} />
        </Suspense>
      </>
    );
  }

  if (
    normalizedPathname !== '/' &&
    normalizedPathname !== NEW_CHECKOUT_PATH &&
    normalizedPathname !== '/condominios' &&
    normalizedPathname !== '/s/homes' &&
    !legalSlug &&
    normalizedPathname !== '/auth/confirm' &&
    !isPropertyPath &&
    !isReservationPath &&
    !isCheckoutPath &&
    !isLocalizedCatalogPath &&
    !(checkoutPreviewAllowed && normalizedPathname === '/checkout-preview/cielo')
  ) {
    return <NotFoundPage />;
  }

  return (
    <>
      <MarketplaceApp />
      <MeasurementPreferences />
    </>
  );
}
