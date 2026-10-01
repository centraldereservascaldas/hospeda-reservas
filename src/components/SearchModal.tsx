import React, { useState } from 'react';
import { 
  X, 
  Search, 
  MapPin, 
  Calendar as CalendarIcon, 
  Users, 
  Plus, 
  Minus,
  Sparkles,
  Zap,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import { SearchFilters } from '../types';
import { StaysSearchWidget, toBrDate } from './StaysSearchWidget';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters: SearchFilters;
  onApplyFilters: (filters: SearchFilters) => void;
  onResetFilters: () => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  filters,
  onApplyFilters,
  onResetFilters,
}) => {
  const [activeTab, setActiveTab] = useState<'destination' | 'dates' | 'guests' | 'stays_engine'>('destination');
  const [destination, setDestination] = useState(filters.destination);
  const [checkIn, setCheckIn] = useState(filters.checkIn);
  const [checkOut, setCheckOut] = useState(filters.checkOut);
  const [adults, setAdults] = useState(filters.guests.adults);
  const [children, setChildren] = useState(filters.guests.children);
  const [infants, setInfants] = useState(filters.guests.infants);
  const [pets, setPets] = useState(filters.guests.pets);

  if (!isOpen) return null;

  const popularDestinations = [
    { name: 'Todos em Caldas Novas & Rio Quente', subtitle: 'Descubra resorts termais e flats', query: '' },
    { name: 'Complexo diRoma & Acqua Park', subtitle: 'Lacqua, Exclusive, Piazza e ingressos', query: 'diRoma' },
    { name: 'Rio Quente & Hot Park', subtitle: 'Parque das Fontes e águas a 42°C', query: 'Rio Quente' },
    { name: 'Bairro do Turista', subtitle: 'Prive Riviera, Boulevard e centro gastronômico', query: 'Turista' },
    { name: 'À beira do Lago Corumbá', subtitle: 'Chalés náuticos, passeios de lancha e pier', query: 'Corumbá' },
    { name: 'Jardim Belvedere (L’acqua diRoma)', subtitle: 'Piscina de ondas e parque 24h', query: 'Belvedere' },
    { name: 'Ecologic Ville & Furnas', subtitle: 'Resorts com bosque nativo e tranquilidade', query: 'Ecologic' },
  ];

  const handleApply = () => {
    onApplyFilters({
      ...filters,
      destination,
      checkIn,
      checkOut,
      guests: {
        adults,
        children,
        infants,
        pets,
      },
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
    onResetFilters();
  };

  const totalGuests = adults + children;
  const brCheckIn = toBrDate(checkIn);
  const brCheckOut = toBrDate(checkOut);
  const externalStaysUrl = `https://www.centraldereservascaldas.com.br/pt/search?from=${encodeURIComponent(brCheckIn)}&to=${encodeURIComponent(brCheckOut)}&persons=${encodeURIComponent(Math.max(1, totalGuests))}&wpl=`;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 sm:pt-16 px-4 bg-neutral-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-3xl bg-white/98 sm:bg-white/96 backdrop-blur-2xl rounded-3xl shadow-2xl border border-neutral-200/90 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Tabs with Crisp Glass pills */}
        <div className="p-4 sm:p-5 border-b border-neutral-200 bg-white/95 backdrop-blur-md flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-1.5 bg-neutral-100 p-1.5 rounded-full text-xs font-semibold border border-neutral-200">
            <button
              onClick={() => setActiveTab('destination')}
              className={`px-4 py-2 rounded-full transition-all cursor-pointer ${
                activeTab === 'destination' ? 'bg-white text-neutral-950 shadow-sm font-bold' : 'text-neutral-700 hover:text-neutral-950'
              }`}
            >
              Destino
            </button>
            <button
              onClick={() => setActiveTab('dates')}
              className={`px-4 py-2 rounded-full transition-all cursor-pointer ${
                activeTab === 'dates' ? 'bg-white text-neutral-950 shadow-sm font-bold' : 'text-neutral-700 hover:text-neutral-950'
              }`}
            >
              Datas
            </button>
            <button
              onClick={() => setActiveTab('guests')}
              className={`px-4 py-2 rounded-full transition-all cursor-pointer ${
                activeTab === 'guests' ? 'bg-white text-neutral-950 shadow-sm font-bold' : 'text-neutral-700 hover:text-neutral-950'
              }`}
            >
              Hóspedes {totalGuests > 1 ? `(${totalGuests})` : ''}
            </button>
            <button
              onClick={() => setActiveTab('stays_engine')}
              className={`px-4 py-2 rounded-full transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'stays_engine' ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm font-bold' : 'text-orange-800 hover:text-orange-950 font-bold'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Busca de acomodações</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 flex items-center justify-center text-neutral-600 hover:text-neutral-950 transition-colors cursor-pointer shadow-2xs"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto max-h-[55vh]">
          {/* TAB: BOOKING SEARCH */}
          {activeTab === 'stays_engine' && (
            <div className="space-y-4">
              <StaysSearchWidget
                variant="modal"
                currentFilters={{
                  ...filters,
                  destination,
                  checkIn,
                  checkOut,
                  guests: { adults, children, infants, pets },
                }}
                onSearchInApp={(params) => {
                  onApplyFilters({
                    ...filters,
                    destination: params.destination || destination,
                    checkIn: params.checkIn,
                    checkOut: params.checkOut,
                    guests: {
                      adults: params.persons,
                      children: 0,
                      infants: 0,
                      pets: 0,
                    },
                  });
                  onClose();
                }}
              />
            </div>
          )}
          {/* TAB 1: DESTINATION */}
          {activeTab === 'destination' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-neutral-900 mb-2">
                  Buscar por região, cidade ou nome do espaço
                </label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-orange-500" />
                  <input
                    type="text"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="Ex: Trancoso, Rio de Janeiro, Campos do Jordão..."
                    className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-neutral-300 focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 text-sm outline-none transition-all"
                  />
                  {destination && (
                    <button
                      onClick={() => setDestination('')}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">
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
                      className="flex items-center gap-3 p-3 rounded-2xl border border-neutral-100 hover:border-neutral-300 hover:bg-neutral-50 text-left transition-all cursor-pointer group"
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
            <div className="space-y-6">
              <h3 className="text-base font-bold text-neutral-900">
                Selecione as datas da sua estadia
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-600">
                    Data de Check-in
                  </label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input
                      type="date"
                      value={checkIn}
                      onChange={(e) => setCheckIn(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-neutral-300 focus:border-neutral-900 text-sm outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-600">
                    Data de Check-out
                  </label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input
                      type="date"
                      value={checkOut}
                      onChange={(e) => setCheckOut(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-neutral-300 focus:border-neutral-900 text-sm outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">
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
                      className="px-3.5 py-2 rounded-xl border border-neutral-200 hover:border-neutral-900 text-xs font-medium text-neutral-700 hover:bg-neutral-50 transition-all cursor-pointer"
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
                    disabled={adults <= 1}
                    onClick={() => setAdults(Math.max(1, adults - 1))}
                    className="w-8 h-8 rounded-full border border-neutral-300 flex items-center justify-center text-neutral-600 disabled:opacity-30 disabled:cursor-not-allowed hover:border-neutral-900 transition-colors"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-6 text-center font-bold text-sm text-neutral-900">{adults}</span>
                  <button
                    onClick={() => setAdults(adults + 1)}
                    className="w-8 h-8 rounded-full border border-neutral-300 flex items-center justify-center text-neutral-600 hover:border-neutral-900 transition-colors"
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
                    disabled={children <= 0}
                    onClick={() => setChildren(Math.max(0, children - 1))}
                    className="w-8 h-8 rounded-full border border-neutral-300 flex items-center justify-center text-neutral-600 disabled:opacity-30 disabled:cursor-not-allowed hover:border-neutral-900 transition-colors"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-6 text-center font-bold text-sm text-neutral-900">{children}</span>
                  <button
                    onClick={() => setChildren(children + 1)}
                    className="w-8 h-8 rounded-full border border-neutral-300 flex items-center justify-center text-neutral-600 hover:border-neutral-900 transition-colors"
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
                    disabled={infants <= 0}
                    onClick={() => setInfants(Math.max(0, infants - 1))}
                    className="w-8 h-8 rounded-full border border-neutral-300 flex items-center justify-center text-neutral-600 disabled:opacity-30 disabled:cursor-not-allowed hover:border-neutral-900 transition-colors"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-6 text-center font-bold text-sm text-neutral-900">{infants}</span>
                  <button
                    onClick={() => setInfants(infants + 1)}
                    className="w-8 h-8 rounded-full border border-neutral-300 flex items-center justify-center text-neutral-600 hover:border-neutral-900 transition-colors"
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
                    disabled={pets <= 0}
                    onClick={() => setPets(Math.max(0, pets - 1))}
                    className="w-8 h-8 rounded-full border border-neutral-300 flex items-center justify-center text-neutral-600 disabled:opacity-30 disabled:cursor-not-allowed hover:border-neutral-900 transition-colors"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-6 text-center font-bold text-sm text-neutral-900">{pets}</span>
                  <button
                    onClick={() => setPets(pets + 1)}
                    className="w-8 h-8 rounded-full border border-neutral-300 flex items-center justify-center text-neutral-600 hover:border-neutral-900 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="p-4 sm:p-5 border-t border-neutral-100 bg-neutral-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={handleClear}
              className="text-xs font-semibold text-neutral-600 underline hover:text-neutral-900 cursor-pointer"
            >
              Limpar tudo
            </button>
            <span className="text-neutral-300 hidden sm:inline">•</span>
            <a
              href={externalStaysUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-orange-600 hover:text-orange-700 font-semibold flex items-center gap-1"
              title="Abrir pesquisa com esses mesmos parâmetros em centraldereservascaldas.com.br"
            >
              <span>Abrir portal de reservas</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <button
            onClick={handleApply}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-bold shadow-md shadow-orange-500/30 hover:shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer border border-white/20"
          >
            <Search className="w-4 h-4 stroke-[2.5]" />
            <span>Buscar hospedagens termais</span>
          </button>
        </div>

      </div>
    </div>
  );
};
