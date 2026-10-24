import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getStaysCalendarDisplayRate,
  isCalendarRangeAvailable,
} from '../src/utils/staysAvailability.ts';

const days = (occupied: string[] = []) =>
  ['2026-11-19', '2026-11-20', '2026-11-21'].map((date) => ({
    date,
    avail: occupied.includes(date) ? 0 : 1,
    closedToArrival: false,
    closedToDeparture: false,
    prices: [{ minStay: 2 }],
  }));

test('calendar range accepts available nights and excludes checkout night', () => {
  assert.equal(isCalendarRangeAvailable(days(), '2026-11-19', '2026-11-21'), true);
});

test('calendar range rejects an occupied night inside the stay', () => {
  assert.equal(isCalendarRangeAvailable(days(['2026-11-20']), '2026-11-19', '2026-11-21'), false);
});

test('calendar range fails closed when a requested date is missing', () => {
  assert.equal(isCalendarRangeAvailable(days().slice(0, 2), '2026-11-19', '2026-11-21'), false);
});

test('calendar range rejects arrival/departure restrictions and minimum stay', () => {
  const arrivalClosed = days();
  arrivalClosed[0].closedToArrival = true;
  assert.equal(isCalendarRangeAvailable(arrivalClosed, '2026-11-19', '2026-11-21'), false);
  assert.equal(isCalendarRangeAvailable(days(), '2026-11-20', '2026-11-21'), false);
});

test('calendar display rate chooses the lowest BRL option with its matching minimum stay', () => {
  const rate = getStaysCalendarDisplayRate({
    date: '2026-11-19',
    avail: 1,
    prices: [
      { minStay: 2, _mcval: { BRL: 120 } },
      { minStay: 5, _mcval: { BRL: 95 } },
      { minStay: 1, _mcval: { BRL: 150, USD: 30 } },
    ],
  });

  assert.deepEqual(rate, { amount: 95, minStay: 5, hasAlternatives: true });
});

test('calendar display rate excludes minimum-stay rates that do not fit the selected period', () => {
  const rate = getStaysCalendarDisplayRate(
    {
      date: '2026-11-19',
      avail: 1,
      prices: [
        { minStay: 5, _mcval: { BRL: 95 } },
        { minStay: 2, _mcval: { BRL: 120 } },
        { minStay: 1, _mcval: { BRL: 150 } },
      ],
    },
    2,
  );

  assert.deepEqual(rate, { amount: 120, minStay: 2, hasAlternatives: true });
});

test('calendar display rate returns null when no price applies to the selected period', () => {
  const rate = getStaysCalendarDisplayRate(
    {
      date: '2026-11-19',
      avail: 1,
      prices: [{ minStay: 5, _mcval: { BRL: 95 } }],
    },
    2,
  );

  assert.equal(rate, null);
});

test('calendar display rate marks equal prices with different stay conditions as alternatives', () => {
  const rate = getStaysCalendarDisplayRate({
    date: '2026-11-19',
    avail: 1,
    prices: [
      { minStay: 5, _mcval: { BRL: 100 } },
      { minStay: 2, _mcval: { BRL: 100 } },
    ],
  });

  assert.deepEqual(rate, { amount: 100, minStay: 2, hasAlternatives: true });
});

test('calendar display rate ignores invalid BRL values and returns null without a usable rate', () => {
  const rate = getStaysCalendarDisplayRate({
    date: '2026-11-19',
    avail: 1,
    prices: [
      { minStay: 1, _mcval: { BRL: 0, USD: 80 } },
      { minStay: 2, _mcval: { BRL: Number.NaN } },
    ],
  });

  assert.equal(rate, null);
});
