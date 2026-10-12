import React from 'react';
import { Star } from 'lucide-react';
import type { Property, Review } from '../types';
import { summarizeReviewCategories } from '../utils/propertyReviews';

interface PropertyReviewsSectionProps {
  property: Pick<Property, 'rating' | 'reviewCount' | 'reviewsSynced'>;
  reviews: Review[];
}

const reviewSourceLabels: Record<NonNullable<Review['source']>, string> = {
  airbnb: 'Airbnb',
  bookingcom: 'Booking.com',
  expedia: 'Expedia',
  internal: 'Central de Reservas',
};

export const PropertyReviewsSection: React.FC<PropertyReviewsSectionProps> = ({
  property,
  reviews,
}) => {
  const reviewCategories = summarizeReviewCategories(reviews);

  return (
    <section
      id="property-reviews"
      aria-labelledby="property-reviews-title"
      className="scroll-mt-8 pt-8 border-t border-neutral-200"
    >
      {reviews.length > 0 ? (
        <>
          <div className="flex items-center gap-3 mb-6">
            <Star className="w-6 h-6 fill-neutral-900 text-neutral-900" />
            <h2 id="property-reviews-title" className="text-xl font-bold text-neutral-900">
              {property.rating.toFixed(2)} • {property.reviewCount} avaliações no último ano
            </h2>
          </div>

          {reviewCategories.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8 p-6 rounded-2xl bg-neutral-50/70 border border-neutral-100">
              {reviewCategories.map((item) => (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold text-neutral-700">
                    <span>{item.label}</span>
                    <span>{item.score.toFixed(1)}</span>
                  </div>
                  <div className="h-1.5 w-full bg-neutral-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-neutral-900 rounded-full"
                      style={{ width: `${(item.score / 5) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {reviews.map((review) => (
              <article
                key={review.id}
                className="p-4 rounded-2xl border border-neutral-100 bg-white shadow-2xs space-y-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    aria-hidden="true"
                    className="w-10 h-10 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-sm font-bold"
                  >
                    H
                  </div>
                  <div>
                    <p className="text-xs font-bold text-neutral-900">{review.authorName}</p>
                    <p className="text-[11px] text-neutral-400">
                      {review.date}
                      {review.source
                        ? ` · ${reviewSourceLabels[review.source] || review.source}`
                        : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs font-semibold text-neutral-700">
                  <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                  {review.rating.toFixed(1)} / 5
                </div>
                {review.comment ? (
                  <p className="text-xs text-neutral-700 leading-relaxed whitespace-pre-line">
                    {review.comment}
                  </p>
                ) : (
                  <p className="text-xs text-neutral-500 italic">
                    Hóspede avaliou sem deixar comentário.
                  </p>
                )}
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-neutral-200 bg-white/60 p-6 text-sm text-neutral-600">
          <h2 id="property-reviews-title" className="mb-2 text-lg font-bold text-neutral-900">
            Avaliações dos hóspedes
          </h2>
          {property.reviewsSynced
            ? 'A API não retornou avaliações para este apartamento.'
            : 'As avaliações da API não estão disponíveis no momento.'}
        </div>
      )}
    </section>
  );
};
