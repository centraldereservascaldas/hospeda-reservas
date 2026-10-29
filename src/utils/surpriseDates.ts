export interface SurpriseDateOption {
  checkIn: string;
  checkOut: string;
  occasion: string;
  kind: 'event' | 'holiday' | 'high-season';
  weight: number;
}

const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const dateAtNoon = (year: number, monthIndex: number, day: number) =>
  new Date(year, monthIndex, day, 12);

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const easterSunday = (year: number) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return dateAtNoon(year, month - 1, day);
};

const holidayWeekendStart = (holiday: Date) => {
  switch (holiday.getDay()) {
    case 1:
      return addDays(holiday, -3); // Monday -> Friday
    case 2:
      return addDays(holiday, -4); // Tuesday -> Friday
    case 4:
      return addDays(holiday, -1); // Thursday -> Wednesday
    case 5:
      return addDays(holiday, -1); // Friday -> Thursday
    case 6:
      return addDays(holiday, -1); // Saturday -> Friday
    default:
      return addDays(holiday, -2); // Sunday -> Friday
  }
};

export function getSurpriseDateCandidates(
  now = new Date(),
  random: () => number = Math.random,
): SurpriseDateOption[] {
  const today = dateAtNoon(now.getFullYear(), now.getMonth(), now.getDate());
  const earliestCheckIn = addDays(today, 2);
  const horizon = addDays(today, 370);
  const candidates: SurpriseDateOption[] = [];

  const add = (
    checkIn: Date,
    nights: number,
    occasion: string,
    kind: SurpriseDateOption['kind'],
    weight: number,
  ) => {
    const checkOut = addDays(checkIn, nights);
    if (checkIn < earliestCheckIn || checkIn > horizon) return;
    candidates.push({
      checkIn: toIsoDate(checkIn),
      checkOut: toIsoDate(checkOut),
      occasion,
      kind,
      weight,
    });
  };

  for (let year = today.getFullYear(); year <= horizon.getFullYear(); year += 1) {
    const fixedHolidays: Array<[number, number, string]> = [
      [0, 1, 'Confraternização Universal'],
      [3, 21, 'Tiradentes'],
      [4, 1, 'Dia do Trabalho'],
      [8, 7, 'Independência do Brasil'],
      [9, 12, 'Nossa Senhora Aparecida'],
      [10, 2, 'Finados'],
      [10, 15, 'Proclamação da República'],
      [10, 20, 'Consciência Negra'],
      [11, 25, 'Natal'],
    ];
    for (const [month, day, name] of fixedHolidays) {
      const holiday = dateAtNoon(year, month, day);
      add(holidayWeekendStart(holiday), 3, `Feriado: ${name}`, 'holiday', 4);
    }

    const easter = easterSunday(year);
    const carnivalTuesday = addDays(easter, -47);
    add(addDays(carnivalTuesday, -4), 4, 'Carnaval', 'holiday', 5);
    add(addDays(easter, -3), 3, 'Páscoa e Sexta-feira Santa', 'holiday', 4);
    add(addDays(easter, 59), 3, 'Corpus Christi', 'holiday', 3);

    add(dateAtNoon(year, 0, 12), 4, 'Alta temporada de verão', 'high-season', 3);
    add(dateAtNoon(year, 6, 12), 4, 'Férias de julho', 'high-season', 3);
    add(dateAtNoon(year, 11, 27), 4, 'Natal e Réveillon', 'high-season', 4);
  }

  // The festival's 2026 dates are published by its official website; future editions
  // are added only after their dates are announced.
  if (today.getFullYear() <= 2026) {
    add(dateAtNoon(2026, 10, 20), 3, 'Caldas Country Festival (21 e 22/11)', 'event', 7);
  }

  const unique = new Map<string, SurpriseDateOption>();
  for (const candidate of candidates) {
    const key = `${candidate.checkIn}|${candidate.checkOut}`;
    if (!unique.has(key) || unique.get(key)!.weight < candidate.weight) unique.set(key, candidate);
  }

  // Weighted sampling without replacement keeps event and long-holiday windows
  // favored while still exploring alternate seasonal dates if a quote is unavailable.
  const pool = Array.from(unique.values());
  const weightedOrder: SurpriseDateOption[] = [];
  while (pool.length) {
    const totalWeight = pool.reduce((sum, candidate) => sum + candidate.weight, 0);
    let roll = random() * totalWeight;
    const selectedIndex = pool.findIndex((candidate) => (roll -= candidate.weight) < 0);
    weightedOrder.push(pool.splice(selectedIndex < 0 ? pool.length - 1 : selectedIndex, 1)[0]);
  }
  return weightedOrder;
}
