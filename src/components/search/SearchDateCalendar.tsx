import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CalendarMonthGrid } from './CalendarMonthGrid';
import { matchesMediaQuery } from '../../utils/motion';

interface SearchDateCalendarProps {
  checkIn: string;
  checkOut: string;
  minDate: string;
  onDatesChange: (checkIn: string, checkOut: string) => void;
}

const toIsoDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function SearchDateCalendar({
  checkIn,
  checkOut,
  minDate,
  onDatesChange,
}: SearchDateCalendarProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const initialDate = checkIn ? new Date(`${checkIn}T12:00:00`) : new Date();
    return new Date(initialDate.getFullYear(), initialDate.getMonth(), 1);
  });
  const [keyboardFocusDate, setKeyboardFocusDate] = useState<string | null>(null);
  const [previewEnd, setPreviewEnd] = useState<string | null>(null);
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    matchesMediaQuery('(max-width: 639px)'),
  );
  const dateButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const monthCount = isMobileLayout ? 12 : 2;

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(max-width: 639px)');
    if (!mediaQuery) return;
    const updateLayout = () => setIsMobileLayout(mediaQuery.matches);
    mediaQuery.addEventListener('change', updateLayout);
    return () => mediaQuery.removeEventListener('change', updateLayout);
  }, []);

  const handleSelectDate = (dateValue: string) => {
    setPreviewEnd(null);
    setKeyboardFocusDate(dateValue);
    if (!checkIn || checkOut || dateValue <= checkIn) {
      onDatesChange(dateValue, '');
      return;
    }

    onDatesChange(checkIn, dateValue);
  };

  const handleDateKeyDown = (event: KeyboardEvent<HTMLButtonElement>, dateValue: string) => {
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
    const candidate = new Date(`${dateValue}T12:00:00`);
    candidate.setDate(candidate.getDate() + dayOffset);
    const candidateValue = toIsoDate(candidate);
    if (candidateValue < minDate) return;

    setKeyboardFocusDate(candidateValue);
    if (!isMobileLayout) {
      setVisibleMonth(new Date(candidate.getFullYear(), candidate.getMonth(), 1));
    }
  };

  const registerDateButton = (dateValue: string) => (button: HTMLButtonElement | null) => {
    if (button) dateButtonRefs.current.set(dateValue, button);
    else dateButtonRefs.current.delete(dateValue);
  };

  useEffect(() => {
    if (!keyboardFocusDate) return;
    dateButtonRefs.current.get(keyboardFocusDate)?.focus();
  }, [keyboardFocusDate]);

  const getMonth = (offset: number) =>
    new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1);

  const getFocusDate = (month: Date): string | undefined => {
    const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-`;
    if (keyboardFocusDate?.startsWith(prefix) && keyboardFocusDate >= minDate)
      return keyboardFocusDate;
    if (checkIn.startsWith(prefix) && checkIn >= minDate) return checkIn;

    const firstAvailableDay = new Date(
      Math.max(month.getTime(), new Date(`${minDate}T12:00:00`).getTime()),
    );
    return firstAvailableDay.getFullYear() === month.getFullYear() &&
      firstAvailableDay.getMonth() === month.getMonth()
      ? toIsoDate(firstAvailableDay)
      : undefined;
  };

  const monthViews = Array.from({ length: monthCount }, (_, offset) => {
    const month = getMonth(offset);
    const focusDate = getFocusDate(month);
    return (
      <CalendarMonthGrid
        key={`${month.getFullYear()}-${month.getMonth()}`}
        month={month}
        minDate={minDate}
        selectedStart={checkIn}
        selectedEnd={checkOut}
        pendingStart={checkIn && !checkOut ? checkIn : null}
        previewEnd={previewEnd}
        onPreviewDate={setPreviewEnd}
        focusDate={focusDate}
        onSelectDate={handleSelectDate}
        onDateKeyDown={handleDateKeyDown}
        registerDateButton={registerDateButton}
      />
    );
  });

  return (
    <div className="search-date-calendar">
      {!isMobileLayout && (
        <div className="search-date-calendar__navigation">
          <button
            type="button"
            aria-label="Mês anterior"
            onClick={() =>
              setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))
            }
            disabled={visibleMonth <= new Date(new Date().getFullYear(), new Date().getMonth(), 1)}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Próximo mês"
            onClick={() =>
              setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))
            }
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      )}
      <div
        className={
          isMobileLayout
            ? 'search-date-calendar__months search-date-calendar__months--stacked'
            : 'search-date-calendar__months'
        }
      >
        {monthViews}
      </div>
    </div>
  );
}
