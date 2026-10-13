import { Briefcase, Compass, Heart, Sparkles } from 'lucide-react';

export type MainView = 'explore' | 'trips' | 'wishlists' | 'host' | 'ownerAdmin';

type MobileBottomNavigationProps = {
  currentView: MainView;
  onNavigate: (view: MainView) => void;
  showHost: boolean;
  hasSavedProperties: boolean;
  hasConfirmedReservations: boolean;
};

export function MobileBottomNavigation({
  currentView,
  onNavigate,
  showHost,
  hasSavedProperties,
  hasConfirmedReservations,
}: MobileBottomNavigationProps) {
  const items = [
    { view: 'explore' as const, label: 'Explorar', icon: Compass },
    {
      view: 'wishlists' as const,
      label: 'Favoritos',
      icon: Heart,
      hasActivity: hasSavedProperties,
    },
    {
      view: 'trips' as const,
      label: 'Reservas',
      icon: Briefcase,
      hasActivity: hasConfirmedReservations,
    },
    ...(showHost ? [{ view: 'host' as const, label: 'Proprietário', icon: Sparkles }] : []),
  ];

  return (
    <nav
      aria-label="Navegação principal"
      className="sm:hidden fixed bottom-3 left-4 right-4 z-40 bg-white/75 backdrop-blur-2xl border border-white/80 rounded-3xl px-6 py-2.5 flex items-center justify-between shadow-[0_12px_36px_rgba(249,115,22,0.15)]"
    >
      {items.map(({ view, label, icon: Icon, hasActivity }) => (
        <button
          key={view}
          type="button"
          aria-current={currentView === view ? 'page' : undefined}
          onClick={() => onNavigate(view)}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold cursor-pointer transition-all relative ${
            currentView === view ? 'text-orange-600 scale-105' : 'text-neutral-500'
          }`}
        >
          <Icon className="w-5 h-5" aria-hidden="true" />
          <span>{label}</span>
          {hasActivity && (
            <span
              aria-hidden="true"
              className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 ring-2 ring-white"
            />
          )}
        </button>
      ))}
    </nav>
  );
}
