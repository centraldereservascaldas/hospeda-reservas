import { RefreshCw } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import {
  getStaysCalendarDisplayRate,
  isCalendarRangeAvailable,
  isCalendarArrivalAvailable,
  getCalendarDayRestriction,
} from '../../utils/staysAvailability';
import type { StaysCalendarDay } from '../../utils/staysAvailability';

interface PropertyAvailabilityStripProps {
  calendarDays: StaysCalendarDay[];
  calendarAvailable: boolean;
  isLoading: boolean;
  isRefreshingCalendar?: boolean;
  calendarMessage: string;
  checkIn: string;
  checkOut: string;
  onExplainDate?: (message: string) => void;
  onRetryCalendar: () => void;
  onSelectDay: (day: StaysCalendarDay) => void;
}

export function PropertyAvailabilityStrip({
  calendarDays,
  calendarAvailable,
  isLoading,
  isRefreshingCalendar = false,
  calendarMessage,
  checkIn,
  checkOut,
  onExplainDate,
  onRetryCalendar,
  onSelectDay,
}: PropertyAvailabilityStripProps) {
  const isCalendarConfirmed = calendarAvailable && !isLoading;
  const isSelectedRangeAvailable = Boolean(
    !isLoading && checkIn && checkOut && isCalendarRangeAvailable(calendarDays, checkIn, checkOut),
  );
  const selectedStayNights =
    isSelectedRangeAvailable && checkIn && checkOut
      ? (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000
      : undefined;

  return (
    <div className="pt-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-lg font-bold text-neutral-900">Disponibilidade e preços</h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Veja os preços por noite. O total da estadia aparece após confirmar as datas.
          </p>
        </div>
        <span
          className={`hidden sm:inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${isCalendarConfirmed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}
        >
          <span
            className={`h-2 w-2 rounded-full ${isLoading ? 'animate-pulse bg-amber-500' : isCalendarConfirmed ? 'bg-emerald-500' : 'bg-amber-500'}`}
          />
          {isLoading || isRefreshingCalendar
            ? 'Verificando'
            : calendarAvailable
              ? 'Consultada'
              : 'Não confirmada'}
        </span>
      </div>

      <div
        role="region"
        aria-label="Calendário de disponibilidade"
        aria-busy={isLoading}
        className="p-4 rounded-2xl border border-neutral-200 bg-neutral-50/70"
      >
        <div className="grid grid-cols-3 gap-1.5 text-center text-xs min-[480px]:grid-cols-5 sm:grid-cols-7">
          {calendarDays.slice(0, 14).map((day) => {
            const isSelectedIn = day.date === checkIn && isCalendarArrivalAvailable(day);
            const isSelectedOut = day.date === checkOut && isSelectedRangeAvailable;
            const isSelected = isSelectedIn || isSelectedOut;
            const isInRange = isSelectedRangeAvailable && day.date > checkIn && day.date < checkOut;
            const isAvailable = isCalendarConfirmed && isCalendarArrivalAvailable(day);
            const isCheckoutCandidate = Boolean(checkIn && !checkOut && day.date > checkIn);
            const canSelectAsCheckOut = Boolean(
              isCalendarConfirmed &&
              isCheckoutCandidate &&
              isCalendarRangeAvailable(calendarDays, checkIn, day.date),
            );
            const displayCanSelect =
              !isLoading &&
              (isCheckoutCandidate
                ? isCalendarRangeAvailable(calendarDays, checkIn, day.date)
                : isCalendarArrivalAvailable(day));
            const canSelect = isCheckoutCandidate ? canSelectAsCheckOut : isAvailable;
            const displayRate = getStaysCalendarDisplayRate(day, selectedStayNights);
            const accessibleDate = new Date(`${day.date}T12:00:00`).toLocaleDateString('pt-BR', {
              dateStyle: 'full',
            });
            const accessiblePrice = displayRate
              ? `${displayRate.hasAlternatives ? 'tarifa a partir de ' : 'tarifa de '}${formatCurrency(displayRate.amount, 'BRL')} por noite${displayRate.minStay ? ` para estadias de pelo menos ${displayRate.minStay} ${displayRate.minStay === 1 ? 'noite' : 'noites'}` : ''}; o total da estadia depende do período selecionado`
              : 'preço não confirmado';
            const dayRestriction = getCalendarDayRestriction(day);
            const availabilityLabel = isLoading
              ? 'disponibilidade sendo atualizada'
              : !calendarAvailable
                ? 'disponibilidade não confirmada'
                : dayRestriction
                  ? `${dayRestriction}${canSelectAsCheckOut ? '; disponível para check-out' : ''}`
                  : canSelectAsCheckOut
                    ? 'disponível para check-out'
                    : isCheckoutCandidate
                      ? 'não atende à disponibilidade ou estadia mínima'
                      : isAvailable
                        ? 'disponível para check-in'
                        : 'indisponível para check-in';

            return (
              <button
                key={day.date}
                type="button"
                aria-label={`Selecionar ${accessibleDate}; ${availabilityLabel}; ${accessiblePrice}`}
                aria-pressed={isSelected}
                onClick={() => {
                  if (!canSelect) {
                    if (dayRestriction) onExplainDate?.(dayRestriction);
                    return;
                  }
                  onSelectDay(day);
                }}
                disabled={!canSelect && !(dayRestriction && isCalendarConfirmed)}
                aria-disabled={!canSelect || undefined}
                className={`p-1 rounded-xl transition-all flex flex-col items-center justify-center ${
                  isSelected
                    ? 'bg-orange-700 text-white font-black shadow-md scale-105'
                    : isInRange
                      ? 'bg-calendar-range text-calendar-range-foreground font-bold'
                      : displayCanSelect
                        ? 'bg-white hover:bg-orange-50 border border-neutral-200/80 text-neutral-800 cursor-pointer'
                        : isLoading || dayRestriction
                          ? 'bg-calendar-muted text-calendar-muted-foreground cursor-not-allowed'
                          : 'bg-neutral-100/50 text-neutral-600 line-through cursor-not-allowed'
                } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:hover:bg-inherit`}
              >
                <span
                  className={`text-caption font-bold ${isSelected ? 'text-white' : 'text-neutral-600'}`}
                >
                  {new Date(`${day.date}T12:00:00`).toLocaleDateString('pt-BR', {
                    weekday: 'narrow',
                  })}
                </span>
                <span className="text-xs font-black my-0.5">{day.date.split('-')[2]}</span>
                {displayRate ? (
                  <>
                    <span
                      className={`text-caption font-bold ${isSelected ? 'text-white' : 'text-orange-700'}`}
                    >
                      {displayRate.hasAlternatives ? 'Desde ' : ''}
                      {formatCurrency(displayRate.amount, 'BRL')}
                    </span>
                    {displayRate.minStay !== undefined && displayRate.minStay > 0 && (
                      <span
                        className={`text-caption font-semibold ${isSelected ? 'text-white' : 'text-neutral-600'}`}
                      >
                        mín. {displayRate.minStay} {displayRate.minStay === 1 ? 'noite' : 'noites'}
                      </span>
                    )}
                  </>
                ) : (
                  <span
                    className={`text-caption font-bold ${isSelected ? 'text-white' : 'text-orange-700'}`}
                  >
                    {day.availabilityStatus === 'unpriced'
                      ? 'Sem tarifa'
                      : day.availabilityStatus === 'unconfirmed'
                        ? 'Não confirmada'
                        : 'Consultar'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      {isLoading && (
        <p className="mt-2 text-xs text-neutral-600" role="status">
          Atualizando disponibilidade...
        </p>
      )}
      {calendarMessage && !isLoading && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="text-xs text-amber-700" role="status">
            {calendarMessage}
          </p>
          {!calendarAvailable && (
            <button
              type="button"
              onClick={onRetryCalendar}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-neutral-300 bg-white px-4 text-xs font-bold text-neutral-800 transition hover:border-orange-300 hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            >
              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
              Tentar novamente
            </button>
          )}
        </div>
      )}
    </div>
  );
}
