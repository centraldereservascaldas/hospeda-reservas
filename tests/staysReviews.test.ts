import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStaysGuestReview, summarizeStaysReviews } from '../src/utils/staysReviews.ts';

test('includes reviews that are not published and marks their status clearly', () => {
  const review = normalizeStaysGuestReview({
    _id: 'review-1',
    status: 'new',
    source: 'airbnb',
    rating: 5,
    publicReview: 'not yet public',
  });

  assert.equal(review?.publicationStatus, 'not-published');
  assert.equal(review?.comment, 'not yet public');
});

test('maps a published Airbnb review with the guest name, but never private feedback', () => {
  const review = normalizeStaysGuestReview({
    _id: 'review-2',
    status: 'published',
    source: 'airbnb',
    rating: 4.8,
    day: '2026-02-03',
    client: { fName: 'Private guest name' },
    publicReview: 'Public review text',
    privateFeedback: 'private text',
    cleanlinessRating: 5,
    accuracyRating: 4,
    apartment: { avatar: 'should-not-be-used-as-author-photo' },
  });

  assert.deepEqual(review, {
    id: 'review-2',
    authorName: 'Private guest name',
    rating: 4.8,
    date: '2026-02-03',
    comment: 'Public review text',
    source: 'airbnb',
    publicationStatus: 'published',
    categories: { cleanliness: 5, accuracy: 4 },
  });
  assert.equal(JSON.stringify(review).includes('private text'), false);
});

test('maps Booking.com text fields and only semantically matching category scores', () => {
  const review = normalizeStaysGuestReview({
    _id: 'review-3',
    status: 'Published',
    source: 'bookingcom',
    rating: 4.5,
    headlineComment: 'Great stay',
    positiveComment: 'Very clean',
    negativeComment: '',
    cleanRating: 5,
    locationRating: 4,
    staffRating: 5,
  });

  assert.equal(review?.comment, 'Great stay\n\nVery clean');
  assert.deepEqual(review?.categories, { cleanliness: 5, location: 4 });
});

test('summarizes only supplied published reviews and returns zero for an empty list', () => {
  const first = normalizeStaysGuestReview({ _id: 'a', status: 'published', source: 'internal', rating: 4, reviewText: 'Ok' })!;
  const second = normalizeStaysGuestReview({ _id: 'b', status: 'published', source: 'expedia', rating: 5, publicReview: 'Good' })!;

  assert.deepEqual(summarizeStaysReviews([first, second]), { rating: 4.5, reviewCount: 2 });
  assert.deepEqual(summarizeStaysReviews([]), { rating: 0, reviewCount: 0 });
});
