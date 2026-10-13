import assert from 'node:assert/strict';
import test from 'node:test';
import { readSavedPropertyIds } from '../src/utils/savedPropertyIds.ts';

const defaults = ['JQ08G', 'stays-lacqua-204'];

test('uses the default saved accommodations when storage is absent or malformed', () => {
  assert.deepEqual(readSavedPropertyIds(null), defaults);
  assert.deepEqual(readSavedPropertyIds('{'), defaults);
  assert.deepEqual(readSavedPropertyIds('{"saved":true}'), defaults);
  assert.deepEqual(readSavedPropertyIds('["prop-demo"]'), defaults);
});

test('keeps saved string IDs and ignores demo IDs and malformed entries', () => {
  assert.deepEqual(readSavedPropertyIds('["JQ08G","prop-demo",3,null,"custom-listing"]'), [
    'JQ08G',
    'custom-listing',
  ]);
});
