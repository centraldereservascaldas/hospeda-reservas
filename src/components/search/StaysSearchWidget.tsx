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
import { SearchFilters } from '../../types';
import { crcnBackendApi } from '../../services/crcnBackendApi';
import { countOccupancyGuests } from '../../utils/guestCounts';
import { emitFunnelEvent } from '../../utils/measurementEvents';

interface StaysSearchWidgetProps {
  onSearchInApp: (searchParams: {
    checkIn: string;
    checkOut: string;
    persons: number;
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
  value: string;
  minDate: string;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChange: (value: string) => void;
  onRangeChange?: (checkIn: string, checkOut: string) => void;
}

const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const addDaysToIsoDate = (dateValue: string, days: number) => {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + days);
  return isoDate(date);
};

const LiquidDatePicker: React.FC<LiquidDatePickerProps> = ({
  label,
  value,
  minDate,
  isOpen,
  onOpen,
  onClose,
  onChange,
  onRangeChange,
}) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dateButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const touchRangeRef = useRef<{ pointerId: number; checkIn: string; checkOut: string } | null>(
    null,
  );
  const suppressClickDatesRef = useRef<string[]>([]);
  const [keyboardFocusDate, setKeyboardFocusDate] = useState<string | null>(null);
  const [touchRangePreview, setTouchRangePreview] = useState<{
    checkIn: string;
    checkOut: string;
  } | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = value ? new Date(`${value}T12:00:00`) : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [position, setPosition] = useState({ left: 8, top: 8, width: 320, maxHeight: 440 });

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gutter = window.innerWidth <= 336 ? 0 : 8;
    const width = Math.min(320, window.innerWidth - gutter * 2);
    const maxHeight = Math.max(0, window.innerHeight - 16);
    const height = Math.min(440, maxHeight);
    const left = Math.max(gutter, Math.min(rect.left, window.innerWidth - width - gutter));
    const below = rect.bottom + 8;
    const top = below + height <= window.innerHeight ? below : Math.max(8, rect.top - height - 8);
    setPosition({ left, top, width, maxHeight });
  };

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
    if (!isOpen) return;
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
  }, [isOpen]);

  const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const leadingDays = (monthStart.getDay() + 6) % 7;
  const calendarDays = Array.from(
    { length: 42 },
    (_, index) =>
      new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index - leadingDays + 1),
  );
  const monthTitle = visibleMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const visibleMonthPrefix = `${visibleMonth.getFullYear()}-${String(visibleMonth.getMonth() + 1).padStart(2, '0')}-`;
  const isFocusableDate = (dateValue: string) =>
    dateValue.startsWith(visibleMonthPrefix) && dateValue >= minDate;
  const selectedOrFirstFocusableDate =
    (keyboardFocusDate && isFocusableDate(keyboardFocusDate) ? keyboardFocusDate : '') ||
    (value && isFocusableDate(value) ? value : '') ||
    calendarDays
      .filter((date) => date.getMonth() === visibleMonth.getMonth())
      .map(isoDate)
      .find((dateValue) => dateValue >= minDate);

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

  const updateTouchRangePreview = (pointerId: number, dateValue: string) => {
    const drag = touchRangeRef.current;
    if (!drag || drag.pointerId !== pointerId || dateValue < drag.checkIn) return;
    const nextRange = { ...drag, checkOut: dateValue };
    touchRangeRef.current = nextRange;
    setTouchRangePreview(nextRange);
  };

  const handleTouchRangePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (touchRangeRef.current?.pointerId !== event.pointerId) return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-calendar-selectable]');
    const dateValue = target?.dataset.calendarDay;
    if (dateValue && target?.dataset.calendarSelectable === 'true') {
      updateTouchRangePreview(event.pointerId, dateValue);
    }
  };

  const handleTouchRangePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = touchRangeRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-calendar-selectable]');
    const checkOut = target?.dataset.calendarDay;
    if (
      checkOut &&
      target?.dataset.calendarSelectable === 'true' &&
      checkOut > drag.checkIn &&
      onRangeChange
    ) {
      onRangeChange(drag.checkIn, checkOut);
      onClose();
      triggerRef.current?.focus();
      suppressClickDatesRef.current = [drag.checkIn, checkOut];
      window.setTimeout(() => {
        suppressClickDatesRef.current = [];
      }, 0);
    }

    touchRangeRef.current = null;
    setTouchRangePreview(null);
  };

  const clearTouchRange = (event: React.PointerEvent<HTMLDivElement>) => {
    if (touchRangeRef.current?.pointerId !== event.pointerId) return;
    touchRangeRef.current = null;
    setTouchRangePreview(null);
  };

  const shownValue = value
    ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR')
    : 'Selecione a data';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${label} ${shownValue}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => {
          const date = value ? new Date(`${value}T12:00:00`) : new Date();
          setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
          setKeyboardFocusDate(value || null);
          touchRangeRef.current = null;
          setTouchRangePreview(null);
          onOpen();
        }}
        className={`min-h-11 w-full pl-10 pr-3 py-3 liquid-glass-input rounded-2xl border border-white/80 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 text-left text-xs sm:text-sm font-bold text-neutral-900 transition-all outline-none cursor-pointer shadow-xs min-w-0 ${value ? '' : 'text-neutral-400'}`}
      >
        <span aria-hidden="true">
          {value ? (
            shownValue
          ) : (
            <>
              <span className="max-[400px]:hidden">{shownValue}</span>
              <span className="hidden max-[400px]:inline">Escolher data</span>
            </>
          )}
        </span>
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            data-dialog-focus-portal
            role="dialog"
            aria-label={`Calendário de ${label.toLowerCase()}`}
            className="fixed z-[1000] overflow-y-auto overscroll-contain rounded-3xl border border-white/90 bg-white/80 p-4 [@media(max-width:639px)]:p-1 text-neutral-800 shadow-[0_20px_60px_-16px_rgba(15,23,42,0.28)] backdrop-blur-2xl"
            style={{
              left: position.left,
              top: position.top,
              width: position.width,
              maxHeight: position.maxHeight,
            }}
            onPointerMove={handleTouchRangePointerMove}
            onPointerUp={handleTouchRangePointerUp}
            onPointerCancel={clearTouchRange}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onKeyDown={handleCalendarKeyDown}
                onClick={() =>
                  setVisibleMonth(
                    new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1),
                  )
                }
                className="liquid-glass-button flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-700 transition hover:text-orange-600"
                aria-label="Mês anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h3 aria-live="polite" className="text-sm font-extrabold capitalize text-neutral-900">
                {monthTitle}
              </h3>
              <button
                type="button"
                onClick={() =>
                  setVisibleMonth(
                    new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1),
                  )
                }
                className="liquid-glass-button flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-700 transition hover:text-orange-600"
                aria-label="Próximo mês"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div
              role="grid"
              aria-label={`Calendário de ${monthTitle}`}
              style={{ touchAction: onRangeChange ? 'pan-y pinch-zoom' : undefined }}
            >
              <div
                role="row"
                className="mb-1 grid grid-cols-7 text-center text-[11px] font-bold text-neutral-600"
              >
                {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((day) => (
                  <span key={day} role="columnheader" className="py-2">
                    {day}
                  </span>
                ))}
              </div>
              {Array.from({ length: 6 }, (_, weekIndex) => (
                <div
                  key={`week-${weekIndex}`}
                  role="row"
                  className="grid grid-cols-7 gap-0 text-center"
                >
                  {calendarDays.slice(weekIndex * 7, weekIndex * 7 + 7).map((date) => {
                    const dateValue = isoDate(date);
                    const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
                    const isSelected = dateValue === value;
                    const isToday = dateValue === isoDate(new Date());
                    const isBeforeMinimum = dateValue < minDate;
                    const isTouchPreviewDate = Boolean(
                      touchRangePreview &&
                      dateValue >= touchRangePreview.checkIn &&
                      dateValue <= touchRangePreview.checkOut,
                    );
                    return (
                      <div
                        key={dateValue}
                        role="gridcell"
                        aria-selected={isSelected || isTouchPreviewDate}
                        data-calendar-day={dateValue}
                        data-calendar-selectable={isCurrentMonth && !isBeforeMinimum}
                        onPointerDown={(event) => {
                          if (
                            event.pointerType !== 'touch' ||
                            !onRangeChange ||
                            !isCurrentMonth ||
                            isBeforeMinimum
                          ) {
                            return;
                          }
                          if (typeof event.currentTarget.setPointerCapture === 'function') {
                            event.currentTarget.setPointerCapture(event.pointerId);
                          }
                          const range = {
                            pointerId: event.pointerId,
                            checkIn: dateValue,
                            checkOut: dateValue,
                          };
                          touchRangeRef.current = range;
                          setTouchRangePreview(range);
                        }}
                        onPointerEnter={(event) => {
                          if (!isCurrentMonth || isBeforeMinimum) return;
                          updateTouchRangePreview(event.pointerId, dateValue);
                        }}
                        onPointerMove={(event) => {
                          if (!isCurrentMonth || isBeforeMinimum) return;
                          updateTouchRangePreview(event.pointerId, dateValue);
                        }}
                      >
                        <button
                          ref={(button) => {
                            if (button) dateButtonRefs.current.set(dateValue, button);
                            else dateButtonRefs.current.delete(dateValue);
                          }}
                          type="button"
                          disabled={!isCurrentMonth || isBeforeMinimum}
                          onKeyDown={(event) => handleDateKeyDown(event, dateValue)}
                          onClick={() => {
                            if (suppressClickDatesRef.current.includes(dateValue)) {
                              suppressClickDatesRef.current = [];
                              return;
                            }
                            setKeyboardFocusDate(dateValue);
                            onChange(dateValue);
                            onClose();
                            triggerRef.current?.focus();
                          }}
                          aria-label={date.toLocaleDateString('pt-BR', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                          aria-pressed={isSelected}
                          data-calendar-day={dateValue}
                          tabIndex={dateValue === selectedOrFirstFocusableDate ? 0 : -1}
                          className={`aspect-square min-h-11 w-full rounded-xl text-xs font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-600 disabled:cursor-not-allowed ${
                            isSelected
                              ? 'liquid-glass-accent text-white shadow-md'
                              : isTouchPreviewDate
                                ? 'bg-orange-100 text-orange-900'
                                : isCurrentMonth && !isBeforeMinimum
                                  ? `hover:bg-orange-500/15 hover:text-orange-700 ${isToday ? 'ring-1 ring-orange-400/60 text-orange-700' : 'text-neutral-800'}`
                                  : 'text-neutral-600'
                          }`}
                        >
                          {date.getDate()}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-neutral-200/70 pt-3">
              {onRangeChange && (
                <p className="text-[11px] text-neutral-500">
                  No celular, arraste da entrada até a saída.
                </p>
              )}
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
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) setQuery('');
  }, [isOpen]);

  const visibleOptions = options.filter(
    (option) =>
      !query || option.label.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')),
  );
  const currentLabel =
    options.find((option) => option.value === value)?.label || selectedLabel || placeholder;
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

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            data-dialog-focus-portal
            role="group"
            aria-label="Opções de filtro"
            className="fixed z-[1000] overflow-hidden rounded-2xl border border-white/90 bg-white/78 p-2 text-neutral-800 shadow-[0_18px_55px_-16px_rgba(15,23,42,0.24)] backdrop-blur-2xl"
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

export const StaysSearchWidget: React.FC<StaysSearchWidgetProps> = ({
  onSearchInApp,
  currentFilters,
  surpriseMe = false,
  className = '',
  onOpenAssistant,
}) => {
  // Dates in ISO format YYYY-MM-DD for native input
  const today = isoDate(new Date());

  const [checkIn, setCheckIn] = useState<string>(currentFilters?.checkIn || '');
  const [checkOut, setCheckOut] = useState<string>(currentFilters?.checkOut || '');
  const [persons, setPersons] = useState<string>(
    currentFilters?.guests
      ? String(currentFilters.guests.adults + currentFilters.guests.children)
      : '2',
  );
  const [selectedResort, setSelectedResort] = useState<string>(currentFilters?.destination || '');
  const [selectedResortId, setSelectedResortId] = useState<string>(
    currentFilters?.destinationPropertyId || '',
  );
  const fieldId = useId().replace(/:/g, '');
  const [activeDatePicker, setActiveDatePicker] = useState<'checkIn' | 'checkOut' | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<'resort' | 'guests' | null>(null);
  const [resorts, setResorts] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoadingResorts, setIsLoadingResorts] = useState(true);
  const [searchValidationMessage, setSearchValidationMessage] = useState('');
  const hasCurrentFilters = currentFilters !== undefined;
  const syncedCheckIn = currentFilters?.checkIn || '';
  const syncedCheckOut = currentFilters?.checkOut || '';
  const syncedAdults = currentFilters?.guests?.adults;
  const syncedChildren = currentFilters?.guests?.children;
  const hasSyncedGuests = syncedAdults !== undefined && syncedChildren !== undefined;
  const syncedGuestCount = (syncedAdults ?? 0) + (syncedChildren ?? 0);
  const syncedDestination = currentFilters?.destination;
  const syncedDestinationPropertyId = currentFilters?.destinationPropertyId || '';

  // Sync with currentFilters if they change externally
  useEffect(() => {
    if (!hasCurrentFilters) return;
    setCheckIn(syncedCheckIn);
    setCheckOut(syncedCheckOut);
    if (hasSyncedGuests && syncedGuestCount >= 1 && syncedGuestCount <= 17) {
      setPersons(String(syncedGuestCount));
    }
    if (syncedDestination !== undefined) {
      setSelectedResort(syncedDestination);
    }
    setSelectedResortId(syncedDestinationPropertyId);
  }, [
    hasCurrentFilters,
    syncedCheckIn,
    syncedCheckOut,
    hasSyncedGuests,
    syncedGuestCount,
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
    const personCount = parseInt(persons, 10) || 2;
    const currentGuests = currentFilters?.guests;
    const guests = currentGuests
      ? personCount === currentGuests.adults + currentGuests.children
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
      persons: guests ? countOccupancyGuests(guests) : personCount,
      guests,
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
  const selectedGuestOption = guestOptions.find((option) => option.value === persons);
  const selectedGuestLabel = selectedGuestOption
    ? currentFilters?.guests.infants
      ? `${selectedGuestOption.label} + ${currentFilters.guests.infants} bebê${currentFilters.guests.infants === 1 ? '' : 's'}`
      : selectedGuestOption.label
    : undefined;

  return (
    <div className={`w-full transition-all ${className}`}>
      {/* Container in Liquid Glass */}
      <div className="relative rounded-3xl liquid-glass-card border border-white/85 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.07)] p-4 sm:p-7 max-[400px]:p-3 [@media(max-height:400px)]:p-0">
        {/* Search widget heading */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 sm:mb-5 pb-3 border-b border-white/60 sm:pb-3.5 max-[400px]:gap-2 max-[400px]:mb-2 max-[400px]:pb-2 [@media(max-height:400px)]:hidden">
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
          onSubmit={handleSubmit}
          className="space-y-3 sm:space-y-4"
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 sm:gap-4 items-center max-[400px]:gap-y-0 [@media(min-width:360px)_and_(max-width:639px)_and_(min-height:401px)]:grid-cols-2 [@media(max-width:479px)_and_(max-height:400px)]:grid-cols-2 [@media(min-width:480px)_and_(max-width:639px)_and_(max-height:400px)]:grid-cols-4 [@media(max-width:639px)_and_(max-height:400px)]:gap-1 [@media(max-width:479px)_and_(max-height:400px)]:gap-0">
            {/* Resort / Destination Selector */}
            {!surpriseMe && (
              <div className="lg:col-span-3 min-w-0 [@media(min-width:360px)_and_(max-width:639px)_and_(min-height:401px)]:col-span-2 [@media(max-width:639px)_and_(max-height:400px)]:col-span-1">
                <span
                  id={`${fieldId}-resort-label`}
                  className="mb-1.5 block truncate text-xs font-extrabold uppercase tracking-wider text-neutral-800 [@media(max-width:639px)_and_(max-height:400px)]:sr-only"
                >
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
                    message={
                      isLoadingResorts
                        ? 'Carregando condomínios da Stays...'
                        : 'Não foi possível carregar os condomínios agora.'
                    }
                    isOpen={activeDropdown === 'resort'}
                    onOpen={() => setActiveDropdown('resort')}
                    onClose={() => setActiveDropdown(null)}
                    onChange={(option) => {
                      setSelectedResortId(option.value);
                      setSelectedResort(option.value ? option.label : '');
                    }}
                  />
                </div>
              </div>
            )}

            {/* Arrival / Check-in */}
            {!surpriseMe && (
              <div className="lg:col-span-3 min-w-0 [@media(min-width:360px)_and_(max-width:639px)_and_(min-height:401px)]:col-span-1 [@media(max-width:639px)_and_(max-height:400px)]:col-span-1">
                <span
                  aria-hidden="true"
                  className="mb-1.5 block truncate text-xs font-extrabold uppercase tracking-wider text-neutral-800 [@media(max-width:639px)_and_(max-height:400px)]:hidden"
                >
                  <span className="max-[400px]:hidden">Entrada (Check-in)</span>
                  <span className="hidden max-[400px]:inline">Entrada</span>
                </span>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 z-10 pl-3.5 flex items-center pointer-events-none text-neutral-500 group-focus-within:text-orange-600">
                    <CalendarIcon className="w-4 h-4 flex-shrink-0" />
                  </div>
                  <LiquidDatePicker
                    label="Entrada (Check-in)"
                    value={checkIn}
                    minDate={today}
                    isOpen={activeDatePicker === 'checkIn'}
                    onOpen={() => setActiveDatePicker('checkIn')}
                    onClose={() => setActiveDatePicker(null)}
                    onChange={(newCheckIn) => {
                      setSearchValidationMessage('');
                      setCheckIn(newCheckIn);
                      if (newCheckIn >= checkOut) {
                        setCheckOut(addDaysToIsoDate(newCheckIn, 1));
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
            {!surpriseMe && (
              <div className="lg:col-span-3 min-w-0 [@media(min-width:360px)_and_(max-width:639px)_and_(min-height:401px)]:col-span-1 [@media(max-width:639px)_and_(max-height:400px)]:col-span-1">
                <span
                  aria-hidden="true"
                  className="mb-1.5 block truncate text-xs font-extrabold uppercase tracking-wider text-neutral-800 [@media(max-width:639px)_and_(max-height:400px)]:hidden"
                >
                  <span className="max-[400px]:hidden">Saída (Checkout)</span>
                  <span className="hidden max-[400px]:inline">Saída</span>
                </span>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 z-10 pl-3.5 flex items-center pointer-events-none text-neutral-500 group-focus-within:text-orange-600">
                    <CalendarIcon className="w-4 h-4 flex-shrink-0" />
                  </div>
                  <LiquidDatePicker
                    label="Saída (Checkout)"
                    value={checkOut}
                    minDate={checkIn ? addDaysToIsoDate(checkIn, 1) : today}
                    isOpen={activeDatePicker === 'checkOut'}
                    onOpen={() => setActiveDatePicker('checkOut')}
                    onClose={() => setActiveDatePicker(null)}
                    onChange={(newCheckOut) => {
                      setSearchValidationMessage('');
                      setCheckOut(newCheckOut);
                    }}
                  />
                </div>
              </div>
            )}

            {/* Guest Count (Persons: 1 to 17) */}
            <div
              className={`${surpriseMe ? 'lg:col-span-4' : 'lg:col-span-3'} min-w-0 [@media(min-width:360px)_and_(max-width:639px)_and_(min-height:401px)]:col-span-2 [@media(max-width:639px)_and_(max-height:400px)]:col-span-1`}
            >
              <span
                id={`${fieldId}-guests-label`}
                className="mb-1.5 block truncate text-xs font-extrabold uppercase tracking-wider text-neutral-800 [@media(max-width:639px)_and_(max-height:400px)]:sr-only"
              >
                Hóspedes
              </span>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 z-10 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                  <Users className="w-4 h-4 text-orange-600 flex-shrink-0" />
                </div>
                <LiquidSelect
                  labelId={`${fieldId}-guests-label`}
                  value={persons}
                  selectedLabel={selectedGuestLabel}
                  placeholder="Hóspedes"
                  options={guestOptions}
                  isOpen={activeDropdown === 'guests'}
                  onOpen={() => setActiveDropdown('guests')}
                  onClose={() => setActiveDropdown(null)}
                  onChange={(option) => {
                    if (option.value) setPersons(option.value);
                  }}
                />
              </div>
            </div>
          </div>

          {searchValidationMessage && (
            <p role="alert" className="text-sm font-semibold text-rose-800">
              {searchValidationMessage}
            </p>
          )}

          {/* Action Row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 [@media(max-width:639px)_and_(max-height:400px)]:pt-1 [@media(max-width:479px)_and_(max-height:400px)]:pt-0 [@media(max-width:479px)_and_(max-height:400px)]:-mt-2 [@media(max-width:639px)_and_(max-height:400px)]:gap-1">
            <div className="flex items-center gap-2 text-xs text-neutral-700 font-medium [@media(max-width:639px)_and_(max-height:400px)]:hidden">
              <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>
                Escolha as datas para conferir preço e disponibilidade; reserve no checkout seguro.
              </span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto [@media(max-width:639px)_and_(max-height:400px)]:w-full">
              <button
                type="submit"
                className="min-h-11 w-full whitespace-nowrap sm:w-auto px-2 sm:px-8 py-3 sm:py-3.5 rounded-2xl liquid-glass-accent text-white font-extrabold text-sm shadow-md shadow-orange-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2.5 [@media(max-width:639px)_and_(max-height:400px)]:text-xs"
              >
                {surpriseMe ? (
                  <Sparkles className="w-4 h-4 stroke-[2.5]" />
                ) : (
                  <Search className="w-4 h-4 stroke-[2.5]" />
                )}
                <span>{surpriseMe ? 'Surpreenda-me' : 'Pesquisar Disponibilidade'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
