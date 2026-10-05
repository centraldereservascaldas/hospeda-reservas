import { Review } from '../types';

export interface StaysGuestReviewRecord {
  _id?: unknown;
  status?: unknown;
  day?: unknown;
  source?: unknown;
  rating?: unknown;
  overallRating?: unknown;
  client?: { fName?: unknown; lName?: unknown; name?: unknown };
  apartment?: { _id?: unknown; id?: unknown; avatar?: unknown };
  publicReview?: unknown;
  reviewText?: unknown;
  headlineComment?: unknown;
  positiveComment?: unknown;
  negativeComment?: unknown;
  accuracyRating?: unknown;
  cleanlinessRating?: unknown;
  cleanRating?: unknown;
  communicationRating?: unknown;
  locationRating?: unknown;
  checkinRating?: unknown;
  valueRating?: unknown;
  roomCleanRating?: unknown;
  cleaningRating?: unknown;
  [key: string]: unknown;
}

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

const score = (value: unknown): number | undefined => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 && numeric <= 5 ? numeric : undefined;
};

const optionalCategories = (entries: Array<[keyof Review['categories'], unknown]>) => {
  const categories: Partial<Review['categories']> = {};
  for (const [key, value] of entries) {
    const normalized = score(value);
    if (normalized !== undefined) categories[key] = normalized;
  }
  return categories;
};

/** Convert Stays guest reviews without forwarding identity or private fields. */
export function normalizeStaysGuestReview(raw: StaysGuestReviewRecord): Review | null {
  const id = text(raw._id);
  if (!id) return null;

  const source = text(raw.source).toLowerCase();
  const rating = score(raw.rating) ?? (source === 'expedia' ? score(raw.overallRating) : undefined);
  if (!rating) return null;

  let comment = '';
  let categories: Partial<Review['categories']> = {};

  if (source === 'airbnb') {
    comment = text(raw.publicReview);
    categories = optionalCategories([
      ['cleanliness', raw.cleanlinessRating],
      ['accuracy', raw.accuracyRating],
      ['communication', raw.communicationRating],
      ['location', raw.locationRating],
      ['checkIn', raw.checkinRating],
      ['value', raw.valueRating],
    ]);
  } else if (source === 'bookingcom') {
    comment = [raw.headlineComment, raw.positiveComment, raw.negativeComment]
      .map(text)
      .filter(Boolean)
      .filter((part, index, all) => all.indexOf(part) === index)
      .join('\n\n');
    categories = optionalCategories([
      ['cleanliness', raw.cleanRating],
      ['location', raw.locationRating],
      ['value', raw.valueRating],
    ]);
  } else if (source === 'internal') {
    comment = text(raw.reviewText);
    categories = optionalCategories([
      ['cleanliness', raw.cleaningRating],
      ['checkIn', raw.checkinRating],
    ]);
  } else if (source === 'expedia') {
    comment = text(raw.publicReview);
    categories = optionalCategories([
      ['cleanliness', raw.roomCleanRating],
      ['communication', raw.communicationRating],
    ]);
  } else {
    return null;
  }

  const date = text(raw.day);
  const guestName = [text(raw.client?.fName), text(raw.client?.lName)].filter(Boolean).join(' ')
    || text(raw.client?.name)
    || 'Hóspede';
  return {
    id,
    authorName: guestName,
    rating,
    date,
    comment,
    source: source as Review['source'],
    publicationStatus: text(raw.status).toLowerCase() === 'published' ? 'published' : 'not-published',
    categories,
  };
}

export function summarizeStaysReviews(reviews: Review[]): { rating: number; reviewCount: number } {
  if (reviews.length === 0) return { rating: 0, reviewCount: 0 };
  const average = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  return { rating: Math.round(average * 100) / 100, reviewCount: reviews.length };
}
