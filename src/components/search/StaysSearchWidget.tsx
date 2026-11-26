import React, { useState, useEffect, useRef, useId, useCallback } from 'react';
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
import { SearchFilters } from '../../types';
import { crcnBackendApi } from '../../services/crcnBackendApi';
import { countOccupancyGuests } from '../../utils/guestCounts';
import { emitFunnelEvent } from '../../utils/measurementEvents';
import { CalendarMonthGrid } from './CalendarMonthGrid';
import { GuestCounterList, type GuestCounts } from './GuestCounterList';

interface StaysSearchWidgetProps {
  onSearchInApp: (searchParams: {
    checkIn: string;
    checkOut: string;
    persons: number;
    dateFlexibility?: 0 | 1 | 2;
    guests?: SearchFilters['guests'];
    destination?: string;
    propertyId?: string;
    surpriseMe?: boolean;
  }) => void;
  currentFilters?: SearchFilters;
  surpriseMe?: boolean;
  variant?: 'hero' | 'compact' | 'modal';
  className?: string;
  onOpenAssistant?: () => void;
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
  hero?: boolean;
  collapsed?: boolean;
  summaryValue?: string;
  rangeEnd?: string;
  emptyLabel?: string;
  value: string;
  minDate: string;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChange: (value: string) => void;
  onRangeChange?: (checkIn: string, checkOut: string) => void;
  dateFlexibility?: 0 | 1 | 2;
  onFlexibilityChange?: (days: 0 | 1 | 2) => void;
}

const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const addDaysToIsoDate = (dateValue: string, days: number) => {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + days);
  return isoDate(date);
};

function usePopoverPresence(isOpen: boolean) {
  const [retained, setRetained] = useState(isOpen);
  useEffect(() => {
    if (isOpen) {
      setRetained(true);
      return;
    }
    const timer = window.setTimeout(() => setRetained(false), 140);
    return () => window.clearTimeout(timer);
  }, [isOpen]);
  return isOpen || retained;
}

const LiquidDatePicker: React.FC<LiquidDatePickerProps> = ({
  label,
  hero = false,
  collapsed = false,
  summaryValue,
  rangeEnd = '',
  emptyLabel = 'Selecione a data',
  value,
  minDate,
  isOpen,
  onOpen,
  onClose,
  onChange,
  onRangeChange,
  dateFlexibility = 0,
  onFlexibilityChange,
}) => {
  const popoverPresent = usePopoverPresence(isOpen);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dateButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const [keyboardFocusDate, setKeyboardFocusDate] = useState<string | null>(null);
  const [pendingRangeStart, setPendingRangeStart] = useState<string | null>(null);
  const [previewRangeEnd, setPreviewRangeEnd] = useState<string | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = value ? new Date(`${value}T12:00:00`) : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [position, setPosition] = useState({
    left: 8,
    top: 8,
    width: hero ? 850 : 320,
    maxHeight: 540,
  });

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gutter = window.innerWidth <= 639 ? 16 : 8;
    const rootStyles = getComputedStyle(document.documentElement);
    const remSize = Number.parseFloat(rootStyles.fontSize) || 16;
    const calendarWidth =
      (Number.parseFloat(rootStyles.getPropertyValue('--search-calendar-width')) || 53.125) *
      remSize;
    const width = Math.min(hero ? calendarWidth : 320, window.innerWidth - gutter * 2);
    const maxHeight = Math.max(0, window.innerHeight - 16);
    const height = Math.min(hero ? 540 : 440, maxHeight);
    const left = hero
      ? Math.max(gutter, (window.innerWidth - width) / 2)
      : Math.max(gutter, Math.min(rect.left, window.innerWidth - width - gutter));
    const below = rect.bottom + 8;
    const top = below + height <= window.innerHeight ? below : Math.max(8, rect.top - height - 8);
    setPosition({ left, top, width, maxHeight });
  }, [hero]);

  const handleCalendarKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Tab') return;
    const popover = popoverRef.current;
    const trigger = triggerRef.current;
    const form = trigger?.closest('form');
    if (!popover || !trigger || !form) return;

    const calendarControls = Array.from(
      popover.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]'),
    );
    const firstControl = calendarControls[0];
    const lastControl = calendarControls[calendarControls.length - 1];
    const target = event.target instanceof Element ? event.target.closest('button') : null;
    const isLeavingCalendar = event.shiftKey ? target === firstControl : target === lastControl;
    if (!isLeavingCalendar) return;

    const formControls = Array.from(
      form.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
      ),
    );
    const triggerIndex = formControls.indexOf(trigger);
    const nextIndex = triggerIndex + (event.shiftKey ? -1 : 1);
    const nextControl = formControls[nextIndex];
    if (!nextControl) return;

    event.preventDefault();
    onCloseRef.current();
    nextControl.focus();
  };

  useEffect(() => {
    if (!isOpen || hero) return;
    updatePosition();
    const focusFrame = window.requestAnimationFrame(() => {
      popoverRef.current
        ?.querySelector<HTMLButtonElement>('[data-calendar-day][tabindex="0"]:not(:disabled)')
        ?.focus();
    });
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        onCloseRef.current();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
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
  }, [isOpen, updatePosition, hero]);

  const getFocusableDateForMonth = (monthOffset: number): string | undefined => {
    const month = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + monthOffset, 1);
    const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-`;
    if (keyboardFocusDate?.startsWith(prefix) && keyboardFocusDate >= minDate)
      return keyboardFocusDate;
    if (value.startsWith(prefix) && value >= minDate) return value;

    const leadingDays = month.getDay();
    return Array.from({ length: 42 }, (_, index) =>
      isoDate(new Date(month.getFullYear(), month.getMonth(), index - leadingDays + 1)),
    ).find((dateValue) => dateValue.startsWith(prefix) && dateValue >= minDate);
  };

  const registerDateButton = (dateValue: string) => (button: HTMLButtonElement | null) => {
    if (button) dateButtonRefs.current.set(dateValue, button);
    else dateButtonRefs.current.delete(dateValue);
  };

  const renderCalendarMonth = (monthOffset: number) => (
    <CalendarMonthGrid
      key={monthOffset}
      month={new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + monthOffset, 1)}
      minDate={minDate}
      selectedStart={value}
      selectedEnd={rangeEnd}
      pendingStart={pendingRangeStart}
      previewEnd={previewRangeEnd}
      onPreviewDate={setPreviewRangeEnd}
      focusDate={getFocusableDateForMonth(monthOffset)}
      onSelectDate={(dateValue) => {
        setPreviewRangeEnd(null);
        setKeyboardFocusDate(dateValue);
        if (hero && onRangeChange) {
          if (pendingRangeStart && dateValue > pendingRangeStart) {
            onRangeChange(pendingRangeStart, dateValue);
            setPendingRangeStart(null);
          } else {
            setPendingRangeStart(dateValue);
            onChange(dateValue);
          }
          return;
        }
        onChange(dateValue);
        onClose();
        triggerRef.current?.focus();
      }}
      onDateKeyDown={handleDateKeyDown}
      registerDateButton={registerDateButton}
    />
  );

  useEffect(() => {
    if (!isOpen || !keyboardFocusDate) return;
    dateButtonRefs.current.get(keyboardFocusDate)?.focus();
  }, [isOpen, keyboardFocusDate, visibleMonth]);

  const handleDateKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, dateValue: string) => {
    const dayOffset =
      event.key === 'ArrowLeft'
        ? -1
        : event.key === 'ArrowRight'
          ? 1
          : event.key === 'ArrowUp'
            ? -7
            : event.key === 'ArrowDown'
              ? 7
              : 0;
    if (dayOffset === 0) return;

    event.preventDefault();
    const startingDate = new Date(`${dateValue}T12:00:00`);
    for (let step = 1; step <= 31; step += 1) {
      const candidate = new Date(startingDate);
      candidate.setDate(candidate.getDate() + dayOffset * step);
      const candidateValue = isoDate(candidate);
      if (candidateValue < minDate) continue;

      setKeyboardFocusDate(candidateValue);
      if (
        candidate.getFullYear() !== visibleMonth.getFullYear() ||
        candidate.getMonth() !== visibleMonth.getMonth()
      ) {
        setVisibleMonth(new Date(candidate.getFullYear(), candidate.getMonth(), 1));
      }
      return;
    }
  };

  const shownValue = value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : emptyLabel;
  const triggerDescription = hero && collapsed ? summaryValue || 'Insira as datas' : shownValue;

  useEffect(() => {
    if (isOpen && !hero) updatePosition();
  }, [collapsed, isOpen, updatePosition, hero]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${hero && collapsed ? 'Quando' : label} ${triggerDescription}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => {
          const date = value ? new Date(`${value}T12:00:00`) : new Date();
          setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
          setKeyboardFocusDate(value || null);
          setPendingRangeStart(null);
          onOpen();
        }}
        className={`${hero ? `flex w-full min-w-0 flex-col items-start justify-center text-left ${collapsed ? 'min-h-9 rounded-xl px-2 py-0.5' : 'min-h-16 rounded-xl px-2 py-1'}` : 'min-h-11 w-full rounded-2xl border border-white/80 px-3 py-3 pl-10 text-left text-xs font-bold shadow-xs liquid-glass-input outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 sm:text-sm'} cursor-pointer text-neutral-900`}
      >
        {hero && !collapsed && (
          <span className="mb-1 block truncate text-base font-bold leading-tight text-neutral-700">
            {label === 'Entrada (Check-in)' ? 'Entrada (Check-in)' : 'Saída'}
          </span>
        )}
        <span
          aria-hidden="true"
          className={
            hero
              ? `block truncate leading-tight text-neutral-900 ${collapsed ? 'text-[length:var(--search-date-value-font-size)] font-normal text-neutral-500' : 'text-3xl font-semibold'}`
              : undefined
          }
        >
          {hero && collapsed ? (
            triggerDescription
          ) : value ? (
            shownValue
          ) : (
            <>
              <span className="max-[400px]:hidden">{shownValue}</span>
              <span className="hidden max-[400px]:inline">Escolher data</span>
            </>
          )}
        </span>
      </button>

      {popoverPresent &&
        !hero &&
        createPortal(
          <div
            ref={popoverRef}
            data-dialog-focus-portal
            aria-hidden={!isOpen}
            inert={!isOpen}
            data-closing={!isOpen || undefined}
            role="dialog"
            aria-label={`Calendário de ${label.toLowerCase()}`}
            className="search-popover-enter fixed z-[1000] overflow-y-auto overscroll-contain rounded-3xl border border-white/90 bg-white/80 p-4 [@media(max-width:639px)]:p-1 text-neutral-800 shadow-[0_20px_60px_-16px_rgba(15,23,42,0.28)] backdrop-blur-2xl"
            style={{
              left: position.left,
              top: position.top,
              width: position.width,
              maxHeight: position.maxHeight,
            }}
          >
            {hero && (
              <div
                role="tablist"
                aria-label="Tipo de data"
                className="mx-auto mb-5 flex w-fit items-center rounded-full bg-neutral-100 p-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected="true"
                  className="min-h-10 rounded-full bg-white px-8 text-sm font-semibold text-neutral-900 shadow-sm"
                >
                  Datas
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected="false"
                  disabled
                  title="A busca flexível ainda não está disponível para os condomínios."
                  className="min-h-10 cursor-not-allowed rounded-full px-8 text-sm font-semibold text-neutral-400"
                >
                  Flexível
                </button>
              </div>
            )}
            <div className="mb-3 grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-start gap-2 sm:gap-3">
              <button
                type="button"
                onKeyDown={handleCalendarKeyDown}
                onClick={() =>
                  setVisibleMonth(
                    new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1),
                  )
                }
                className="liquid-glass-button mt-8 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-700 transition hover:text-orange-600"
                aria-label="Mês anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div
                className={`grid min-w-0 ${hero && window.innerWidth > 639 ? 'grid-cols-2 gap-6' : 'grid-cols-1'}`}
              >
                {renderCalendarMonth(0)}
                {hero && window.innerWidth > 639 && renderCalendarMonth(1)}
              </div>
              <button
                type="button"
                onClick={() =>
                  setVisibleMonth(
                    new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1),
                  )
                }
                className="liquid-glass-button mt-8 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-700 transition hover:text-orange-600"
                aria-label="Próximo mês"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-neutral-200/70 pt-3">
              {hero && onRangeChange && (
                <div
                  aria-label="Flexibilidade das datas"
                  className="flex flex-wrap items-center gap-2"
                >
                  {([0, 1, 2] as const).map((days) => (
                    <button
                      key={days}
                      type="button"
                      aria-pressed={dateFlexibility === days}
                      onClick={() => onFlexibilityChange?.(days)}
                      className={`min-h-10 rounded-full border px-4 text-xs font-semibold ${dateFlexibility === days ? 'border-neutral-900 text-neutral-900' : 'border-neutral-300 text-neutral-700 hover:border-neutral-900'}`}
                    >
                      {days === 0 ? 'Datas exatas' : `± ${days} ${days === 1 ? 'dia' : 'dias'}`}
                    </button>
                  ))}
                </div>
              )}
              {!hero && (
                <button
                  type="button"
                  onKeyDown={handleCalendarKeyDown}
                  onClick={() => {
                    const today = isoDate(new Date());
                    if (today >= minDate) {
                      onChange(today);
                      onClose();
                      triggerRef.current?.focus();
                    }
                  }}
                  disabled={isoDate(new Date()) < minDate}
                  className="min-h-11 rounded-full px-4 text-xs font-bold text-orange-700 transition hover:bg-orange-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Hoje
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

interface LiquidOption {
  value: string;
  label: string;
}
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
  advanceOnSelect?: boolean;
  sharedPanel?: boolean;
}

const LiquidSelect: React.FC<LiquidSelectProps> = ({
  labelId,
  value,
  selectedLabel,
  placeholder,
  options,
  isOpen,
  onOpen,
  onClose,
  onChange,
  searchable,
  message,
  advanceOnSelect = false,
  sharedPanel = false,
}) => {
  const popoverPresent = usePopoverPresence(isOpen);
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
    if (!isOpen || sharedPanel) return;
    const frame = window.requestAnimationFrame(updatePosition);
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
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
  }, [isOpen, onClose, sharedPanel]);

  useEffect(() => {
    if (isOpen) setQuery('');
  }, [isOpen]);

  const visibleOptions = options.filter(
    (option) =>
      !query || option.label.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')),
  );
  const currentLabel =
    selectedLabel || options.find((option) => option.value === value)?.label || placeholder;
  const selectedIndex = visibleOptions.findIndex((option) => option.value === value);

  useEffect(() => {
    if (!isOpen || sharedPanel) return;
    const frame = window.requestAnimationFrame(() => {
      if (searchable) searchInputRef.current?.focus();
      else (optionRefs.current[selectedIndex] || optionRefs.current[0])?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, searchable, selectedIndex, sharedPanel]);

  const selectOption = (option: LiquidOption) => {
    onChange(option);
    onClose();
    if (!advanceOnSelect) triggerRef.current?.focus();
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
        className="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-2xl border border-white/85 bg-white/55 py-3 pl-10 pr-3 text-left text-xs font-bold text-neutral-900 shadow-[inset_0_1px_2px_rgba(255,255,255,0.85),0_3px_10px_rgba(15,23,42,0.04)] backdrop-blur-xl transition hover:bg-white/70 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20 sm:text-sm"
      >
        <span
          id={`${labelId}-value`}
          className={`min-w-0 truncate ${currentLabel === placeholder ? 'text-neutral-500' : ''}`}
        >
          {currentLabel}
        </span>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-neutral-500 transition-transform ${isOpen ? 'rotate-180 text-orange-600' : ''}`}
        />
      </button>

      {popoverPresent &&
        !sharedPanel &&
        createPortal(
          <div
            ref={menuRef}
            data-dialog-focus-portal
            aria-hidden={!isOpen}
            inert={!isOpen}
            data-closing={!isOpen || undefined}
            role="group"
            aria-label="Opções de filtro"
            className="search-popover-enter fixed z-[1000] overflow-hidden rounded-2xl border border-white/90 bg-white/78 p-2 text-neutral-800 shadow-[0_18px_55px_-16px_rgba(15,23,42,0.24)] backdrop-blur-2xl"
            style={{
              left: position.left,
              top: position.top,
              width: position.width,
              maxHeight: position.maxHeight,
            }}
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
                className="mb-2 min-h-11 w-full rounded-xl border border-white/90 bg-white/65 px-3 py-2.5 text-sm text-neutral-800 shadow-inner outline-none placeholder:text-neutral-400 focus:border-orange-300 focus:ring-2 focus:ring-orange-400/15"
              />
            )}
            <div
              id={`${labelId}-listbox`}
              role="listbox"
              aria-label="Opções disponíveis"
              className="overflow-y-auto overscroll-contain"
              style={{ maxHeight: Math.max(0, position.maxHeight - (searchable ? 68 : 16)) }}
            >
              {visibleOptions.map((option, index) => (
                <button
                  ref={(element) => {
                    optionRefs.current[index] = element;
                  }}
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
                      optionRefs.current[
                        event.key === 'Home' ? 0 : visibleOptions.length - 1
                      ]?.focus();
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      onClose();
                      triggerRef.current?.focus();
                    }
                  }}
                  className={`flex min-h-11 w-full items-center rounded-xl px-3 py-2.5 text-left text-xs transition sm:text-sm ${
                    option.value === value
                      ? 'bg-orange-500/10 font-extrabold text-orange-800 ring-1 ring-inset ring-orange-300/50'
                      : 'font-semibold text-neutral-700 hover:bg-white/75 hover:text-orange-700'
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                </button>
              ))}
              {visibleOptions.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-neutral-500">
                  {message || 'Nenhuma opção encontrada.'}
                </p>
              )}
              {visibleOptions.length === 1 && options.length === 1 && message && (
                <p className="px-3 py-2 text-xs text-neutral-500">{message}</p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

interface SharedCalendarContentProps {
  checkIn: string;
  checkOut: string;
  today: string;
  dateFlexibility: 0 | 1 | 2;
  onFlexibilityChange: (days: 0 | 1 | 2) => void;
  onSelectRange: (checkIn: string, checkOut: string) => void;
}

function SharedCalendarContent({
  checkIn,
  checkOut,
  today,
  dateFlexibility,
  onFlexibilityChange,
  onSelectRange,
}: SharedCalendarContentProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const initialDate = checkIn ? new Date(`${checkIn}T12:00:00`) : new Date();
    return new Date(initialDate.getFullYear(), initialDate.getMonth(), 1);
  });
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [previewEnd, setPreviewEnd] = useState<string | null>(null);
  const [focusDate, setFocusDate] = useState(checkIn || undefined);
  const dateButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const isWide = typeof window !== 'undefined' && window.innerWidth > 639;

  const getFocusableDate = (monthOffset: number): string | undefined => {
    const month = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + monthOffset, 1);
    const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-`;
    if (focusDate?.startsWith(prefix) && focusDate >= today) return focusDate;
    if (checkIn.startsWith(prefix) && checkIn >= today) return checkIn;
    const leadingDays = month.getDay();
    return Array.from({ length: 42 }, (_, index) =>
      isoDate(new Date(month.getFullYear(), month.getMonth(), index - leadingDays + 1)),
    ).find((dateValue) => dateValue.startsWith(prefix) && dateValue >= today);
  };

  const handleDateKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, dateValue: string) => {
    const dayOffset =
      event.key === 'ArrowLeft'
        ? -1
        : event.key === 'ArrowRight'
          ? 1
          : event.key === 'ArrowUp'
            ? -7
            : event.key === 'ArrowDown'
              ? 7
              : 0;
    if (!dayOffset) return;
    event.preventDefault();
    const candidate = new Date(`${dateValue}T12:00:00`);
    candidate.setDate(candidate.getDate() + dayOffset);
    const nextDate = isoDate(candidate);
    if (nextDate < today) return;
    setFocusDate(nextDate);
    if (
      candidate.getMonth() !== visibleMonth.getMonth() ||
      candidate.getFullYear() !== visibleMonth.getFullYear()
    ) {
      setVisibleMonth(new Date(candidate.getFullYear(), candidate.getMonth(), 1));
    }
  };

  useEffect(() => {
    if (focusDate) dateButtonRefs.current.get(focusDate)?.focus();
  }, [focusDate, visibleMonth]);

  const renderMonth = (monthOffset: number) => (
    <CalendarMonthGrid
      key={monthOffset}
      month={new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + monthOffset, 1)}
      minDate={today}
      selectedStart={checkIn}
      selectedEnd={checkOut}
      pendingStart={pendingStart}
      previewEnd={previewEnd}
      onPreviewDate={setPreviewEnd}
      focusDate={getFocusableDate(monthOffset)}
      onSelectDate={(date) => {
        setFocusDate(date);
        setPreviewEnd(null);
        if (!pendingStart) {
          setPendingStart(date);
          return;
        }
        if (date > pendingStart) {
          onSelectRange(pendingStart, date);
          setPendingStart(null);
          return;
        }
        setPendingStart(date);
      }}
      onDateKeyDown={handleDateKeyDown}
      registerDateButton={(date) => (button) => {
        if (button) dateButtonRefs.current.set(date, button);
        else dateButtonRefs.current.delete(date);
      }}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        role="tablist"
        aria-label="Tipo de data"
        className="mx-auto mb-4 flex w-fit shrink-0 items-center rounded-full bg-neutral-100 p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected="true"
          className="min-h-10 rounded-full bg-white px-8 text-sm font-semibold text-neutral-900 shadow-sm"
        >
          Datas
        </button>
        <button
          type="button"
          role="tab"
          aria-selected="false"
          disabled
          title="A busca flexível ainda não está disponível para os condomínios."
          className="min-h-10 cursor-not-allowed rounded-full px-8 text-sm font-semibold text-neutral-400"
        >
          Flexível
        </button>
      </div>
      <div className="mb-3 grid min-h-0 flex-1 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-start gap-2 overflow-y-auto sm:gap-3">
        <button
          type="button"
          onClick={() =>
            setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))
          }
          aria-label="Mês anterior"
          className="mt-8 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 transition hover:border-neutral-900"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className={`grid min-w-0 ${isWide ? 'grid-cols-2 gap-4 sm:gap-6' : 'grid-cols-1'}`}>
          {renderMonth(0)}
          {isWide && renderMonth(1)}
        </div>
        <button
          type="button"
          onClick={() =>
            setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))
          }
          aria-label="Próximo mês"
          className="mt-8 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 transition hover:border-neutral-900"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div
        aria-label="Flexibilidade das datas"
        className="flex shrink-0 flex-wrap items-center gap-2 border-t border-neutral-200/70 pt-3"
      >
        {([0, 1, 2, 3, 7, 14] as const).map((days) => (
          <button
            key={days}
            type="button"
            disabled={days > 2}
            aria-pressed={dateFlexibility === days}
            onClick={() => {
              if (days <= 2) onFlexibilityChange(days as 0 | 1 | 2);
            }}
            title={days > 2 ? 'Ainda não disponível' : undefined}
            className={`min-h-10 rounded-full border px-4 text-xs font-semibold ${dateFlexibility === days ? 'border-neutral-900 text-neutral-900' : days > 2 ? 'cursor-not-allowed border-neutral-200 text-neutral-400' : 'border-neutral-300 text-neutral-700 hover:border-neutral-900'}`}
          >
            {days === 0 ? 'Datas exatas' : `± ${days} ${days === 1 ? 'dia' : 'dias'}`}
          </button>
        ))}
      </div>
    </div>
  );
}

export const StaysSearchWidget: React.FC<StaysSearchWidgetProps> = ({
  onSearchInApp,
  currentFilters,
  surpriseMe = false,
  variant = 'hero',
  className = '',
  onOpenAssistant,
}) => {
  const isHero = variant === 'hero';
  // Dates in ISO format YYYY-MM-DD for native input
  const today = isoDate(new Date());

  const [checkIn, setCheckIn] = useState<string>(currentFilters?.checkIn || '');
  const [checkOut, setCheckOut] = useState<string>(currentFilters?.checkOut || '');
  const [dateFlexibility, setDateFlexibility] = useState<0 | 1 | 2>(
    currentFilters?.dateFlexibility ?? 0,
  );
  const [persons, setPersons] = useState<string>(
    currentFilters?.guests ? String(countOccupancyGuests(currentFilters.guests)) : '2',
  );
  const [guestCounts, setGuestCounts] = useState<GuestCounts>(
    currentFilters?.guests ?? { adults: 1, children: 0, infants: 0, pets: 0 },
  );
  const [selectedResort, setSelectedResort] = useState<string>(currentFilters?.destination || '');
  const [selectedResortId, setSelectedResortId] = useState<string>(
    currentFilters?.destinationPropertyId || '',
  );
  const fieldId = useId().replace(/:/g, '');
  const [activeDatePicker, setActiveDatePicker] = useState<'checkIn' | 'checkOut' | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<'resort' | 'guests' | null>(null);
  const guestTriggerRef = useRef<HTMLButtonElement>(null);
  const [sharedPanelPosition, setSharedPanelPosition] = useState({
    left: 8,
    top: 150,
    width: 400,
    height: 420,
  });
  const [sharedPanelVisible, setSharedPanelVisible] = useState(false);
  const [sharedResortQuery, setSharedResortQuery] = useState('');
  const sharedPanelRef = useRef<HTMLDivElement>(null);
  const [resorts, setResorts] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoadingResorts, setIsLoadingResorts] = useState(true);
  const [searchValidationMessage, setSearchValidationMessage] = useState('');
  const hasCurrentFilters = currentFilters !== undefined;
  const syncedCheckIn = currentFilters?.checkIn || '';
  const syncedCheckOut = currentFilters?.checkOut || '';
  const syncedFlexibility = currentFilters?.dateFlexibility ?? 0;
  const syncedAdults = currentFilters?.guests?.adults;
  const syncedChildren = currentFilters?.guests?.children;
  const syncedInfants = currentFilters?.guests?.infants;
  const syncedPets = currentFilters?.guests?.pets;
  const hasSyncedGuests = syncedAdults !== undefined && syncedChildren !== undefined;
  const syncedGuestCount = countOccupancyGuests({
    adults: syncedAdults ?? 1,
    children: syncedChildren ?? 0,
    infants: syncedInfants ?? 0,
  });
  const syncedDestination = currentFilters?.destination;
  const syncedDestinationPropertyId = currentFilters?.destinationPropertyId || '';

  // Sync with currentFilters if they change externally
  useEffect(() => {
    if (!hasCurrentFilters) return;
    setCheckIn(syncedCheckIn);
    setCheckOut(syncedCheckOut);
    setDateFlexibility(syncedFlexibility);
    if (hasSyncedGuests && syncedGuestCount >= 1 && syncedGuestCount <= 17) {
      setPersons(String(syncedGuestCount));
      setGuestCounts({
        adults: syncedAdults ?? 1,
        children: syncedChildren ?? 0,
        infants: syncedInfants ?? 0,
        pets: syncedPets ?? 0,
      });
    }
    if (syncedDestination !== undefined) {
      setSelectedResort(syncedDestination);
    }
    setSelectedResortId(syncedDestinationPropertyId);
  }, [
    hasCurrentFilters,
    syncedCheckIn,
    syncedCheckOut,
    syncedFlexibility,
    hasSyncedGuests,
    syncedAdults,
    syncedChildren,
    syncedGuestCount,
    syncedInfants,
    syncedPets,
    syncedDestination,
    syncedDestinationPropertyId,
  ]);

  useEffect(() => {
    let active = true;
    crcnBackendApi
      .getResorts()
      .then((items) => {
        if (active) setResorts(items);
      })
      .finally(() => {
        if (active) setIsLoadingResorts(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isHero) return;
    const activePanel =
      activeDropdown === 'resort'
        ? 'where'
        : activeDropdown === 'guests'
          ? 'guests'
          : activeDatePicker
            ? 'when'
            : null;
    if (!activePanel) {
      const timer = window.setTimeout(() => setSharedPanelVisible(false), 240);
      return () => window.clearTimeout(timer);
    }
    setSharedPanelVisible(true);
    const updatePosition = () => {
      const form = document.getElementById('widgetStaysSearchForm');
      const target = form?.querySelector<HTMLElement>(
        `[data-search-segment="${activePanel === 'where' ? 'where' : activePanel === 'when' ? 'when' : 'guests'}"]`,
      );
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const gutter = window.innerWidth <= 639 ? 12 : 16;
      const width = Math.min(
        activePanel === 'when' ? 850 : activePanel === 'where' ? 400 : 620,
        window.innerWidth - gutter * 2,
      );
      const height = Math.min(
        activePanel === 'when' ? 540 : activePanel === 'where' ? 360 : 430,
        window.innerHeight - 24,
      );
      const centeredLeft = activePanel === 'when' ? (window.innerWidth - width) / 2 : rect.left;
      const left = Math.max(gutter, Math.min(centeredLeft, window.innerWidth - width - gutter));
      const top = Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - height - 8));
      setSharedPanelPosition({ left, top, width, height });
    };
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    const focusFrame = window.requestAnimationFrame(() => {
      if (activePanel === 'where')
        sharedPanelRef.current
          ?.querySelector<HTMLInputElement>('input[aria-label="Buscar condomínio"]')
          ?.focus();
      if (activePanel === 'guests')
        sharedPanelRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
      if (activePanel === 'when')
        sharedPanelRef.current
          ?.querySelector<HTMLButtonElement>('[data-calendar-day]:not(:disabled)')
          ?.focus();
    });
    const handleOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !sharedPanelRef.current?.contains(target) &&
        !document.getElementById('widgetStaysSearchForm')?.contains(target)
      ) {
        setActiveDropdown(null);
        setActiveDatePicker(null);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveDropdown(null);
        setActiveDatePicker(null);
        document
          .querySelector<HTMLButtonElement>(
            `[data-search-segment="${activePanel === 'where' ? 'where' : activePanel === 'when' ? 'when' : 'guests'}"] button`,
          )
          ?.focus();
      }
    };
    const handlePanelKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !sharedPanelRef.current?.contains(event.target as Node)) return;
      const controls = Array.from(
        sharedPanelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]',
        ),
      );
      const firstControl = controls[0];
      const lastControl = controls[controls.length - 1];
      const target =
        event.target instanceof Element
          ? event.target.closest('button, a, input, [tabindex="0"]')
          : null;
      const leavesPanel = event.shiftKey ? target === firstControl : target === lastControl;
      if (!leavesPanel) return;

      event.preventDefault();
      setActiveDropdown(null);
      setActiveDatePicker(null);
      if (event.shiftKey) {
        const activeSegment =
          activeDropdown === 'resort' ? 'where' : activeDropdown === 'guests' ? 'guests' : 'when';
        document
          .querySelector<HTMLButtonElement>(`[data-search-segment="${activeSegment}"] button`)
          ?.focus();
      } else {
        document
          .querySelector<HTMLButtonElement>('#widgetStaysSearchForm button[type="submit"]')
          ?.focus();
      }
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('keydown', handlePanelKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('pointerdown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('keydown', handlePanelKeyDown);
    };
  }, [activeDropdown, activeDatePicker, isHero]);

  // Form submission handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!surpriseMe && (!checkIn || !checkOut)) {
      setSearchValidationMessage(
        'Selecione as datas de entrada e saída para consultar a disponibilidade.',
      );
      return;
    }
    if (!surpriseMe && checkIn < today) {
      setSearchValidationMessage('O check-in precisa ser hoje ou em uma data futura.');
      return;
    }
    if (!surpriseMe && checkOut <= checkIn) {
      setSearchValidationMessage('A data de saída precisa ser posterior à data de entrada.');
      return;
    }
    setSearchValidationMessage('');
    const personCount = isHero ? countOccupancyGuests(guestCounts) : parseInt(persons, 10) || 2;
    const currentGuests = currentFilters?.guests;
    const guests = isHero
      ? guestCounts
      : currentGuests
        ? personCount === countOccupancyGuests(currentGuests)
          ? currentGuests
          : {
              adults: personCount,
              children: 0,
              infants: currentGuests.infants,
              pets: currentGuests.pets,
            }
        : undefined;
    emitFunnelEvent({
      event: 'search',
      has_dates: !surpriseMe && Boolean(checkIn && checkOut),
      guests: guests ? countOccupancyGuests(guests) : personCount,
    });
    onSearchInApp({
      checkIn,
      checkOut,
      dateFlexibility,
      persons: guests ? countOccupancyGuests(guests) : personCount,
      guests,
      destination: surpriseMe ? '' : selectedResort,
      propertyId: surpriseMe || selectedResortId.startsWith('imobsys-condo-') ? '' : selectedResortId,
      surpriseMe,
    });
  };

  const resortOptions = [
    { value: '', label: 'Todos os condomínios' },
    ...resorts.map((resort) => ({
      value: resort.id,
      label: resort.name.replace(/^CRCN\s*[-–]\s*/i, ''),
    })),
  ];
  const guestOptions = [
    { value: '', label: 'Hóspedes' },
    ...Array.from({ length: 17 }, (_, index) => ({
      value: String(index + 1),
      label: `${index + 1} ${index === 0 ? 'Pessoa' : 'Pessoas'}`,
    })),
  ];
  const selectedGuestOption = guestOptions.find((option) => option.value === persons);
  const selectedOccupancyCount = countOccupancyGuests(guestCounts);
  const selectedGuestLabel = isHero
    ? [
        `${selectedOccupancyCount} ${selectedOccupancyCount === 1 ? 'hóspede' : 'hóspedes'}`,
        guestCounts.pets > 0
          ? `${guestCounts.pets} ${guestCounts.pets === 1 ? 'pet' : 'pets'}`
          : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : selectedGuestOption
      ? currentFilters?.guests.infants
        ? `${selectedGuestOption.label} + ${currentFilters.guests.infants} bebê${currentFilters.guests.infants === 1 ? '' : 's'}`
        : selectedGuestOption.label
      : undefined;
  const dateRangeSummary = checkIn
    ? `${new Date(`${checkIn}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}${checkOut ? ` - ${new Date(`${checkOut}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}` : ''}`
    : 'Insira as datas';

  return (
    <div className={`w-full transition-all ${className}`}>
      {/* Container in Liquid Glass */}
      <div
        className={`relative ${isHero ? 'search-bar-shell rounded-[2rem] border border-neutral-200/90 bg-white/85 p-0 shadow-[0_8px_24px_-16px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:rounded-full sm:p-0' : 'rounded-3xl liquid-glass-card border border-white/85 p-4 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.07)] sm:p-7 max-[400px]:p-3 [@media(max-height:400px)]:p-0'}`}
      >
        {/* Search widget heading */}
        <div
          className={
            isHero
              ? 'hidden'
              : 'mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/60 pb-3 sm:mb-5 sm:pb-3.5 max-[400px]:mb-2 max-[400px]:gap-2 max-[400px]:pb-2 [@media(max-height:400px)]:hidden'
          }
        >
          <div className="flex flex-1 items-center gap-2 text-sm text-neutral-800 font-bold [@media(max-height:400px)]:text-xs">
            <Sparkles className="w-4 h-4 text-orange-500 flex-shrink-0" />
            <span>
              {surpriseMe ? (
                'Vamos escolher uma data especial e encontrar boas opções para você'
              ) : (
                <>
                  <span className="sm:hidden">Busque por datas e condomínio</span>
                  <span className="hidden sm:inline">
                    Encontre sua hospedagem em Caldas Novas por data e condomínio
                  </span>
                </>
              )}
            </span>
          </div>
          {onOpenAssistant && (
            <button
              type="button"
              onClick={onOpenAssistant}
              aria-label="Falar com Sofia, assistente virtual"
              className="sm:hidden inline-flex min-h-11 flex-shrink-0 items-center gap-2 rounded-full border border-orange-200 bg-white/80 px-3 text-sm font-bold text-orange-800 shadow-sm max-[400px]:gap-1 max-[400px]:px-2 [@media(max-height:400px)]:hidden"
            >
              <Sparkles className="h-4 w-4 text-orange-600" aria-hidden="true" />
              Sofia
            </button>
          )}
        </div>

        {/* 
          Form configured with accurate date and destination parameters
        */}
        <form
          role="search"
          id="widgetStaysSearchForm"
          data-search-variant={isHero ? 'hero' : 'standard'}
          data-active-search-segment={
            isHero
              ? activeDatePicker
                ? 'when'
                : activeDropdown === 'resort'
                  ? 'where'
                  : activeDropdown === 'guests'
                    ? 'guests'
                    : undefined
              : undefined
          }
          onSubmit={handleSubmit}
          className={
            isHero
              ? 'grid grid-cols-1 items-stretch gap-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]'
              : 'space-y-3 sm:space-y-4'
          }
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
          <input name="persons" value={isHero ? selectedOccupancyCount : persons} type="hidden" />
          <input
            name="adults"
            value={isHero ? guestCounts.adults : (currentFilters?.guests.adults ?? persons)}
            type="hidden"
          />
          <input
            name="children"
            value={isHero ? guestCounts.children : (currentFilters?.guests.children ?? 0)}
            type="hidden"
          />
          <input
            name="infants"
            value={isHero ? guestCounts.infants : (currentFilters?.guests.infants ?? 0)}
            type="hidden"
          />
          <input
            name="pets"
            value={isHero ? guestCounts.pets : (currentFilters?.guests.pets ?? 0)}
            type="hidden"
          />
          {selectedResort && <input name="q" value={selectedResort} type="hidden" />}
          {selectedResortId && <input name="propertyId" value={selectedResortId} type="hidden" />}

          <div
            data-search-fields={isHero ? '' : undefined}
            className={`${isHero ? 'contents' : 'grid grid-cols-1 items-center gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-12 max-[400px]:gap-y-0 [@media(min-width:360px)_and_(max-width:639px)_and_(min-height:401px)]:grid-cols-2 [@media(max-width:479px)_and_(max-height:400px)]:grid-cols-2 [@media(min-width:480px)_and_(max-width:639px)_and_(max-height:400px)]:grid-cols-4 [@media(max-width:639px)_and_(max-height:400px)]:gap-1 [@media(max-width:479px)_and_(max-height:400px)]:gap-0'}`}
          >
            {/* Resort / Destination Selector */}
            {!surpriseMe && (
              <div
                data-search-segment="where"
                data-search-active={isHero && activeDropdown === 'resort' ? 'true' : undefined}
                className={`${isHero ? 'min-w-0 border-b border-neutral-200 px-3 py-2 sm:border-b-0 sm:border-r sm:px-4 lg:col-span-3' : 'min-w-0 lg:col-span-3 [@media(min-width:360px)_and_(max-width:639px)_and_(min-height:401px)]:col-span-2 [@media(max-width:639px)_and_(max-height:400px)]:col-span-1'}`}
              >
                <span
                  id={`${fieldId}-resort-label`}
                  className={`mb-1.5 block truncate text-xs font-extrabold text-neutral-800 ${isHero ? 'normal-case tracking-normal' : 'uppercase tracking-wider [@media(max-width:639px)_and_(max-height:400px)]:sr-only'}`}
                >
                  {isHero ? 'Onde' : 'Complexo / Resort'}
                </span>
                <div className="relative">
                  <div
                    className={`${isHero ? 'hidden' : 'pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-3.5 text-neutral-500'}`}
                  >
                    <Building2 className="h-4 w-4 flex-shrink-0 text-orange-600" />
                  </div>
                  <LiquidSelect
                    labelId={`${fieldId}-resort-label`}
                    value={selectedResortId}
                    selectedLabel={selectedResort || undefined}
                    placeholder="Todos os condomínios"
                    options={resortOptions}
                    searchable
                    advanceOnSelect={isHero}
                    sharedPanel={isHero}
                    message={
                      isLoadingResorts
                        ? 'Carregando condomínios da Stays...'
                        : 'Não foi possível carregar os condomínios agora.'
                    }
                    isOpen={activeDropdown === 'resort'}
                    onOpen={() => {
                      setActiveDatePicker(null);
                      setActiveDropdown('resort');
                    }}
                    onClose={() => setActiveDropdown(null)}
                    onChange={(option) => {
                      setSelectedResortId(option.value);
                      setSelectedResort(option.value ? option.label : '');
                      if (isHero) setActiveDatePicker('checkIn');
                    }}
                  />
                </div>
              </div>
            )}

            {!surpriseMe && (
              <div
                data-search-segment="when"
                data-search-active={isHero && activeDatePicker ? 'true' : undefined}
                className={isHero ? 'min-w-0 px-3 py-2 sm:px-4 lg:col-span-1' : 'contents'}
              >
                {isHero && <span className="mb-1.5 block text-xs font-semibold">Quando</span>}
                <div className={isHero ? 'grid grid-cols-1 gap-0' : 'contents'}>
                  {/* Arrival / Check-in */}
                  {!surpriseMe && (
                    <div
                      className={`${isHero ? 'min-w-0' : 'min-w-0 lg:col-span-3 [@media(min-width:360px)_and_(max-width:639px)_and_(min-height:401px)]:col-span-1 [@media(max-width:639px)_and_(max-height:400px)]:col-span-1'}`}
                    >
                      {!isHero && (
                        <span
                          aria-hidden="true"
                          className="mb-1.5 block truncate text-xs font-extrabold uppercase tracking-wider text-neutral-800 [@media(max-width:639px)_and_(max-height:400px)]:hidden"
                        >
                          <span className="max-[400px]:hidden">Entrada (Check-in)</span>
                          <span className="hidden max-[400px]:inline">Entrada</span>
                        </span>
                      )}
                      <div className="relative group">
                        <div
                          className={`${isHero ? 'hidden' : 'pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-3.5 text-neutral-500 group-focus-within:text-orange-600'}`}
                        >
                          <CalendarIcon className="w-4 h-4 flex-shrink-0" />
                        </div>
                        <LiquidDatePicker
                          label="Entrada (Check-in)"
                          hero={isHero}
                          collapsed={isHero}
                          summaryValue={dateRangeSummary}
                          rangeEnd={checkOut}
                          dateFlexibility={dateFlexibility}
                          onFlexibilityChange={setDateFlexibility}
                          emptyLabel={isHero ? 'Entrada' : undefined}
                          value={checkIn}
                          minDate={today}
                          isOpen={activeDatePicker === 'checkIn'}
                          onOpen={() => {
                            setActiveDropdown(null);
                            setActiveDatePicker('checkIn');
                          }}
                          onClose={() => {
                            setActiveDatePicker(null);
                          }}
                          onChange={(newCheckIn) => {
                            setSearchValidationMessage('');
                            setCheckIn(newCheckIn);
                            if (newCheckIn >= checkOut) {
                              setCheckOut(isHero ? '' : addDaysToIsoDate(newCheckIn, 1));
                            }
                          }}
                          onRangeChange={(newCheckIn, newCheckOut) => {
                            setSearchValidationMessage('');
                            setCheckIn(newCheckIn);
                            setCheckOut(newCheckOut);
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Departure / Checkout */}
                  {!surpriseMe && !isHero && (
                    <div
                      className={`${isHero ? 'min-w-0' : 'min-w-0 lg:col-span-3 [@media(min-width:360px)_and_(max-width:639px)_and_(min-height:401px)]:col-span-1 [@media(max-width:639px)_and_(max-height:400px)]:col-span-1'}`}
                    >
                      {!isHero && (
                        <span
                          aria-hidden="true"
                          className="mb-1.5 block truncate text-xs font-extrabold uppercase tracking-wider text-neutral-800 [@media(max-width:639px)_and_(max-height:400px)]:hidden"
                        >
                          <span className="max-[400px]:hidden">Saída (Checkout)</span>
                          <span className="hidden max-[400px]:inline">Saída</span>
                        </span>
                      )}
                      <div className="relative group">
                        <div
                          className={`${isHero ? 'hidden' : 'pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-3.5 text-neutral-500 group-focus-within:text-orange-600'}`}
                        >
                          <CalendarIcon className="w-4 h-4 flex-shrink-0" />
                        </div>
                        <LiquidDatePicker
                          label="Saída (Checkout)"
                          hero={isHero}
                          emptyLabel={isHero ? 'Saída' : undefined}
                          value={checkOut}
                          minDate={checkIn ? addDaysToIsoDate(checkIn, 1) : today}
                          isOpen={activeDatePicker === 'checkOut'}
                          onOpen={() => {
                            setActiveDropdown(null);
                            setActiveDatePicker('checkOut');
                          }}
                          onClose={() => {
                            setActiveDatePicker(null);
                          }}
                          onChange={(newCheckOut) => {
                            setSearchValidationMessage('');
                            setCheckOut(newCheckOut);
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Guest Count (Persons: 1 to 17) */}
            <div
              data-search-segment={isHero ? 'guests' : undefined}
              data-search-active={isHero && activeDropdown === 'guests' ? 'true' : undefined}
              className={`${isHero ? 'flex min-w-0 items-center gap-3 px-3 py-2 sm:px-4' : `${surpriseMe ? 'lg:col-span-4' : 'lg:col-span-3'} min-w-0 [@media(min-width:360px)_and_(max-width:639px)_and_(min-height:401px)]:col-span-2 [@media(max-width:639px)_and_(max-height:400px)]:col-span-1`}`}
            >
              <span
                id={`${fieldId}-guests-label`}
                className={`mb-1.5 block truncate text-xs font-extrabold text-neutral-800 ${isHero ? 'normal-case tracking-normal' : 'uppercase tracking-wider [@media(max-width:639px)_and_(max-height:400px)]:sr-only'}`}
              >
                {isHero ? 'Quem' : 'Hóspedes'}
              </span>
              <div
                className={`relative min-w-0 flex-1 ${isHero ? '' : ''}`}
                data-guest-picker={isHero ? '' : undefined}
              >
                {!isHero && (
                  <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-3.5 text-neutral-500">
                    <Users className="w-4 h-4 text-orange-600 flex-shrink-0" />
                  </div>
                )}
                {isHero ? (
                  <>
                    <button
                      ref={guestTriggerRef}
                      type="button"
                      aria-haspopup="dialog"
                      aria-expanded={activeDropdown === 'guests'}
                      aria-label={`Quem: ${selectedGuestLabel || '1 Pessoa'}`}
                      onClick={() => {
                        setActiveDatePicker(null);
                        setActiveDropdown(activeDropdown === 'guests' ? null : 'guests');
                      }}
                      className="flex min-h-8 w-full items-center rounded-xl text-left text-[length:var(--search-date-value-font-size)] text-neutral-700 transition hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                    >
                      {selectedGuestLabel || '1 Pessoa'}
                    </button>
                  </>
                ) : (
                  <LiquidSelect
                    labelId={`${fieldId}-guests-label`}
                    value={persons}
                    selectedLabel={selectedGuestLabel}
                    placeholder="Hóspedes"
                    options={guestOptions}
                    isOpen={activeDropdown === 'guests'}
                    onOpen={() => {
                      setActiveDatePicker(null);
                      setActiveDropdown('guests');
                    }}
                    onClose={() => setActiveDropdown(null)}
                    onChange={(option) => {
                      if (option.value) setPersons(option.value);
                    }}
                  />
                )}
              </div>
              {isHero && (
                <button
                  type="submit"
                  aria-label="Buscar hospedagens"
                  className={`flex h-12 shrink-0 items-center justify-center rounded-full bg-orange-600 text-white transition-all hover:bg-orange-700 active:scale-95 ${activeDropdown || activeDatePicker ? 'w-auto gap-2 px-4' : 'w-12'}`}
                >
                  <Search className="h-5 w-5 stroke-[2.5]" aria-hidden="true" />
                  <span
                    className={activeDropdown || activeDatePicker ? 'text-sm font-bold' : 'sr-only'}
                  >
                    Buscar
                  </span>
                </button>
              )}
            </div>
          </div>

          {searchValidationMessage && (
            <p role="alert" className="text-sm font-semibold text-rose-800">
              {searchValidationMessage}
            </p>
          )}

          {/* Action Row */}
          <div
            data-search-action={isHero ? '' : undefined}
            className={`${isHero ? 'hidden' : 'flex flex-col items-center justify-between gap-3 pt-2 sm:flex-row [@media(max-width:639px)_and_(max-height:400px)]:gap-1 [@media(max-width:639px)_and_(max-height:400px)]:pt-1 [@media(max-width:479px)_and_(max-height:400px)]:-mt-2 [@media(max-width:479px)_and_(max-height:400px)]:pt-0'}`}
          >
            <div
              className={
                isHero
                  ? 'hidden'
                  : 'flex items-center gap-2 text-xs font-medium text-neutral-700 [@media(max-width:639px)_and_(max-height:400px)]:hidden'
              }
            >
              <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>
                Escolha as datas para conferir preço e disponibilidade; reserve no checkout seguro.
              </span>
            </div>

            <div
              className={
                isHero
                  ? 'contents'
                  : 'flex w-full items-center gap-2 sm:w-auto [@media(max-width:639px)_and_(max-height:400px)]:w-full'
              }
            >
              <button
                type="submit"
                className={`${isHero ? 'min-h-11 w-full rounded-full bg-orange-600 px-6 text-sm font-bold text-white shadow-sm transition hover:bg-orange-700 active:scale-95 sm:w-auto' : 'flex min-h-11 w-full cursor-pointer items-center justify-center gap-2.5 whitespace-nowrap rounded-2xl px-2 py-3 text-sm font-extrabold text-white shadow-md shadow-orange-500/30 transition-all hover:scale-[1.02] active:scale-[0.98] liquid-glass-accent sm:w-auto sm:px-8 sm:py-3.5 [@media(max-width:639px)_and_(max-height:400px)]:text-xs'}`}
              >
                {surpriseMe ? (
                  <Sparkles className="w-4 h-4 stroke-[2.5]" />
                ) : (
                  <Search className="w-4 h-4 stroke-[2.5]" />
                )}
                <span>
                  {surpriseMe ? 'Surpreenda-me' : isHero ? 'Buscar' : 'Pesquisar Disponibilidade'}
                </span>
              </button>
            </div>
          </div>
        </form>
        {isHero &&
          sharedPanelVisible &&
          createPortal(
            <div
              ref={sharedPanelRef}
              data-dialog-focus-portal
              aria-hidden={!activeDropdown && !activeDatePicker}
              inert={!activeDropdown && !activeDatePicker}
              role="dialog"
              tabIndex={-1}
              aria-label={
                activeDropdown === 'resort'
                  ? 'Escolher condomínio'
                  : activeDropdown === 'guests'
                    ? 'Selecionar hóspedes'
                    : 'Calendário de entrada (check-in)'
              }
              className={`search-shared-panel fixed z-[1000] overflow-hidden rounded-3xl border border-white/90 bg-white/90 p-4 text-neutral-800 shadow-[0_20px_60px_-16px_rgba(15,23,42,0.28)] backdrop-blur-2xl [@media(max-width:639px)]:p-3 ${!activeDropdown && !activeDatePicker ? 'search-shared-panel--closing' : ''}`}
              style={{
                left: sharedPanelPosition.left,
                top: sharedPanelPosition.top,
                width: sharedPanelPosition.width,
                height: sharedPanelPosition.height,
              }}
            >
              {activeDropdown === 'resort' && (
                <div className="h-full overflow-hidden">
                  <label className="sr-only" htmlFor={`${fieldId}-resorts-query`}>
                    Buscar condomínio
                  </label>
                  <input
                    id={`${fieldId}-resorts-query`}
                    aria-label="Buscar condomínio"
                    value={sharedResortQuery}
                    onChange={(event) => setSharedResortQuery(event.target.value)}
                    placeholder="Buscar condomínio..."
                    className="mb-2 min-h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-orange-500"
                  />
                  <div
                    role="listbox"
                    aria-label="Opções disponíveis"
                    className="max-h-[calc(100%-3.5rem)] overflow-y-auto"
                  >
                    {resortOptions
                      .filter(
                        (option) =>
                          !sharedResortQuery ||
                          option.label
                            .normalize('NFD')
                            .replace(/[\u0300-\u036f]/g, '')
                            .toLocaleLowerCase('pt-BR')
                            .includes(
                              sharedResortQuery
                                .normalize('NFD')
                                .replace(/[\u0300-\u036f]/g, '')
                                .toLocaleLowerCase('pt-BR'),
                            ),
                      )
                      .map((option) => (
                        <button
                          key={option.value || 'all'}
                          type="button"
                          role="option"
                          aria-selected={selectedResortId === option.value}
                          onClick={() => {
                            setSelectedResortId(option.value);
                            setSelectedResort(option.value ? option.label : '');
                            setSharedResortQuery('');
                            setActiveDropdown(null);
                            setActiveDatePicker('checkIn');
                          }}
                          className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm hover:bg-orange-50"
                        >
                          {option.label}
                        </button>
                      ))}
                  </div>
                </div>
              )}
              {activeDropdown === 'guests' && (
                <GuestCounterList
                  compact
                  counts={guestCounts}
                  onChange={(nextCounts) => {
                    setGuestCounts(nextCounts);
                    setPersons(String(countOccupancyGuests(nextCounts)));
                  }}
                />
              )}
              {!activeDropdown && activeDatePicker && (
                <SharedCalendarContent
                  checkIn={checkIn}
                  checkOut={checkOut}
                  today={today}
                  dateFlexibility={dateFlexibility}
                  onFlexibilityChange={setDateFlexibility}
                  onSelectRange={(newCheckIn, newCheckOut) => {
                    setSearchValidationMessage('');
                    setCheckIn(newCheckIn);
                    setCheckOut(newCheckOut);
                    setActiveDatePicker(null);
                    document
                      .querySelector<HTMLButtonElement>('[data-search-segment="when"] button')
                      ?.focus();
                  }}
                />
              )}
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
};
