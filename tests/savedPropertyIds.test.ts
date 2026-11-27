import assert from 'node:assert/strict';
import test from 'node:test';
import { readSavedPropertyIds } from '../src/utils/savedPropertyIds.ts';

test('starts with no saved accommodations when storage is absent or invalid', () => {
  assert.deepEqual(readSavedPropertyIds(null), []);
  assert.deepEqual(readSavedPropertyIds('{'), []);
  assert.deepEqual(readSavedPropertyIds('{"saved":true}'), []);
  assert.deepEqual(readSavedPropertyIds('["prop-demo"]'), []);
  assert.deepEqual(readSavedPropertyIds('[]'), []);
});

test('keeps unique saved string IDs and ignores demo IDs and malformed entries', () => {
  assert.deepEqual(readSavedPropertyIds('["JQ08G","prop-demo",3,null,"custom-listing","JQ08G"]'), [
    'JQ08G',
    'custom-listing',
  ]);
});
