import assert from 'node:assert/strict';
import test from 'node:test';
import { getSurpriseDateCandidates } from '../src/utils/surpriseDates.ts';

test('surprise dates are future stays and preserve a positive stay length', () => {
  const now = new Date(2026, 9, 2, 12);
  const options = getSurpriseDateCandidates(now);

  assert.ok(options.length > 0);
  for (const option of options) {
    assert.ok(option.checkIn >= '2026-10-04');
    assert.ok(option.checkOut > option.checkIn);
    assert.ok(['event', 'holiday', 'high-season'].includes(option.kind));
  }
});

test('surprise dates omit festival dates that are not confirmed for a future edition', () => {
  const options = getSurpriseDateCandidates(new Date(2026, 9, 2, 12));

  assert.equal(options.some((option) => option.kind === 'event'), false);
});
