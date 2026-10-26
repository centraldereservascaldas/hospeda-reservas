export type OwnerCalendarDaySegment = 'none' | 'full' | 'checkout';

export function getOwnerCalendarDaySegment(
  checkIn: string,
  checkOut: string,
  day: string,
): OwnerCalendarDaySegment {
  if (day < checkIn || day > checkOut) return 'none';
  return day === checkOut ? 'checkout' : 'full';
}
