import assert from 'node:assert/strict';
import test from 'node:test';
import {
  selectAvailabilityDay,
  selectAvailabilityRange,
} from '../src/utils/propertyDateSelection.ts';
import type { StaysCalendarDay } from '../src/utils/staysAvailability.ts';

const calendar: StaysCalendarDay[] = ['2026-11-19', '2026-11-20', '2026-11-21'].map((date) => ({
  date,
  avail: 1,
  prices: [{ minStay: 2 }],
}));

const day = (date: string): StaysCalendarDay => ({ date, avail: 1 });

test('starts a new selection when no check-in or a complete range exists', () => {
  assert.deepEqual(selectAvailabilityDay(calendar, '', '', day('2026-11-19')), {
    checkIn: '2026-11-19',
    checkOut: '',
    message: '',
  });
  assert.deepEqual(selectAvailabilityDay(calendar, '2026-11-19', '2026-11-21', day('2026-11-20')), {
    checkIn: '2026-11-20',
    checkOut: '',
    message: '',
  });
});

test('selects a valid checkout and rejects an unavailable range without changing dates', () => {
  assert.deepEqual(selectAvailabilityDay(calendar, '2026-11-19', '', day('2026-11-21')), {
    checkIn: '2026-11-19',
    checkOut: '2026-11-21',
    message: '',
  });

  const occupiedCalendar = calendar.map((entry) =>
    entry.date === '2026-11-20' ? { ...entry, avail: 0 } : entry,
  );
  const rejected = selectAvailabilityDay(occupiedCalendar, '2026-11-19', '', day('2026-11-21'));
  assert.equal(rejected.checkIn, '2026-11-19');
  assert.equal(rejected.checkOut, '');
  assert.match(rejected.message, /data indisponível/);
});

test('restarts the range when the selected day is before or equal to check-in', () => {
  assert.deepEqual(selectAvailabilityDay(calendar, '2026-11-20', '', day('2026-11-19')), {
    checkIn: '2026-11-19',
    checkOut: '',
    message: '',
  });
});

test('accepts a dragged date range only when arrival and every night are available', () => {
  assert.deepEqual(selectAvailabilityRange(calendar, '2026-11-19', '2026-11-21'), {
    checkIn: '2026-11-19',
    checkOut: '2026-11-21',
    message: '',
  });

  const blockedArrival = calendar.map((entry) =>
    entry.date === '2026-11-19' ? { ...entry, closedToArrival: true } : entry,
  );
  assert.match(
    selectAvailabilityRange(blockedArrival, '2026-11-19', '2026-11-21').message,
    /não está disponível para check-in/,
  );

  const unavailableNight = calendar.map((entry) =>
    entry.date === '2026-11-20' ? { ...entry, avail: 0 } : entry,
  );
  assert.match(
    selectAvailabilityRange(unavailableNight, '2026-11-19', '2026-11-21').message,
    /não atende à estadia mínima/,
  );
});
