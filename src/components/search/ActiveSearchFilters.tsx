import { MapPin, X } from 'lucide-react';
import type { SearchFilters } from '../../types';
import { CATEGORIES } from '../../data/mockProperties';
import { formatCurrency } from '../../utils/formatters';

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  entire_place: 'Espaço inteiro',
  cabin: 'Cabana ou chalé',
  villa: 'Vila',
};

interface ActiveSearchFiltersProps {
  filters: SearchFilters;
  activeFilterCount: number;
  defaultFilters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
  onRemoveDestination: () => void;
  onRemoveDates: () => void;
  onRemoveGuests: () => void;
  onClearFilters: () => void;
}

export function ActiveSearchFilters({
  filters,
  activeFilterCount,
  defaultFilters,
  onChange,
  onRemoveDestination,
  onRemoveDates,
  onRemoveGuests,
  onClearFilters,
}: ActiveSearchFiltersProps) {
  const hasDestinationFilter = Boolean(filters.destination || filters.destinationPropertyId);
  const hasDateFilter = Boolean(filters.checkIn && filters.checkOut);
  const hasGuestFilter =
    filters.guests.adults !== defaultFilters.guests.adults ||
    filters.guests.children !== defaultFilters.guests.children ||
    filters.guests.infants !== defaultFilters.guests.infants ||
    filters.guests.pets !== defaultFilters.guests.pets;
  const hasTripCriteria = hasDestinationFilter || hasDateFilter || hasGuestFilter;
  const selectedCategory = CATEGORIES.find(({ id }) => id === filters.category && id !== 'all');
  const hasPropertyFilters = activeFilterCount > 0;

  if (!hasTripCriteria && !selectedCategory && !hasPropertyFilters) return null;

  return (
    <div data-active-criteria className="mb-6 space-y-3 text-xs">
      {hasTripCriteria && (
        <div
          role="group"
          aria-label="Critérios da viagem"
          className="flex flex-wrap items-center gap-x-1 gap-y-1.5 sm:gap-2"
        >
          <span className="w-full font-extrabold text-neutral-800 sm:w-auto">Sua viagem:</span>
          {hasDestinationFilter && (
            <span className="-my-px flex items-center gap-1.5 rounded-full border border-white/80 px-1 py-0 font-bold text-neutral-900 shadow-xs liquid-glass-pill sm:my-0 sm:px-3 sm:py-1.5">
              <MapPin aria-hidden="true" className="h-3.5 w-3.5 text-orange-500" />
              <span>{filters.destination || 'Condomínio selecionado'}</span>
              <RemoveFilterButton
                label={filters.destination ? 'destino' : 'condomínio selecionado'}
                onClick={onRemoveDestination}
              />
            </span>
          )}
          {hasDateFilter && (
            <FilterChip
              label={`Datas: ${formatDate(filters.checkIn)} – ${formatDate(filters.checkOut)}`}
              onRemove={onRemoveDates}
            />
          )}
          {hasGuestFilter && (
            <FilterChip
              label={`Hóspedes: ${formatGuests(filters.guests)}`}
              onRemove={onRemoveGuests}
            />
          )}
        </div>
      )}
      {selectedCategory && (
        <div
          role="group"
          aria-label="Categoria selecionada"
          className="flex flex-wrap items-center gap-x-1 gap-y-1.5 sm:gap-2"
        >
          <span className="w-full font-extrabold text-neutral-800 sm:w-auto">Categoria:</span>
          <FilterChip
            label={selectedCategory.label}
            onRemove={() => onChange({ ...filters, category: 'all' })}
          />
        </div>
      )}
      {hasPropertyFilters && (
        <div
          role="group"
          aria-label="Filtros do imóvel ativos"
          className="flex flex-wrap items-center gap-x-1 gap-y-1.5 sm:gap-2"
        >
          <span className="sr-only font-extrabold text-neutral-800 sm:not-sr-only sm:w-auto">
            Filtros do imóvel:
          </span>
          {(filters.minPrice > defaultFilters.minPrice ||
            filters.maxPrice < defaultFilters.maxPrice) && (
            <FilterChip
              label={`Preço em reais: ${formatCurrency(filters.minPrice, 'BRL')} – ${formatCurrency(filters.maxPrice, 'BRL')} / noite`}
              onRemove={() =>
                onChange({
                  ...filters,
                  minPrice: defaultFilters.minPrice,
                  maxPrice: defaultFilters.maxPrice,
                })
              }
            />
          )}
          {filters.propertyTypes.map((type) => (
            <FilterChip
              key={type}
              label={PROPERTY_TYPE_LABELS[type] || type}
              onRemove={() =>
                onChange({
                  ...filters,
                  propertyTypes: filters.propertyTypes.filter((item) => item !== type),
                })
              }
            />
          ))}
          {filters.amenities.map((amenity) => (
            <FilterChip
              key={amenity}
              label={amenity}
              onRemove={() =>
                onChange({
                  ...filters,
                  amenities: filters.amenities.filter((item) => item !== amenity),
                })
              }
            />
          ))}
          {filters.minBedrooms > defaultFilters.minBedrooms && (
            <FilterChip
              label={`${filters.minBedrooms}+ quartos`}
              onRemove={() => onChange({ ...filters, minBedrooms: defaultFilters.minBedrooms })}
            />
          )}
          {filters.minBaths > defaultFilters.minBaths && (
            <FilterChip
              label={`${filters.minBaths}+ banheiros`}
              onRemove={() => onChange({ ...filters, minBaths: defaultFilters.minBaths })}
            />
          )}
          {filters.superhostOnly && (
            <FilterChip
              label="Apenas Superhost"
              onRemove={() => onChange({ ...filters, superhostOnly: false })}
            />
          )}
          {filters.instantBookOnly && (
            <FilterChip
              label="Reserva Imediata"
              onRemove={() => onChange({ ...filters, instantBookOnly: false })}
            />
          )}
          <button
            type="button"
            onClick={() => {
              onClearFilters();
              const restoreFocus = () => {
                const activeCriteria =
                  document.querySelector<HTMLElement>('[data-active-criteria]');
                const nextAction = activeCriteria?.querySelector<HTMLButtonElement>(
                  'button[aria-label^="Remover filtro:"]',
                );
                (
                  nextAction ??
                  document.querySelector<HTMLButtonElement>('button[aria-label^="Abrir filtros"]')
                )?.focus();
              };
              if (window.requestAnimationFrame) {
                window.requestAnimationFrame(restoreFocus);
              } else {
                window.setTimeout(restoreFocus, 0);
              }
            }}
            className="inline-flex min-h-11 items-center px-2 font-extrabold text-orange-700 underline hover:text-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 sm:min-h-0 sm:px-0"
          >
            Limpar filtros
          </button>
        </div>
      )}
    </div>
  );
}

function formatDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatGuests(guests: SearchFilters['guests']): string {
  const categories = [
    [guests.adults, guests.adults === 1 ? 'adulto' : 'adultos'],
    [guests.children, guests.children === 1 ? 'criança' : 'crianças'],
    [guests.infants, guests.infants === 1 ? 'bebê' : 'bebês'],
    [guests.pets, guests.pets === 1 ? 'pet' : 'pets'],
  ] as const;
  return categories
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}`)
    .join(', ');
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="-my-px flex items-center gap-1.5 rounded-full border border-white/80 px-1 py-0 font-bold text-neutral-900 shadow-xs liquid-glass-pill sm:my-0 sm:px-3 sm:py-1.5">
      <span>{label}</span>
      <RemoveFilterButton label={label} onClick={onRemove} />
    </span>
  );
}

function RemoveFilterButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Remover filtro: ${label}`}
      onClick={(event) => {
        const group = event.currentTarget.closest<HTMLElement>('[data-active-criteria]');
        const removeButtons = Array.from(
          group?.querySelectorAll<HTMLButtonElement>('button[aria-label^="Remover filtro:"]') ?? [],
        );
        const removedIndex = removeButtons.indexOf(event.currentTarget);
        onClick();

        const restoreFocus = () => {
          const updatedGroup = document.querySelector<HTMLElement>('[data-active-criteria]');
          if (!updatedGroup) {
            document
              .querySelector<HTMLButtonElement>('button[aria-label^="Abrir filtros"]')
              ?.focus();
            return;
          }

          const updatedButtons = updatedGroup.querySelectorAll<HTMLButtonElement>(
            'button[aria-label^="Remover filtro:"]',
          );
          const nextButton = updatedButtons[Math.min(removedIndex, updatedButtons.length - 1)];
          (nextButton ?? updatedGroup.querySelector<HTMLButtonElement>('button'))?.focus();
        };

        if (window.requestAnimationFrame) {
          window.requestAnimationFrame(restoreFocus);
        } else {
          window.setTimeout(restoreFocus, 0);
        }
      }}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 sm:h-6 sm:w-6"
    >
      <X aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  );
}
