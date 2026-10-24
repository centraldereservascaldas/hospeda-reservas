import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useDialogFocus } from '../useDialogFocus';
import type { StaysCalendarDay } from '../../utils/staysAvailability';
import { isCalendarRangeAvailable } from '../../utils/staysAvailability';

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
  availabilityMessage: string;
  interactionMessage: string;
  onRetryCalendar: () => void;
  onRetryCalendarExtension: () => void;
  onActiveDateFieldChange: (field: DateField) => void;
  onDisplayedMonthChange: (date: Date) => void;
  onChooseDate: (date: Date) => void;
  onChooseDateRange: (checkIn: Date, checkOut: Date) => void;
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
  availabilityMessage,
  interactionMessage,
  onRetryCalendar,
  onRetryCalendarExtension,
  onActiveDateFieldChange,
  onDisplayedMonthChange,
  onChooseDate,
  onChooseDateRange,
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
  const calendarWeeks = Array.from({ length: calendarRowCount }, (_, index) =>
    calendarCells.slice(index * 7, index * 7 + 7),
  );
  const calendarMonthLabel = displayedMonth.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  const calendarByDate = new Map(calendarDays.map((day) => [day.date, day]));
  const displayedMonthPrefix = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-`;
  const isSelectableDate = (dateValue: string) => {
    const day = calendarByDate.get(dateValue);
    if (dateValue < todayIso || !calendarAvailable || isLoadingCalendar || !day) return false;
    return activeDateField === 'checkIn'
      ? day.avail > 0 && !day.closedToArrival
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

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={dialogRef}
      data-dialog-focus-root
      id="stay-dates-dialog"
      tabIndex={-1}
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-white/25 p-0 backdrop-blur-xl animate-in fade-in duration-150 sm:items-center sm:p-4"
      onPointerUp={handleTouchRangePointerUp}
      onPointerMove={handleTouchRangePointerMove}
      onPointerCancel={clearTouchRange}
      role="dialog"
      aria-modal="true"
      aria-labelledby="stay-dates-title"
    >
      <div className="my-auto w-full max-w-sm rounded-3xl border border-white/90 bg-white/95 p-3 shadow-2xl backdrop-blur-2xl sm:p-5">
        <div className="sticky top-4 z-10 -mx-3 mb-4 flex items-center justify-between rounded-t-3xl bg-white/95 px-3 py-2.5 backdrop-blur-2xl sm:-mx-5 sm:px-5">
          <div>
            <h2 id="stay-dates-title" className="text-lg font-bold text-neutral-900">
              Escolha as datas
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500">
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

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-orange-50/70 p-1.5">
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

        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onDisplayedMonthChange(new Date(calendarYear, calendarMonth - 1, 1))}
            disabled={calendarYear === today.getFullYear() && calendarMonth <= today.getMonth()}
            aria-label="Mês anterior"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 transition hover:border-orange-200 hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h3 aria-live="polite" className="text-sm font-bold capitalize text-neutral-900">
            {calendarMonthLabel}
          </h3>
          <button
            type="button"
            onClick={() => onDisplayedMonthChange(new Date(calendarYear, calendarMonth + 1, 1))}
            aria-label="Próximo mês"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 transition hover:border-orange-200 hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div
          role="grid"
          aria-label={`Calendário de ${calendarMonthLabel}`}
          className="-mx-3 sm:mx-0"
        >
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
          {calendarWeeks.map((week, weekIndex) => (
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
                const isPast = dateValue < todayIso;
                const isAvailableCheckIn = Boolean(
                  calendarDay && Number(calendarDay.avail) > 0 && !calendarDay.closedToArrival,
                );
                const isAvailableCheckOut = Boolean(
                  checkIn &&
                  dateValue > checkIn &&
                  isCalendarRangeAvailable(calendarDays, checkIn, dateValue),
                );
                const isUnavailableForArrival = Boolean(
                  calendarDay && (Number(calendarDay.avail) < 1 || calendarDay.closedToArrival),
                );
                const isAvailableForActiveField =
                  activeDateField === 'checkIn' ? isAvailableCheckIn : isAvailableCheckOut;
                const isSelectedCheckIn = dateValue === checkIn && isAvailableCheckIn;
                const isSelectedCheckOut = dateValue === checkOut && isAvailableCheckOut;
                const isSelected = isSelectedCheckIn || isSelectedCheckOut;
                const isSelectedForAnotherField =
                  activeDateField === 'checkIn' ? isSelectedCheckOut : isSelectedCheckIn;
                const isBlocked = Boolean(
                  !isPast &&
                  !isLoadingCalendar &&
                  calendarAvailable &&
                  calendarDay &&
                  !isAvailableForActiveField &&
                  !isSelectedForAnotherField,
                );
                const selectedRangeIsAvailable = Boolean(
                  checkIn && checkOut && isCalendarRangeAvailable(calendarDays, checkIn, checkOut),
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
                      : isSelectedForAnotherField
                        ? `selecionada como ${activeDateField === 'checkIn' ? 'check-out' : 'check-in'}`
                        : isUnavailableForArrival && isSelectedCheckOut && isAvailableCheckOut
                          ? 'indisponível para check-in; checkout permitido'
                          : isBlocked
                            ? 'indisponível para esta seleção'
                            : isUnavailableForArrival
                              ? 'indisponível para check-in'
                              : 'disponível';
                const shouldShowUnavailableMark =
                  isBlocked ||
                  (isSelectedCheckOut && isUnavailableForArrival && isAvailableCheckOut);
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
                      if (event.pointerType !== 'touch' || activeDateField !== 'checkIn') return;
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
                    <button
                      key={dateValue}
                      ref={(button) => {
                        if (button) {
                          dayButtonRefs.current.set(dateValue, button);
                        } else {
                          dayButtonRefs.current.delete(dateValue);
                        }
                      }}
                      type="button"
                      disabled={isDisabled}
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
                        if (suppressClickDatesRef.current.includes(dateValue)) {
                          suppressClickDatesRef.current = [];
                          return;
                        }
                        setKeyboardFocusDate(dateValue);
                        onChooseDate(date);
                      }}
                      className={`h-11 w-full rounded-xl text-xs font-semibold transition ${
                        isTouchPreviewDate
                          ? isTouchPreviewValid
                            ? 'bg-orange-100 text-orange-900 ring-1 ring-orange-300'
                            : 'bg-rose-100 text-rose-900 ring-1 ring-rose-300'
                          : isBlocked
                            ? 'relative cursor-not-allowed bg-rose-50 text-rose-700'
                            : isSelected
                              ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/20'
                              : isInRange
                                ? 'bg-orange-100 text-orange-900'
                                : isDisabled
                                  ? 'cursor-not-allowed bg-neutral-100/70 text-neutral-600'
                                  : 'text-neutral-700 hover:bg-orange-50 hover:text-orange-800'
                      } focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-600 disabled:hover:bg-inherit`}
                      title={availabilityLabel}
                    >
                      {date.getDate()}
                      {shouldShowUnavailableMark && (
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none absolute left-1/2 top-1/2 h-px w-7 -translate-x-1/2 -translate-y-1/2 rotate-[-42deg] ${isSelectedCheckOut ? 'bg-rose-700' : 'bg-rose-500/80'}`}
                        />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-3 border-t border-neutral-100 pt-3">
          {interactionMessage && (
            <p className="text-center text-xs text-amber-800" role="status" aria-live="polite">
              {interactionMessage}
            </p>
          )}
          {isLoadingCalendar ? (
            <p className="text-center text-caption text-neutral-500" role="status">
              Atualizando disponibilidade. As datas ficam bloqueadas até a confirmação.
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
                    Sem disponibilidade para check-in
                  </span>
                </div>
              )}
            </>
          )}
          <p className="text-center text-caption text-neutral-500">
            {activeDateField === 'checkIn'
              ? 'Escolha um dia disponível para o check-in. Use as setas do teclado ou, no celular, arraste até o check-out.'
              : 'Escolha um check-out que mantenha toda a estadia disponível. Use as setas para navegar.'}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
};
