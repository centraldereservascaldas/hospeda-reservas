import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from '../IconButton';

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
  return (
    <div className="mb-3 flex shrink-0 items-center justify-between [@media(max-height:500px)]:mb-1">
      <IconButton
        onClick={() => onMonthChange(new Date(year, monthIndex - 1, 1))}
        disabled={isFirstMonth}
        aria-label="Mês anterior"
        variant="outlined"
      >
        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
      </IconButton>
      <h3 aria-live="polite" className="text-sm font-bold capitalize text-neutral-900">
        {month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
      </h3>
      <IconButton
        onClick={() => onMonthChange(new Date(year, monthIndex + 1, 1))}
        aria-label="Próximo mês"
        variant="outlined"
      >
        <ChevronRight aria-hidden="true" className="h-4 w-4" />
      </IconButton>
    </div>
  );
}
