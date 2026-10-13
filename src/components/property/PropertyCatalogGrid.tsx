import { Search } from 'lucide-react';
import type { Currency, Property } from '../../types';
import { PropertyCard } from './PropertyCard';

type PropertyCatalogStatus = 'loading' | 'error' | 'ready';

interface PropertyCatalogGridProps {
  status: PropertyCatalogStatus;
  properties: Property[];
  currency: Currency;
  savedPropertyIds: string[];
  showTotalWithTaxes: boolean;
  onToggleSave: (propertyId: string) => void;
  onSelectProperty: (property: Property) => void;
  onResetFilters: () => void;
}

export function PropertyCatalogGrid({
  status,
  properties,
  currency,
  savedPropertyIds,
  showTotalWithTaxes,
  onToggleSave,
  onSelectProperty,
  onResetFilters,
}: PropertyCatalogGridProps) {
  if (status === 'loading') {
    return (
      <div role="status" className="py-20 text-center text-sm font-semibold text-neutral-600">
        Carregando acomodações…
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div role="alert" className="py-20 text-center text-sm font-semibold text-neutral-700">
        Não foi possível carregar as acomodações. Recarregue a página para tentar novamente.
      </div>
    );
  }

  if (properties.length === 0) {
    return (
      <div className="text-center py-20 max-w-md mx-auto space-y-4">
        <div className="w-16 h-16 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto">
          <Search aria-hidden="true" className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-neutral-900">Nenhuma acomodação encontrada</h3>
        <p className="text-xs text-neutral-500">
          Tente ajustar ou remover alguns filtros como datas, comodidades ou faixa de preço para ver
          mais resultados.
        </p>
        <button
          type="button"
          onClick={onResetFilters}
          className="px-6 py-2.5 rounded-full bg-neutral-900 hover:bg-black text-white text-xs font-bold transition-all cursor-pointer"
        >
          Restaurar todas as acomodações
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
      {properties.map((property, index) => (
        <PropertyCard
          key={property.id}
          property={property}
          currency={currency}
          isSaved={savedPropertyIds.includes(property.id)}
          onToggleSave={onToggleSave}
          onSelectProperty={onSelectProperty}
          showTotalWithTaxes={showTotalWithTaxes}
          prioritizeImage={index === 0}
        />
      ))}
    </div>
  );
}
