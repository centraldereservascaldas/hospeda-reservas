import { isCalendarRangeAvailable } from './staysAvailability';
import type { StaysCalendarDay } from './staysAvailability';

export interface PropertyDateSelection {
  checkIn: string;
  checkOut: string;
  message: string;
}

const invalidRangeMessage =
  'O período inclui uma data indisponível ou não atende à estadia mínima. Selecione outras datas.';

export function selectAvailabilityDay(
  calendar: StaysCalendarDay[],
  currentCheckIn: string,
  currentCheckOut: string,
  selectedDay: StaysCalendarDay,
): PropertyDateSelection {
  if (!currentCheckIn || currentCheckOut) {
    return { checkIn: selectedDay.date, checkOut: '', message: '' };
  }

  if (selectedDay.date > currentCheckIn) {
    if (isCalendarRangeAvailable(calendar, currentCheckIn, selectedDay.date)) {
      return { checkIn: currentCheckIn, checkOut: selectedDay.date, message: '' };
    }

    return { checkIn: currentCheckIn, checkOut: currentCheckOut, message: invalidRangeMessage };
  }

  return { checkIn: selectedDay.date, checkOut: currentCheckOut, message: '' };
}
