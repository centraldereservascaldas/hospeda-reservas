import {
  isCalendarRangeAvailable,
  isCalendarArrivalAvailable,
  getCalendarDayRestriction,
} from './staysAvailability';
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
  if (
    (!currentCheckIn || currentCheckOut || selectedDay.date <= currentCheckIn) &&
    !isCalendarArrivalAvailable(selectedDay)
  ) {
    return {
      checkIn: currentCheckIn,
      checkOut: currentCheckOut,
      message:
        getCalendarDayRestriction(selectedDay) || 'Esta data não está disponível para check-in.',
    };
  }
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

export function selectAvailabilityRange(
  calendar: StaysCalendarDay[],
  checkIn: string,
  checkOut: string,
): PropertyDateSelection {
  const arrival = calendar.find((day) => day.date === checkIn);
  if (!arrival || !isCalendarArrivalAvailable(arrival)) {
    return {
      checkIn,
      checkOut: '',
      message:
        (arrival && getCalendarDayRestriction(arrival)) ||
        'Esta data não está disponível para check-in.',
    };
  }

  if (!isCalendarRangeAvailable(calendar, checkIn, checkOut)) {
    return { checkIn, checkOut: '', message: invalidRangeMessage };
  }

  return { checkIn, checkOut, message: '' };
}
