import React from 'react';
import { Property, Currency } from '../../types';
import { PropertyCard } from '../property/PropertyCard';
import { Heart, Compass } from 'lucide-react';

interface WishlistsViewProps {
  savedProperties: Property[];
  currency: Currency;
  onToggleSave: (id: string) => void;
  onSelectProperty: (property: Property) => void;
  onExploreMore: () => void;
  showTotalWithTaxes: boolean;
}

export const WishlistsView: React.FC<WishlistsViewProps> = ({
  savedProperties,
  currency,
  onToggleSave,
  onSelectProperty,
  onExploreMore,
  showTotalWithTaxes,
}) => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 [@media(max-height:640px)]:py-6 [@media(max-height:400px)]:py-1 min-h-[75vh]">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-8 [@media(max-height:400px)]:gap-2 [@media(max-height:400px)]:pb-1 [@media(min-width:480px)_and_(max-height:400px)]:flex-row [@media(min-width:480px)_and_(max-height:400px)]:items-center border-b border-neutral-100">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight">
            Lugares Favoritos
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1 [@media(max-height:400px)]:hidden">
            Espaços que você salvou para suas próximas aventuras e escapadas de fim de semana.
          </p>
        </div>

        <button
          onClick={onExploreMore}
          className={`flex min-h-11 items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-black cursor-pointer ${savedProperties.length === 0 ? '[@media(max-height:400px)]:hidden' : ''}`}
        >
          <Compass className="w-4 h-4" />
          <span>Explorar mais lugares</span>
        </button>
      </div>

      {savedProperties.length === 0 ? (
        <div className="text-center py-20 [@media(max-height:640px)]:py-6 [@media(max-height:400px)]:-mt-5 [@media(max-height:400px)]:py-1 max-w-md mx-auto space-y-4 [@media(max-height:640px)]:space-y-3 [@media(max-height:400px)]:space-y-0">
          <div className="w-16 h-16 [@media(max-height:400px)]:w-8 [@media(max-height:400px)]:h-8 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center mx-auto border border-orange-200/60 shadow-xs">
            <Heart className="w-8 h-8 [@media(max-height:400px)]:w-4 [@media(max-height:400px)]:h-4 fill-orange-500 text-orange-500" />
          </div>
          <h3 className="text-lg [@media(max-height:400px)]:text-base [@media(max-height:400px)]:leading-tight font-bold text-neutral-900">
            Sua lista de favoritos está vazia
          </h3>
          <p className="text-xs [@media(max-height:400px)]:sr-only text-neutral-500">
            Enquanto navega, clique no ícone de coração nos anúncios que mais gostar para salvá-los
            aqui.
          </p>
          <button
            onClick={onExploreMore}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-7 py-3 [@media(max-height:400px)]:py-2 text-sm font-extrabold text-white shadow-md shadow-orange-500/25 transition-all hover:from-orange-600 hover:to-amber-600 hover:scale-105 active:scale-95 cursor-pointer"
          >
            Começar a explorar
          </button>
        </div>
      ) : (
        <div className="mt-8 [@media(max-height:400px)]:mt-1">
          <p className="text-xs text-neutral-500 mb-6 [@media(max-height:400px)]:mb-1 font-semibold">
            {savedProperties.length} acomodaç
            {savedProperties.length === 1 ? 'ão salva' : 'ões salvas'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 [@media(max-height:400px)]:gap-3 [@media(min-width:480px)_and_(max-height:400px)]:grid-cols-2">
            {savedProperties.map((prop) => (
              <PropertyCard
                key={prop.id}
                property={prop}
                currency={currency}
                isSaved={true}
                onToggleSave={onToggleSave}
                onSelectProperty={onSelectProperty}
                showTotalWithTaxes={showTotalWithTaxes}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
