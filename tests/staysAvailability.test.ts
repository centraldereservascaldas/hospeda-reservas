import assert from 'node:assert/strict';
import test from 'node:test';
import { isCalendarRangeAvailable } from '../src/utils/staysAvailability.ts';

const days = (occupied: string[] = []) => [
  '2026-11-19', '2026-11-20', '2026-11-21',
].map((date) => ({
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
