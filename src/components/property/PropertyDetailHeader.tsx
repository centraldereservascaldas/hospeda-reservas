import { Medal, Star } from 'lucide-react';
import type { RefObject } from 'react';
import type { Property } from '../../types';
import { getPublicPropertyTitle } from '../../utils/publicPropertyTitle';

interface PropertyDetailHeaderProps {
  property: Property;
  hasReviews: boolean;
  onShowReviews: () => void;
  titleRef: RefObject<HTMLHeadingElement | null>;
}

export function PropertyDetailHeader({
  property,
  hasReviews,
  onShowReviews,
  titleRef,
}: PropertyDetailHeaderProps) {
  const displayTitle = getPublicPropertyTitle(property.title);

  return (
    <div>
      <h1
        ref={titleRef}
        id="property-detail-title"
        tabIndex={-1}
        className="w-fit max-w-full rounded-sm text-2xl font-extrabold tracking-tight text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 sm:text-3xl"
      >
        {displayTitle}
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-y-2 gap-x-4 text-xs sm:text-sm text-neutral-600">
        {hasReviews && (
          <>
            <div className="flex items-center gap-1 font-semibold text-neutral-900">
              <Star className="w-4 h-4 fill-neutral-900 text-neutral-900" />
              <span>{property.rating.toFixed(2)}</span>
              <span className="text-neutral-500 font-normal">
                ({property.reviewCount} {property.reviewCount === 1 ? 'avaliação' : 'avaliações'})
              </span>
            </div>
            <span>•</span>
          </>
        )}
        {(hasReviews || !property.staysSynced || !property.reviewsSynced) && (
          <>
            <button
              type="button"
              onClick={onShowReviews}
              className="inline-flex min-h-11 items-center rounded-sm underline font-medium text-neutral-600 hover:text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              aria-label={
                hasReviews
                  ? `Ver ${property.reviewCount} ${property.reviewCount === 1 ? 'avaliação' : 'avaliações'}`
                  : 'Ver seção de avaliações dos hóspedes'
              }
            >
              {hasReviews
                ? `${property.reviewCount} ${property.reviewCount === 1 ? 'avaliação' : 'avaliações'}`
                : 'Avaliações dos hóspedes'}
            </button>
            <span>•</span>
          </>
        )}
        {property.staysSynced && property.isSuperhost && (
          <>
            <div className="flex items-center gap-1 font-semibold text-orange-600">
              <Medal className="w-4 h-4 text-orange-500" />
              <span>Anfitrião destaque</span>
            </div>
            <span>•</span>
          </>
        )}
        <span className="font-medium text-neutral-600">
          {property.location.neighborhood}, {property.location.city} - {property.location.state}
        </span>
      </div>
    </div>
  );
}
