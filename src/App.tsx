/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Property, Reservation, SearchFilters, Currency } from './types';
import { CalculatedPriceResponse } from './services/crcnBackendApi';
import { INITIAL_RESERVATIONS } from './data/mockProperties';
import { STAYS_NET_APARTMENTS } from './data/staysApartments';
import { staysApi } from './services/staysApi';
import { Header } from './components/Header';
import { CategoryBar } from './components/CategoryBar';
import { PropertyCard } from './components/PropertyCard';
import { InteractiveMap } from './components/InteractiveMap';
import { PropertyDetailModal } from './components/PropertyDetailModal';
import { CheckoutModal } from './components/CheckoutModal';
import { SearchModal } from './components/SearchModal';
import { FilterModal } from './components/FilterModal';
import { TripsView } from './components/TripsView';
import { WishlistsView } from './components/WishlistsView';
import { HostDashboardView } from './components/HostDashboardView';
import { CreateListingModal } from './components/CreateListingModal';
import { StaysSearchWidget } from './components/StaysSearchWidget';
import { SofiaAssistantModal } from './components/SofiaAssistantModal';
import { LogoCRCN } from './components/LogoCRCN';
import { crcnBackendApi } from './services/crcnBackendApi';
import { 
  Compass, 
  Heart, 
  Briefcase, 
  Sparkles, 
  MapPin, 
  SlidersHorizontal, 
  CheckCircle, 
  Globe, 
  ShieldCheck, 
  Search 
} from 'lucide-react';

export default function App() {
  // Persistent properties supplied by the reservations catalogue
  const [properties, setProperties] = useState<Property[]>(() => {
    const saved = localStorage.getItem('hospeda_properties');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Purge any legacy mockup items
          const cleaned = parsed.filter((p: Property) => !p.id.startsWith('prop-'));
          if (cleaned.length > 0 && localStorage.getItem('hospeda_properties_source') === 'stays-live') {
            // Galleries are refreshed from the backend at startup; do not treat
            // an older one-image cache as the current source of truth.
            return cleaned.map((property: Property) => ({
              ...property,
              images: Array.isArray(property.images) ? property.images.filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url)) : [],
            }));
          }
        }
      } catch (e) { /* fallback */ }
    }
    return STAYS_NET_APARTMENTS;
  });

  const handlePullStaysApartments = async (silent = false) => {
    try {
      const res = await staysApi.fetchListings();
      if (res.success && res.listings.length > 0) {
        setProperties(res.listings);
        localStorage.setItem('hospeda_properties', JSON.stringify(res.listings));
        localStorage.setItem('hospeda_properties_source', 'stays-live');
        if (!silent) {
          showToast(`🎉 ${res.listings.length} acomodações atualizadas com sucesso!`);
        }
      }
    } catch {
      if (!silent) showToast('Não foi possível atualizar as acomodações. Tente novamente.');
    }
  };

  useEffect(() => {
    // Replace the local demo seed with account-owned listing IDs before users
    // start quoting or attempting checkout; synthetic seed IDs are not valid
    // identifiers in the live booking catalog.
    void handlePullStaysApartments(true);
  }, []);

  // Persistent Reservations State
  const [reservations, setReservations] = useState<Reservation[]>(() => {
    const saved = localStorage.getItem('hospeda_reservations');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter((r: Reservation) => !r.propertyId.startsWith('prop-'));
          if (cleaned.length > 0) return cleaned;
        }
      } catch (e) { /* fallback */ }
    }
    return INITIAL_RESERVATIONS;
  });

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
      } catch (e) { /* fallback */ }
    }
    return ['JQ08G', 'stays-lacqua-204'];
  });

  // Currency & Display preferences
  const [currency, setCurrency] = useState<Currency>('BRL');
  const [showTotalWithTaxes, setShowTotalWithTaxes] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [currentView, setCurrentView] = useState<'explore' | 'trips' | 'wishlists' | 'host'>('explore');

  // Modals & Active selections
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isCreateListingOpen, setIsCreateListingOpen] = useState(false);
  const [isSofiaOpen, setIsSofiaOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
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
      const match = window.location.pathname.match(/\/apartamento\/([a-zA-Z0-9_-]+)/);
      if (match) {
        const targetId = match[1];
        const found = properties.find((p) => p.id === targetId || p.staysListingId === targetId);
        if (found) setSelectedProperty(found);
      } else {
        setSelectedProperty(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [properties]);

  const handleSelectProperty = (p: Property) => {
    setSelectedProperty(p);
    const slug = p.staysListingId || p.id;
    if (window.location.pathname !== `/apartamento/${slug}`) {
      window.history.pushState(null, '', `/apartamento/${slug}`);
    }
  };

  const handleClosePropertyDetail = () => {
    setSelectedProperty(null);
    if (window.location.pathname.startsWith('/apartamento/')) {
      window.history.pushState(null, '', '/');
    }
  };

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Refresh accommodation catalog from the booking service
  useEffect(() => {
    crcnBackendApi.getAccommodations().then((list) => {
      if (list && list.length > 0) {
        setProperties(list);
        localStorage.setItem('hospeda_properties', JSON.stringify(list));
        localStorage.setItem('hospeda_properties_source', 'stays-live');
      }
    });
  }, []);

  useEffect(() => {
    localStorage.setItem('hospeda_properties', JSON.stringify(properties));
  }, [properties]);

  useEffect(() => {
    localStorage.setItem('hospeda_reservations', JSON.stringify(reservations));
  }, [reservations]);

  useEffect(() => {
    localStorage.setItem('hospeda_wishlist', JSON.stringify(savedPropertyIds));
  }, [savedPropertyIds]);

  // Search & Filter State
  const defaultFilters: SearchFilters = {
    destination: '',
    checkIn: '',
    checkOut: '',
    guests: { adults: 1, children: 0, infants: 0, pets: 0 },
    category: 'all',
    minPrice: 0,
    maxPrice: 5000,
    propertyTypes: [],
    amenities: [],
    minBedrooms: 0,
    minBaths: 0,
    superhostOnly: false,
    instantBookOnly: false,
  };

  const [filters, setFilters] = useState<SearchFilters>(defaultFilters);

  // Toggle Save Property
  const handleToggleSave = (propertyId: string) => {
    if (savedPropertyIds.includes(propertyId)) {
      setSavedPropertyIds(savedPropertyIds.filter((id) => id !== propertyId));
      showToast('Acomodação removida dos seus favoritos');
    } else {
      setSavedPropertyIds([...savedPropertyIds, propertyId]);
      showToast('Acomodação salva nos seus favoritos! ❤️');
    }
  };

  // Filter Properties Logic
  const filteredProperties = useMemo(() => {
    return properties.filter((prop) => {
      // Category filter
      if (filters.category !== 'all' && prop.category !== filters.category) {
        return false;
      }

      // Destination filter
      if (filters.destination.trim()) {
        const destLower = filters.destination.toLowerCase();
        const matchesCity = prop.location.city.toLowerCase().includes(destLower);
        const matchesState = prop.location.state.toLowerCase().includes(destLower);
        const matchesTitle = prop.title.toLowerCase().includes(destLower);
        const matchesNeighborhood = prop.location.neighborhood.toLowerCase().includes(destLower);
        if (!matchesCity && !matchesState && !matchesTitle && !matchesNeighborhood) {
          return false;
        }
      }

      // Guest capacity
      const requestedGuests = filters.guests.adults + filters.guests.children;
      if (requestedGuests > prop.maxGuests) {
        return false;
      }

      // Price filter
      if (prop.pricePerNight < filters.minPrice || prop.pricePerNight > filters.maxPrice) {
        return false;
      }

      // Property type filter
      if (filters.propertyTypes.length > 0 && !filters.propertyTypes.includes(prop.propertyType)) {
        return false;
      }

      // Bedrooms
      if (filters.minBedrooms > 0 && prop.bedrooms < filters.minBedrooms) {
        return false;
      }

      // Bathrooms
      if (filters.minBaths > 0 && prop.bathrooms < filters.minBaths) {
        return false;
      }

      // Superhost only
      if (filters.superhostOnly && !prop.isSuperhost) {
        return false;
      }

      // Instant book only
      if (filters.instantBookOnly && !prop.instantBook) {
        return false;
      }

      // Amenities filter (all requested amenities must match)
      if (filters.amenities.length > 0) {
        const hasAllAmenities = filters.amenities.every((amenity) =>
          prop.amenities.some((a) => a.toLowerCase().includes(amenity.toLowerCase()))
        );
        if (!hasAllAmenities) return false;
      }

      return true;
    });
  }, [properties, filters]);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.minPrice > 0 || filters.maxPrice < 5000) count++;
    if (filters.propertyTypes.length > 0) count++;
    if (filters.amenities.length > 0) count += filters.amenities.length;
    if (filters.minBedrooms > 0) count++;
    if (filters.minBaths > 0) count++;
    if (filters.superhostOnly) count++;
    if (filters.instantBookOnly) count++;
    return count;
  }, [filters]);

  // Handlers
  const handleAddNewProperty = (newProp: Property) => {
    setProperties([newProp, ...properties]);
    showToast(`"${newProp.title}" foi anunciada com sucesso! ✨`);
  };

  const handleCancelReservation = (reservationId: string) => {
    void reservationId;
    showToast('O cancelamento online ainda não está disponível. Nenhuma reserva foi cancelada.');
  };

  const handleStaysWidgetSearch = async (searchParams: {
    checkIn: string;
    checkOut: string;
    persons: number;
    destination?: string;
  }) => {
    let searchedProperties: Property[] | null = null;
    setFilters((prev) => ({
      ...prev,
      checkIn: searchParams.checkIn,
      checkOut: searchParams.checkOut,
      destination: searchParams.destination || '',
      guests: {
        adults: searchParams.persons,
        children: 0,
        infants: 0,
        pets: 0,
      },
    }));

    // Search current availability and pricing through the backend
    try {
      const searchRes = await crcnBackendApi.searchAccommodations({
        from: searchParams.checkIn,
        to: searchParams.checkOut,
        guests: searchParams.persons,
        destination: searchParams.destination,
      });
      if (searchRes && searchRes.data) searchedProperties = searchRes.data;
    } catch (e) {
      console.warn('Backend search error:', e);
    }

    if (searchedProperties) setProperties(searchedProperties);

    showToast(`🔍 Buscando apartamentos para ${searchParams.persons} ${searchParams.persons === 1 ? 'hóspede' : 'hóspedes'}!`);
    const catalogEl = document.getElementById('stays-apartments-catalog');
    if (catalogEl) {
      catalogEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const savedPropertiesList = useMemo(() => {
    return properties.filter((p) => savedPropertyIds.includes(p.id));
  }, [properties, savedPropertyIds]);

  return (
    <div className="min-h-screen flex flex-col bg-transparent text-neutral-900 selection:bg-orange-500/20 selection:text-orange-950">
      
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-60 bg-neutral-900 text-white px-5 py-3 rounded-full text-xs font-semibold shadow-2xl flex items-center gap-2.5 animate-in fade-in slide-in-from-top-4 duration-200">
          <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Header */}
      <Header
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenCreateListing={() => setIsCreateListingOpen(true)}
        currentView={currentView}
        setCurrentView={setCurrentView}
        currency={currency}
        setCurrency={setCurrency}
        savedCount={savedPropertyIds.length}
        tripsCount={reservations.filter((r) => r.status === 'confirmed').length}
        searchSummaryText={filters.destination || undefined}
      />

      {/* Category Bar & Controls (Visible only on Explore view) */}
      {currentView === 'explore' && (
        <CategoryBar
          selectedCategory={filters.category}
          onSelectCategory={(catId) => setFilters({ ...filters, category: catId })}
          onOpenFilters={() => setIsFilterOpen(true)}
          activeFilterCount={activeFilterCount}
          showTotalWithTaxes={showTotalWithTaxes}
          setShowTotalWithTaxes={setShowTotalWithTaxes}
          viewMode={viewMode}
          setViewMode={setViewMode}
        />
      )}

      {/* Main Content Router */}
      <main className="flex-1 pb-24 sm:pb-12">
        {/* EXPLORE VIEW */}
        {currentView === 'explore' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            
            {/* Search accommodation and dates */}
            <div className="mb-8">
              <StaysSearchWidget
                variant="hero"
                currentFilters={filters}
                onSearchInApp={handleStaysWidgetSearch}
                onOpenSofia={() => setIsSofiaOpen(true)}
              />
            </div>

            {/* Filter pills if active */}
            {(filters.destination || activeFilterCount > 0) && (
              <div className="mb-6 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-extrabold text-neutral-800">Filtros ativos:</span>
                {filters.destination && (
                  <span className="px-3 py-1.5 rounded-full liquid-glass-pill text-neutral-900 font-bold border border-white/80 shadow-xs flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-orange-500" />
                    <span>{filters.destination}</span>
                    <button
                      onClick={() => setFilters({ ...filters, destination: '' })}
                      className="text-neutral-400 hover:text-neutral-900 ml-1 font-bold"
                    >
                      ×
                    </button>
                  </span>
                )}
                {filters.superhostOnly && (
                  <span className="px-3 py-1.5 rounded-full liquid-glass-pill text-neutral-900 font-bold border border-white/80 shadow-xs">
                    Apenas Superhost
                  </span>
                )}
                {filters.instantBookOnly && (
                  <span className="px-3 py-1.5 rounded-full liquid-glass-pill text-neutral-900 font-bold border border-white/80 shadow-xs">
                    Reserva Imediata
                  </span>
                )}
                <button
                  onClick={() => setFilters(defaultFilters)}
                  className="text-orange-700 font-extrabold underline hover:text-orange-800 cursor-pointer ml-2"
                >
                  Limpar todos os filtros
                </button>
              </div>
            )}

            {/* View Mode: Grid or Interactive Map */}
            <div id="stays-apartments-catalog" className="scroll-mt-24">
            {viewMode === 'grid' ? (
              filteredProperties.length === 0 ? (
                <div className="text-center py-20 max-w-md mx-auto space-y-4">
                  <div className="w-16 h-16 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto">
                    <Search className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold text-neutral-900">
                    Nenhuma acomodação encontrada
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Tente ajustar ou remover alguns filtros como datas, comodidades ou faixa de preço para ver mais resultados.
                  </p>
                  <button
                    onClick={() => setFilters(defaultFilters)}
                    className="px-6 py-2.5 rounded-full bg-neutral-900 hover:bg-black text-white text-xs font-bold transition-all cursor-pointer"
                  >
                    Restaurar todas as acomodações
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
                  {filteredProperties.map((prop) => (
                    <PropertyCard
                      key={prop.id}
                      property={prop}
                      currency={currency}
                      isSaved={savedPropertyIds.includes(prop.id)}
                      onToggleSave={handleToggleSave}
                      onSelectProperty={handleSelectProperty}
                      showTotalWithTaxes={showTotalWithTaxes}
                    />
                  ))}
                </div>
              )
            ) : (
              <InteractiveMap
                properties={filteredProperties}
                currency={currency}
                onSelectProperty={handleSelectProperty}
                selectedProperty={selectedProperty}
              />
            )}
            </div>

          </div>
        )}

        {/* TRIPS VIEW */}
        {currentView === 'trips' && (
          <TripsView
            reservations={reservations}
            currency={currency}
            onCancelReservation={handleCancelReservation}
            onExploreMore={() => setCurrentView('explore')}
          />
        )}

        {/* WISHLISTS VIEW */}
        {currentView === 'wishlists' && (
          <WishlistsView
            savedProperties={savedPropertiesList}
            currency={currency}
            onToggleSave={handleToggleSave}
            onSelectProperty={handleSelectProperty}
            onExploreMore={() => setCurrentView('explore')}
            showTotalWithTaxes={showTotalWithTaxes}
          />
        )}

        {/* HOST DASHBOARD VIEW */}
        {currentView === 'host' && (
          <HostDashboardView
            properties={properties}
            reservations={reservations}
            currency={currency}
            onOpenCreateListing={() => setIsCreateListingOpen(true)}
            onSelectProperty={handleSelectProperty}
          />
        )}
      </main>

      {/* Floating Bottom Navigation Bar for Mobile with Liquid Glass */}
      <nav className="sm:hidden fixed bottom-3 left-4 right-4 z-40 bg-white/75 backdrop-blur-2xl border border-white/80 rounded-3xl px-6 py-2.5 flex items-center justify-between shadow-[0_12px_36px_rgba(249,115,22,0.15)]">
        <button
          onClick={() => setCurrentView('explore')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold cursor-pointer transition-all ${
            currentView === 'explore' ? 'text-orange-600 scale-105' : 'text-neutral-500'
          }`}
        >
          <Compass className="w-5 h-5" />
          <span>Explorar</span>
        </button>

        <button
          onClick={() => setCurrentView('wishlists')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold cursor-pointer transition-all relative ${
            currentView === 'wishlists' ? 'text-orange-600 scale-105' : 'text-neutral-500'
          }`}
        >
          <Heart className="w-5 h-5" />
          <span>Favoritos</span>
          {savedPropertyIds.length > 0 && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 ring-2 ring-white" />
          )}
        </button>

        <button
          onClick={() => setCurrentView('trips')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold cursor-pointer transition-all relative ${
            currentView === 'trips' ? 'text-orange-600 scale-105' : 'text-neutral-500'
          }`}
        >
          <Briefcase className="w-5 h-5" />
          <span>Reservas</span>
          {reservations.filter((r) => r.status === 'confirmed').length > 0 && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 ring-2 ring-white" />
          )}
        </button>

        <button
          onClick={() => setCurrentView('host')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold cursor-pointer transition-all ${
            currentView === 'host' ? 'text-orange-600 scale-105' : 'text-neutral-500'
          }`}
        >
          <Sparkles className="w-5 h-5" />
          <span>Gestor</span>
        </button>
      </nav>

      {/* Footer in Liquid Glass */}
      <footer className="border-t border-white/60 bg-white/40 backdrop-blur-2xl text-xs text-neutral-600 hidden sm:block">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div className="space-y-3">
              <LogoCRCN size="md" variant="glass" />
              <p className="text-[11px] text-neutral-500 leading-relaxed">
                Central de Reservas Caldas Novas oficial. Especialistas em hospedagens termais, flats no diRoma, resorts com ingressos e passeios no Lago de Corumbá.
              </p>
              <div className="pt-1 text-[11px] text-neutral-700 font-semibold space-y-1">
                <p>📍 Caldas Novas - Goiás, Brasil</p>
                <p>✉️ centraldereservascn@gmail.com</p>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-neutral-900 mb-3">Principais Destinos & Parques</h4>
              <ul className="space-y-2">
                <li><a href="#" className="hover:underline">diRoma Acqua Park</a></li>
                <li><a href="#" className="hover:underline">Hot Park & Praia do Cerrado</a></li>
                <li><a href="#" className="hover:underline">L’acqua diRoma 24h</a></li>
                <li><a href="#" className="hover:underline">Náutico Praia Clube (Lago Corumbá)</a></li>
                <li><a href="#" className="hover:underline">Prive Diversão & Water Park</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-neutral-900 mb-3">Proprietários & Hospedagem</h4>
              <ul className="space-y-2">
                <li><button onClick={() => setIsCreateListingOpen(true)} className="hover:underline text-left cursor-pointer">Cadastre seu Imóvel na Central</button></li>
                <li><a href="#" className="hover:underline">Gestão de Flats em Caldas Novas</a></li>
                <li><a href="#" className="hover:underline">Vantagens para Proprietários</a></li>
                <li><a href="#" className="hover:underline">Regras de Condomínio e Pulseiras</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-neutral-900 mb-3">Segurança e Garantia CRCN</h4>
              <div className="p-3.5 bg-white/80 backdrop-blur-md rounded-2xl border border-white/80 shadow-2xs space-y-2">
                <div className="flex items-center gap-2 text-orange-600 font-bold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Reserva Garantida CRCN</span>
                </div>
                <p className="text-[11px] text-neutral-500 leading-relaxed">
                  Vouchers autênticos com liberação imediata de pulseiras e chaves na portaria do condomínio contratado.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-neutral-200/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-neutral-500 text-[11px]">
            <div className="flex items-center gap-2">
              <span>© {new Date().getFullYear()} Central de Reservas Caldas Novas. Todos os direitos reservados.</span>
              <span>•</span>
              <a href="#" className="hover:underline">Privacidade</a>
              <span>•</span>
              <a href="#" className="hover:underline">Termos</a>
            </div>

            <div className="flex items-center gap-4 font-semibold text-neutral-700">
              <span className="flex items-center gap-1">
                <Globe className="w-3.5 h-3.5 text-orange-500" />
                Português (BR)
              </span>
              <span>{currency}</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating Sofia Concierge Virtual Assistant Trigger Button */}
      <div className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-40">
        <button
          onClick={() => setIsSofiaOpen(true)}
          className="group flex items-center gap-2.5 px-4 py-3 rounded-full bg-gradient-to-r from-orange-600 via-amber-500 to-orange-600 text-white font-black text-xs shadow-2xl shadow-orange-500/40 border-2 border-white/90 hover:scale-105 active:scale-95 transition-all cursor-pointer"
          title="Falar com Sofia - Concierge Virtual Central de Reservas"
        >
          <div className="relative">
            <img
              src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=100&q=80"
              alt="Sofia Concierge"
              className="w-8 h-8 rounded-full object-cover border border-white"
            />
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 border-2 border-white rounded-full animate-ping" />
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 border-2 border-white rounded-full" />
          </div>
          <div className="flex flex-col text-left">
            <span className="leading-tight flex items-center gap-1 font-black">
              Sofia • Concierge IA
              <Sparkles className="w-3 h-3 text-amber-200 animate-spin" style={{ animationDuration: '4s' }} />
            </span>
            <span className="text-[10px] text-orange-100 font-semibold">Tire dúvidas sobre os resorts</span>
          </div>
        </button>
      </div>

      {/* ALL INTERACTIVE MODALS */}
      
      {/* 1. Property Detail Modal */}
      <PropertyDetailModal
        property={selectedProperty}
        initialCheckIn={filters.checkIn}
        initialCheckOut={filters.checkOut}
        initialGuests={filters.guests}
        onClose={handleClosePropertyDetail}
        currency={currency}
        isSaved={selectedProperty ? savedPropertyIds.includes(selectedProperty.id) : false}
        onToggleSave={handleToggleSave}
        onStartBooking={(bookingData) => {
          handleClosePropertyDetail();
          setBookingPayload(bookingData);
        }}
      />

      {/* 2. Sofia Concierge Assistant Modal */}
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
          if (catalogEl) catalogEl.scrollIntoView({ behavior: 'smooth' });
        }}
      />

      {/* 2. Checkout Modal */}
      <CheckoutModal
        isOpen={!!bookingPayload}
        onClose={() => setBookingPayload(null)}
        bookingData={bookingPayload}
        currency={currency}
      />

      {/* 3. Search Modal */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        filters={filters}
        onApplyFilters={(newFilters) => setFilters(newFilters)}
        onResetFilters={() => setFilters(defaultFilters)}
      />

      {/* 4. Filter Modal */}
      <FilterModal
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filters={filters}
        onApplyFilters={(newFilters) => setFilters(newFilters)}
        onResetFilters={() => setFilters(defaultFilters)}
        currency={currency}
        matchingCount={filteredProperties.length}
      />

      {/* 5. Create Listing Modal */}
      <CreateListingModal
        isOpen={isCreateListingOpen}
        onClose={() => setIsCreateListingOpen(false)}
        onAddProperty={handleAddNewProperty}
        currency={currency}
      />

    </div>
  );
}
