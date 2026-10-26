import assert from 'node:assert/strict';
import test from 'node:test';
import { isMissingOwnerReviewMetadataError } from '../src/utils/ownerApproval.ts';

test('recognizes missing Supabase owner review metadata columns', () => {
  assert.equal(isMissingOwnerReviewMetadataError({
    code: '42703',
    message: 'column owner_access.reviewed_by does not exist',
  }), true);
  assert.equal(isMissingOwnerReviewMetadataError({
    code: 'PGRST204',
    message: "Could not find the 'reviewed_at' column in the schema cache",
  }), true);
});

test('does not retry approval for unrelated persistence errors', () => {
  assert.equal(isMissingOwnerReviewMetadataError({
    code: '23505',
    message: 'duplicate key value violates unique constraint',
  }), false);
  assert.equal(isMissingOwnerReviewMetadataError({
    code: '42703',
    message: 'column owner_access.status does not exist',
  }), false);
  assert.equal(isMissingOwnerReviewMetadataError(null), false);
});
