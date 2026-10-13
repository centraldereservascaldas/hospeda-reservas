import { formatCurrency } from '../utils/formatters';
import type { StaysCalendarDay } from '../utils/staysAvailability';

interface PropertyAvailabilityStripProps {
  calendarDays: StaysCalendarDay[];
  calendarAvailable: boolean;
  calendarMessage: string;
  checkIn: string;
  checkOut: string;
  baseNightlyRate: number;
  onSelectDay: (day: StaysCalendarDay) => void;
}

export function PropertyAvailabilityStrip({
  calendarDays,
  calendarAvailable,
  calendarMessage,
  checkIn,
  checkOut,
  baseNightlyRate,
  onSelectDay,
}: PropertyAvailabilityStripProps) {
  return (
    <div className="pt-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-lg font-bold text-neutral-900">
            Calendário de Disponibilidade &amp; Diárias
          </h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Consulte os valores por noite e selecione as datas desejadas.
          </p>
        </div>
        <span
          className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${calendarAvailable ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}
        >
          <span
            className={`w-2 h-2 rounded-full ${calendarAvailable ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}
          />
          {calendarAvailable ? 'Sincronizado' : 'Indisponível'}
        </span>
      </div>

      <div className="p-4 rounded-2xl border border-neutral-200 bg-neutral-50/70">
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 text-center text-xs">
          {calendarDays.slice(0, 14).map((day) => {
            const isSelectedIn = day.date === checkIn;
            const isSelectedOut = day.date === checkOut;
            const isSelected = isSelectedIn || isSelectedOut;
            const isInRange = day.date > checkIn && day.date < checkOut;
            const isAvailable = Number(day.avail) > 0 && !day.closedToArrival;
            const canSelectAsCheckOut = Boolean(checkIn && !checkOut && day.date > checkIn);
            const dayPrice = day.prices?.[0]?._mcval?.BRL || baseNightlyRate;
            const accessibleDate = new Date(`${day.date}T12:00:00`).toLocaleDateString('pt-BR', {
              dateStyle: 'full',
            });

            return (
              <button
                key={day.date}
                type="button"
                disabled={!isAvailable && !canSelectAsCheckOut}
                aria-label={`Selecionar ${accessibleDate} por ${formatCurrency(dayPrice, 'BRL')} por noite`}
                aria-pressed={isSelected}
                onClick={() => onSelectDay(day)}
                className={`p-2 rounded-xl transition-all flex flex-col items-center justify-center cursor-pointer ${
                  isSelected
                    ? 'bg-orange-600 text-white font-black shadow-md scale-105'
                    : isInRange
                      ? 'bg-orange-100 text-orange-950 font-bold'
                      : isAvailable || canSelectAsCheckOut
                        ? 'bg-white hover:bg-orange-50 border border-neutral-200/80 text-neutral-800'
                        : 'bg-neutral-100/50 text-neutral-300 line-through cursor-not-allowed'
                }`}
              >
                <span className="text-[10px] font-bold opacity-80">
                  {new Date(`${day.date}T12:00:00`).toLocaleDateString('pt-BR', {
                    weekday: 'narrow',
                  })}
                </span>
                <span className="text-xs font-black my-0.5">{day.date.split('-')[2]}</span>
                <span
                  className={`text-[9px] font-bold ${isSelected ? 'text-orange-100' : 'text-orange-600'}`}
                >
                  R$ {dayPrice}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {calendarMessage && (
        <p className="mt-2 text-xs text-amber-700" role="status">
          {calendarMessage}
        </p>
      )}
    </div>
  );
}
