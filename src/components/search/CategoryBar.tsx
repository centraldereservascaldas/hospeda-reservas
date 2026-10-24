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
      const categoryWidth = Math.max(itemWidth, rowWidth - actionsWidth - rowGap - 88);
      const nextCount = Math.max(1, Math.floor((categoryWidth + gap) / (itemWidth + gap)));
      setCategoryItemWidth(itemWidth);
      setCategoryGap(gap);
      setVisibleCategoryCount((current) => (current === nextCount ? current : nextCount));
    };

    updateVisibleCount();
    const observer = new ResizeObserver(updateVisibleCount);
    observer.observe(toolbarRow);
    if (actionsRef.current) observer.observe(actionsRef.current);
    return () => observer.disconnect();
  }, [isCondominiumView]);

  const pageCount = Math.max(1, Math.ceil(availableCategories.length / visibleCategoryCount));
  const categoryPageWidth = visibleCategoryCount * (categoryItemWidth + categoryGap);
  const categoryTrackWidth =
    availableCategories.length * categoryItemWidth +
    Math.max(0, availableCategories.length - 1) * categoryGap;

  useEffect(() => {
    setCategoryPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  useEffect(() => {
    const index = pendingCategoryFocusRef.current;
    if (index === null) return;
    pendingCategoryFocusRef.current = null;
    const categoryButtons =
      toolbarRowRef.current?.querySelectorAll<HTMLButtonElement>('[data-category-index]');
    const categoryButton = categoryButtons?.[index];
    const categoryViewport = categoryButton?.parentElement?.parentElement;
    if (categoryViewport) categoryViewport.scrollLeft = 0;
    categoryButton?.focus({ preventScroll: true });
  }, [categoryPage]);

  const changeCategoryPage = (nextPage: number) => {
    pendingCategoryFocusRef.current = nextPage * visibleCategoryCount;
    setCategoryPage(nextPage);
  };

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Waves':
        return <Waves className="w-4 h-4" />;
      case 'Home':
        return <Home className="w-4 h-4" />;
      case 'Droplets':
        return <Droplets className="w-4 h-4" />;
      case 'Trees':
        return <Trees className="w-4 h-4" />;
      case 'Mountain':
        return <Mountain className="w-4 h-4" />;
      case 'Crown':
        return <Crown className="w-4 h-4" />;
      case 'Palmtree':
        return <Palmtree className="w-4 h-4" />;
      case 'Landmark':
        return <Landmark className="w-4 h-4" />;
      case 'Fish':
        return <Fish className="w-4 h-4" />;
      case 'Tent':
        return <Tent className="w-4 h-4" />;
      case 'GlassWater':
        return <GlassWater className="w-4 h-4" />;
      case 'MapPin':
        return <MapPin className="w-4 h-4" />;
      case 'Users':
        return <Users className="w-4 h-4" />;
      case 'PawPrint':
        return <PawPrint className="w-4 h-4" />;
      case 'Building':
        return <Building className="w-4 h-4" />;
      default:
        return <Sparkles className="w-4 h-4" />;
    }
  };

  return (
    <div className="sticky top-16 sm:top-20 z-30 liquid-glass border-b border-white/50 backdrop-blur-2xl shadow-[0_4px_20px_rgba(0,0,0,0.02)] [@media(max-width:639px)_and_(max-height:400px)]:top-14">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-1.5 sm:py-2 [@media(max-height:400px)]:py-0 [@media(max-width:639px)_and_(max-height:400px)]:py-0">
        <div
          ref={toolbarRowRef}
          className={`grid w-full items-center gap-2 [@media(max-width:639px)_and_(max-height:400px)]:gap-0 ${isCondominiumView ? 'grid-cols-1' : 'grid-cols-[minmax(0,1fr)_auto]'}`}
        >
          {/* Exibe apenas cartões inteiros; as setas alternam páginas sem cortar rótulos. */}
          <div className="flex min-w-0 flex-none items-center justify-center justify-self-center gap-2 sm:gap-4">
            {categoryPage > 0 && (
              <button
                type="button"
                onClick={() => changeCategoryPage(Math.max(0, categoryPage - 1))}
                aria-label={`Ver filtros anteriores; página ${categoryPage + 1} de ${pageCount}`}
                title="Ver filtros anteriores"
                className="liquid-glass-button flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-white/85 text-neutral-800 shadow-md transition hover:scale-105 hover:bg-white active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <div
              className="min-w-0 max-w-full flex-none overflow-hidden py-1 [@media(max-width:639px)_and_(max-height:400px)]:py-0"
              style={{ width: categoryPageWidth }}
            >
              <div
                className="category-filter-track flex items-stretch gap-2 sm:gap-3"
                style={{
                  width: categoryTrackWidth,
                  transform: `translateX(-${categoryPage * categoryPageWidth}px)`,
                }}
              >
                {availableCategories.map((cat, index) => {
                  const isSelected = selectedCategory === cat.id;
                  const isVisible =
                    index >= categoryPage * visibleCategoryCount &&
                    index < (categoryPage + 1) * visibleCategoryCount;
                  return (
                    <button
                      key={cat.id}
                      data-category-index={index}
                      onClick={() => onSelectCategory(cat.id)}
                      aria-pressed={isSelected}
                      aria-hidden={!isVisible}
                      tabIndex={isVisible ? 0 : -1}
                      className={`flex h-16 min-h-16 w-24 min-w-24 flex-shrink-0 flex-col items-center justify-center gap-0 overflow-hidden border-b-2 py-1 text-center transition-all duration-300 cursor-pointer group rounded-2xl px-1 sm:h-14 sm:min-h-14 sm:w-28 sm:min-w-28 sm:flex-row sm:gap-0 sm:py-1 sm:text-left sm:px-0 lg:px-0 [@media(max-height:400px)]:py-0 [@media(max-width:639px)_and_(max-height:400px)]:h-12 [@media(max-width:639px)_and_(max-height:400px)]:min-h-12 ${
                        isSelected
                          ? 'border-orange-500/65 text-neutral-950 font-bold'
                          : 'border-transparent text-neutral-600 hover:text-neutral-900 hover:border-white/80'
                      } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700`}
                    >
                      <div
                        className={`relative isolate flex h-6 w-6 flex-none items-center justify-center overflow-hidden rounded-2xl border transition-all duration-300 group-hover:-translate-y-0.5 group-hover:scale-105 sm:h-6 sm:w-6 [@media(max-width:639px)_and_(max-height:400px)]:h-5 [@media(max-width:639px)_and_(max-height:400px)]:w-5 ${
                          isSelected
                            ? 'border-white/90 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(255,247,237,0.62)_48%,rgba(251,146,60,0.20))] text-orange-700 shadow-[0_8px_20px_-9px_rgba(234,88,12,0.55),inset_0_1.5px_1px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(234,88,12,0.12)] ring-1 ring-orange-300/35 backdrop-blur-2xl'
                            : 'border-white/90 bg-[linear-gradient(145deg,rgba(255,255,255,0.88),rgba(255,255,255,0.48))] text-neutral-600 shadow-[0_5px_14px_-8px_rgba(15,23,42,0.32),inset_0_1.5px_1px_rgba(255,255,255,0.98)] backdrop-blur-2xl group-hover:text-orange-700 group-hover:shadow-[0_8px_18px_-9px_rgba(15,23,42,0.3),inset_0_1.5px_1px_rgba(255,255,255,1)]'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none absolute inset-x-1 top-px h-1/2 rounded-t-[15px] bg-gradient-to-b from-white/90 to-white/0 ${isSelected ? 'opacity-100' : 'opacity-75'}`}
                        />
                        {isSelected && (
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute -right-2 -top-3 h-8 w-8 rounded-full bg-orange-300/35 blur-md"
                          />
                        )}
                        <span className="relative z-10 transition-transform duration-300 group-hover:scale-105">
                          {getIcon(cat.icon)}
                        </span>
                      </div>
                      <span className="flex min-h-0 min-w-0 w-full items-center justify-center text-center sm:h-auto sm:flex-1 sm:justify-start sm:text-left [@media(max-width:639px)_and_(max-height:400px)]:h-auto">
                        <span className="block w-full whitespace-normal text-caption font-semibold [@media(max-width:639px)_and_(max-height:400px)]:leading-3">
                          {cat.label}
                        </span>
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
                className="liquid-glass-button flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-white/85 text-neutral-800 shadow-md transition hover:scale-105 hover:bg-white active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Action buttons on the right: Filters, Tax Toggle, Map view */}
          {!isCondominiumView && (
            <div
              ref={actionsRef}
              className="col-start-2 flex flex-shrink-0 items-center justify-self-end gap-1 sm:gap-3"
            >
              {/* Filter button in Crisp Glass */}
              <button
                onClick={onOpenFilters}
                aria-label={
                  activeFilterCount > 0
                    ? `Abrir filtros; ${activeFilterCount} ativos`
                    : 'Abrir filtros'
                }
                className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-2xl border border-white/85 px-2 text-xs font-bold text-neutral-800 shadow-xs liquid-glass-button transition-all hover:scale-105 hover:bg-white active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 sm:px-4"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-neutral-700" />
                <span className="hidden sm:inline">Filtros</span>
                {activeFilterCount > 0 && (
                  <span className="w-5 h-5 rounded-full bg-orange-700 text-white text-[11px] font-bold flex items-center justify-center shadow-xs">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {/* Toggle Total with taxes */}
              <div className="hidden lg:flex items-center gap-1.5 sm:gap-3 px-2 sm:px-4 py-2 sm:py-2.5 rounded-2xl liquid-glass-card border border-white/80 text-xs font-semibold text-neutral-800 shadow-xs">
                <span className="hidden lg:inline whitespace-nowrap">Exibir total da estadia</span>
                <span className="lg:hidden whitespace-nowrap">Total + taxas</span>
                <button
                  type="button"
                  role="switch"
                  aria-label="Exibir total da estadia"
                  title="Exibir total da estadia"
                  aria-checked={showTotalWithTaxes}
                  onClick={() => setShowTotalWithTaxes(!showTotalWithTaxes)}
                  className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
                >
                  <span
                    aria-hidden="true"
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border border-neutral-300 transition-colors duration-200 ease-in-out ${
                      showTotalWithTaxes ? 'bg-neutral-900' : 'bg-neutral-200'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        showTotalWithTaxes ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </span>
                </button>
              </div>

              {/* Toggle Grid vs Map button */}
              <button
                onClick={() => setViewMode(viewMode === 'grid' ? 'map' : 'grid')}
                aria-label={viewMode === 'grid' ? 'Ver mapa' : 'Ver lista'}
                className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-2xl px-2 text-xs font-bold text-white shadow-md liquid-glass-dark transition-all hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 sm:px-4"
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
