import { PropertyCatalogSkeleton } from './PropertyCatalogSkeleton';
import { Fragment, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import type { Currency, Property } from '../../types';
import { emitViewItemList } from '../../utils/measurementEvents';
import { Button } from '../Button';
import { EmptyState } from '../EmptyState';
import { CatalogLoadNotice } from './CatalogLoadNotice';
import { PropertyCard } from './PropertyCard';

type PropertyCatalogStatus = 'loading' | 'error' | 'stale' | 'ready';

// The opening row is visible on desktop and commonly reached immediately on mobile.
// Keep the rest native-lazy so an entire catalogue never competes with the first view.
const INITIAL_EAGER_IMAGE_COUNT = 4;

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
  prioritizeFirstImage?: boolean;
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
  prioritizeFirstImage = true,
  onRetryCatalog,
  onToggleSave,
  onSelectProperty,
  onResetFilters,
  onClearCatalogFilters,
}: PropertyCatalogGridProps) {
  const emittedListIdentityRef = useRef<string | null>(null);
  const orderedProperties = [
    ...properties.filter((property) => property.dataSource !== 'imobsys-live'),
    ...properties.filter((property) => property.dataSource === 'imobsys-live'),
  ];
  const firstMoreOptionIndex = orderedProperties.findIndex(
    (property) => property.dataSource === 'imobsys-live',
  );

  useEffect(() => {
    if (status !== 'ready' && status !== 'stale') return;

    const itemIds = orderedProperties.map((property) => property.staysListingId || property.id);
    if (itemIds.length === 0) {
      emittedListIdentityRef.current = null;
      return;
    }

    const identity = JSON.stringify(itemIds);
    if (emittedListIdentityRef.current === identity) return;

    if (emitViewItemList(itemIds)) emittedListIdentityRef.current = identity;
  });

  if (status === 'loading') {
    return <PropertyCatalogSkeleton />;
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
        <EmptyState
          headingLevel="h3"
          icon={<Search aria-hidden="true" className="h-7 w-7" />}
          title={
            hasAvailableSearchResults
              ? 'Nenhum imóvel corresponde a esses filtros'
              : 'Nenhuma acomodação encontrada'
          }
          description={
            hasAvailableSearchResults
              ? 'A busca encontrou acomodações. Remova alguns filtros para ver mais opções sem alterar datas, hóspedes ou destino.'
              : 'Remova as datas da busca e todos os filtros para voltar a explorar as acomodações.'
          }
          action={
            <Button
              variant="primary"
              onClick={hasAvailableSearchResults ? onClearCatalogFilters : onResetFilters}
              className="min-w-48"
            >
              {hasAvailableSearchResults
                ? 'Limpar filtros'
                : 'Limpar filtros e ver todas as acomodações'}
            </Button>
          }
          className="py-20"
        />
      </div>
    );
  }

  return (
    <div>
      {staleNotice}
      <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 sm:gap-y-10 md:grid-cols-3 lg:grid-cols-4">
        {orderedProperties.map((property, index) => {
          const isFirstMoreOption = index === firstMoreOptionIndex;

          return (
            <Fragment key={property.id}>
              {isFirstMoreOption && (
                <div className="col-span-full border-t border-neutral-200 pt-7 sm:pt-9">
                  <h2 className="text-xl font-semibold tracking-tight text-neutral-900">
                    Mais opções
                  </h2>
                  <p className="mt-1 text-sm text-neutral-600">
                    Mais acomodações para as mesmas datas. Valores e disponibilidade sujeitos a
                    confirmação.
                  </p>
                </div>
              )}
              <PropertyCard
                property={property}
                currency={currency}
                isSaved={savedPropertyIds.includes(property.id)}
                onToggleSave={onToggleSave}
                onSelectProperty={onSelectProperty}
                showTotalWithTaxes={showTotalWithTaxes}
                hasSearchDates={hasSearchDates}
                availabilityConfirmed={availabilityConfirmed}
                searchGuestCount={searchGuestCount}
                prioritizeImage={prioritizeFirstImage && index === 0}
                eagerImage={prioritizeFirstImage && index < INITIAL_EAGER_IMAGE_COUNT}
              />
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
