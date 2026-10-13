import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useDialogFocus } from '../useDialogFocus';

type DateField = 'checkIn' | 'checkOut';

interface PropertyDatePickerDialogProps {
  isOpen: boolean;
  activeDateField: DateField;
  checkIn: string;
  checkOut: string;
  displayedMonth: Date;
  today: Date;
  todayIso: string;
  onActiveDateFieldChange: (field: DateField) => void;
  onDisplayedMonthChange: (date: Date) => void;
  onChooseDate: (date: Date) => void;
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
  onActiveDateFieldChange,
  onDisplayedMonthChange,
  onChooseDate,
  onClose,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogFocus(isOpen, onClose, { initialFocusRef: closeButtonRef });

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const calendarYear = displayedMonth.getFullYear();
  const calendarMonth = displayedMonth.getMonth();
  const calendarLeadingDays = (new Date(calendarYear, calendarMonth, 1).getDay() + 6) % 7;
  const calendarDaysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const calendarCells: Array<Date | null> = [
    ...Array.from({ length: calendarLeadingDays }, () => null),
    ...Array.from(
      { length: calendarDaysInMonth },
      (_, index) => new Date(calendarYear, calendarMonth, index + 1),
    ),
  ];
  const calendarMonthLabel = displayedMonth.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  const formatDateLabel = (value: string) =>
    value
      ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
      : 'Selecionar';

  return createPortal(
    <div
      ref={dialogRef}
      data-dialog-focus-root
      id="stay-dates-dialog"
      tabIndex={-1}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-white/25 p-4 backdrop-blur-xl animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stay-dates-title"
    >
      <div className="w-full max-w-sm rounded-3xl border border-white/90 bg-white/95 p-5 shadow-2xl backdrop-blur-2xl">
        <div className="mb-4 flex items-center justify-between">
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
            className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 transition hover:bg-orange-50 hover:text-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-orange-50/70 p-1.5">
          <button
            type="button"
            aria-pressed={activeDateField === 'checkIn'}
            onClick={() => onActiveDateFieldChange('checkIn')}
            className={`rounded-xl px-3 py-2 text-left transition ${activeDateField === 'checkIn' ? 'bg-white text-orange-800 shadow-sm ring-1 ring-orange-100' : 'text-neutral-600 hover:bg-white/60'}`}
          >
            <span className="block text-[10px] font-bold uppercase tracking-wide">Check-in</span>
            <span className="mt-0.5 block text-xs font-semibold">{formatDateLabel(checkIn)}</span>
          </button>
          <button
            type="button"
            aria-pressed={activeDateField === 'checkOut'}
            onClick={() => onActiveDateFieldChange('checkOut')}
            className={`rounded-xl px-3 py-2 text-left transition ${activeDateField === 'checkOut' ? 'bg-white text-orange-800 shadow-sm ring-1 ring-orange-100' : 'text-neutral-600 hover:bg-white/60'}`}
          >
            <span className="block text-[10px] font-bold uppercase tracking-wide">Check-out</span>
            <span className="mt-0.5 block text-xs font-semibold">{formatDateLabel(checkOut)}</span>
          </button>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onDisplayedMonthChange(new Date(calendarYear, calendarMonth - 1, 1))}
            disabled={calendarYear === today.getFullYear() && calendarMonth <= today.getMonth()}
            aria-label="Mês anterior"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 transition hover:border-orange-200 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h3 className="text-sm font-bold capitalize text-neutral-900">{calendarMonthLabel}</h3>
          <button
            type="button"
            onClick={() => onDisplayedMonthChange(new Date(calendarYear, calendarMonth + 1, 1))}
            aria-label="Próximo mês"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 transition hover:border-orange-200 hover:bg-orange-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-semibold text-neutral-400">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((weekday) => (
            <span key={weekday} className="py-2">
              {weekday}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {calendarCells.map((date, index) => {
            if (!date) return <span key={`empty-${index}`} className="h-10" />;
            const dateValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            const isSelected = dateValue === checkIn || dateValue === checkOut;
            const isInRange = Boolean(
              checkIn && checkOut && dateValue > checkIn && dateValue < checkOut,
            );
            const isDisabled =
              dateValue < todayIso || (activeDateField === 'checkOut' && dateValue <= checkIn);
            return (
              <button
                key={dateValue}
                type="button"
                disabled={isDisabled}
                aria-label={date.toLocaleDateString('pt-BR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                aria-pressed={isSelected}
                onClick={() => onChooseDate(date)}
                className={`h-10 rounded-xl text-xs font-semibold transition ${
                  isSelected
                    ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/20'
                    : isInRange
                      ? 'bg-orange-100 text-orange-900'
                      : 'text-neutral-700 hover:bg-orange-50 hover:text-orange-800'
                } disabled:cursor-not-allowed disabled:text-neutral-300 disabled:hover:bg-transparent`}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
        <p className="mt-4 border-t border-neutral-100 pt-3 text-center text-[11px] text-neutral-500">
          {activeDateField === 'checkIn'
            ? 'Toque em um dia para escolher o check-in.'
            : 'Agora escolha o dia do check-out.'}
        </p>
      </div>
    </div>,
    document.body,
  );
};
