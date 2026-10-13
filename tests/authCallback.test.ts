import assert from 'node:assert/strict';
import test from 'node:test';
import { getAuthCallbackError } from '../src/utils/authCallback.ts';

test('reads OAuth callback errors from query and fragment without a Supabase dependency', () => {
  assert.equal(getAuthCallbackError('?error_description=Expired%20link', ''), 'Expired link');
  assert.equal(getAuthCallbackError('', '#error=access_denied'), 'access_denied');
  assert.equal(
    getAuthCallbackError('?error=invalid&error_description=More%20detail', ''),
    'More detail',
  );
  assert.equal(getAuthCallbackError('', ''), '');
});
