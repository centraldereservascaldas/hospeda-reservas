import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CalendarMonthNavigationProps {
  month: Date;
  earliestMonth: Date;
  onMonthChange: (month: Date) => void;
}

export function CalendarMonthNavigation({
  month,
  earliestMonth,
  onMonthChange,
}: CalendarMonthNavigationProps) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const isFirstMonth =
    year < earliestMonth.getFullYear() ||
    (year === earliestMonth.getFullYear() && monthIndex <= earliestMonth.getMonth());
  const buttonClassName =
    'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 transition hover:border-orange-200 hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:opacity-35';

  return (
    <div className="mb-3 flex shrink-0 items-center justify-between [@media(max-height:500px)]:mb-1">
      <button
        type="button"
        onClick={() => onMonthChange(new Date(year, monthIndex - 1, 1))}
        disabled={isFirstMonth}
        aria-label="Mês anterior"
        className={buttonClassName}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <h3 aria-live="polite" className="text-sm font-bold capitalize text-neutral-900">
        {month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
      </h3>
      <button
        type="button"
        onClick={() => onMonthChange(new Date(year, monthIndex + 1, 1))}
        aria-label="Próximo mês"
        className={buttonClassName}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
