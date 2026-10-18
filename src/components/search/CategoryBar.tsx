import React, { useEffect, useRef, useState } from 'react';
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
  Map,
  Grid,
  GlassWater,
  MapPin,
  Users,
  PawPrint,
  Building,
  ChevronLeft,
  ChevronRight,
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
  showTotalWithTaxes: boolean;
  setShowTotalWithTaxes: (show: boolean) => void;
  viewMode: 'grid' | 'map';
  setViewMode: (mode: 'grid' | 'map') => void;
  availableCategories: CategoryOption[];
  isCondominiumView?: boolean;
}

export const CategoryBar: React.FC<CategoryBarProps> = ({
  selectedCategory,
  onSelectCategory,
  onOpenFilters,
  activeFilterCount,
  showTotalWithTaxes,
  setShowTotalWithTaxes,
  viewMode,
  setViewMode,
  availableCategories,
  isCondominiumView = false,
}) => {
  const toolbarRowRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const pendingCategoryFocusRef = useRef<number | null>(null);
  const [visibleCategoryCount, setVisibleCategoryCount] = useState(4);
  const [categoryPage, setCategoryPage] = useState(0);
  const [categoryItemWidth, setCategoryItemWidth] = useState(112);
  const [categoryGap, setCategoryGap] = useState(12);

  useEffect(() => {
    const toolbarRow = toolbarRowRef.current;
    if (!toolbarRow) return;

    const updateVisibleCount = () => {
      const rowWidth = toolbarRow.clientWidth;
      const actionsWidth = actionsRef.current?.getBoundingClientRect().width ?? 0;
      const itemWidth = window.innerWidth < 640 ? 96 : 112;
      const gap = window.innerWidth < 640 ? 8 : 12;
      const rowGap = window.innerWidth < 640 ? 8 : 16;
      // Fit complete cards, navigation arrows, and the action controls without stretching empty space.
      const categoryWidth = Math.max(itemWidth, rowWidth - actionsWidth - rowGap - 80);
      const nextCount = Math.max(1, Math.floor((categoryWidth + gap) / (itemWidth + gap)));
      setCategoryItemWidth(itemWidth);
      setCategoryGap(gap);
      setVisibleCategoryCount((current) => current === nextCount ? current : nextCount);
    };

    updateVisibleCount();
    const observer = new ResizeObserver(updateVisibleCount);
    observer.observe(toolbarRow);
    if (actionsRef.current) observer.observe(actionsRef.current);
    return () => observer.disconnect();
  }, [isCondominiumView]);

  const pageCount = Math.max(1, Math.ceil(availableCategories.length / visibleCategoryCount));
  const categoryPageWidth = visibleCategoryCount * categoryItemWidth + Math.max(0, visibleCategoryCount - 1) * categoryGap;
  const categoryTrackWidth = availableCategories.length * categoryItemWidth + Math.max(0, availableCategories.length - 1) * categoryGap;

  useEffect(() => {
    setCategoryPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  useEffect(() => {
    const index = pendingCategoryFocusRef.current;
    if (index === null) return;
    pendingCategoryFocusRef.current = null;
    toolbarRowRef.current?.querySelectorAll<HTMLButtonElement>('[data-category-index]')[index]?.focus();
  }, [categoryPage]);

  const changeCategoryPage = (nextPage: number) => {
    pendingCategoryFocusRef.current = nextPage * visibleCategoryCount;
    setCategoryPage(nextPage);
  };

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Waves': return <Waves className="w-5 h-5" />;
      case 'Home': return <Home className="w-5 h-5" />;
      case 'Droplets': return <Droplets className="w-5 h-5" />;
      case 'Trees': return <Trees className="w-5 h-5" />;
      case 'Mountain': return <Mountain className="w-5 h-5" />;
      case 'Crown': return <Crown className="w-5 h-5" />;
      case 'Palmtree': return <Palmtree className="w-5 h-5" />;
      case 'Landmark': return <Landmark className="w-5 h-5" />;
      case 'Fish': return <Fish className="w-5 h-5" />;
      case 'Tent': return <Tent className="w-5 h-5" />;
      case 'GlassWater': return <GlassWater className="w-5 h-5" />;
      case 'MapPin': return <MapPin className="w-5 h-5" />;
      case 'Users': return <Users className="w-5 h-5" />;
      case 'PawPrint': return <PawPrint className="w-5 h-5" />;
      case 'Building': return <Building className="w-5 h-5" />;
      default: return <Sparkles className="w-5 h-5" />;
    }
  };

  return (
    <div className="sticky top-16 sm:top-20 z-30 liquid-glass border-b border-white/50 backdrop-blur-2xl shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-1.5 sm:py-2">
        <div ref={toolbarRowRef} className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center">
          <div className="col-start-2 flex items-center gap-2 sm:gap-4">
          
          {/* Exibe apenas cartões inteiros; as setas alternam páginas sem cortar rótulos. */}
          <div className="flex min-w-0 flex-none items-center gap-2">
            {categoryPage > 0 && (
              <button type="button" onClick={() => changeCategoryPage(Math.max(0, categoryPage - 1))} aria-label={`Ver filtros anteriores; página ${categoryPage + 1} de ${pageCount}`} title="Ver filtros anteriores" className="liquid-glass-button flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/85 text-neutral-800 shadow-md transition hover:scale-105 hover:bg-white active:scale-95">
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0 max-w-full flex-none overflow-hidden py-1" style={{ width: categoryPageWidth }}>
              <div className="category-filter-track flex items-stretch gap-2 px-1 sm:gap-3" style={{ width: categoryTrackWidth, transform: `translateX(-${categoryPage * categoryPageWidth}px)` }}>
              {availableCategories.map((cat, index) => {
                const isSelected = selectedCategory === cat.id;
                const isVisible = index >= categoryPage * visibleCategoryCount && index < (categoryPage + 1) * visibleCategoryCount;
                return (
                  <button
                    key={cat.id}
                    data-category-index={index}
                    onClick={() => onSelectCategory(cat.id)}
                    aria-pressed={isSelected}
                    aria-hidden={!isVisible}
                    tabIndex={isVisible ? 0 : -1}
                    className={`flex w-24 min-w-24 flex-shrink-0 flex-col items-center gap-1 border-b-2 py-1 text-center transition-all duration-300 cursor-pointer group rounded-2xl px-1 sm:w-28 sm:min-w-28 sm:px-1 lg:px-2 ${
                      isSelected
                        ? 'border-orange-500/65 text-neutral-950 font-bold'
                        : 'border-transparent text-neutral-600 hover:text-neutral-900 hover:border-white/80'
                    }`}
                  >
                    <div className={`relative isolate flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl border transition-all duration-300 group-hover:-translate-y-0.5 group-hover:scale-105 ${
                      isSelected
                        ? 'border-white/90 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(255,247,237,0.62)_48%,rgba(251,146,60,0.20))] text-orange-700 shadow-[0_8px_20px_-9px_rgba(234,88,12,0.55),inset_0_1.5px_1px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(234,88,12,0.12)] ring-1 ring-orange-300/35 backdrop-blur-2xl'
                        : 'border-white/90 bg-[linear-gradient(145deg,rgba(255,255,255,0.88),rgba(255,255,255,0.48))] text-neutral-600 shadow-[0_5px_14px_-8px_rgba(15,23,42,0.32),inset_0_1.5px_1px_rgba(255,255,255,0.98)] backdrop-blur-2xl group-hover:text-orange-700 group-hover:shadow-[0_8px_18px_-9px_rgba(15,23,42,0.3),inset_0_1.5px_1px_rgba(255,255,255,1)]'
                    }`}>
                      <span aria-hidden="true" className={`pointer-events-none absolute inset-x-1 top-px h-1/2 rounded-t-[15px] bg-gradient-to-b from-white/90 to-white/0 ${isSelected ? 'opacity-100' : 'opacity-75'}`} />
                      {isSelected && <span aria-hidden="true" className="pointer-events-none absolute -right-2 -top-3 h-8 w-8 rounded-full bg-orange-300/35 blur-md" />}
                      <span className="relative z-10 transition-transform duration-300 group-hover:scale-105">{getIcon(cat.icon)}</span>
                    </div>
                    <span className="flex h-7 w-full items-center justify-center text-center">
                      <span className="block w-full whitespace-normal break-words text-[10px] leading-3 font-semibold sm:text-[11px] sm:leading-4">{cat.label}</span>
                    </span>
                  </button>
                );
              })}
              </div>
            </div>
            {categoryPage < pageCount - 1 && (
              <button
                type="button"
                onClick={() => changeCategoryPage(Math.min(pageCount - 1, categoryPage + 1))}
                aria-label={`Ver outros filtros; página ${categoryPage + 1} de ${pageCount}`}
                title="Ver outros filtros"
                className="liquid-glass-button flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/85 text-neutral-800 shadow-md transition hover:scale-105 hover:bg-white active:scale-95"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Action buttons on the right: Filters, Tax Toggle, Map view */}
          {!isCondominiumView && <div ref={actionsRef} className="flex flex-shrink-0 items-center gap-1 sm:gap-3">
            
            {/* Filter button in Crisp Glass */}
            <button
              onClick={onOpenFilters}
              aria-label={activeFilterCount > 0 ? `Abrir filtros; ${activeFilterCount} ativos` : 'Abrir filtros'}
              className="flex items-center gap-2 px-2 py-2 sm:px-4 sm:py-2.5 rounded-2xl liquid-glass-button hover:bg-white border border-white/85 shadow-xs text-xs font-bold text-neutral-800 transition-all cursor-pointer hover:scale-105 active:scale-95"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-neutral-700" />
              <span className="hidden sm:inline">Filtros</span>
              {activeFilterCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-orange-700 text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Toggle Total with taxes */}
            <div className="hidden lg:flex items-center gap-1.5 sm:gap-3 px-2 sm:px-4 py-2 sm:py-2.5 rounded-2xl liquid-glass-card border border-white/80 text-xs font-semibold text-neutral-800 shadow-xs">
              <span className="hidden lg:inline whitespace-nowrap">Exibir total com taxas</span>
              <span className="lg:hidden whitespace-nowrap">Total + taxas</span>
              <button
                type="button"
                role="switch"
                aria-label="Exibir total com taxas"
                title="Exibir total com taxas"
                aria-checked={showTotalWithTaxes}
                onClick={() => setShowTotalWithTaxes(!showTotalWithTaxes)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-neutral-300 p-0 transition-colors duration-200 ease-in-out focus:outline-none ${
                  showTotalWithTaxes ? 'bg-neutral-900' : 'bg-neutral-200'
                }`}
              >
                <span
                  className={`pointer-events-none absolute left-0.5 top-1/2 block h-4 w-4 -translate-y-1/2 transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out ${
                    showTotalWithTaxes ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Toggle Grid vs Map button */}
            <button
              onClick={() => setViewMode(viewMode === 'grid' ? 'map' : 'grid')}
              aria-label={viewMode === 'grid' ? 'Ver mapa' : 'Ver lista'}
              className="flex items-center gap-2 px-2 py-2.5 sm:px-4 rounded-2xl liquid-glass-dark text-white text-xs font-bold shadow-md transition-all cursor-pointer hover:scale-105 active:scale-95"
            >
              {viewMode === 'grid' ? (
                <>
                  <Map className="w-3.5 h-3.5 text-orange-400" />
                  <span className="hidden sm:inline">Ver mapa</span>
                </>
              ) : (
                <>
                  <Grid className="w-3.5 h-3.5 text-orange-400" />
                  <span className="hidden sm:inline">Ver lista</span>
                </>
              )}
            </button>

          </div>}
          </div>

        </div>
      </div>
    </div>
  );
};
