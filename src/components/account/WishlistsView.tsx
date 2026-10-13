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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 min-h-[75vh]">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-8 border-b border-neutral-100">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight">
            Lugares Favoritos
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">
            Espaços que você salvou para suas próximas aventuras e escapadas de fim de semana.
          </p>
        </div>

        <button
          onClick={onExploreMore}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-neutral-900 hover:bg-black text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
        >
          <Compass className="w-4 h-4" />
          <span>Explorar mais lugares</span>
        </button>
      </div>

      {savedProperties.length === 0 ? (
        <div className="text-center py-20 max-w-md mx-auto space-y-4">
          <div className="w-16 h-16 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center mx-auto border border-orange-200/60 shadow-xs">
            <Heart className="w-8 h-8 fill-orange-500 text-orange-500" />
          </div>
          <h3 className="text-lg font-bold text-neutral-900">Sua lista de favoritos está vazia</h3>
          <p className="text-xs text-neutral-500">
            Enquanto navega, clique no ícone de coração nos anúncios que mais gostar para salvá-los aqui.
          </p>
          <button
            onClick={onExploreMore}
            className="px-7 py-3 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-extrabold text-xs shadow-md shadow-orange-500/25 transition-all cursor-pointer hover:scale-105 active:scale-95"
          >
            Começar a explorar
          </button>
        </div>
      ) : (
        <div className="mt-8">
          <p className="text-xs text-neutral-500 mb-6 font-semibold">
            {savedProperties.length} acomodaç{savedProperties.length === 1 ? 'ão salva' : 'ões salvas'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
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
