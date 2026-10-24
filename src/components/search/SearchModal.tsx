import React, { useEffect, useId, useRef, useState } from 'react';
import {
  X,
  Search,
  MapPin,
  Calendar as CalendarIcon,
  Plus,
  Minus,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { SearchFilters } from '../../types';
import { StaysSearchWidget, toBrDate } from './StaysSearchWidget';
import { useDialogFocus } from '../useDialogFocus';
import { countOccupancyGuests } from '../../utils/guestCounts';

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function addDaysToIsoDate(dateValue: string, days: number): string {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + days);

  return toLocalIsoDate(date);
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters: SearchFilters;
  onApplyFilters: (filters: SearchFilters) => void;
  onResetFilters: () => void;
  onSearchInApp: (searchParams: {
    checkIn: string;
    checkOut: string;
    persons: number;
    guests?: SearchFilters['guests'];
    destination?: string;
    propertyId?: string;
    surpriseMe?: boolean;
  }) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  filters,
  onApplyFilters,
  onResetFilters,
  onSearchInApp,
}) => {
  const fieldId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const tabListRef = useRef<HTMLDivElement>(null);
  const tabPanelRef = useRef<HTMLDivElement>(null);
  const dialogRef = useDialogFocus(isOpen, onClose, { initialFocusRef: closeButtonRef });
  const focusRing =
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600';
  const [activeTab, setActiveTab] = useState<'destination' | 'dates' | 'guests' | 'stays_engine'>(
    'destination',
  );
  const [destination, setDestination] = useState(filters.destination);
  const [checkIn, setCheckIn] = useState(filters.checkIn);
  const [checkOut, setCheckOut] = useState(filters.checkOut);
  const [adults, setAdults] = useState(filters.guests.adults);
  const [children, setChildren] = useState(filters.guests.children);
  const [infants, setInfants] = useState(filters.guests.infants);
  const [pets, setPets] = useState(filters.guests.pets);
  const [searchError, setSearchError] = useState('');
  const todayIso = toLocalIsoDate(new Date());
  const checkOutMin = checkIn ? addDaysToIsoDate(checkIn, 1) : todayIso;
  const totalGuests = countOccupancyGuests({ adults, children, infants });
  const tabs = [
    { id: 'destination', label: 'Destino' },
    { id: 'dates', label: 'Datas' },
    { id: 'guests', label: `Hóspedes${totalGuests > 1 ? ` (${totalGuests})` : ''}` },
    { id: 'stays_engine', label: 'Surpreenda-me' },
  ] as const;

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex]!;
    setActiveTab(nextTab.id);
    tabListRef.current
      ?.querySelector<HTMLButtonElement>(`[data-search-tab="${nextTab.id}"]`)
      ?.focus();
  };

  useEffect(() => {
    if (!isOpen) return;
    setDestination(filters.destination);
    setCheckIn(filters.checkIn);
    setCheckOut(filters.checkOut);
    setAdults(filters.guests.adults);
    setChildren(filters.guests.children);
    setInfants(filters.guests.infants);
    setPets(filters.guests.pets);
  }, [filters, isOpen]);

  useEffect(() => {
    if (!isOpen || !tabPanelRef.current) return;

    tabPanelRef.current.scrollTop = 0;
  }, [activeTab, isOpen]);

  if (!isOpen) return null;

  const popularDestinations = [
    {
      name: 'Todos em Caldas Novas & Rio Quente',
      subtitle: 'Descubra resorts termais e flats',
      query: '',
    },
    {
      name: 'Complexo diRoma & Acqua Park',
      subtitle: 'Lacqua, Exclusive, Piazza e ingressos',
      query: 'diRoma',
    },
    {
      name: 'Rio Quente & Hot Park',
      subtitle: 'Parque das Fontes e águas a 42°C',
      query: 'Rio Quente',
    },
    {
      name: 'Bairro do Turista',
      subtitle: 'Prive Riviera, Boulevard e centro gastronômico',
      query: 'Turista',
    },
    {
      name: 'À beira do Lago Corumbá',
      subtitle: 'Chalés náuticos, passeios de lancha e pier',
      query: 'Corumbá',
    },
    {
      name: 'Jardim Belvedere (L’acqua diRoma)',
      subtitle: 'Piscina de ondas e parque 24h',
      query: 'Belvedere',
    },
    {
      name: 'Ecologic Ville & Furnas',
      subtitle: 'Resorts com bosque nativo e tranquilidade',
      query: 'Ecologic',
    },
  ];

  const handleApply = () => {
    const hasPartialDateRange = Boolean(checkIn) !== Boolean(checkOut);
    const hasInvalidDateRange = Boolean(
      checkIn && (checkIn < todayIso || (checkOut && checkOut <= checkIn)),
    );
    if (hasPartialDateRange || hasInvalidDateRange) {
      setSearchError('Escolha datas futuras e um check-out posterior ao check-in.');
      setActiveTab('dates');
      return;
    }

    const guests = { adults, children, infants, pets };
    onApplyFilters({
      ...filters,
      destination,
      destinationPropertyId:
        destination === filters.destination ? filters.destinationPropertyId : '',
      checkIn,
      checkOut,
      guests,
    });
    onSearchInApp({
      checkIn,
      checkOut,
      persons: Math.max(1, totalGuests),
      guests,
      destination,
      propertyId: destination === filters.destination ? filters.destinationPropertyId : '',
    });
    onClose();
  };

  const handleClear = () => {
    setDestination('');
    setCheckIn('');
    setCheckOut('');
    setAdults(1);
    setChildren(0);
    setInfants(0);
    setPets(0);
    setSearchError('');
    onResetFilters();
    onSearchInApp({
      checkIn: '',
      checkOut: '',
      persons: 1,
      guests: { adults: 1, children: 0, infants: 0, pets: 0 },
      destination: '',
      propertyId: '',
    });
  };

  const brCheckIn = toBrDate(checkIn);
  const brCheckOut = toBrDate(checkOut);
  const externalStaysUrl = `https://www.centraldereservascaldas.com.br/pt/search?from=${encodeURIComponent(brCheckIn)}&to=${encodeURIComponent(brCheckOut)}&persons=${encodeURIComponent(Math.max(1, totalGuests))}&wpl=`;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 [@media(max-height:400px)]:pt-2 sm:pt-16 px-4 bg-neutral-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div
        ref={dialogRef}
        data-dialog-focus-root
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${fieldId}-title`}
        tabIndex={-1}
        className="w-full max-w-3xl bg-white/98 sm:bg-white/96 backdrop-blur-2xl rounded-3xl shadow-2xl border border-neutral-200/90 overflow-hidden flex flex-col max-h-[90dvh] sm:max-h-[85vh] [@media(max-height:400px)]:max-h-[calc(100dvh-1rem)] animate-in zoom-in-95 duration-200"
      >
        {/* Header Tabs with Crisp Glass pills */}
        <div className="relative flex flex-col items-stretch gap-3 border-b border-neutral-200 bg-white/95 p-4 backdrop-blur-md [@media(max-height:400px)]:gap-2 [@media(max-height:400px)]:p-2 min-[480px]:flex-row min-[480px]:items-center min-[480px]:justify-between sm:p-5">
          <h2
            id={`${fieldId}-title`}
            className="pr-12 text-base font-bold text-neutral-950 min-[480px]:sr-only"
          >
            Buscar hospedagens
          </h2>
          <div
            ref={tabListRef}
            role="tablist"
            aria-label="Tipo de busca"
            tabIndex={-1}
            onKeyDown={handleTabKeyDown}
            className="grid w-full grid-cols-[0.9fr_1.1fr] items-center gap-1.5 rounded-2xl border border-neutral-200 bg-neutral-100 p-1.5 text-xs font-semibold min-[480px]:flex min-[480px]:w-auto min-[480px]:flex-wrap min-[480px]:rounded-full"
          >
            <button
              type="button"
              id={`${fieldId}-tab-destination`}
              data-search-tab="destination"
              role="tab"
              aria-selected={activeTab === 'destination'}
              aria-controls={`${fieldId}-tabpanel`}
              tabIndex={activeTab === 'destination' ? 0 : -1}
              onClick={() => setActiveTab('destination')}
              className={`flex min-h-11 items-center justify-center rounded-xl px-2 py-2 transition-all cursor-pointer min-[480px]:rounded-full min-[480px]:px-3 sm:px-4 ${focusRing} ${
                activeTab === 'destination'
                  ? 'bg-white text-neutral-950 shadow-sm font-bold'
                  : 'text-neutral-700 hover:text-neutral-950'
              }`}
            >
              Destino
            </button>
            <button
              type="button"
              id={`${fieldId}-tab-dates`}
              data-search-tab="dates"
              role="tab"
              aria-selected={activeTab === 'dates'}
              aria-controls={`${fieldId}-tabpanel`}
              tabIndex={activeTab === 'dates' ? 0 : -1}
              onClick={() => setActiveTab('dates')}
              className={`flex min-h-11 items-center justify-center rounded-xl px-2 py-2 transition-all cursor-pointer min-[480px]:rounded-full min-[480px]:px-3 sm:px-4 ${focusRing} ${
                activeTab === 'dates'
                  ? 'bg-white text-neutral-950 shadow-sm font-bold'
                  : 'text-neutral-700 hover:text-neutral-950'
              }`}
            >
              Datas
            </button>
            <button
              type="button"
              id={`${fieldId}-tab-guests`}
              data-search-tab="guests"
              role="tab"
              aria-selected={activeTab === 'guests'}
              aria-controls={`${fieldId}-tabpanel`}
              tabIndex={activeTab === 'guests' ? 0 : -1}
              onClick={() => setActiveTab('guests')}
              className={`flex min-h-11 items-center justify-center rounded-xl px-2 py-2 transition-all cursor-pointer min-[480px]:rounded-full min-[480px]:px-3 sm:px-4 ${focusRing} ${
                activeTab === 'guests'
                  ? 'bg-white text-neutral-950 shadow-sm font-bold'
                  : 'text-neutral-700 hover:text-neutral-950'
              }`}
            >
              Hóspedes {totalGuests > 1 ? `(${totalGuests})` : ''}
            </button>
            <button
              type="button"
              id={`${fieldId}-tab-stays_engine`}
              data-search-tab="stays_engine"
              role="tab"
              aria-selected={activeTab === 'stays_engine'}
              aria-controls={`${fieldId}-tabpanel`}
              tabIndex={activeTab === 'stays_engine' ? 0 : -1}
              onClick={() => setActiveTab('stays_engine')}
              className={`flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 py-2 transition-all cursor-pointer min-[480px]:rounded-full min-[480px]:px-3 sm:px-4 ${focusRing} ${
                activeTab === 'stays_engine'
                  ? 'bg-gradient-to-r from-orange-700 to-amber-700 text-white shadow-sm font-bold'
                  : 'text-orange-800 hover:text-orange-950 font-bold'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Surpreenda-me</span>
            </button>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Fechar busca de hospedagens"
            onClick={onClose}
            className={`absolute right-4 top-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 text-neutral-600 shadow-2xs transition-colors hover:bg-neutral-200 hover:text-neutral-950 [@media(max-height:400px)]:right-2 [@media(max-height:400px)]:top-0 min-[480px]:static ${focusRing}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Body */}
        <div
          ref={tabPanelRef}
          id={`${fieldId}-tabpanel`}
          role="tabpanel"
          aria-labelledby={`${fieldId}-tab-${activeTab}`}
          tabIndex={0}
          className="p-6 [@media(max-height:400px)]:p-3 overflow-y-auto max-h-[55vh]"
        >
          {/* TAB: BOOKING SEARCH */}
          {activeTab === 'stays_engine' && (
            <div className="space-y-4">
              <StaysSearchWidget
                variant="modal"
                surpriseMe
                currentFilters={{
                  ...filters,
                  destination,
                  checkIn,
                  checkOut,
                  guests: { adults, children, infants, pets },
                }}
                onSearchInApp={(params) => {
                  onSearchInApp(params);
                  onClose();
                }}
              />
            </div>
          )}
          {/* TAB 1: DESTINATION */}
          {activeTab === 'destination' && (
            <div className="space-y-6">
              <div>
                <label
                  htmlFor={`${fieldId}-destination`}
                  className="block text-sm font-bold text-neutral-900 mb-2"
                >
                  Buscar por região, cidade ou nome do espaço
                </label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-orange-500" />
                  <input
                    id={`${fieldId}-destination`}
                    type="text"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="Ex: Trancoso, Rio de Janeiro, Campos do Jordão..."
                    className="w-full pl-12 pr-12 py-3.5 rounded-2xl border border-neutral-300 focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 focus-visible:ring-2 focus-visible:ring-orange-600 text-sm outline-none transition-all"
                  />
                  {destination && (
                    <button
                      type="button"
                      aria-label="Limpar destino"
                      onClick={() => setDestination('')}
                      className={`absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 ${focusRing}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-600 mb-3">
                  Destinos em destaque
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {popularDestinations.map((dest) => (
                    <button
                      key={dest.name}
                      onClick={() => {
                        setDestination(dest.query);
                        setActiveTab('dates');
                      }}
                      className={`flex items-center gap-3 p-3 rounded-2xl border border-neutral-100 hover:border-neutral-300 hover:bg-neutral-50 text-left transition-all cursor-pointer group ${focusRing}`}
                    >
                      <div className="w-10 h-10 rounded-xl bg-orange-50 group-hover:bg-orange-100 text-orange-600 flex items-center justify-center flex-shrink-0 transition-colors">
                        <MapPin className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-neutral-900 group-hover:text-orange-600 transition-colors">
                          {dest.name}
                        </p>
                        <p className="text-xs text-neutral-500">{dest.subtitle}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DATES */}
          {activeTab === 'dates' && (
            <div className="space-y-6 [@media(max-height:400px)]:space-y-3">
              <h3 className="text-base font-bold text-neutral-900 [@media(max-height:400px)]:sr-only">
                Selecione as datas da sua estadia
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 [@media(max-height:400px)]:gap-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor={`${fieldId}-check-in`}
                    className="text-xs font-semibold text-neutral-600"
                  >
                    Data de Check-in
                  </label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input
                      id={`${fieldId}-check-in`}
                      type="date"
                      min={todayIso}
                      value={checkIn}
                      onChange={(e) => {
                        const nextCheckIn = e.target.value;
                        setCheckIn(nextCheckIn);
                        if (nextCheckIn && checkOut && checkOut <= nextCheckIn) {
                          setCheckOut(addDaysToIsoDate(nextCheckIn, 1));
                        }
                        setSearchError('');
                      }}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-neutral-300 focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-orange-600 text-sm outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor={`${fieldId}-check-out`}
                    className="text-xs font-semibold text-neutral-600"
                  >
                    Data de Check-out
                  </label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input
                      id={`${fieldId}-check-out`}
                      type="date"
                      min={checkOutMin}
                      value={checkOut}
                      onChange={(e) => {
                        setCheckOut(e.target.value);
                        setSearchError('');
                      }}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-neutral-300 focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-orange-600 text-sm outline-none"
                    />
                  </div>
                </div>
              </div>

              {searchError && (
                <p role="alert" className="text-sm font-semibold text-red-700">
                  {searchError}
                </p>
              )}

              {/* Quick Preset Buttons */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-neutral-600 mb-2">
                  Atalhos rápidos
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Próximo fim de semana (Sex - Dom)', days: 2, offset: 5 },
                    { label: 'Férias de 5 noites', days: 5, offset: 12 },
                    { label: 'Semana completa (7 noites)', days: 7, offset: 20 },
                  ].map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        const now = new Date();
                        const start = new Date(now);
                        start.setDate(now.getDate() + preset.offset);
                        const end = new Date(start);
                        end.setDate(start.getDate() + preset.days);
                        setCheckIn(start.toISOString().split('T')[0]);
                        setCheckOut(end.toISOString().split('T')[0]);
                      }}
                      className={`inline-flex min-h-11 items-center justify-center rounded-xl border border-neutral-200 px-3.5 py-2 text-left text-xs font-medium text-neutral-700 transition-all hover:border-neutral-900 hover:bg-neutral-50 cursor-pointer ${focusRing}`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: GUESTS */}
          {activeTab === 'guests' && (
            <div className="space-y-5 divide-y divide-neutral-100">
              {/* Adults */}
              <div className="flex items-center justify-between pt-2">
                <div>
                  <p className="text-sm font-bold text-neutral-900">Adultos</p>
                  <p className="text-xs text-neutral-500">13 anos ou mais</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label="Diminuir número de adultos"
                    disabled={adults <= 1}
                    onClick={() => setAdults(Math.max(1, adults - 1))}
                    className={`h-11 w-11 shrink-0 rounded-full border border-neutral-300 flex items-center justify-center text-neutral-600 disabled:opacity-30 disabled:cursor-not-allowed hover:border-neutral-900 transition-colors ${focusRing}`}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span
                    aria-live="polite"
                    className="w-6 text-center font-bold text-sm text-neutral-900"
                  >
                    {adults}
                  </span>
                  <button
                    type="button"
                    aria-label="Aumentar número de adultos"
                    onClick={() => setAdults(adults + 1)}
                    className={`h-11 w-11 shrink-0 rounded-full border border-neutral-300 flex items-center justify-center text-neutral-600 hover:border-neutral-900 transition-colors ${focusRing}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Children */}
              <div className="flex items-center justify-between pt-4">
                <div>
                  <p className="text-sm font-bold text-neutral-900">Crianças</p>
                  <p className="text-xs text-neutral-500">2 a 12 anos</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label="Diminuir número de crianças"
                    disabled={children <= 0}
                    onClick={() => setChildren(Math.max(0, children - 1))}
                    className={`h-11 w-11 shrink-0 rounded-full border border-neutral-300 flex items-center justify-center text-neutral-600 disabled:opacity-30 disabled:cursor-not-allowed hover:border-neutral-900 transition-colors ${focusRing}`}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span
                    aria-live="polite"
                    className="w-6 text-center font-bold text-sm text-neutral-900"
                  >
                    {children}
                  </span>
                  <button
                    type="button"
                    aria-label="Aumentar número de crianças"
                    onClick={() => setChildren(children + 1)}
                    className={`h-11 w-11 shrink-0 rounded-full border border-neutral-300 flex items-center justify-center text-neutral-600 hover:border-neutral-900 transition-colors ${focusRing}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Infants */}
              <div className="flex items-center justify-between pt-4">
                <div>
                  <p className="text-sm font-bold text-neutral-900">Bebês</p>
                  <p className="text-xs text-neutral-500">Menos de 2 anos</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label="Diminuir número de bebês"
                    disabled={infants <= 0}
                    onClick={() => setInfants(Math.max(0, infants - 1))}
                    className={`h-11 w-11 shrink-0 rounded-full border border-neutral-300 flex items-center justify-center text-neutral-600 disabled:opacity-30 disabled:cursor-not-allowed hover:border-neutral-900 transition-colors ${focusRing}`}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span
                    aria-live="polite"
                    className="w-6 text-center font-bold text-sm text-neutral-900"
                  >
                    {infants}
                  </span>
                  <button
                    type="button"
                    aria-label="Aumentar número de bebês"
                    onClick={() => setInfants(infants + 1)}
                    className={`h-11 w-11 shrink-0 rounded-full border border-neutral-300 flex items-center justify-center text-neutral-600 hover:border-neutral-900 transition-colors ${focusRing}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Pets */}
              <div className="flex items-center justify-between pt-4">
                <div>
                  <p className="text-sm font-bold text-neutral-900">Animais de estimação</p>
                  <p className="text-xs text-neutral-500">Cães ou gatos de assistência ou viagem</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label="Diminuir número de animais de estimação"
                    disabled={pets <= 0}
                    onClick={() => setPets(Math.max(0, pets - 1))}
                    className={`h-11 w-11 shrink-0 rounded-full border border-neutral-300 flex items-center justify-center text-neutral-600 disabled:opacity-30 disabled:cursor-not-allowed hover:border-neutral-900 transition-colors ${focusRing}`}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span
                    aria-live="polite"
                    className="w-6 text-center font-bold text-sm text-neutral-900"
                  >
                    {pets}
                  </span>
                  <button
                    type="button"
                    aria-label="Aumentar número de animais de estimação"
                    onClick={() => setPets(pets + 1)}
                    className={`h-11 w-11 shrink-0 rounded-full border border-neutral-300 flex items-center justify-center text-neutral-600 hover:border-neutral-900 transition-colors ${focusRing}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="p-4 [@media(max-height:400px)]:p-2 sm:p-5 border-t border-neutral-100 bg-neutral-50/50 flex flex-col [@media(max-height:400px)]:flex-row sm:flex-row items-center justify-between gap-3 [@media(max-height:400px)]:gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={handleClear}
              className={`inline-flex min-h-11 items-center justify-center rounded-full px-2 text-xs font-semibold text-neutral-600 underline hover:text-neutral-900 cursor-pointer ${focusRing}`}
            >
              Limpar tudo
            </button>
            <span className="text-neutral-300 hidden sm:inline">•</span>
            <a
              href={externalStaysUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`text-xs text-orange-600 hover:text-orange-700 font-semibold flex items-center gap-1 [@media(max-height:400px)]:hidden ${focusRing}`}
              title="Abrir pesquisa com esses mesmos parâmetros em centraldereservascaldas.com.br"
            >
              <span>Abrir portal de reservas</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <button
            onClick={handleApply}
            aria-label="Buscar hospedagens termais"
            className={`min-h-11 w-full [@media(max-height:400px)]:w-auto [@media(max-height:400px)]:min-w-0 [@media(max-height:400px)]:flex-1 [@media(max-height:400px)]:px-2 sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-orange-700 to-amber-700 text-white text-sm font-bold shadow-md shadow-orange-500/30 hover:shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer border border-white/20 ${focusRing}`}
          >
            <Search className="w-4 h-4 stroke-[2.5]" />
            <span className="[@media(max-height:400px)]:hidden">Buscar hospedagens termais</span>
            <span className="hidden [@media(max-height:400px)]:inline">Buscar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
