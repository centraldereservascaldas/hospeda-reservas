import React, { useState, useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { 
  Calendar as CalendarIcon, 
  Users, 
  Search, 
  Sparkles, 
  ShieldCheck,
  Building2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { SearchFilters } from '../types';
import { crcnBackendApi } from '../services/crcnBackendApi';

interface StaysSearchWidgetProps {
  onSearchInApp: (searchParams: {
    checkIn: string;
    checkOut: string;
    persons: number;
    destination?: string;
    propertyId?: string;
    surpriseMe?: boolean;
  }) => void;
  currentFilters?: SearchFilters;
  surpriseMe?: boolean;
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

interface LiquidDatePickerProps {
  label: string;
  labelId: string;
  value: string;
  minDate: string;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChange: (value: string) => void;
}

const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const LiquidDatePicker: React.FC<LiquidDatePickerProps> = ({ label, labelId, value, minDate, isOpen, onOpen, onClose, onChange }) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = value ? new Date(`${value}T12:00:00`) : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [position, setPosition] = useState({ left: 8, top: 8, width: 320 });

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 16);
    const height = 370;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const below = rect.bottom + 8;
    const top = below + height <= window.innerHeight ? below : Math.max(8, rect.top - height - 8);
    setPosition({ left, top, width });
  };

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const focusFrame = window.requestAnimationFrame(() => {
      const selectedDay = popoverRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]:not(:disabled)');
      const firstAvailableDay = popoverRef.current?.querySelector<HTMLButtonElement>('[data-calendar-day]:not(:disabled)');
      (selectedDay || firstAvailableDay)?.focus();
    });
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const leadingDays = (monthStart.getDay() + 6) % 7;
  const calendarDays = Array.from({ length: 42 }, (_, index) =>
    new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index - leadingDays + 1)
  );
  const monthTitle = visibleMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const shownValue = value
    ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR')
    : 'Selecione a data';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-labelledby={`${labelId} ${labelId}-value`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => {
          const date = value ? new Date(`${value}T12:00:00`) : new Date();
          setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
          onOpen();
        }}
        className={`w-full pl-10 pr-3 py-3 liquid-glass-input rounded-2xl border border-white/80 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 text-left text-xs sm:text-sm font-bold text-neutral-900 transition-all outline-none cursor-pointer shadow-xs min-w-0 ${value ? '' : 'text-neutral-400'}`}
      >
        <span id={`${labelId}-value`}>{shownValue}</span>
      </button>

      {isOpen && createPortal(
        <div
          ref={popoverRef}
          data-dialog-focus-portal
          role="dialog"
          aria-label={`Calendário de ${label.toLowerCase()}`}
          className="fixed z-[1000] rounded-3xl border border-white/90 bg-white/80 p-4 text-neutral-800 shadow-[0_20px_60px_-16px_rgba(15,23,42,0.28)] backdrop-blur-2xl"
          style={{ left: position.left, top: position.top, width: position.width }}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))}
              className="liquid-glass-button flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 transition hover:text-orange-600"
              aria-label="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h3 className="text-sm font-extrabold capitalize text-neutral-900">{monthTitle}</h3>
            <button
              type="button"
              onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))}
              className="liquid-glass-button flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 transition hover:text-orange-600"
              aria-label="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-bold text-neutral-500">
            {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((day) => <span key={day} className="py-2">{day}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {calendarDays.map((date) => {
              const dateValue = isoDate(date);
              const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
              const isSelected = dateValue === value;
              const isToday = dateValue === isoDate(new Date());
              const isBeforeMinimum = dateValue < minDate;
              return (
                <button
                  key={dateValue}
                  type="button"
                  disabled={!isCurrentMonth || isBeforeMinimum}
                  onClick={() => { onChange(dateValue); onClose(); triggerRef.current?.focus(); }}
                aria-label={date.toLocaleDateString('pt-BR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                  aria-pressed={isSelected}
                  data-calendar-day
                  className={`aspect-square rounded-xl text-xs font-semibold transition-all disabled:cursor-not-allowed ${
                    isSelected
                      ? 'liquid-glass-accent text-white shadow-md'
                      : isCurrentMonth && !isBeforeMinimum
                        ? `hover:bg-orange-500/15 hover:text-orange-700 ${isToday ? 'ring-1 ring-orange-400/60 text-orange-700' : 'text-neutral-800'}`
                        : 'text-neutral-300'
                  }`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex justify-end border-t border-neutral-200/70 pt-3">
            <button type="button" onClick={() => { const today = isoDate(new Date()); if (today >= minDate) { onChange(today); onClose(); triggerRef.current?.focus(); } }} className="rounded-full px-3 py-1.5 text-xs font-bold text-orange-700 transition hover:bg-orange-500/10">Hoje</button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

interface LiquidOption { value: string; label: string; }
interface LiquidSelectProps {
  labelId: string;
  value: string;
  selectedLabel?: string;
  placeholder: string;
  options: LiquidOption[];
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChange: (option: LiquidOption) => void;
  searchable?: boolean;
  message?: string;
}

const LiquidSelect: React.FC<LiquidSelectProps> = ({
  labelId, value, selectedLabel, placeholder, options, isOpen, onOpen, onClose, onChange, searchable, message,
}) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [position, setPosition] = useState({ left: 8, top: 8, width: 300, maxHeight: 360 });
  const [query, setQuery] = useState('');

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(Math.max(280, rect.width), window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const belowTop = rect.bottom + 8;
    const belowSpace = Math.max(0, window.innerHeight - belowTop - 8);
    const aboveSpace = Math.max(0, rect.top - 8);
    const maxHeight = Math.min(360, Math.max(belowSpace, aboveSpace));
    const placeBelow = belowSpace >= Math.min(320, maxHeight) || belowSpace >= aboveSpace;
    const top = placeBelow ? belowTop : Math.max(8, rect.top - Math.min(360, aboveSpace));
    setPosition({ left, top, width, maxHeight });
  };

  useEffect(() => {
    if (!isOpen) return;
    const frame = window.requestAnimationFrame(updatePosition);
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen, onClose]);

  useEffect(() => { if (isOpen) setQuery(''); }, [isOpen]);

  const visibleOptions = options.filter((option) => !query || option.label.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')));
  const currentLabel = options.find((option) => option.value === value)?.label || selectedLabel || placeholder;
  const selectedIndex = visibleOptions.findIndex((option) => option.value === value);

  useEffect(() => {
    if (!isOpen) return;
    const frame = window.requestAnimationFrame(() => {
      if (searchable) searchInputRef.current?.focus();
      else (optionRefs.current[selectedIndex] || optionRefs.current[0])?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, searchable, selectedIndex]);

  const selectOption = (option: LiquidOption) => {
    onChange(option);
    onClose();
    triggerRef.current?.focus();
  };

  const moveOptionFocus = (index: number, direction: -1 | 1) => {
    const next = Math.min(Math.max(index + direction, 0), visibleOptions.length - 1);
    optionRefs.current[next]?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-labelledby={`${labelId} ${labelId}-value`}
        aria-controls={`${labelId}-listbox`}
        aria-expanded={isOpen}
        onClick={() => onOpen()}
        className="flex w-full min-w-0 items-center justify-between gap-2 rounded-2xl border border-white/85 bg-white/55 py-3 pl-10 pr-3 text-left text-xs font-bold text-neutral-900 shadow-[inset_0_1px_2px_rgba(255,255,255,0.85),0_3px_10px_rgba(15,23,42,0.04)] backdrop-blur-xl transition hover:bg-white/70 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20 sm:text-sm"
      >
        <span id={`${labelId}-value`} className={`min-w-0 truncate ${currentLabel === placeholder ? 'text-neutral-500' : ''}`}>{currentLabel}</span>
        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-neutral-500 transition-transform ${isOpen ? 'rotate-180 text-orange-600' : ''}`} />
      </button>

      {isOpen && createPortal(
        <div
          ref={menuRef}
          data-dialog-focus-portal
          role="group"
          aria-label="Opções de filtro"
          className="fixed z-[1000] overflow-hidden rounded-2xl border border-white/90 bg-white/78 p-2 text-neutral-800 shadow-[0_18px_55px_-16px_rgba(15,23,42,0.24)] backdrop-blur-2xl"
          style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }}
        >
          {searchable && (
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' && visibleOptions.length > 0) {
                  event.preventDefault();
                  (optionRefs.current[selectedIndex] || optionRefs.current[0])?.focus();
                }
                if (event.key === 'Escape') {
                  onClose();
                  triggerRef.current?.focus();
                }
              }}
              aria-label="Buscar condomínio"
              placeholder="Buscar condomínio..."
              className="mb-2 w-full rounded-xl border border-white/90 bg-white/65 px-3 py-2.5 text-sm text-neutral-800 shadow-inner outline-none placeholder:text-neutral-400 focus:border-orange-300 focus:ring-2 focus:ring-orange-400/15"
            />
          )}
          <div id={`${labelId}-listbox`} role="listbox" aria-label="Opções disponíveis" className="overflow-y-auto overscroll-contain" style={{ maxHeight: Math.max(112, position.maxHeight - (searchable ? 68 : 16)) }}>
            {visibleOptions.map((option, index) => (
              <button
                ref={(element) => { optionRefs.current[index] = element; }}
                key={option.value || 'all'}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => selectOption(option)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    moveOptionFocus(index, event.key === 'ArrowDown' ? 1 : -1);
                  } else if (event.key === 'Home' || event.key === 'End') {
                    event.preventDefault();
                    optionRefs.current[event.key === 'Home' ? 0 : visibleOptions.length - 1]?.focus();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    onClose();
                    triggerRef.current?.focus();
                  }
                }}
                className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left text-xs transition sm:text-sm ${
                  option.value === value
                    ? 'bg-orange-500/10 font-extrabold text-orange-800 ring-1 ring-inset ring-orange-300/50'
                    : 'font-semibold text-neutral-700 hover:bg-white/75 hover:text-orange-700'
                }`}
              >
                <span className="truncate">{option.label}</span>
              </button>
            ))}
            {visibleOptions.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-neutral-500">{message || 'Nenhuma opção encontrada.'}</p>
            )}
            {visibleOptions.length === 1 && options.length === 1 && message && (
              <p className="px-3 py-2 text-xs text-neutral-500">{message}</p>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export const StaysSearchWidget: React.FC<StaysSearchWidgetProps> = ({
  onSearchInApp,
  currentFilters,
  surpriseMe = false,
  className = '',
}) => {
  // Dates in ISO format YYYY-MM-DD for native input
  const today = isoDate(new Date());
  const tomorrow = isoDate(new Date(new Date(`${today}T12:00:00`).getTime() + 86400000 * 2));

  const [checkIn, setCheckIn] = useState<string>(currentFilters?.checkIn || today);
  const [checkOut, setCheckOut] = useState<string>(currentFilters?.checkOut || tomorrow);
  const [persons, setPersons] = useState<string>(
    currentFilters?.guests ? String(currentFilters.guests.adults + currentFilters.guests.children) : '2'
  );
  const [selectedResort, setSelectedResort] = useState<string>(currentFilters?.destination || '');
  const [selectedResortId, setSelectedResortId] = useState<string>(currentFilters?.destinationPropertyId || '');
  const fieldId = useId().replace(/:/g, '');
  const [activeDatePicker, setActiveDatePicker] = useState<'checkIn' | 'checkOut' | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<'resort' | 'guests' | null>(null);
  const [resorts, setResorts] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoadingResorts, setIsLoadingResorts] = useState(true);

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
    if (currentFilters) {
      setSelectedResortId(currentFilters.destinationPropertyId || '');
    }
  }, [currentFilters]);

  useEffect(() => {
    let active = true;
    crcnBackendApi.getResorts().then((items) => {
      if (active) setResorts(items);
    }).finally(() => {
      if (active) setIsLoadingResorts(false);
    });
    return () => { active = false; };
  }, []);

  // Form submission handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkIn || !checkOut || checkOut <= checkIn) return;
    onSearchInApp({
      checkIn,
      checkOut,
      persons: parseInt(persons, 10) || 2,
      destination: surpriseMe ? '' : selectedResort,
      propertyId: surpriseMe ? '' : selectedResortId,
      surpriseMe,
    });
  };

  const resortOptions = [
    { value: '', label: 'Todos os condomínios' },
    ...resorts.map((resort) => ({ value: resort.id, label: resort.name })),
  ];
  const guestOptions = [
    { value: '', label: 'Hóspedes' },
    ...Array.from({ length: 17 }, (_, index) => ({
      value: String(index + 1),
      label: `${index + 1} ${index === 0 ? 'Pessoa' : 'Pessoas'}`,
    })),
  ];

  return (
    <div className={`w-full transition-all ${className}`}>
      {/* Container in Liquid Glass */}
      <div className="relative rounded-3xl liquid-glass-card border border-white/85 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.07)] p-5 sm:p-7">
        
        {/* Search widget heading */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-3.5 border-b border-white/60">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-neutral-800 font-bold">
            <Sparkles className="w-4 h-4 text-orange-500 flex-shrink-0" />
            <span>{surpriseMe ? 'Vamos escolher uma data especial e encontrar boas opções para você' : 'Encontre sua hospedagem em Caldas Novas por data e condomínio'}</span>
          </div>
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
          {selectedResortId && <input name="propertyId" value={selectedResortId} type="hidden" />}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 sm:gap-4 items-center">
            
            {/* Resort / Destination Selector */}
            {!surpriseMe && <div className="lg:col-span-3 min-w-0">
              <span id={`${fieldId}-resort-label`} className="mb-1.5 block truncate text-xs font-extrabold uppercase tracking-wider text-neutral-800">
                Complexo / Resort
              </span>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 z-10 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                  <Building2 className="w-4 h-4 text-orange-600 flex-shrink-0" />
                </div>
                <LiquidSelect
                  labelId={`${fieldId}-resort-label`}
                  value={selectedResortId}
                  selectedLabel={selectedResort || undefined}
                  placeholder="Todos os condomínios"
                  options={resortOptions}
                  searchable
                  message={isLoadingResorts ? 'Carregando condomínios da Stays...' : 'Não foi possível carregar os condomínios agora.'}
                  isOpen={activeDropdown === 'resort'}
                  onOpen={() => setActiveDropdown('resort')}
                  onClose={() => setActiveDropdown(null)}
                  onChange={(option) => {
                    setSelectedResortId(option.value);
                    setSelectedResort(option.value ? option.label : '');
                  }}
                />
              </div>
            </div>}

            {/* Arrival / Check-in */}
            {!surpriseMe && <div className="lg:col-span-3 min-w-0">
              <span id={`${fieldId}-checkin-label`} className="mb-1.5 block truncate text-xs font-extrabold uppercase tracking-wider text-neutral-800">
                Entrada (Check-in)
              </span>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 z-10 pl-3.5 flex items-center pointer-events-none text-neutral-500 group-focus-within:text-orange-600">
                  <CalendarIcon className="w-4 h-4 flex-shrink-0" />
                </div>
                <LiquidDatePicker
                  label="Entrada (Check-in)"
                  labelId={`${fieldId}-checkin-label`}
                  value={checkIn}
                  minDate={today}
                  isOpen={activeDatePicker === 'checkIn'}
                  onOpen={() => setActiveDatePicker('checkIn')}
                  onClose={() => setActiveDatePicker(null)}
                  onChange={(newCheckIn) => {
                    setCheckIn(newCheckIn);
                    if (newCheckIn >= checkOut) {
                      const next = new Date(new Date(newCheckIn).getTime() + 86400000 * 2)
                        .toISOString()
                        .split('T')[0];
                      setCheckOut(next);
                    }
                  }}
                />
              </div>
            </div>}

            {/* Departure / Checkout */}
            {!surpriseMe && <div className="lg:col-span-3 min-w-0">
              <span id={`${fieldId}-checkout-label`} className="mb-1.5 block truncate text-xs font-extrabold uppercase tracking-wider text-neutral-800">
                Saída (Checkout)
              </span>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 z-10 pl-3.5 flex items-center pointer-events-none text-neutral-500 group-focus-within:text-orange-600">
                  <CalendarIcon className="w-4 h-4 flex-shrink-0" />
                </div>
                <LiquidDatePicker
                  label="Saída (Checkout)"
                  labelId={`${fieldId}-checkout-label`}
                  value={checkOut}
                  minDate={checkIn || today}
                  isOpen={activeDatePicker === 'checkOut'}
                  onOpen={() => setActiveDatePicker('checkOut')}
                  onClose={() => setActiveDatePicker(null)}
                  onChange={setCheckOut}
                />
              </div>
            </div>}

            {/* Guest Count (Persons: 1 to 17) */}
            <div className={`${surpriseMe ? 'lg:col-span-4' : 'lg:col-span-3'} min-w-0`}>
              <span id={`${fieldId}-guests-label`} className="mb-1.5 block truncate text-xs font-extrabold uppercase tracking-wider text-neutral-800">
                Hóspedes
              </span>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 z-10 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                  <Users className="w-4 h-4 text-orange-600 flex-shrink-0" />
                </div>
                <LiquidSelect
                  labelId={`${fieldId}-guests-label`}
                  value={persons}
                  selectedLabel={guestOptions.find((option) => option.value === persons)?.label}
                  placeholder="Hóspedes"
                  options={guestOptions}
                  isOpen={activeDropdown === 'guests'}
                  onOpen={() => setActiveDropdown('guests')}
                  onClose={() => setActiveDropdown(null)}
                  onChange={(option) => { if (option.value) setPersons(option.value); }}
                />
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
                {surpriseMe ? <Sparkles className="w-4 h-4 stroke-[2.5]" /> : <Search className="w-4 h-4 stroke-[2.5]" />}
                <span>{surpriseMe ? 'Surpreenda-me' : 'Pesquisar Disponibilidade'}</span>
              </button>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
};
