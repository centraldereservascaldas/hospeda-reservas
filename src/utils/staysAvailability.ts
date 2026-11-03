export type StaysCalendarDay = {
  date: string;
  avail: number;
  availabilityStatus?: 'available' | 'unavailable' | 'unpriced' | 'unconfirmed';
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
  if (day.availabilityStatus === 'unpriced' || day.availabilityStatus === 'unconfirmed')
    return null;
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

export function validateCalendarRange(
  calendar: StaysCalendarDay[],
  from: string,
  to: string,
): CalendarRangeValidation {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return { available: false, reason: 'invalid-range' };

  const byDate = new Map(calendar.map((day) => [day.date, day]));
  const checkIn = byDate.get(from);
  const checkOut = byDate.get(to);
  if (!checkIn || !checkOut) return { available: false, reason: 'unknown' };
  if (checkIn.closedToArrival) return { available: false, reason: 'arrival-closed' };
  if (checkOut.closedToDeparture) return { available: false, reason: 'departure-closed' };

  for (let timestamp = start; timestamp < end; timestamp += DAY_MS) {
    const date = new Date(timestamp).toISOString().slice(0, 10);
    const day = byDate.get(date);
    if (!day) return { available: false, reason: 'unknown' };
    if (day.availabilityStatus === 'unpriced') return { available: false, reason: 'unpriced' };
    if (day.availabilityStatus === 'unconfirmed')
      return { available: false, reason: 'unconfirmed' };
    if (
      day.availabilityStatus === 'unavailable' ||
      !Number.isFinite(Number(day.avail)) ||
      Number(day.avail) < 1
    )
      return { available: false, reason: 'occupied', date };
  }

  const minimumStayOptions = (checkIn.prices ?? [])
    .filter(
      (price) =>
        checkIn.availabilityStatus === undefined ||
        (typeof price._mcval?.BRL === 'number' &&
          Number.isFinite(price._mcval.BRL) &&
          price._mcval.BRL > 0),
    )
    .map((price) => Number(price.minStay ?? 0))
    .filter((minStay) => Number.isFinite(minStay) && minStay >= 0);
  const minStay = minimumStayOptions.length ? Math.min(...minimumStayOptions) : 0;
  if (minStay && (end - start) / DAY_MS < minStay)
    return { available: false, reason: 'minimum-stay', minimumNights: minStay };
  return { available: true };
}

export type CalendarRangeValidation =
  | { available: true }
  | {
      available: false;
      reason:
        | 'invalid-range'
        | 'unknown'
        | 'arrival-closed'
        | 'departure-closed'
        | 'unpriced'
        | 'unconfirmed';
    }
  | { available: false; reason: 'occupied'; date: string }
  | { available: false; reason: 'minimum-stay'; minimumNights: number };

export function isCalendarRangeAvailable(
  calendar: StaysCalendarDay[],
  from: string,
  to: string,
): boolean {
  return validateCalendarRange(calendar, from, to).available;
}

export function getCalendarRangeMessage(result: CalendarRangeValidation): string {
  if (result.available) return 'Período disponível';
  switch (result.reason) {
    case 'unpriced':
      return 'Tarifa não disponível para esta data';
    case 'unconfirmed':
      return 'Data não disponível para reserva; motivo não confirmado';
    case 'invalid-range':
      return 'Escolha uma saída posterior à entrada.';
    case 'unknown':
      return 'A disponibilidade deste período ainda não foi confirmada.';
    case 'arrival-closed':
      return 'Esta data não permite check-in.';
    case 'departure-closed':
      return 'Esta data não permite check-out.';
    case 'occupied':
      return `O período inclui uma noite indisponível em ${result.date.split('-').reverse().join('/')}.`;
    case 'minimum-stay':
      return `Esta entrada exige pelo menos ${result.minimumNights} noites.`;
  }
}

export function isCalendarArrivalAvailable(day: StaysCalendarDay): boolean {
  return (
    Number(day.avail) > 0 &&
    !day.closedToArrival &&
    (day.availabilityStatus === undefined || day.availabilityStatus === 'available')
  );
}

export function getCalendarDayRestriction(day: StaysCalendarDay): string | null {
  if (day.availabilityStatus === 'unpriced')
    return getCalendarRangeMessage({ available: false, reason: 'unpriced' });
  if (day.availabilityStatus === 'unconfirmed')
    return getCalendarRangeMessage({ available: false, reason: 'unconfirmed' });
  return null;
}
