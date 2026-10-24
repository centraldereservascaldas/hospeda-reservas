export type StaysCalendarDay = {
  date: string;
  avail: number;
  closedToArrival?: boolean;
  closedToDeparture?: boolean;
  prices?: Array<{ minStay?: number; _mcval?: Record<string, number> }>;
};

export interface StaysCalendarDisplayRate {
  amount: number;
  minStay?: number;
  hasAlternatives: boolean;
}

export function getStaysCalendarDisplayRate(
  day: StaysCalendarDay,
  stayNights?: number,
): StaysCalendarDisplayRate | null {
  const rates = (day.prices ?? []).flatMap((price) => {
    const amount = price._mcval?.BRL;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return [];

    return [{ amount, minStay: price.minStay }];
  });

  const applicableRates =
    stayNights === undefined
      ? rates
      : rates.filter((rate) => rate.minStay === undefined || rate.minStay <= stayNights);
  if (applicableRates.length === 0) return null;

  const sortedRates = [...applicableRates].sort(
    (first, second) => first.amount - second.amount || (first.minStay ?? 0) - (second.minStay ?? 0),
  );
  const selectedRate = sortedRates[0]!;
  const hasAlternatives = sortedRates.some(
    (rate) => rate.amount !== selectedRate.amount || rate.minStay !== selectedRate.minStay,
  );

  return { ...selectedRate, hasAlternatives };
}

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

  const minimumStayOptions = (checkIn.prices ?? [])
    .map((price) => Number(price.minStay ?? 0))
    .filter((minStay) => Number.isFinite(minStay) && minStay >= 0);
  const minStay = minimumStayOptions.length ? Math.min(...minimumStayOptions) : 0;
  return !minStay || (end - start) / DAY_MS >= minStay;
}
