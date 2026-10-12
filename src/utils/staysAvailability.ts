export type StaysCalendarDay = {
  date: string;
  avail: number;
  closedToArrival?: boolean;
  closedToDeparture?: boolean;
  prices?: Array<{ minStay?: number; _mcval?: Record<string, number> }>;
};

const DAY_MS = 86_400_000;

export function isCalendarRangeAvailable(
  calendar: StaysCalendarDay[],
  from: string,
  to: string,
): boolean {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;

  const byDate = new Map(calendar.map((day) => [day.date, day]));
  const checkIn = byDate.get(from);
  const checkOut = byDate.get(to);
  if (!checkIn || !checkOut || checkIn.closedToArrival || checkOut.closedToDeparture) return false;

  for (let timestamp = start; timestamp < end; timestamp += DAY_MS) {
    const date = new Date(timestamp).toISOString().slice(0, 10);
    const day = byDate.get(date);
    if (!day || !Number.isFinite(Number(day.avail)) || Number(day.avail) < 1) return false;
  }

  const minStay = Number(checkIn.prices?.[0]?.minStay || 0);
  return !minStay || (end - start) / DAY_MS >= minStay;
}
