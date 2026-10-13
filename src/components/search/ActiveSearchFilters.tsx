import { MapPin } from 'lucide-react';
import type { SearchFilters } from '../../types';

interface ActiveSearchFiltersProps {
  filters: SearchFilters;
  activeFilterCount: number;
  defaultFilters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
}

export function ActiveSearchFilters({
  filters,
  activeFilterCount,
  defaultFilters,
  onChange,
}: ActiveSearchFiltersProps) {
  if (!filters.destination && activeFilterCount === 0) return null;

  return (
    <div
      role="group"
      aria-label="Filtros ativos"
      className="mb-6 flex flex-wrap items-center gap-2 text-xs"
    >
      <span className="font-extrabold text-neutral-800">Filtros ativos:</span>
      {filters.destination && (
        <span className="px-3 py-1.5 rounded-full liquid-glass-pill text-neutral-900 font-bold border border-white/80 shadow-xs flex items-center gap-1.5">
          <MapPin aria-hidden="true" className="w-3.5 h-3.5 text-orange-500" />
          <span>{filters.destination}</span>
          <button
            type="button"
            aria-label="Remover filtro de destino"
            onClick={() => onChange({ ...filters, destination: '' })}
            className="text-neutral-400 hover:text-neutral-900 ml-1 font-bold"
          >
            ×
          </button>
        </span>
      )}
      {filters.superhostOnly && (
        <span className="px-3 py-1.5 rounded-full liquid-glass-pill text-neutral-900 font-bold border border-white/80 shadow-xs">
          Apenas Superhost
        </span>
      )}
      {filters.instantBookOnly && (
        <span className="px-3 py-1.5 rounded-full liquid-glass-pill text-neutral-900 font-bold border border-white/80 shadow-xs">
          Reserva Imediata
        </span>
      )}
      <button
        type="button"
        onClick={() => onChange(defaultFilters)}
        className="text-orange-700 font-extrabold underline hover:text-orange-800 cursor-pointer ml-2"
      >
        Limpar todos os filtros
      </button>
    </div>
  );
}
