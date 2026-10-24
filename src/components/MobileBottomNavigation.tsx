import { Briefcase, Compass, Heart, Sparkles } from 'lucide-react';

export type MainView = 'explore' | 'trips' | 'wishlists' | 'host' | 'ownerAdmin';

export function resolveMobileNavigationTarget(
  view: MainView,
  ownerAccessApproved: boolean,
): MainView {
  return view === 'host' && !ownerAccessApproved ? 'explore' : view;
}

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
      className="sm:hidden fixed left-4 right-4 z-40 bg-white/75 backdrop-blur-2xl border border-white/80 rounded-3xl px-6 py-2.5 max-[400px]:px-2 [@media(max-height:400px)]:py-1 flex items-center justify-between shadow-[0_12px_36px_rgba(249,115,22,0.15)]"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
    >
      {items.map(({ view, label, icon: Icon, hasActivity }) => (
        <button
          key={view}
          type="button"
          aria-current={currentView === view ? 'page' : undefined}
          onClick={() => onNavigate(view)}
          className={`relative flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-2xl text-sm max-[400px]:text-xs font-bold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${
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
