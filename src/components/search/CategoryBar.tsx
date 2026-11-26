import React from 'react';
import {
  Sparkles,
  Waves,
  Home,
  Droplets,
  Trees,
  Mountain,
  Crown,
  Palmtree,
  Landmark,
  Fish,
  Tent,
  SlidersHorizontal,
  GlassWater,
  MapPin,
  Users,
  PawPrint,
  Building,
} from 'lucide-react';
interface CategoryOption {
  id: string;
  label: string;
  icon: string;
}

interface CategoryBarProps {
  selectedCategory: string;
  onSelectCategory: (categoryId: string) => void;
  onOpenFilters: () => void;
  activeFilterCount: number;
  showTotalWithTaxes?: boolean;
  setShowTotalWithTaxes?: (show: boolean) => void;
  viewMode?: 'grid' | 'map';
  setViewMode?: (mode: 'grid' | 'map') => void;
  availableCategories: CategoryOption[];
  isCondominiumView?: boolean;
  searchBar?: React.ReactNode;
  compact?: boolean;
}

export const CategoryBar: React.FC<CategoryBarProps> = ({
  selectedCategory,
  onSelectCategory,
  onOpenFilters,
  activeFilterCount,
  availableCategories,
  searchBar,
  compact = false,
}) => {
  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Waves':
        return <Waves className="w-5 h-5" />;
      case 'Home':
        return <Home className="w-5 h-5" />;
      case 'Droplets':
        return <Droplets className="w-5 h-5" />;
      case 'Trees':
        return <Trees className="w-5 h-5" />;
      case 'Mountain':
        return <Mountain className="w-5 h-5" />;
      case 'Crown':
        return <Crown className="w-5 h-5" />;
      case 'Palmtree':
        return <Palmtree className="w-5 h-5" />;
      case 'Landmark':
        return <Landmark className="w-5 h-5" />;
      case 'Fish':
        return <Fish className="w-5 h-5" />;
      case 'Tent':
        return <Tent className="w-5 h-5" />;
      case 'GlassWater':
        return <GlassWater className="w-5 h-5" />;
      case 'MapPin':
        return <MapPin className="w-5 h-5" />;
      case 'Users':
        return <Users className="w-5 h-5" />;
      case 'PawPrint':
        return <PawPrint className="w-5 h-5" />;
      case 'Building':
        return <Building className="w-5 h-5" />;
      default:
        return <Sparkles className="w-5 h-5" />;
    }
  };

  return (
    <div
      aria-hidden={compact || undefined}
      inert={compact || undefined}
      className={`border-t border-neutral-100 bg-white transition-[transform,opacity] duration-300 motion-reduce:transition-none ${compact ? 'sm:pointer-events-none sm:-translate-y-3 sm:opacity-0' : ''}`}
    >
      <div className="mx-auto max-w-[1440px] px-3 py-1.5 sm:px-7 sm:py-2.5 lg:px-10">
        <div className="mx-auto flex w-full items-center gap-2 sm:max-w-[calc(var(--search-bar-width)+6rem)] sm:gap-3">
          <div
            role="group"
            aria-label="Categorias de hospedagem"
            className="no-scrollbar order-2 flex min-w-0 flex-1 items-center gap-3 overflow-x-auto py-1 sm:order-1 sm:gap-5"
          >
            {availableCategories.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => onSelectCategory(cat.id)}
                  aria-label={cat.label}
                  aria-pressed={isSelected}
                  className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 ${
                    isSelected
                      ? 'border-neutral-900 bg-white text-neutral-950'
                      : 'border-transparent text-neutral-500 hover:border-neutral-200 hover:bg-white hover:text-neutral-900'
                  }`}
                >
                  <span aria-hidden="true" className="shrink-0">
                    {getIcon(cat.icon)}
                  </span>
                  <span className="whitespace-nowrap">{cat.label}</span>
                </button>
              );
            })}
          </div>
          <div
            data-shared-search="expanded"
            style={{ viewTransitionName: compact ? 'none' : 'shared-search-bar' }}
            className="order-2 hidden min-w-0 w-full max-w-[var(--search-bar-width)] sm:block"
          >
            {searchBar}
          </div>
          <button
            onClick={onOpenFilters}
            aria-label={
              activeFilterCount > 0 ? `Abrir filtros; ${activeFilterCount} ativos` : 'Abrir filtros'
            }
            className="order-1 flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-neutral-300 bg-white px-3 text-xs font-bold text-neutral-800 transition-colors hover:border-neutral-900 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 sm:order-3 sm:px-4"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-neutral-700" />
            <span>Filtros</span>
            {activeFilterCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-700 text-[11px] font-bold text-white shadow-xs">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
