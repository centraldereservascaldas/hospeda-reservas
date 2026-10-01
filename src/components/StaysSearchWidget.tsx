import React, { useState, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, 
  Users, 
  Search, 
  Sparkles, 
  ShieldCheck,
  Building2
} from 'lucide-react';
import { SearchFilters } from '../types';

interface StaysSearchWidgetProps {
  onSearchInApp: (searchParams: {
    checkIn: string;
    checkOut: string;
    persons: number;
    destination?: string;
  }) => void;
  onOpenSofia?: () => void;
  currentFilters?: SearchFilters;
  variant?: 'hero' | 'compact' | 'modal';
  className?: string;
}

// Convert YYYY-MM-DD to DD/MM/YYYY
export const toBrDate = (isoDate: string): string => {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
};

// Convert DD/MM/YYYY to YYYY-MM-DD
export const fromBrDate = (brDate: string): string => {
  if (!brDate) return '';
  const parts = brDate.split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return brDate;
};

export const StaysSearchWidget: React.FC<StaysSearchWidgetProps> = ({
  onSearchInApp,
  onOpenSofia,
  currentFilters,
  className = '',
}) => {
  // Dates in ISO format YYYY-MM-DD for native input
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0];

  const [checkIn, setCheckIn] = useState<string>(currentFilters?.checkIn || today);
  const [checkOut, setCheckOut] = useState<string>(currentFilters?.checkOut || tomorrow);
  const [persons, setPersons] = useState<string>(
    currentFilters?.guests ? String(currentFilters.guests.adults + currentFilters.guests.children) : '2'
  );
  const [selectedResort, setSelectedResort] = useState<string>(currentFilters?.destination || '');

  // Sync with currentFilters if they change externally
  useEffect(() => {
    if (currentFilters?.checkIn) setCheckIn(currentFilters.checkIn);
    if (currentFilters?.checkOut) setCheckOut(currentFilters.checkOut);
    if (currentFilters?.guests) {
      const total = currentFilters.guests.adults + currentFilters.guests.children;
      if (total >= 1 && total <= 17) {
        setPersons(String(total));
      }
    }
    if (currentFilters?.destination !== undefined) {
      setSelectedResort(currentFilters.destination);
    }
  }, [currentFilters]);

  // Form submission handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearchInApp({
      checkIn,
      checkOut,
      persons: parseInt(persons, 10) || 2,
      destination: selectedResort,
    });
  };

  // Popular Caldas Novas resorts available through the reservation portal
  const resorts = [
    { label: 'Todos os Resorts & Flats', value: '' },
    { label: 'Condomínio Sol das Caldas', value: 'Sol das Caldas' },
    { label: 'L’acqua diRoma I a V (Jardins Acqua Park)', value: 'Lacqua' },
    { label: 'diRoma Exclusive & Fiori', value: 'Exclusive' },
    { label: 'Piazza diRoma', value: 'Piazza' },
    { label: 'Golden Dolphin Grand Hotel & Express', value: 'Golden Dolphin' },
    { label: 'Lagoa Quente Flat Service', value: 'Lagoa Quente' },
    { label: 'Ecologic Ville Resort & Spa', value: 'Ecologic' },
    { label: 'Thermas dos Pássaros / Eldorado Flat', value: 'Eldorado' },
    { label: 'Prive Riviera Park Hotel', value: 'Riviera' },
    { label: 'Rio Quente & Parque das Fontes', value: 'Rio Quente' },
    { label: 'Náutico & Marina Clube Corumbá', value: 'Corumbá' },
  ];

  return (
    <div className={`w-full transition-all ${className}`}>
      {/* Container in Liquid Glass */}
      <div className="relative rounded-3xl liquid-glass-card border border-white/85 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.07)] p-5 sm:p-7">
        
        {/* Top Header: Clean and focused for guests + Sofia assistant trigger */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-3.5 border-b border-white/60">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-neutral-800 font-bold">
            <Sparkles className="w-4 h-4 text-orange-500 flex-shrink-0" />
            <span>Encontre sua hospedagem em Caldas Novas por data e condomínio</span>
          </div>

          {onOpenSofia && (
            <button
              type="button"
              onClick={onOpenSofia}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-700 text-xs font-black transition-all cursor-pointer border border-orange-200 shadow-2xs hover:scale-105 active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5 text-orange-600" />
              <span>Consultar a Sofia (Concierge IA)</span>
            </button>
          )}
        </div>

        {/* 
          Form configured with accurate date and destination parameters
        */}
        <form
          role="search"
          id="widgetStaysSearchForm"
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          {/* Stays widget required placement token */}
          <input type="hidden" name="wpl" value="" />

          {/* Stays date parameters in ISO format YYYY-MM-DD for reliable engine parsing */}
          <input name="from" value={checkIn} type="hidden" />
          <input name="to" value={checkOut} type="hidden" />
          <input name="checkIn" value={checkIn} type="hidden" />
          <input name="checkOut" value={checkOut} type="hidden" />
          <input name="checkin" value={checkIn} type="hidden" />
          <input name="checkout" value={checkOut} type="hidden" />
          <input name="adults" value={persons} type="hidden" />
          {selectedResort && <input name="q" value={selectedResort} type="hidden" />}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 sm:gap-4 items-center">
            
            {/* Resort / Destination Selector */}
            <div className="lg:col-span-3 min-w-0">
              <label className="block text-xs font-extrabold uppercase tracking-wider text-neutral-800 mb-1.5 truncate">
                Complexo / Resort
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                  <Building2 className="w-4 h-4 text-orange-600 flex-shrink-0" />
                </div>
                <select
                  value={selectedResort}
                  onChange={(e) => setSelectedResort(e.target.value)}
                  className="w-full pl-10 pr-8 py-3 liquid-glass-input rounded-2xl border border-white/80 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 text-xs sm:text-sm font-bold text-neutral-900 transition-all outline-none cursor-pointer appearance-none shadow-xs truncate"
                >
                  {resorts.map((r, i) => (
                    <option key={i} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-neutral-500 text-xs">
                  ▼
                </div>
              </div>
            </div>

            {/* Arrival / Check-in */}
            <div className="lg:col-span-3 min-w-0">
              <label className="block text-xs font-extrabold uppercase tracking-wider text-neutral-800 mb-1.5 truncate">
                Entrada (Check-in)
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500 group-focus-within:text-orange-600">
                  <CalendarIcon className="w-4 h-4 flex-shrink-0" />
                </div>
                <input
                  type="date"
                  value={checkIn}
                  min={today}
                  onChange={(e) => {
                    const newCheckIn = e.target.value;
                    setCheckIn(newCheckIn);
                    if (newCheckIn >= checkOut) {
                      const next = new Date(new Date(newCheckIn).getTime() + 86400000 * 2)
                        .toISOString()
                        .split('T')[0];
                      setCheckOut(next);
                    }
                  }}
                  className="w-full pl-10 pr-3 py-3 liquid-glass-input rounded-2xl border border-white/80 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 text-xs sm:text-sm font-bold text-neutral-900 transition-all outline-none cursor-pointer shadow-xs min-w-0"
                  required
                />
              </div>
            </div>

            {/* Departure / Checkout */}
            <div className="lg:col-span-3 min-w-0">
              <label className="block text-xs font-extrabold uppercase tracking-wider text-neutral-800 mb-1.5 truncate">
                Saída (Checkout)
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500 group-focus-within:text-orange-600">
                  <CalendarIcon className="w-4 h-4 flex-shrink-0" />
                </div>
                <input
                  type="date"
                  value={checkOut}
                  min={checkIn || today}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className="w-full pl-10 pr-3 py-3 liquid-glass-input rounded-2xl border border-white/80 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 text-xs sm:text-sm font-bold text-neutral-900 transition-all outline-none cursor-pointer shadow-xs min-w-0"
                  required
                />
              </div>
            </div>

            {/* Guest Count (Persons: 1 to 17) */}
            <div className="lg:col-span-3 min-w-0">
              <label className="block text-xs font-extrabold uppercase tracking-wider text-neutral-800 mb-1.5 truncate">
                Hóspedes
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                  <Users className="w-4 h-4 text-orange-600 flex-shrink-0" />
                </div>
                <select
                  name="persons"
                  value={persons}
                  onChange={(e) => setPersons(e.target.value)}
                  className="w-full pl-10 pr-8 py-3 liquid-glass-input rounded-2xl border border-white/80 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 text-xs sm:text-sm font-bold text-neutral-900 transition-all outline-none cursor-pointer appearance-none shadow-xs min-w-0"
                  required
                >
                  <option value="" className="text-muted">Hóspedes</option>
                  <option value="1">1 Pessoa</option>
                  <option value="2">2 Pessoas</option>
                  <option value="3">3 Pessoas</option>
                  <option value="4">4 Pessoas</option>
                  <option value="5">5 Pessoas</option>
                  <option value="6">6 Pessoas</option>
                  <option value="7">7 Pessoas</option>
                  <option value="8">8 Pessoas</option>
                  <option value="9">9 Pessoas</option>
                  <option value="10">10 Pessoas</option>
                  <option value="11">11 Pessoas</option>
                  <option value="12">12 Pessoas</option>
                  <option value="13">13 Pessoas</option>
                  <option value="14">14 Pessoas</option>
                  <option value="15">15 Pessoas</option>
                  <option value="16">16 Pessoas</option>
                  <option value="17">17 Pessoas</option>
                </select>
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-neutral-500">
                  ▼
                </div>
              </div>
            </div>

          </div>

          {/* Action Row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2 text-xs text-neutral-700 font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>
                Consulte valores e disponibilidade; conclua sua reserva no checkout seguro.
              </span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="submit"
                className="w-full sm:w-auto px-8 py-3.5 rounded-2xl liquid-glass-accent text-white font-extrabold text-sm shadow-md shadow-orange-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2.5"
              >
                <Search className="w-4 h-4 stroke-[2.5]" />
                <span>Pesquisar Disponibilidade</span>
              </button>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
};
