import assert from 'node:assert/strict';
import test from 'node:test';
import type { Review } from '../src/types/index.ts';
import { summarizeReviewCategories } from '../src/utils/propertyReviews.ts';

const review = (id: string, categories: Review['categories']): Review => ({
  id,
  authorName: `Hóspede ${id}`,
  rating: 4,
  date: '2026-01-01',
  comment: '',
  source: 'internal',
  publicationStatus: 'published',
  categories,
});

test('averages supplied positive review category scores and omits empty categories', () => {
  assert.deepEqual(
    summarizeReviewCategories([
      review('one', { cleanliness: 4, location: 0 }),
      review('two', { cleanliness: 5, location: Number.NaN }),
      review('three', { accuracy: 3 }),
    ]),
    [
      { label: 'Limpeza', score: 4.5 },
      { label: 'Precisão', score: 3 },
    ],
  );
});

test('returns no category summaries when there are no reviews', () => {
  assert.deepEqual(summarizeReviewCategories([]), []);
});
