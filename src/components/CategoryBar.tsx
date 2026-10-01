import React, { useRef, useState, useEffect } from 'react';
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
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { CATEGORIES } from '../data/mockProperties';

interface CategoryBarProps {
  selectedCategory: string;
  onSelectCategory: (categoryId: string) => void;
  onOpenFilters: () => void;
  activeFilterCount: number;
  showTotalWithTaxes: boolean;
  setShowTotalWithTaxes: (show: boolean) => void;
  viewMode: 'grid' | 'map';
  setViewMode: (mode: 'grid' | 'map') => void;
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
}) => {
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
      default: return <Sparkles className="w-5 h-5" />;
    }
  };

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const carouselRef = useRef<HTMLDivElement>(null);

  const checkScroll = () => {
    if (carouselRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = carouselRef.current;
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, []);

  const handleScroll = (direction: 'left' | 'right') => {
    if (carouselRef.current) {
      const scrollAmount = direction === 'left' ? -280 : 280;
      carouselRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      setTimeout(checkScroll, 300);
    }
  };

  return (
    <div className="sticky top-16 sm:top-20 z-30 liquid-glass border-b border-white/50 backdrop-blur-2xl shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-3">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          
          {/* Categories Carousel with smooth scroll controls without overlapping icons */}
          <div className="relative flex-1 min-w-0 flex items-center gap-1.5 sm:gap-2">
            {/* Scroll Left Button */}
            {canScrollLeft && (
              <button
                onClick={() => handleScroll('left')}
                className="hidden md:flex flex-shrink-0 w-8 h-8 rounded-full liquid-glass-button hover:bg-white shadow-md border border-white/80 text-neutral-800 items-center justify-center transition-all cursor-pointer hover:scale-110 active:scale-95"
                aria-label="Rolar para esquerda"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}

            <div 
              ref={carouselRef}
              onScroll={checkScroll}
              className="flex items-center gap-4 sm:gap-6 overflow-x-auto no-scrollbar scroll-smooth flex-1 py-2 px-1"
            >
              {CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => onSelectCategory(cat.id)}
                    className={`flex flex-col items-center gap-1.5 pb-1.5 border-b-2 transition-all cursor-pointer flex-shrink-0 group ${
                      isSelected
                        ? 'border-orange-500 text-neutral-950 font-bold'
                        : 'border-transparent text-neutral-600 hover:text-neutral-900 hover:border-neutral-300'
                    }`}
                  >
                    <div className={`p-2 rounded-xl transition-all duration-200 group-hover:scale-110 ${
                      isSelected 
                        ? 'bg-orange-500/15 text-orange-600 scale-105 shadow-2xs border border-orange-400/40 backdrop-blur-xs' 
                        : 'bg-white/60 text-neutral-600 border border-white/70 group-hover:bg-white group-hover:text-neutral-900 group-hover:shadow-xs'
                    }`}>
                      {getIcon(cat.icon)}
                    </div>
                    <span className="text-[11px] sm:text-xs font-semibold whitespace-nowrap">
                      {cat.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Scroll Right Button */}
            {canScrollRight && (
              <button
                onClick={() => handleScroll('right')}
                className="hidden md:flex flex-shrink-0 w-8 h-8 rounded-full liquid-glass-button hover:bg-white shadow-md border border-white/80 text-neutral-800 items-center justify-center transition-all cursor-pointer hover:scale-110 active:scale-95"
                aria-label="Rolar para direita"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Action buttons on the right: Filters, Tax Toggle, Map view */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 pl-2">
            
            {/* Filter button in Crisp Glass */}
            <button
              onClick={onOpenFilters}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl liquid-glass-button hover:bg-white border border-white/85 shadow-xs text-xs font-bold text-neutral-800 transition-all cursor-pointer hover:scale-105 active:scale-95"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-neutral-700" />
              <span className="hidden sm:inline">Filtros</span>
              {activeFilterCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Toggle Total with taxes */}
            <div className="flex items-center gap-1.5 sm:gap-3 px-2 sm:px-4 py-2 sm:py-2.5 rounded-2xl liquid-glass-card border border-white/80 text-xs font-semibold text-neutral-800 shadow-xs">
              <span className="hidden lg:inline whitespace-nowrap">Exibir total com taxas</span>
              <span className="lg:hidden whitespace-nowrap">Total + taxas</span>
              <button
                type="button"
                role="switch"
                aria-label="Exibir total com taxas"
                title="Exibir total com taxas"
                aria-checked={showTotalWithTaxes}
                onClick={() => setShowTotalWithTaxes(!showTotalWithTaxes)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-neutral-300 transition-colors duration-200 ease-in-out focus:outline-none ${
                  showTotalWithTaxes ? 'bg-neutral-900' : 'bg-neutral-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    showTotalWithTaxes ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Toggle Grid vs Map button */}
            <button
              onClick={() => setViewMode(viewMode === 'grid' ? 'map' : 'grid')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl liquid-glass-dark text-white text-xs font-bold shadow-md transition-all cursor-pointer hover:scale-105 active:scale-95"
            >
              {viewMode === 'grid' ? (
                <>
                  <Map className="w-3.5 h-3.5 text-orange-400" />
                  <span className="hidden sm:inline">Ver Mapa</span>
                </>
              ) : (
                <>
                  <Grid className="w-3.5 h-3.5 text-orange-400" />
                  <span className="hidden sm:inline">Ver Lista</span>
                </>
              )}
            </button>

          </div>

        </div>
      </div>
    </div>
  );
};
