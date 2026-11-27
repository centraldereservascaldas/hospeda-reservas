import React, { useEffect, useId, useRef, useState } from 'react';
import { X, Search, MapPin, Sparkles } from 'lucide-react';
import { SearchFilters } from '../../types';
import { crcnBackendApi } from '../../services/crcnBackendApi';
import { StaysSearchWidget, toBrDate } from './StaysSearchWidget';
import { useDialogFocus } from '../useDialogFocus';
import { countOccupancyGuests } from '../../utils/guestCounts';
import { matchesMediaQuery } from '../../utils/motion';
import { GuestCounterList } from './GuestCounterList';
import { CalendarMonthGrid } from './CalendarMonthGrid';
import { focusWithoutScrolling } from '../../utils/focus';

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
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
    dateFlexibility?: 0 | 1 | 2;
    guests?: SearchFilters['guests'];
    destination?: string;
    propertyId?: string;
    surpriseMe?: boolean;
  }) => void;
}

const MAX_SEARCH_CALENDAR_MONTHS = 12;

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
  const dateButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const shouldFocusDateRef = useRef(false);
  const mobileDestinationInputRef = useRef<HTMLInputElement>(null);
  const mobileCalendarScrollRef = useRef<HTMLDivElement>(null);
  const mobileCalendarSentinelRef = useRef<HTMLDivElement>(null);
  const dialogRef = useDialogFocus(isOpen, onClose, { initialFocusRef: closeButtonRef });
  const focusRing =
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600';
  const [activeTab, setActiveTab] = useState<'destination' | 'dates' | 'guests' | 'stays_engine'>(
    'destination',
  );
  const [displayedTab, setDisplayedTab] = useState(activeTab);
  const previousDisplayedTabRef = useRef(displayedTab);
  const [destination, setDestination] = useState(filters.destination);
  const [resorts, setResorts] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    crcnBackendApi
      .getResorts()
      .then((items) => {
        if (active) setResorts(items);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isOpen]);
  const [checkIn, setCheckIn] = useState(filters.checkIn);
  const [checkOut, setCheckOut] = useState(filters.checkOut);
  const [focusDate, setFocusDate] = useState(() => {
    const today = toLocalIsoDate(new Date());
    return filters.checkIn >= today ? filters.checkIn : today;
  });
  const [dateFlexibility, setDateFlexibility] = useState<0 | 1 | 2>(filters.dateFlexibility ?? 0);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = filters.checkIn ? new Date(`${filters.checkIn}T12:00:00`) : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [mobileMonthCount, setMobileMonthCount] = useState(2);
  const [adults, setAdults] = useState(filters.guests.adults);
  const [children, setChildren] = useState(filters.guests.children);
  const [infants, setInfants] = useState(filters.guests.infants);
  const [pets, setPets] = useState(filters.guests.pets);
  const [searchError, setSearchError] = useState('');
  const [mobile, setMobile] = useState(() => matchesMediaQuery('(max-width: 639px)'));
  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 639px)');
    if (!media) return;
    const update = () => setMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const todayIso = toLocalIsoDate(new Date());
  const today = new Date(`${todayIso}T12:00:00`);
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthOffsetFromCurrent = Math.max(
    0,
    (visibleMonth.getFullYear() - currentMonth.getFullYear()) * 12 +
      visibleMonth.getMonth() -
      currentMonth.getMonth(),
  );
  const maxCalendarMonths = Math.max(1, MAX_SEARCH_CALENDAR_MONTHS - monthOffsetFromCurrent);
  const totalGuests = countOccupancyGuests({ adults, children, infants });
  const tabs = [
    { id: 'destination', label: 'Destino' },
    { id: 'dates', label: 'Datas' },
    { id: 'guests', label: `Hóspedes${totalGuests > 1 ? ` (${totalGuests})` : ''}` },
    { id: 'stays_engine', label: 'Surpreenda-me' },
  ] as const;

  const getFocusableDate = (monthOffset: number): string | undefined => {
    const month = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + monthOffset, 1);
    const monthPrefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-`;
    if (focusDate.startsWith(monthPrefix) && focusDate >= todayIso) return focusDate;
    if (checkIn.startsWith(monthPrefix) && checkIn >= todayIso) return checkIn;
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, index) =>
      toLocalIsoDate(new Date(month.getFullYear(), month.getMonth(), index + 1)),
    ).find((date) => date >= todayIso);
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
    const nextDate = toLocalIsoDate(candidate);
    if (nextDate < todayIso) return;

    shouldFocusDateRef.current = true;
    setFocusDate(nextDate);
    const monthDifference =
      (candidate.getFullYear() - visibleMonth.getFullYear()) * 12 +
      candidate.getMonth() -
      visibleMonth.getMonth();
    if (monthDifference < 0 || monthDifference >= (mobile ? mobileMonthCount : 2)) {
      setVisibleMonth(new Date(candidate.getFullYear(), candidate.getMonth(), 1));
    }
  };

  useEffect(() => {
    if (!shouldFocusDateRef.current) return;
    const button = dateButtonRefs.current.get(focusDate);
    if (!isOpen || activeTab !== 'dates' || !button) return;

    const frame = window.requestAnimationFrame(() => {
      shouldFocusDateRef.current = false;
      button.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, focusDate, isOpen, mobile, visibleMonth]);

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
    setDisplayedTab(nextTab.id);
    tabListRef.current
      ?.querySelector<HTMLButtonElement>(`[data-search-tab="${nextTab.id}"]`)
      ?.focus();
  };

  const transitionToTab = (nextTab: typeof activeTab) => {
    setActiveTab(nextTab);
    setDisplayedTab(nextTab);
  };

  useEffect(() => {
    if (!isOpen) return;
    const selectedDate = filters.checkIn ? new Date(`${filters.checkIn}T12:00:00`) : new Date();
    const firstVisibleDate =
      selectedDate < new Date(`${todayIso}T12:00:00`) ? new Date() : selectedDate;
    setVisibleMonth(new Date(firstVisibleDate.getFullYear(), firstVisibleDate.getMonth(), 1));
    setMobileMonthCount(2);
    setDestination(filters.destination);
    setCheckIn(filters.checkIn);
    setCheckOut(filters.checkOut);
    setFocusDate(filters.checkIn >= todayIso ? filters.checkIn : todayIso);
    setDateFlexibility(filters.dateFlexibility ?? 0);
    setAdults(filters.guests.adults);
    setChildren(filters.guests.children);
    setInfants(filters.guests.infants);
    setPets(filters.guests.pets);
  }, [filters, isOpen, todayIso]);

  useEffect(() => {
    if (!isOpen || !tabPanelRef.current) return;

    tabPanelRef.current.scrollTop = 0;
    setDisplayedTab(activeTab);
  }, [activeTab, isOpen]);

  useEffect(() => {
    const previousDisplayedTab = previousDisplayedTabRef.current;
    previousDisplayedTabRef.current = displayedTab;
    if (!isOpen || !mobile || previousDisplayedTab === displayedTab) return;

    const frame = window.requestAnimationFrame(() => {
      const target =
        displayedTab === 'destination'
          ? mobileDestinationInputRef.current
          : displayedTab === 'dates'
            ? (dateButtonRefs.current.get(focusDate) ??
              dialogRef.current?.querySelector<HTMLButtonElement>(
                'button[data-calendar-day]:not(:disabled)[tabindex="0"]',
              ))
            : displayedTab === 'guests'
              ? dialogRef.current?.querySelector<HTMLButtonElement>(
                  '[aria-label^="Aumentar "]:not(:disabled), [aria-label^="Diminuir "]:not(:disabled)',
                )
              : null;

      focusWithoutScrolling(target ?? null);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [dialogRef, displayedTab, focusDate, isOpen, mobile]);

  useEffect(() => {
    if (!isOpen || !mobile || activeTab !== 'dates' || !('IntersectionObserver' in window)) return;
    if (mobileMonthCount >= maxCalendarMonths) return;

    const scrollRoot = mobileCalendarScrollRef.current;
    const sentinel = mobileCalendarSentinelRef.current;
    if (!scrollRoot || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMobileMonthCount((count) => Math.min(count + 2, maxCalendarMonths));
        }
      },
      { root: scrollRoot, rootMargin: '0px 0px 180px 0px' },
    );
    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [activeTab, isOpen, maxCalendarMonths, mobile, mobileMonthCount]);

  if (!isOpen) return null;

  const normalizedQuery = destination
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  const popularDestinations = resorts
    .map((resort) => {
      const name = resort.name.replace(/^CRCN\s*[-–]\s*/i, '');
      return { name, subtitle: 'Condomínio', query: resort.name };
    })
    .filter((item) => {
      const normalizedName = item.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      const normalizedDestination = item.query
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

      return (
        !normalizedQuery ||
        normalizedName.includes(normalizedQuery) ||
        normalizedDestination.includes(normalizedQuery)
      );
    })
    .slice(0, 8);

  const handleApply = () => {
    const hasPartialDateRange = Boolean(checkIn) !== Boolean(checkOut);
    const hasInvalidDateRange = Boolean(
      checkIn && (checkIn < todayIso || (checkOut && checkOut <= checkIn)),
    );
    if (hasPartialDateRange || hasInvalidDateRange) {
      setSearchError('Escolha datas futuras e um check-out posterior ao check-in.');
      transitionToTab('dates');
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
      dateFlexibility,
      guests,
    });
    onSearchInApp({
      checkIn,
      checkOut,
      persons: Math.max(1, totalGuests),
      dateFlexibility,
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
    setDateFlexibility(0);
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

  const renderDateCalendar = () => (
    <div
      className={`grid items-start gap-2 sm:gap-3 ${mobile ? 'grid-cols-1' : 'grid-cols-[2.75rem_minmax(0,1fr)_2.75rem]'}`}
    >
      {!mobile && (
        <button
          type="button"
          aria-label="Mês anterior"
          onClick={() =>
            setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))
          }
          disabled={visibleMonth <= currentMonth}
          className="mt-8 flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span aria-hidden="true">‹</span>
        </button>
      )}
      <div
        ref={mobile ? mobileCalendarScrollRef : undefined}
        className={`grid min-w-0 grid-cols-1 gap-6 ${mobile ? 'h-[58dvh] min-h-0 overflow-y-auto overscroll-contain touch-pan-y' : 'sm:grid-cols-2'}`}
      >
        {Array.from({ length: mobile ? mobileMonthCount : 2 }, (_, offset) => (
          <CalendarMonthGrid
            key={`${visibleMonth.getFullYear()}-${visibleMonth.getMonth() + offset}`}
            month={new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1)}
            minDate={todayIso}
            selectedStart={checkIn}
            selectedEnd={checkOut}
            pendingStart={checkIn && !checkOut ? checkIn : null}
            focusDate={getFocusableDate(offset)}
            registerDateButton={(date) => (button) => {
              if (button) dateButtonRefs.current.set(date, button);
              else dateButtonRefs.current.delete(date);
            }}
            onDateKeyDown={handleDateKeyDown}
            onSelectDate={(date) => {
              if (!checkIn || checkOut || date <= checkIn) {
                setCheckIn(date);
                setCheckOut('');
              } else {
                setCheckOut(date);
              }
              setSearchError('');
              setFocusDate(date);
            }}
          />
        ))}
        {mobile && mobileMonthCount < maxCalendarMonths && (
          <div ref={mobileCalendarSentinelRef} aria-hidden="true" className="h-1" />
        )}
      </div>
      {!mobile && (
        <button
          type="button"
          aria-label="Próximo mês"
          onClick={() =>
            setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))
          }
          disabled={monthOffsetFromCurrent >= MAX_SEARCH_CALENDAR_MONTHS - 1}
          className="mt-8 flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span aria-hidden="true">›</span>
        </button>
      )}
    </div>
  );

  if (mobile) {
    const steps = [
      { id: 'destination' as const, label: 'Onde', summary: destination || 'Todos os condomínios' },
      {
        id: 'dates' as const,
        label: 'Quando',
        summary:
          checkIn && checkOut ? `${toBrDate(checkIn)} - ${toBrDate(checkOut)}` : 'Adicionar datas',
      },
      {
        id: 'guests' as const,
        label: 'Quem',
        summary: `${totalGuests} ${totalGuests === 1 ? 'hóspede' : 'hóspedes'}${pets ? ` · ${pets} pet${pets === 1 ? '' : 's'}` : ''}`,
      },
    ];
    return (
      <div className="fixed inset-0 z-[100] bg-neutral-100">
        <div
          ref={dialogRef}
          data-dialog-focus-root
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${fieldId}-mobile-title`}
          tabIndex={-1}
          className="flex h-dvh flex-col"
        >
          <header className="flex h-20 shrink-0 items-center justify-between px-5">
            <h2 id={`${fieldId}-mobile-title`} className="text-base font-bold">
              Buscar hospedagens
            </h2>
            <button
              ref={closeButtonRef}
              type="button"
              aria-label="Fechar busca de hospedagens"
              onClick={onClose}
              className={`flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 bg-white shadow-sm ${focusRing}`}
            >
              <X className="h-5 w-5" />
            </button>
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-4">
            {steps.map((step) =>
              displayedTab === step.id ? (
                <section
                  key={step.id}
                  className="min-h-0 shrink-0 rounded-3xl bg-white p-6 shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
                >
                  <h3 className="mb-5 text-2xl font-bold">{step.label}?</h3>
                  {step.id === 'destination' && (
                    <div className="space-y-4">
                      <label className="sr-only" htmlFor={`${fieldId}-mobile-destination`}>
                        Buscar condomínio ou destino
                      </label>
                      <input
                        ref={mobileDestinationInputRef}
                        id={`${fieldId}-mobile-destination`}
                        value={destination}
                        onChange={(event) => setDestination(event.target.value)}
                        placeholder="Buscar condomínio ou destino"
                        className="min-h-14 w-full rounded-xl border border-neutral-300 px-4 text-sm focus-visible:outline-2 focus-visible:outline-orange-600"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setDestination('');
                          transitionToTab('dates');
                        }}
                        className="flex min-h-14 w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-orange-600"
                      >
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                          <MapPin className="h-5 w-5" />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold">Todos os condomínios</span>
                          <span className="block text-xs text-neutral-500">
                            Buscar em todos os empreendimentos
                          </span>
                        </span>
                      </button>
                      <p className="text-sm font-semibold">
                        {normalizedQuery ? 'Resultados da busca' : 'Destinos sugeridos'}
                      </p>
                      <div className="space-y-1">
                        {popularDestinations.length > 0 ? (
                          popularDestinations.map((item) => (
                            <button
                              key={item.name}
                              type="button"
                              onClick={() => {
                                setDestination(item.query);
                                transitionToTab('dates');
                              }}
                              className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-neutral-50"
                            >
                              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                                <MapPin className="h-5 w-5" />
                              </span>
                              <span>
                                <span className="block text-sm font-semibold">{item.name}</span>
                                <span className="block text-xs text-neutral-500">
                                  {item.subtitle}
                                </span>
                              </span>
                            </button>
                          ))
                        ) : normalizedQuery && resorts.length > 0 ? (
                          <p className="px-3 py-2 text-sm text-neutral-500">
                            Nenhum condomínio encontrado. Tente outro nome.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  )}
                  {step.id === 'dates' && (
                    <div>
                      <p className="mb-4 text-sm text-neutral-600">
                        {checkIn && !checkOut ? 'Selecione a saída' : 'Selecione entrada e saída'}
                      </p>
                      <div
                        className="mb-3 flex flex-wrap gap-2"
                        aria-label="Flexibilidade das datas"
                      >
                        {([0, 1, 2] as const).map((days) => (
                          <button
                            key={days}
                            type="button"
                            aria-pressed={dateFlexibility === days}
                            onClick={() => setDateFlexibility(days)}
                            className={`rounded-full border px-4 py-2 text-sm ${dateFlexibility === days ? 'border-neutral-900' : 'border-neutral-300'}`}
                          >
                            {days === 0
                              ? 'Datas exatas'
                              : `± ${days} ${days === 1 ? 'dia' : 'dias'}`}
                          </button>
                        ))}
                      </div>
                      {renderDateCalendar()}
                      {searchError && (
                        <p role="alert" className="text-sm text-red-700">
                          {searchError}
                        </p>
                      )}
                    </div>
                  )}
                  {step.id === 'guests' && (
                    <GuestCounterList
                      counts={{ adults, children, infants, pets }}
                      onChange={(counts) => {
                        setAdults(counts.adults);
                        setChildren(counts.children);
                        setInfants(counts.infants);
                        setPets(counts.pets);
                      }}
                    />
                  )}
                </section>
              ) : (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => transitionToTab(step.id)}
                  className="flex min-h-14 shrink-0 items-center justify-between gap-4 rounded-2xl bg-white px-6 text-sm shadow-sm"
                >
                  <span className="text-neutral-500">{step.label}</span>
                  <span className="truncate font-semibold">{step.summary}</span>
                </button>
              ),
            )}
          </div>
          <footer className="flex min-h-[88px] shrink-0 items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-100 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={handleClear}
              className="min-h-12 px-2 text-sm font-semibold underline"
            >
              Limpar tudo
            </button>
            {activeTab === 'guests' ? (
              <button
                type="button"
                onClick={handleApply}
                className="min-h-14 rounded-xl bg-orange-700 px-8 text-base font-bold text-white shadow-sm"
              >
                Buscar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (activeTab === 'dates' && Boolean(checkIn) !== Boolean(checkOut)) {
                    setSearchError('Escolha a entrada e a saída para continuar.');
                    return;
                  }
                  transitionToTab(activeTab === 'destination' ? 'dates' : 'guests');
                }}
                className="min-h-14 rounded-xl bg-neutral-900 px-8 text-base font-bold text-white shadow-sm"
              >
                Avançar
              </button>
            )}
          </footer>
        </div>
      </div>
    );
  }

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
              onClick={() => transitionToTab('destination')}
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
              onClick={() => transitionToTab('dates')}
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
              onClick={() => transitionToTab('guests')}
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
              onClick={() => transitionToTab('stays_engine')}
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
          className="search-modal-shared-panel search-popover-enter motion-reduce:animate-none p-6 [@media(max-height:400px)]:p-3 overflow-y-auto max-h-[55vh]"
        >
          <div key={displayedTab} className="search-modal-panel-content">
            {/* TAB: BOOKING SEARCH */}
            {displayedTab === 'stays_engine' && (
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
            {displayedTab === 'destination' && (
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
                    {normalizedQuery ? 'Resultados da busca' : 'Destinos em destaque'}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {popularDestinations.length > 0 ? (
                      popularDestinations.map((dest) => (
                        <button
                          key={dest.name}
                          onClick={() => {
                            setDestination(dest.query);
                            transitionToTab('dates');
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
                      ))
                    ) : normalizedQuery && resorts.length > 0 ? (
                      <p className="text-sm text-neutral-500">
                        Nenhum condomínio encontrado. Tente outro nome.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: DATES */}
            {displayedTab === 'dates' && (
              <div className="space-y-6 [@media(max-height:400px)]:space-y-3">
                <h3 className="text-base font-bold text-neutral-900 [@media(max-height:400px)]:sr-only">
                  Selecione as datas da sua estadia
                </h3>

                <div aria-label="Período da hospedagem" className="grid grid-cols-2 gap-3">
                  <div className="min-w-0 rounded-2xl border border-neutral-200 px-4 py-3">
                    <p className="text-[length:var(--search-date-label-font-size)] font-semibold text-neutral-600">
                      Entrada
                    </p>
                    <p className="mt-1 truncate text-[length:var(--search-date-value-font-size)] font-semibold text-neutral-900">
                      {checkIn ? toBrDate(checkIn) : 'Adicionar data'}
                    </p>
                  </div>
                  <div className="min-w-0 rounded-2xl border border-neutral-200 px-4 py-3">
                    <p className="text-[length:var(--search-date-label-font-size)] font-semibold text-neutral-600">
                      Saída
                    </p>
                    <p className="mt-1 truncate text-[length:var(--search-date-value-font-size)] font-semibold text-neutral-900">
                      {checkOut ? toBrDate(checkOut) : 'Adicionar data'}
                    </p>
                  </div>
                </div>

                {renderDateCalendar()}

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
            {displayedTab === 'guests' && (
              <GuestCounterList
                counts={{ adults, children, infants, pets }}
                onChange={(counts) => {
                  setAdults(counts.adults);
                  setChildren(counts.children);
                  setInfants(counts.infants);
                  setPets(counts.pets);
                }}
              />
            )}
          </div>
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
          </div>

          <button
            onClick={handleApply}
            aria-label="Buscar Reserva"
            className={`min-h-11 w-full [@media(max-height:400px)]:w-auto [@media(max-height:400px)]:min-w-0 [@media(max-height:400px)]:flex-1 [@media(max-height:400px)]:px-2 sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-orange-700 to-amber-700 text-white text-sm font-bold shadow-md shadow-orange-500/30 hover:shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer border border-white/20 ${focusRing}`}
          >
            <Search className="w-4 h-4 stroke-[2.5]" />
            <span className="[@media(max-height:400px)]:hidden">Buscar Reserva</span>
            <span className="hidden [@media(max-height:400px)]:inline">Buscar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
