import type { Property, Review } from '../types';

export interface ReviewCategorySummary {
  label: string;
  score: number;
}

const reviewCategoryFields: Array<{ key: keyof Review['categories']; label: string }> = [
  { key: 'cleanliness', label: 'Limpeza' },
  { key: 'accuracy', label: 'Precisão' },
  { key: 'communication', label: 'Comunicação' },
  { key: 'location', label: 'Localização' },
  { key: 'checkIn', label: 'Check-in' },
  { key: 'value', label: 'Custo-benefício' },
];

export function getSyncedPropertyReviews(property: Property): Review[] {
  return property.reviewsSynced ? property.reviews.filter((review) => Boolean(review.source)) : [];
}

export function summarizeReviewCategories(reviews: Review[]): ReviewCategorySummary[] {
  return reviewCategoryFields.flatMap(({ key, label }) => {
    const values = reviews
      .map((review) => review.categories[key])
      .filter((value): value is number => Number.isFinite(value) && Number(value) > 0);

    return values.length
      ? [{ label, score: values.reduce((sum, value) => sum + value, 0) / values.length }]
      : [];
  });
}
