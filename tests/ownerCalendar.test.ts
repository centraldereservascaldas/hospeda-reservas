import assert from 'node:assert/strict';
import test from 'node:test';
import { getOwnerCalendarDaySegment } from '../src/utils/ownerCalendar.ts';

test('shows the Stays checkout date as a partial final-day segment', () => {
  assert.equal(getOwnerCalendarDaySegment('2026-10-26', '2026-10-27', '2026-10-26'), 'full');
  assert.equal(getOwnerCalendarDaySegment('2026-10-26', '2026-10-27', '2026-10-27'), 'checkout');
});

test('does not show calendar segments outside the reserved date range', () => {
  assert.equal(getOwnerCalendarDaySegment('2026-10-26', '2026-10-27', '2026-10-25'), 'none');
  assert.equal(getOwnerCalendarDaySegment('2026-10-26', '2026-10-27', '2026-10-28'), 'none');
});

test('keeps intermediate dates fully occupied and the last date partial', () => {
  assert.equal(getOwnerCalendarDaySegment('2026-10-20', '2026-10-27', '2026-10-25'), 'full');
  assert.equal(getOwnerCalendarDaySegment('2026-10-20', '2026-10-27', '2026-10-26'), 'full');
  assert.equal(getOwnerCalendarDaySegment('2026-10-20', '2026-10-27', '2026-10-27'), 'checkout');
});
