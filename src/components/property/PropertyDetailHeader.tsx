import { Medal, Star } from 'lucide-react';
import type { Property } from '../../types';

interface PropertyDetailHeaderProps {
  property: Property;
  hasReviews: boolean;
  onShowReviews: () => void;
}

export function PropertyDetailHeader({
  property,
  hasReviews,
  onShowReviews,
}: PropertyDetailHeaderProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="px-3 py-1 rounded-full bg-orange-50 text-orange-700 font-bold text-xs border border-orange-200/80">
          Central de Reservas Caldas Novas • Seleção Oficial
        </span>
      </div>
      <h1
        id="property-detail-title"
        className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight"
      >
        {property.title}
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-y-2 gap-x-4 text-xs sm:text-sm text-neutral-600">
        {hasReviews && (
          <>
            <div className="flex items-center gap-1 font-semibold text-neutral-900">
              <Star className="w-4 h-4 fill-neutral-900 text-neutral-900" />
              <span>{property.rating.toFixed(2)}</span>
              <span className="text-neutral-500 font-normal">
                ({property.reviewCount} no último ano)
              </span>
            </div>
            <span>•</span>
          </>
        )}
        <button
          type="button"
          onClick={onShowReviews}
          className="underline font-medium text-neutral-600 hover:text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded-sm"
          aria-label={
            hasReviews
              ? `Ver ${property.reviewCount} avaliações dos hóspedes`
              : 'Ver seção de avaliações dos hóspedes'
          }
        >
          {hasReviews
            ? `${property.reviewCount} avaliações dos hóspedes`
            : 'Avaliações dos hóspedes'}
        </button>
        <span>•</span>
        {property.isSuperhost && (
          <>
            <div className="flex items-center gap-1 font-semibold text-orange-600">
              <Medal className="w-4 h-4 text-orange-500" />
              <span>Anfitrião Verificado CRCN</span>
            </div>
            <span>•</span>
          </>
        )}
        <span className="underline font-medium cursor-pointer hover:text-neutral-900">
          {property.location.neighborhood}, {property.location.city} - {property.location.state}
        </span>
      </div>
    </div>
  );
}
