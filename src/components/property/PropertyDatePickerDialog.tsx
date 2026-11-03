import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { CalendarDayButton } from './CalendarDayButton';
import { CalendarMonthNavigation } from './CalendarMonthNavigation';
import { useDialogFocus } from '../useDialogFocus';
import type { StaysCalendarDay } from '../../utils/staysAvailability';
import {
  isCalendarRangeAvailable,
  isCalendarArrivalAvailable,
  getCalendarDayRestriction,
  validateCalendarRange,
  getCalendarRangeMessage,
} from '../../utils/staysAvailability';

type DateField = 'checkIn' | 'checkOut';

interface PropertyDatePickerDialogProps {
  isOpen: boolean;
  activeDateField: DateField;
  checkIn: string;
  checkOut: string;
  displayedMonth: Date;
  today: Date;
  todayIso: string;
  calendarDays: StaysCalendarDay[];
  isExtendingCalendar: boolean;
  calendarExtensionMessage: string;
  calendarAvailable: boolean;
  isLoadingCalendar: boolean;
  isRefreshingCalendar?: boolean;
  availabilityMessage: string;
  interactionMessage: string;
  onRetryCalendar: () => void;
  onRetryCalendarExtension: () => void;
  onActiveDateFieldChange: (field: DateField) => void;
  onDisplayedMonthChange: (date: Date) => void;
  onChooseDate: (date: Date) => void;
  onChooseDateRange: (checkIn: Date, checkOut: Date) => void;
  onClear?: () => void;
  onApply?: () => void;
  onExplainDate?: (message: string) => void;
  onClose: () => void;
}

export const PropertyDatePickerDialog: React.FC<PropertyDatePickerDialogProps> = ({
  isOpen,
  activeDateField,
  checkIn,
  checkOut,
  displayedMonth,
  today,
  todayIso,
  calendarDays,
  isExtendingCalendar,
  calendarExtensionMessage,
  calendarAvailable,
  isLoadingCalendar,
  isRefreshingCalendar = false,
  availabilityMessage,
  interactionMessage,
  onRetryCalendar,
  onRetryCalendarExtension,
  onActiveDateFieldChange,
  onDisplayedMonthChange,
  onChooseDate,
  onChooseDateRange,
  onClear,
  onApply,
  onExplainDate,
  onClose,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dayButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const [keyboardFocusDate, setKeyboardFocusDate] = useState<string | null>(null);
  const [touchRangePreview, setTouchRangePreview] = useState<{
    pointerId: number;
    checkIn: string;
    checkOut: string;
  } | null>(null);
  const touchRangeRef = useRef<typeof touchRangePreview>(null);
  const suppressClickDatesRef = useRef<string[]>([]);
  const dialogRef = useDialogFocus(isOpen, onClose, { initialFocusRef: closeButtonRef });

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const calendarYear = displayedMonth.getFullYear();
  const calendarMonth = displayedMonth.getMonth();
  const calendarLeadingDays = (new Date(calendarYear, calendarMonth, 1).getDay() + 6) % 7;
  const calendarDaysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const calendarRowCount = Math.ceil((calendarLeadingDays + calendarDaysInMonth) / 7);
  const calendarCells: Array<Date | null> = Array.from(
    { length: calendarRowCount * 7 },
    (_, index) => {
      const dayOfMonth = index - calendarLeadingDays + 1;
      return dayOfMonth > 0 && dayOfMonth <= calendarDaysInMonth
        ? new Date(calendarYear, calendarMonth, dayOfMonth)
        : null;
    },
  );
  const calendarByDate = new Map(calendarDays.map((day) => [day.date, day]));
  const displayedMonthPrefix = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-`;
  const isSelectableDate = (dateValue: string) => {
    const day = calendarByDate.get(dateValue);
    if (dateValue < todayIso || !calendarAvailable || isLoadingCalendar || !day) return false;
    return activeDateField === 'checkIn'
      ? isCalendarArrivalAvailable(day)
      : Boolean(checkIn && isCalendarRangeAvailable(calendarDays, checkIn, dateValue));
  };
  const selectedActiveDate = activeDateField === 'checkIn' ? checkIn : checkOut;
  const focusableCalendarDate =
    (keyboardFocusDate &&
    isSelectableDate(keyboardFocusDate) &&
    keyboardFocusDate.startsWith(displayedMonthPrefix)
      ? keyboardFocusDate
      : '') ||
    (selectedActiveDate &&
    selectedActiveDate.startsWith(displayedMonthPrefix) &&
    isSelectableDate(selectedActiveDate)
      ? selectedActiveDate
      : '') ||
    calendarCells
      .filter((date): date is Date => date !== null)
      .map(
        (date) =>
          `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      )
      .find(isSelectableDate);
  useEffect(() => {
    if (isOpen && keyboardFocusDate) dayButtonRefs.current.get(keyboardFocusDate)?.focus();
  }, [displayedMonth, isOpen, keyboardFocusDate]);

  const handleDateKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, dateValue: string) => {
    const startingDate = new Date(`${dateValue}T12:00:00`);
    if (['Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
      event.preventDefault();
      const candidate = new Date(startingDate);
      if (event.key === 'Home')
        candidate.setDate(candidate.getDate() - ((candidate.getDay() + 6) % 7));
      if (event.key === 'End')
        candidate.setDate(candidate.getDate() + 6 - ((candidate.getDay() + 6) % 7));
      if (event.key === 'PageUp' || event.key === 'PageDown') {
        const day = candidate.getDate();
        candidate.setDate(1);
        candidate.setMonth(candidate.getMonth() + (event.key === 'PageUp' ? -1 : 1));
        candidate.setDate(
          Math.min(day, new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate()),
        );
      }
      const value = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, '0')}-${String(candidate.getDate()).padStart(2, '0')}`;
      if (isSelectableDate(value)) {
        setKeyboardFocusDate(value);
        onDisplayedMonthChange(new Date(candidate.getFullYear(), candidate.getMonth(), 1));
      }
      return;
    }
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
    for (let step = 1; step <= 31; step += 1) {
      const candidate = new Date(startingDate);
      candidate.setDate(candidate.getDate() + dayOffset * step);
      const candidateValue = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, '0')}-${String(candidate.getDate()).padStart(2, '0')}`;
      if (!isSelectableDate(candidateValue)) continue;

      setKeyboardFocusDate(candidateValue);
      if (candidate.getFullYear() !== calendarYear || candidate.getMonth() !== calendarMonth) {
        onDisplayedMonthChange(new Date(candidate.getFullYear(), candidate.getMonth(), 1));
      }
      return;
    }
  };
  const handleTouchRangePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = touchRangeRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-calendar-date]');
    const checkOut = target?.dataset.calendarDate;
    if (checkOut && checkOut !== drag.checkIn) {
      const checkInDate = new Date(`${drag.checkIn}T12:00:00`);
      const checkOutDate = new Date(`${checkOut}T12:00:00`);
      if (Number.isFinite(checkInDate.getTime()) && Number.isFinite(checkOutDate.getTime())) {
        onChooseDateRange(checkInDate, checkOutDate);
        suppressClickDatesRef.current = [drag.checkIn, checkOut];
        window.setTimeout(() => {
          suppressClickDatesRef.current = [];
        }, 0);
      }
    }

    touchRangeRef.current = null;
    setTouchRangePreview(null);
  };

  const handleTouchRangePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (touchRangeRef.current?.pointerId !== event.pointerId) return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-calendar-date]');
    const dateValue = target?.dataset.calendarDate;
    if (dateValue) updateTouchRangePreview(event.pointerId, dateValue);
  };

  const clearTouchRange = (event: React.PointerEvent<HTMLDivElement>) => {
    if (touchRangeRef.current?.pointerId !== event.pointerId) return;
    touchRangeRef.current = null;
    setTouchRangePreview(null);
  };

  const updateTouchRangePreview = (pointerId: number, dateValue: string) => {
    const drag = touchRangeRef.current;
    if (!drag || drag.pointerId !== pointerId || dateValue < drag.checkIn) return;
    const nextDrag = { ...drag, checkOut: dateValue };
    touchRangeRef.current = nextDrag;
    setTouchRangePreview(nextDrag);
  };
  const formatDateLabel = (value: string) =>
    value
      ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
      : 'Selecionar';

  const selectedNights = Math.round(
    (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86400000,
  );

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={dialogRef}
      data-dialog-focus-root
      id="stay-dates-dialog"
      tabIndex={-1}
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-white/25 p-0 backdrop-blur-xl animate-in fade-in duration-150 sm:items-center sm:p-4 [@media(max-height:500px)]:p-0"
      onPointerUp={handleTouchRangePointerUp}
      onPointerMove={handleTouchRangePointerMove}
      onPointerCancel={clearTouchRange}
      role="dialog"
      aria-modal="true"
      aria-labelledby="stay-dates-title"
    >
      <div className="flex h-[100dvh] w-full flex-col bg-white p-3 shadow-2xl sm:my-auto sm:h-auto sm:max-h-[90dvh] sm:max-w-3xl sm:rounded-3xl sm:p-5 [@media(max-height:500px)]:h-[100dvh] [@media(max-height:500px)]:max-h-[100dvh] [@media(max-height:500px)]:py-2">
        <div className="sticky top-0 shrink-0 z-10 -mx-3 mb-4 flex items-center justify-between rounded-t-3xl bg-white/95 px-3 py-2.5 backdrop-blur-2xl sm:-mx-5 sm:px-5 [@media(max-height:500px)]:mb-1 [@media(max-height:500px)]:py-0">
          <div>
            <h2 id="stay-dates-title" className="text-lg font-bold text-neutral-900">
              Escolha as datas
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500 [@media(max-height:500px)]:hidden">
              Selecione entrada e saída da hospedagem
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar calendário"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 transition hover:bg-orange-50 hover:text-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 grid shrink-0 grid-cols-2 gap-2 rounded-2xl bg-orange-50/70 p-1.5 [@media(max-height:500px)]:mb-1">
          <button
            type="button"
            aria-pressed={activeDateField === 'checkIn'}
            onClick={() => onActiveDateFieldChange('checkIn')}
            className={`min-h-11 rounded-xl px-3 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-600 ${activeDateField === 'checkIn' ? 'bg-white text-orange-800 shadow-sm ring-1 ring-orange-100' : 'text-neutral-600 hover:bg-white/60'}`}
          >
            <span className="block text-caption font-bold uppercase tracking-wide">Check-in</span>
            <span className="mt-0.5 block text-xs font-semibold">{formatDateLabel(checkIn)}</span>
          </button>
          <button
            type="button"
            aria-pressed={activeDateField === 'checkOut'}
            onClick={() => onActiveDateFieldChange('checkOut')}
            className={`min-h-11 rounded-xl px-3 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-600 ${activeDateField === 'checkOut' ? 'bg-white text-orange-800 shadow-sm ring-1 ring-orange-100' : 'text-neutral-600 hover:bg-white/60'}`}
          >
            <span className="block text-caption font-bold uppercase tracking-wide">Check-out</span>
            <span className="mt-0.5 block text-xs font-semibold">{formatDateLabel(checkOut)}</span>
          </button>
        </div>

        <CalendarMonthNavigation
          month={displayedMonth}
          earliestMonth={today}
          onMonthChange={onDisplayedMonthChange}
        />

        <div className="-mx-3 min-h-0 flex-1 overflow-y-auto sm:mx-0">
          <div className="grid gap-6 md:grid-cols-2">
            {[0, 1].map((offset) => {
              const monthDate = new Date(calendarYear, calendarMonth + offset, 1);
              const monthLabel = monthDate.toLocaleDateString('pt-BR', {
                month: 'long',
                year: 'numeric',
              });
              const leading = (monthDate.getDay() + 6) % 7;
              const count = new Date(calendarYear, calendarMonth + offset + 1, 0).getDate();
              const cells = Array.from(
                { length: Math.ceil((leading + count) / 7) * 7 },
                (_, index) =>
                  index >= leading && index < leading + count
                    ? new Date(calendarYear, calendarMonth + offset, index - leading + 1)
                    : null,
              );
              const weeks = Array.from({ length: cells.length / 7 }, (_, index) =>
                cells.slice(index * 7, index * 7 + 7),
              );
              return (
                <div key={offset} className={offset ? 'hidden md:block' : ''}>
                  <h3 className="mb-2 text-center font-bold capitalize">{monthLabel}</h3>
                  <div role="grid" aria-label={`Calendário de ${monthLabel}`} className="w-full">
                    <div
                      role="row"
                      className="mb-1 grid grid-cols-7 text-center text-caption font-semibold text-neutral-600"
                    >
                      {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((weekday) => (
                        <span key={weekday} role="columnheader" className="py-2">
                          {weekday}
                        </span>
                      ))}
                    </div>
                    {weeks.map((week, weekIndex) => (
                      <div
                        key={`week-${weekIndex}`}
                        role="row"
                        className="grid grid-cols-7 gap-0 text-center"
                      >
                        {week.map((date, dayIndex) => {
                          if (!date) {
                            return (
                              <div
                                key={`empty-${weekIndex}-${dayIndex}`}
                                role="gridcell"
                                aria-hidden="true"
                                className="h-10"
                              />
                            );
                          }
                          const dateValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                          const calendarDay = calendarByDate.get(dateValue);
                          const dayRestriction = calendarDay
                            ? getCalendarDayRestriction(calendarDay)
                            : null;
                          const isPast = dateValue < todayIso;
                          const isAvailableCheckIn = Boolean(
                            calendarDay && isCalendarArrivalAvailable(calendarDay),
                          );
                          const isAvailableCheckOut = Boolean(
                            checkIn &&
                            dateValue > checkIn &&
                            isCalendarRangeAvailable(calendarDays, checkIn, dateValue),
                          );
                          const isUnavailableForArrival = Boolean(
                            calendarDay && !isCalendarArrivalAvailable(calendarDay),
                          );
                          const isAvailableForActiveField =
                            activeDateField === 'checkIn'
                              ? isAvailableCheckIn
                              : isAvailableCheckOut;
                          const isSelectedCheckIn = dateValue === checkIn && isAvailableCheckIn;
                          const isSelectedCheckOut = dateValue === checkOut && isAvailableCheckOut;
                          const isSelected = isSelectedCheckIn || isSelectedCheckOut;
                          const isSelectedForAnotherField =
                            activeDateField === 'checkIn' ? isSelectedCheckOut : isSelectedCheckIn;
                          const isBlocked = Boolean(
                            !isPast &&
                            !isLoadingCalendar &&
                            calendarDay &&
                            !isAvailableForActiveField &&
                            !isSelectedForAnotherField,
                          );
                          const selectedRangeIsAvailable = Boolean(
                            checkIn &&
                            checkOut &&
                            isCalendarRangeAvailable(calendarDays, checkIn, checkOut),
                          );
                          const isInRange = Boolean(
                            selectedRangeIsAvailable &&
                            checkIn &&
                            checkOut &&
                            dateValue > checkIn &&
                            dateValue < checkOut,
                          );
                          const isDisabled =
                            isPast ||
                            isLoadingCalendar ||
                            !calendarAvailable ||
                            !calendarDay ||
                            !isAvailableForActiveField;
                          const availabilityLabel = isPast
                            ? 'data passada'
                            : isLoadingCalendar
                              ? 'disponibilidade sendo atualizada'
                              : !calendarAvailable || !calendarDay
                                ? 'disponibilidade não confirmada'
                                : dayRestriction
                                  ? `${dayRestriction}${isAvailableCheckOut && activeDateField === 'checkOut' ? '; checkout permitido' : ''}`
                                  : isSelectedForAnotherField
                                    ? `selecionada como ${activeDateField === 'checkIn' ? 'check-out' : 'check-in'}`
                                    : isUnavailableForArrival &&
                                        isSelectedCheckOut &&
                                        isAvailableCheckOut
                                      ? 'indisponível para check-in; checkout permitido'
                                      : isInRange
                                        ? 'noite incluída no período selecionado'
                                        : isBlocked
                                          ? `indisponível para esta seleção; ${activeDateField === 'checkOut' ? getCalendarRangeMessage(validateCalendarRange(calendarDays, checkIn, dateValue)) : calendarDay?.closedToArrival ? 'entrada não permitida' : 'noite indisponível'}`
                                          : isUnavailableForArrival
                                            ? 'indisponível para check-in'
                                            : 'disponível';
                          const shouldShowUnavailableMark =
                            !dayRestriction &&
                            ((isBlocked && !isInRange) ||
                              (isSelectedCheckOut &&
                                isUnavailableForArrival &&
                                isAvailableCheckOut));
                          const isTouchPreviewDate = Boolean(
                            touchRangePreview &&
                            dateValue >= touchRangePreview.checkIn &&
                            dateValue <= touchRangePreview.checkOut,
                          );
                          const isTouchPreviewValid = Boolean(
                            touchRangePreview &&
                            isCalendarRangeAvailable(
                              calendarDays,
                              touchRangePreview.checkIn,
                              touchRangePreview.checkOut,
                            ),
                          );
                          return (
                            <div
                              key={dateValue}
                              role="gridcell"
                              aria-selected={isSelected}
                              data-calendar-date={dateValue}
                              onPointerDown={(event) => {
                                if (event.pointerType !== 'touch' || activeDateField !== 'checkIn')
                                  return;
                                if (!isSelectableDate(dateValue)) return;
                                const drag = {
                                  pointerId: event.pointerId,
                                  checkIn: dateValue,
                                  checkOut: dateValue,
                                };
                                touchRangeRef.current = drag;
                                setTouchRangePreview(drag);
                              }}
                              onPointerEnter={(event) => {
                                updateTouchRangePreview(event.pointerId, dateValue);
                              }}
                              onPointerMove={(event) => {
                                updateTouchRangePreview(event.pointerId, dateValue);
                              }}
                            >
                              <CalendarDayButton
                                key={dateValue}
                                ref={(button) => {
                                  if (button) {
                                    dayButtonRefs.current.set(dateValue, button);
                                  } else {
                                    dayButtonRefs.current.delete(dateValue);
                                  }
                                }}
                                type="button"
                                disabled={
                                  isDisabled &&
                                  !(
                                    dayRestriction &&
                                    !isPast &&
                                    !isLoadingCalendar &&
                                    calendarAvailable
                                  )
                                }
                                aria-disabled={isDisabled || undefined}
                                style={{ touchAction: 'pan-y pinch-zoom' }}
                                onKeyDown={(event) => handleDateKeyDown(event, dateValue)}
                                aria-label={`${date.toLocaleDateString('pt-BR', {
                                  weekday: 'long',
                                  day: 'numeric',
                                  month: 'long',
                                  year: 'numeric',
                                })}, ${availabilityLabel}`}
                                aria-pressed={isSelected}
                                tabIndex={dateValue === focusableCalendarDate ? 0 : -1}
                                onClick={() => {
                                  if (isDisabled) {
                                    if (dayRestriction) onExplainDate?.(dayRestriction);
                                    return;
                                  }
                                  if (suppressClickDatesRef.current.includes(dateValue)) {
                                    suppressClickDatesRef.current = [];
                                    return;
                                  }
                                  setKeyboardFocusDate(dateValue);
                                  onChooseDate(date);
                                }}
                                visualState={{
                                  preview: isTouchPreviewDate
                                    ? isTouchPreviewValid
                                      ? 'valid'
                                      : 'invalid'
                                    : null,
                                  restricted: Boolean(dayRestriction),
                                  blocked: isBlocked,
                                  selected: isSelected,
                                  inRange: isInRange,
                                  disabled:
                                    isPast ||
                                    isLoadingCalendar ||
                                    !calendarDay ||
                                    !isAvailableForActiveField,
                                }}
                                title={availabilityLabel}
                              >
                                {date.getDate()}
                                {shouldShowUnavailableMark && (
                                  <span
                                    aria-hidden="true"
                                    className={`pointer-events-none absolute left-1/2 top-1/2 h-px w-7 -translate-x-1/2 -translate-y-1/2 rotate-[-42deg] ${isSelectedCheckOut ? 'bg-rose-700' : 'bg-rose-500/80'}`}
                                  />
                                )}
                              </CalendarDayButton>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 space-y-3 border-t border-neutral-100 px-3 pt-3 sm:px-0">
            {isLoadingCalendar || isRefreshingCalendar ? (
              <p className="text-center text-caption text-neutral-500" role="status">
                {isRefreshingCalendar
                  ? 'Atualizando disponibilidade. Sua seleção foi preservada.'
                  : 'Atualizando disponibilidade. As datas ficam bloqueadas até a confirmação.'}
              </p>
            ) : !calendarAvailable ? (
              <div className="flex flex-col items-center gap-2">
                <p className="text-center text-caption text-amber-800" role="status">
                  {availabilityMessage ||
                    'Não foi possível confirmar a disponibilidade. As datas permanecem bloqueadas.'}
                </p>
                <button
                  type="button"
                  onClick={onRetryCalendar}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-neutral-300 bg-white px-3 py-2 text-caption font-semibold text-neutral-700 transition hover:border-orange-300 hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
                >
                  Tentar novamente
                </button>
              </div>
            ) : (
              <>
                {isExtendingCalendar || calendarExtensionMessage ? (
                  <div className="flex flex-col items-center gap-2">
                    <p
                      className="text-center text-caption text-neutral-600"
                      role="status"
                      aria-live="polite"
                    >
                      {calendarExtensionMessage || 'Consultando disponibilidade deste mês...'}
                    </p>
                    {!isExtendingCalendar && calendarExtensionMessage && (
                      <button
                        type="button"
                        onClick={onRetryCalendarExtension}
                        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-neutral-300 bg-white px-3 py-2 text-caption font-semibold text-neutral-700 transition hover:border-orange-300 hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
                      >
                        Tentar novamente
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-caption text-neutral-600">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full border border-neutral-300 bg-white" />
                      Disponível
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="relative h-2.5 w-2.5 rounded-full bg-rose-50">
                        <span className="absolute left-0 top-1/2 h-px w-3 -rotate-45 bg-rose-500" />
                      </span>
                      {activeDateField === 'checkIn'
                        ? 'Entrada indisponível'
                        : 'Saída indisponível para este período'}
                    </span>
                    {(['unpriced', 'unconfirmed'] as const).map(
                      (status) =>
                        calendarDays.some(
                          (day) =>
                            day.availabilityStatus === status &&
                            (day.date.startsWith(displayedMonthPrefix) ||
                              day.date.startsWith(
                                `${new Date(calendarYear, calendarMonth + 1, 1).getFullYear()}-${String(new Date(calendarYear, calendarMonth + 1, 1).getMonth() + 1).padStart(2, '0')}-`,
                              )) &&
                            (activeDateField === 'checkIn' || !checkIn || day.date > checkIn),
                        ) && (
                          <span key={status} className="inline-flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full bg-neutral-200" />
                            {status === 'unpriced'
                              ? 'Tarifa não disponível'
                              : 'Motivo não confirmado'}
                          </span>
                        ),
                    )}
                  </div>
                )}
              </>
            )}
            <p className="text-center text-caption text-neutral-500">
              {activeDateField === 'checkIn'
                ? 'Toque ou clique na entrada e depois na saída. No teclado, use setas, Home, End e Page Up/Down.'
                : 'Escolha um check-out que mantenha toda a estadia disponível. Use as setas para navegar.'}
            </p>
          </div>
        </div>
        <p
          className={`shrink-0 py-2 text-center [@media(max-height:500px)]:py-1 ${interactionMessage ? 'text-xs text-amber-800' : 'text-sm'}`}
          role={interactionMessage ? 'status' : undefined}
          aria-live="polite"
        >
          {interactionMessage ||
            (checkIn && checkOut && isCalendarRangeAvailable(calendarDays, checkIn, checkOut)
              ? `${formatDateLabel(checkIn)} — ${formatDateLabel(checkOut)} · ${selectedNights} ${selectedNights === 1 ? 'noite' : 'noites'}`
              : activeDateField === 'checkIn'
                ? 'Escolha a entrada'
                : 'Agora escolha a saída')}
        </p>
        <div className="flex shrink-0 items-center justify-between gap-1 border-t pt-3 pb-[env(safe-area-inset-bottom)] [@media(max-height:500px)]:pt-1">
          <button
            type="button"
            onClick={onClear}
            className="min-h-11 px-2 underline focus-visible:outline-2 focus-visible:outline-orange-600"
          >
            Limpar
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 px-2 focus-visible:outline-2 focus-visible:outline-orange-600"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={
              !calendarAvailable ||
              isLoadingCalendar ||
              !isCalendarRangeAvailable(calendarDays, checkIn, checkOut)
            }
            className="min-h-11 rounded-xl bg-orange-600 px-4 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:opacity-40"
          >
            Aplicar datas
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
