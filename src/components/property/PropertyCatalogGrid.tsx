import { Search } from 'lucide-react';
import type { Currency, Property } from '../../types';
import { CatalogLoadNotice } from './CatalogLoadNotice';
import { PropertyCard } from './PropertyCard';

type PropertyCatalogStatus = 'loading' | 'error' | 'stale' | 'ready';

interface PropertyCatalogGridProps {
  status: PropertyCatalogStatus;
  properties: Property[];
  currency: Currency;
  savedPropertyIds: string[];
  showTotalWithTaxes: boolean;
  hasSearchDates?: boolean;
  availabilityConfirmed?: boolean;
  hasAvailableSearchResults?: boolean;
  searchGuestCount?: number;
  isRefreshingCatalog?: boolean;
  onRetryCatalog: () => void;
  onToggleSave: (propertyId: string) => void;
  onSelectProperty: (property: Property) => void;
  onResetFilters: () => void;
  onClearCatalogFilters: () => void;
}

export function PropertyCatalogGrid({
  status,
  properties,
  currency,
  savedPropertyIds,
  showTotalWithTaxes,
  hasSearchDates = false,
  availabilityConfirmed = false,
  hasAvailableSearchResults = false,
  searchGuestCount = 1,
  isRefreshingCatalog = false,
  onRetryCatalog,
  onToggleSave,
  onSelectProperty,
  onResetFilters,
  onClearCatalogFilters,
}: PropertyCatalogGridProps) {
  if (status === 'loading') {
    return <CatalogLoadNotice status="loading" isRefreshing={false} onRetry={onRetryCatalog} />;
  }

  if (status === 'error') {
    return <CatalogLoadNotice status="error" isRefreshing={false} onRetry={onRetryCatalog} />;
  }

  const staleNotice = status === 'stale' && (
    <CatalogLoadNotice status="stale" isRefreshing={isRefreshingCatalog} onRetry={onRetryCatalog} />
  );

  if (properties.length === 0) {
    return (
      <div>
        {staleNotice}
        <div className="text-center py-20 max-w-md mx-auto space-y-4">
          <div className="w-16 h-16 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto">
            <Search aria-hidden="true" className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-neutral-900">
            {hasAvailableSearchResults
              ? 'Nenhum imóvel corresponde a esses filtros'
              : 'Nenhuma acomodação encontrada'}
          </h3>
          <p className="text-xs text-neutral-500">
            {hasAvailableSearchResults
              ? 'A busca encontrou acomodações. Remova alguns filtros para ver mais opções sem alterar datas, hóspedes ou destino.'
              : 'Remova as datas da busca e todos os filtros para voltar a explorar as acomodações.'}
          </p>
          <button
            type="button"
            onClick={hasAvailableSearchResults ? onClearCatalogFilters : onResetFilters}
            className="min-h-11 rounded-full bg-neutral-900 px-6 py-2.5 text-xs font-bold text-white transition-all hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
          >
            {hasAvailableSearchResults
              ? 'Limpar filtros'
              : 'Limpar filtros e ver todas as acomodações'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {staleNotice}
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
            hasSearchDates={hasSearchDates}
            availabilityConfirmed={availabilityConfirmed}
            searchGuestCount={searchGuestCount}
            prioritizeImage={index === 0}
          />
        ))}
      </div>
    </div>
  );
}
