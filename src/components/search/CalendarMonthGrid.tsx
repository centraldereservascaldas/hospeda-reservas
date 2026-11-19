import type { KeyboardEvent, RefCallback } from 'react';

interface CalendarMonthGridProps {
  month: Date;
  minDate: string;
  selectedStart: string;
  selectedEnd: string;
  pendingStart: string | null;
  previewEnd?: string | null;
  onPreviewDate?: (date: string | null) => void;
  focusDate: string | undefined;
  onSelectDate: (date: string) => void;
  onDateKeyDown: (event: KeyboardEvent<HTMLButtonElement>, date: string) => void;
  registerDateButton: (date: string) => RefCallback<HTMLButtonElement>;
}

const isoDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function CalendarMonthGrid({
  month,
  minDate,
  selectedStart,
  selectedEnd,
  pendingStart,
  previewEnd,
  onPreviewDate,
  focusDate,
  onSelectDate,
  onDateKeyDown,
  registerDateButton,
}: CalendarMonthGridProps) {
  const monthTitle = month.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  const leadingDays = month.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const weekCount = Math.ceil((leadingDays + daysInMonth) / 7);
  const calendarCells: (Date | null)[] = Array.from({ length: weekCount * 7 }, (_, index) => {
    const day = index - leadingDays + 1;
    return day > 0 && day <= daysInMonth
      ? new Date(month.getFullYear(), month.getMonth(), day)
      : null;
  });
  const rangeStart = pendingStart || selectedStart;
  const rangeEnd = pendingStart
    ? previewEnd && previewEnd > pendingStart
      ? previewEnd
      : ''
    : selectedEnd;

  return (
    <section
      className="min-w-0"
      aria-label={monthTitle}
      onPointerLeave={() => onPreviewDate?.(null)}
    >
      <h3
        aria-live="polite"
        aria-atomic="true"
        className="mb-2 text-center text-[length:var(--search-calendar-month-font-size)] font-semibold text-neutral-900"
      >
        {monthTitle}
      </h3>
      <div role="grid" aria-label={`Calendário de ${monthTitle}`}>
        <div
          role="row"
          className="mb-1 grid grid-cols-7 text-center text-[length:var(--search-calendar-weekday-font-size)] font-semibold text-neutral-600"
        >
          {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, index) => (
            <span key={`${day}-${index}`} role="columnheader" className="py-2">
              {day}
            </span>
          ))}
        </div>
        {Array.from({ length: weekCount }, (_, weekIndex) => (
          <div key={`week-${weekIndex}`} role="row" className="grid grid-cols-7 text-center">
            {calendarCells.slice(weekIndex * 7, weekIndex * 7 + 7).map((date, dayIndex) => {
              if (!date) {
                return (
                  <div
                    key={`empty-${weekIndex}-${dayIndex}`}
                    role="gridcell"
                    aria-hidden="true"
                    className="aspect-square min-h-[var(--search-calendar-day-size)]"
                  />
                );
              }

              const dateValue = isoDate(date);
              const isBeforeMinimum = dateValue < minDate;
              const isStart = Boolean(rangeStart && dateValue === rangeStart);
              const isEnd = Boolean(rangeEnd && dateValue === rangeEnd);
              const isInRange = Boolean(
                rangeStart && rangeEnd && dateValue > rangeStart && dateValue < rangeEnd,
              );
              const isSelected = isStart || (isEnd && !pendingStart);
              const isPreviewEnd = Boolean(pendingStart && isEnd);

              return (
                <div
                  key={dateValue}
                  role="gridcell"
                  aria-selected={isSelected || (!pendingStart && isInRange)}
                  data-calendar-day={dateValue}
                  className={
                    isInRange
                      ? 'bg-calendar-range'
                      : rangeEnd && isStart
                        ? 'bg-linear-to-r from-transparent from-50% to-calendar-range to-50%'
                        : rangeStart && isEnd
                          ? 'bg-linear-to-r from-calendar-range from-50% to-transparent to-50%'
                          : ''
                  }
                >
                  <button
                    ref={registerDateButton(dateValue)}
                    type="button"
                    disabled={isBeforeMinimum}
                    onKeyDown={(event) => onDateKeyDown(event, dateValue)}
                    onPointerEnter={(event) => {
                      if (event.pointerType !== 'touch' && !isBeforeMinimum)
                        onPreviewDate?.(dateValue);
                    }}
                    onClick={() => onSelectDate(dateValue)}
                    aria-label={date.toLocaleDateString('pt-BR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                    aria-pressed={isSelected}
                    data-calendar-day={dateValue}
                    tabIndex={dateValue === focusDate ? 0 : -1}
                    className={`search-calendar-day aspect-square min-h-[var(--search-calendar-day-size)] w-full rounded-full text-[length:var(--search-calendar-day-font-size)] font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-600 disabled:cursor-not-allowed ${
                      isSelected
                        ? 'bg-neutral-900 font-semibold text-white'
                        : isPreviewEnd
                          ? 'bg-white text-neutral-900 outline outline-1 -outline-offset-1 outline-neutral-800'
                          : isInRange
                            ? 'text-calendar-range-foreground'
                            : !isBeforeMinimum
                              ? 'text-neutral-800'
                              : 'text-calendar-muted-foreground'
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
    </section>
  );
}
