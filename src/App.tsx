/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Property, Reservation, SearchFilters, Currency } from './types';
import { CalculatedPriceResponse } from './services/crcnBackendApi';
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
import { crcnBackendApi } from './services/crcnBackendApi';
import { getAuthCallbackError } from './utils/authCallback';
import { getSurpriseDateCandidates } from './utils/surpriseDates';
import { buildCondominiumCatalog } from './utils/condominiumCatalog';
import { createDefaultSearchFilters, parseSearchFilters } from './utils/searchUrlState';
import { useSearchUrlSync } from './hooks/useSearchUrlSync';
import { countActivePropertyFilters, filterPropertiesBySearchFilters } from './utils/propertySearchFilters';
import { scrollIntoViewRespectingMotion } from './utils/motion';
import type { CondominiumSummary } from './utils/condominiumCatalog';
import { useAccommodationCatalog } from './hooks/useAccommodationCatalog';

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

  // Persistent Reservations State
  const [reservations, setReservations] = useState<Reservation[]>([]);

  // Persistent saved accommodation IDs
  const [savedPropertyIds, setSavedPropertyIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('hospeda_wishlist');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter((id: string) => !id.startsWith('prop-'));
          if (cleaned.length > 0) return cleaned;
        }
      } catch { /* fallback */ }
    }
    return ['JQ08G', 'stays-lacqua-204'];
  });

  // Currency & Display preferences
  const [currency, setCurrency] = useState<Currency>('BRL');
  const [showTotalWithTaxes, setShowTotalWithTaxes] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [currentView, setCurrentView] = useState<MainView>('explore');
  const currentViewRef = useRef(currentView);
  currentViewRef.current = currentView;
  const [authCallbackNotice, setAuthCallbackNotice] = useState('');
  const [accountSession, setAccountSession] = useState<Session | null>(null);
  const [accountModalMode, setAccountModalMode] = useState<'login' | 'signup' | 'recovery' | null>(null);
  const [ownerAccessStatus, setOwnerAccessStatus] = useState<'loading' | 'unavailable' | 'none' | 'pending' | 'approved' | 'suspended'>('none');
  const [ownerRequestLoading, setOwnerRequestLoading] = useState(false);
  const [isOwnerAdmin, setIsOwnerAdmin] = useState(false);

  useEffect(() => {
    const authHash = new URLSearchParams(window.location.hash.slice(1));
    if (authHash.get('type') === 'recovery') setAccountModalMode('recovery');
    if (initialAuthCallbackError) {
      setAuthCallbackNotice(`Não foi possível confirmar o e-mail: ${initialAuthCallbackError}`);
    }
    if (!import.meta.env.VITE_SUPABASE_URL?.trim() || !import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()) return;

    let isMounted = true;
    let unsubscribeAuth: (() => void) | undefined;

    const handleConfirmedSession = (session: import('@supabase/supabase-js').Session | null) => {
      if (!isMounted) return;
      if (localStorage.getItem('hospeda_pending_email_confirmation') !== 'true') return;
      if (!session?.user.email_confirmed_at) return;
      localStorage.removeItem('hospeda_pending_email_confirmation');
      setAuthCallbackNotice('E-mail confirmado! Volte à reserva e entre na sua conta para continuar.');
    };

    const bootstrapTimer = window.setTimeout(() => {
      void (async () => {
        try {
          const { supabase } = await import('./services/supabase');
          if (!isMounted || !supabase) return;
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (!isMounted) return;
            setAccountSession(session);
            if (event === 'PASSWORD_RECOVERY') setAccountModalMode('recovery');
            if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
              handleConfirmedSession(session);
            }
          });
          unsubscribeAuth = () => subscription.unsubscribe();
          const { data } = await supabase.auth.getSession();
          if (!isMounted) return;
          setAccountSession(data.session);
          handleConfirmedSession(data.session);
        } catch {
          if (isMounted) setAuthCallbackNotice('Não foi possível verificar sua sessão. Tente atualizar a página.');
        }
      })();
    }, 0);

    return () => {
      isMounted = false;
      window.clearTimeout(bootstrapTimer);
      unsubscribeAuth?.();
    };
  }, []);

  // Modals & Active selections
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isCreateListingOpen, setIsCreateListingOpen] = useState(false);
  const [isSofiaOpen, setIsSofiaOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const catalogFocusRef = useRef<HTMLElement>(null);
  const [selectedCondominium, setSelectedCondominium] = useState<CondominiumSummary | null>(null);
  const initialLocationRef = useRef(`${window.location.pathname}${window.location.search}${window.location.hash}`);
  const initialUrlSearchHandledRef = useRef(false);
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

  // Deep-linking: sync URL /apartamento/:id with selectedProperty
  useEffect(() => {
    const parseUrlAndSelect = () => {
      const match = window.location.pathname.match(/\/apartamento\/([a-zA-Z0-9_-]+)/);
      if (match) {
        const targetId = match[1];
        const found = properties.find((p) => p.id === targetId || p.staysListingId === targetId);
        if (found) {
          setSelectedProperty(found);
        } else {
          crcnBackendApi.getAccommodationById(targetId).then((p) => {
            if (p) setSelectedProperty(p);
          });
        }
      }
    };

    parseUrlAndSelect();

    const handlePopState = () => {
      const restoredFilters = parseSearchFilters(window.location.search);
      setFilters(restoredFilters);
      const match = window.location.pathname.match(/\/apartamento\/([a-zA-Z0-9_-]+)/);
      if (match) {
        const targetId = match[1];
        const found = properties.find((p) => p.id === targetId || p.staysListingId === targetId);
        if (found) setSelectedProperty(found);
      } else {
        setSelectedProperty(null);
        if (restoredFilters.checkIn && restoredFilters.checkOut) {
          restoreSearchFromUrlRef.current(restoredFilters);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [properties]);

  const handleSelectProperty = (p: Property) => {
    setSelectedProperty(p);
    const slug = p.staysListingId || p.id;
    if (window.location.pathname !== `/apartamento/${slug}`) {
      window.history.pushState(null, '', `/apartamento/${slug}${window.location.search}${window.location.hash}`);
    }
  };

  const handleClosePropertyDetail = () => {
    setSelectedProperty(null);
    if (window.location.pathname.startsWith('/apartamento/')) {
      window.history.pushState(null, '', `/${window.location.search}${window.location.hash}`);
    }
  };

  useEffect(() => {
    if (!accountSession?.access_token) {
      setReservations([]);
      return;
    }
    let cancelled = false;
    void crcnBackendApi.getMyReservations(accountSession.access_token)
      .then((items) => { if (!cancelled) setReservations(items); })
      .catch((error) => { if (!cancelled) { setReservations([]); console.warn('Unable to load guest reservations:', error); } });
    return () => { cancelled = true; };
  }, [accountSession?.access_token]);

  useEffect(() => {
    if (!accountSession?.access_token) {
      setOwnerAccessStatus('none');
      setIsOwnerAdmin(false);
      if (currentViewRef.current === 'host' || currentViewRef.current === 'ownerAdmin') setCurrentView('explore');
      return;
    }
    let cancelled = false;
    setOwnerAccessStatus('loading');
    void crcnBackendApi.getOwnerAccess(accountSession.access_token)
      .then((status) => { if (!cancelled) setOwnerAccessStatus(status); })
      .catch((error) => {
        if (!cancelled) {
          setOwnerAccessStatus('unavailable');
          console.warn('Unable to verify owner access:', error);
        }
      });
    return () => { cancelled = true; };
  }, [accountSession?.access_token]);

  useEffect(() => {
    if (!accountSession?.access_token) {
      setIsOwnerAdmin(false);
      return;
    }
    let cancelled = false;
    void crcnBackendApi.getOwnerAdminStatus(accountSession.access_token)
      .then((isAdmin) => {
        if (cancelled) return;
        setIsOwnerAdmin(isAdmin);
        if (!isAdmin && currentViewRef.current === 'ownerAdmin') setCurrentView('explore');
      })
      .catch(() => {
        if (cancelled) return;
        setIsOwnerAdmin(false);
        if (currentViewRef.current === 'ownerAdmin') setCurrentView('explore');
      });
    return () => { cancelled = true; };
  }, [accountSession?.access_token]);

  useEffect(() => {
    localStorage.setItem('hospeda_wishlist', JSON.stringify(savedPropertyIds));
  }, [savedPropertyIds]);

  // Search & Filter State
  const [filters, setFilters] = useState<SearchFilters>(() => parseSearchFilters(window.location.search));
  const defaultFilters = createDefaultSearchFilters();
  useSearchUrlSync(filters);

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

  const handleCancelReservation = async (reservationId: string) => {
    if (!accountSession?.access_token) throw new Error('Entre na sua conta para solicitar o cancelamento.');
    await crcnBackendApi.cancelMyReservation(reservationId, accountSession.access_token);
    setReservations((current) => current.map((reservation) =>
      reservation.id === reservationId ? { ...reservation, status: 'cancelled' } : reservation
    ));
    try {
      const refreshed = await crcnBackendApi.getMyReservations(accountSession.access_token);
      setReservations(refreshed.map((reservation) =>
        reservation.id === reservationId ? { ...reservation, status: 'cancelled' } : reservation
      ));
    } catch {
      // Stays has already confirmed the cancellation; keep that confirmed status visible.
    }
  };

  const handleRequestOwnerAccess = async () => {
    if (!accountSession?.access_token) {
      setAccountModalMode('login');
      return;
    }
    setOwnerRequestLoading(true);
    try {
      const status = await crcnBackendApi.requestOwnerAccess(accountSession.access_token);
      setOwnerAccessStatus(status);
      if (status === 'pending') setAuthCallbackNotice('Solicitação de acesso ao painel de proprietário enviada para análise.');
    } catch (error) {
      setAuthCallbackNotice(error instanceof Error ? error.message : 'Não foi possível solicitar acesso ao painel.');
      setOwnerAccessStatus('unavailable');
    } finally {
      setOwnerRequestLoading(false);
    }
  };

  const handleSetCurrentView = (view: 'explore' | 'trips' | 'wishlists' | 'host' | 'ownerAdmin') => {
    if (view === 'host' && ownerAccessStatus !== 'approved') return;
    if (view === 'ownerAdmin' && !isOwnerAdmin) return;
    setCurrentView(view);
  };

  const handleStaysWidgetSearch = useCallback(async (searchParams: {
    checkIn: string;
    checkOut: string;
    persons: number;
    guests?: SearchFilters['guests'];
    destination?: string;
    propertyId?: string;
    surpriseMe?: boolean;
  }) => {
    let searchedProperties: Array<Property & { calculatedPrice?: { totalAmount?: number } }> | null = null;
    setFilters((prev) => ({
      ...prev,
      ...(searchParams.surpriseMe ? {} : { checkIn: searchParams.checkIn, checkOut: searchParams.checkOut }),
      destination: searchParams.surpriseMe ? '' : searchParams.destination || '',
      destinationPropertyId: searchParams.surpriseMe ? '' : searchParams.propertyId || '',
      guests: searchParams.guests ?? {
        adults: searchParams.persons,
        children: 0,
        infants: 0,
        pets: 0,
      },
    }));

    const dateOptions = searchParams.surpriseMe
      ? getSurpriseDateCandidates().slice(0, 3)
      : [{ checkIn: searchParams.checkIn, checkOut: searchParams.checkOut, occasion: '', kind: 'holiday' as const, weight: 1 }];
    let selectedDateOption: (typeof dateOptions)[number] | null = null;

    // For surprise searches, try a few weighted seasonal/event dates in order.
    // Every option still requires a live availability result and official quote.
    for (const dateOption of dateOptions) {
      try {
        const searchRes = await crcnBackendApi.searchAccommodations({
          from: dateOption.checkIn,
          to: dateOption.checkOut,
          guests: searchParams.persons,
          destination: searchParams.destination,
          propertyId: searchParams.propertyId,
        });
        const results = searchRes?.data || [];
        if (searchParams.surpriseMe) {
          const confirmedQuotes = results.filter((property) => Number(property.calculatedPrice?.totalAmount) > 0);
          if (confirmedQuotes.length) {
            searchedProperties = confirmedQuotes;
            selectedDateOption = dateOption;
            break;
          }
        } else {
          searchedProperties = results;
          break;
        }
      } catch (e) {
        console.warn('Backend search error:', e);
      }
    }

    if (searchParams.surpriseMe) {
      const quoted = (searchedProperties || []).filter((property) => Number(property.calculatedPrice?.totalAmount) > 0);
      const score = (property: Property & { calculatedPrice?: { totalAmount?: number } }) =>
        (Number(property.rating) || 0) * 10
        + Math.log10((Number(property.reviewCount) || 0) + 1) * 3
        + (property.isGuestFavorite ? 5 : 0)
        + (property.isSuperhost ? 2 : 0);
      const topCandidates = [...quoted].sort((a, b) =>
        score(b) - score(a) || Number(a.calculatedPrice?.totalAmount) - Number(b.calculatedPrice?.totalAmount)
      ).slice(0, 10);
      const randomizedCandidates = [...topCandidates];
      for (let index = randomizedCandidates.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [randomizedCandidates[index], randomizedCandidates[swapIndex]] = [randomizedCandidates[swapIndex], randomizedCandidates[index]];
      }
      const chosenProperties = randomizedCandidates.slice(0, 5);
      setProperties(chosenProperties);
      if (chosenProperties.length) {
        const suggestedDates = selectedDateOption!;
        setFilters((prev) => ({ ...prev, checkIn: suggestedDates.checkIn, checkOut: suggestedDates.checkOut }));
      }
    } else {
      if (searchedProperties) setProperties(searchedProperties);
    }
    const catalogEl = document.getElementById('stays-apartments-catalog');
    if (catalogEl) {
      scrollIntoViewRespectingMotion(catalogEl);
    }
  }, [setProperties]);

  restoreSearchFromUrlRef.current = (restoredFilters) => {
    void handleStaysWidgetSearch({
      checkIn: restoredFilters.checkIn,
      checkOut: restoredFilters.checkOut,
      persons: restoredFilters.guests.adults + restoredFilters.guests.children,
      guests: restoredFilters.guests,
      destination: restoredFilters.destination,
      propertyId: restoredFilters.destinationPropertyId,
    });
  };

  useEffect(() => {
    if (initialUrlSearchHandledRef.current) return;
    initialUrlSearchHandledRef.current = true;

    const initialUrl = new URL(initialLocationRef.current, window.location.origin);
    if (initialUrl.pathname.startsWith('/apartamento/')) return;
    const initialFilters = parseSearchFilters(initialUrl.search);
    if (!initialFilters.checkIn || !initialFilters.checkOut) return;

    void handleStaysWidgetSearch({
      checkIn: initialFilters.checkIn,
      checkOut: initialFilters.checkOut,
      persons: initialFilters.guests.adults + initialFilters.guests.children,
      guests: initialFilters.guests,
      destination: initialFilters.destination,
      propertyId: initialFilters.destinationPropertyId,
    });
  }, [handleStaysWidgetSearch]);

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
        onSignOut={async () => {
          const { supabase } = await import('./services/supabase');
          if (!supabase) throw new Error('Serviço de autenticação indisponível.');
          const { error } = await supabase.auth.signOut();
          if (error) throw error;
        }}
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
