import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal, flushSync } from 'react-dom';
import {
  Search,
  LogIn,
  UserPlus,
  Globe,
  User,
  Heart,
  Briefcase,
  Sparkles,
  Check,
  ChevronDown,
  LogOut,
  ShieldCheck,
  Building,
  Waves,
  GlassWater,
  MapPin,
  Users,
  PawPrint,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Currency } from '../types';
import { matchesMediaQuery } from '../utils/motion';
import { LogoCRCN } from './LogoCRCN';

interface HeaderProps {
  onOpenSearch: () => void;
  currentView: 'explore' | 'trips' | 'wishlists' | 'host' | 'ownerAdmin';
  setCurrentView: (view: 'explore' | 'trips' | 'wishlists' | 'host' | 'ownerAdmin') => void;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  tripsCount: number;
  searchSummaryText?: string;
  compactSearch?: boolean;
  searchDateSummary?: string;
  searchGuestSummary?: string;
  onCreateListing?: () => void;
  toolbar?: React.ReactNode | ((compactSearch: boolean) => React.ReactNode);
  categories?: Array<{ id: string; label: string; icon: string }>;
  selectedCategory?: string;
  onSelectCategory?: (id: string) => void;
  accountName?: string;
  accountEmail?: string;
  isAccountConnected: boolean;
  onOpenAccount: (mode: 'login' | 'signup') => void;
  accountButtonRef?: React.RefObject<HTMLButtonElement | null>;
  onSignOut: () => Promise<void>;
  ownerAccessStatus:
    'loading' | 'unavailable' | 'none' | 'pending' | 'approved' | 'suspended' | 'rejected';
  ownerRequestLoading: boolean;
  onRequestOwnerAccess: () => Promise<void>;
  isOwnerAdmin: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSearch,
  currentView,
  setCurrentView,
  currency,
  setCurrency,
  tripsCount,
  searchSummaryText,
  compactSearch: compactSearchOverride,
  searchDateSummary = 'Qualquer dia',
  searchGuestSummary = 'Hóspedes?',
  onCreateListing,
  toolbar,
  categories = [],
  selectedCategory,
  onSelectCategory,
  accountName,
  accountEmail,
  isAccountConnected,
  onOpenAccount,
  accountButtonRef,
  onSignOut,
  ownerAccessStatus,
  ownerRequestLoading,
  onRequestOwnerAccess,
  isOwnerAdmin,
}) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSearchCompact, setIsSearchCompact] = useState(false);
  const compactSearch = compactSearchOverride ?? isSearchCompact;
  const [isDesktop, setIsDesktop] = useState(() => matchesMediaQuery('(min-width: 640px)'));
  useEffect(() => {
    let compact = false;
    const desktop = window.matchMedia?.('(min-width: 640px)');
    const update = () => {
      const position = window.scrollY;
      const next = Boolean(desktop?.matches) && (compact ? position > 1 : position > 32);
      if (next === compact) return;

      compact = next;
      const transitionDocument = document as Document & {
        startViewTransition?: (update: () => void) => { finished: Promise<void> };
        activeViewTransition?: unknown;
      };
      const transitionScope = document.documentElement;
      const headerOnlyTransitionClass = 'search-header-only-transition';
      const applyState = () => {
        if (compact === next) setIsSearchCompact(next);
      };
      const supportsSharedTransition =
        typeof transitionDocument.startViewTransition === 'function' &&
        Boolean(document.querySelector('[data-shared-search="expanded"]')) &&
        Boolean(document.querySelector('[data-shared-search="compact"]')) &&
        !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

      if (!supportsSharedTransition || transitionDocument.activeViewTransition) {
        setIsSearchCompact(next);
        return;
      }

      try {
        transitionScope.classList.add(headerOnlyTransitionClass);
        const transition = transitionDocument.startViewTransition?.(() => flushSync(applyState));
        if (transition) {
          void transition.finished.then(
            () => transitionScope.classList.remove(headerOnlyTransitionClass),
            () => transitionScope.classList.remove(headerOnlyTransitionClass),
          );
        } else {
          transitionScope.classList.remove(headerOnlyTransitionClass);
          setIsSearchCompact(next);
        }
      } catch {
        transitionScope.classList.remove(headerOnlyTransitionClass);
        setIsSearchCompact(next);
      }
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    desktop?.addEventListener('change', update);
    return () => {
      window.removeEventListener('scroll', update);
      desktop?.removeEventListener('change', update);
    };
  }, []);
  useEffect(() => {
    const media = window.matchMedia?.('(min-width: 640px)');
    if (!media) return;
    const update = () => setIsDesktop(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const [isCurrencyMenuOpen, setIsCurrencyMenuOpen] = useState(false);
  const categoryNavigationRef = useRef<HTMLDivElement>(null);
  const categoryIndicatorReadyRef = useRef(false);
  const [categoryIndicator, setCategoryIndicator] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    ready: false,
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const localAccountButtonRef = useRef<HTMLButtonElement>(null);
  const accountTriggerRef = accountButtonRef ?? localAccountButtonRef;
  const currencyRef = useRef<HTMLDivElement>(null);
  const [accountMenuPosition, setAccountMenuPosition] = useState({ top: 0, right: 12 });
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const currencyTriggerRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const navigation = categoryNavigationRef.current;
    if (!navigation || currentView !== 'explore' || !selectedCategory) return;

    const updateCategoryIndicator = () => {
      const selectedButton = Array.from(
        navigation.querySelectorAll<HTMLButtonElement>('[data-header-category-id]'),
      ).find((button) => button.dataset.headerCategoryId === selectedCategory);
      if (!selectedButton) return;

      const navigationBounds = navigation.getBoundingClientRect();
      const buttonBounds = selectedButton.getBoundingClientRect();
      setCategoryIndicator({
        left: buttonBounds.left - navigationBounds.left + navigation.scrollLeft,
        top: buttonBounds.top - navigationBounds.top + navigation.scrollTop,
        width: buttonBounds.width,
        height: buttonBounds.height,
        ready: true,
      });
      categoryIndicatorReadyRef.current = true;
    };

    updateCategoryIndicator();
    const observer = new ResizeObserver(updateCategoryIndicator);
    observer.observe(navigation);
    return () => observer.disconnect();
  }, [categories, currentView, selectedCategory]);

  const toggleAccountMenu = () => {
    if (isUserMenuOpen) {
      setIsUserMenuOpen(false);
      return;
    }
    const rect = accountTriggerRef.current?.getBoundingClientRect();
    if (rect) {
      setAccountMenuPosition({
        top: rect.bottom + 10,
        right: Math.max(12, window.innerWidth - rect.right),
      });
    }
    setIsUserMenuOpen(true);
  };

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        !accountMenuRef.current?.contains(target)
      ) {
        setIsUserMenuOpen(false);
      }
      if (currencyRef.current && !currencyRef.current.contains(e.target as Node)) {
        setIsCurrencyMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isUserMenuOpen) return;
    const handleMenuKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setIsUserMenuOpen(false);
      accountTriggerRef.current?.focus();
    };
    const updatePosition = () => {
      const rect = accountTriggerRef.current?.getBoundingClientRect();
      if (rect) {
        setAccountMenuPosition({
          top: rect.bottom + 10,
          right: Math.max(12, window.innerWidth - rect.right),
        });
      }
    };
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('keydown', handleMenuKeyDown);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('keydown', handleMenuKeyDown);
    };
  }, [isUserMenuOpen, accountTriggerRef]);

  useEffect(() => {
    if (!isCurrencyMenuOpen) return;
    const handleCurrencyMenuKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setIsCurrencyMenuOpen(false);
      currencyTriggerRef.current?.focus();
    };
    document.addEventListener('keydown', handleCurrencyMenuKeyDown);
    return () => document.removeEventListener('keydown', handleCurrencyMenuKeyDown);
  }, [isCurrencyMenuOpen]);

  return (
    <header className="sticky top-0 z-50 liquid-glass border-b border-neutral-200/80 shadow-[0_8px_30px_-24px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
      <div className="mx-auto w-full max-w-[var(--header-expanded-width)] px-[var(--header-edge-spacing)]">
        <div className="flex items-center justify-between h-[84px] sm:h-20 gap-2 sm:gap-4 [@media(max-width:639px)_and_(max-height:400px)]:h-[76px]">
          {/* Official Company Logo: Central de Reservas Caldas Novas */}
          <button
            onClick={() => {
              const params = new URLSearchParams();
              new URLSearchParams(window.location.search).forEach((value, key) => {
                if (key.toLowerCase().startsWith('utm_')) params.append(key, value);
              });
              const query = params.toString();
              window.location.assign(query ? `/?${query}` : '/');
            }}
            className={`group hidden flex-shrink-0 cursor-pointer items-center rounded-2xl transition-transform duration-[400ms] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 sm:flex ${compactSearch ? 'sm:-translate-x-[max(0px,calc((100vw_-_var(--header-expanded-width))_/2))]' : ''}`}
            title="Central de Reservas Caldas Novas"
          >
            <LogoCRCN size="md" variant="light" responsiveText={true} />
          </button>

          {/* Central Search Bar with min-w-0 so it never forces overflow */}
          {currentView === 'explore' && (
            <div
              aria-hidden={compactSearch || undefined}
              inert={compactSearch || undefined}
              className={`hidden min-w-0 flex-1 items-center gap-1 transition-[opacity,transform] duration-300 motion-reduce:transition-none sm:flex ${compactSearch ? 'sm:pointer-events-none sm:-translate-y-3 sm:opacity-0' : ''}`}
              aria-label="Categorias de hospedagem"
            >
              <button
                type="button"
                aria-label="Rolar categorias para trás"
                onClick={(event) =>
                  event.currentTarget.nextElementSibling?.scrollBy({
                    left: -300,
                    behavior: 'smooth',
                  })
                }
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-600 hover:bg-white"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div
                ref={categoryNavigationRef}
                className="relative flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <span
                  aria-hidden="true"
                  className={`header-category-selection ${categoryIndicator.ready && categoryIndicatorReadyRef.current ? 'header-category-selection--ready' : ''}`}
                  style={{
                    left: categoryIndicator.left,
                    top: categoryIndicator.top,
                    width: categoryIndicator.width,
                    height: categoryIndicator.height,
                  }}
                />
                {categories.map((category) => {
                  const icons: Record<string, React.ElementType> = {
                    Building,
                    Waves,
                    GlassWater,
                    MapPin,
                    Users,
                    PawPrint,
                    Sparkles,
                  };
                  const Icon = icons[category.icon] || Sparkles;
                  return (
                    <button
                      key={category.id}
                      data-header-category-id={category.id}
                      type="button"
                      aria-pressed={selectedCategory === category.id}
                      onClick={() => onSelectCategory?.(category.id)}
                      onFocus={(event) => {
                        const navigation = categoryNavigationRef.current;
                        if (!navigation) return;

                        const buttonBounds = event.currentTarget.getBoundingClientRect();
                        const navigationBounds = navigation.getBoundingClientRect();
                        if (buttonBounds.left < navigationBounds.left) {
                          navigation.scrollLeft -= navigationBounds.left - buttonBounds.left;
                        } else if (buttonBounds.right > navigationBounds.right) {
                          navigation.scrollLeft += buttonBounds.right - navigationBounds.right;
                        }
                      }}
                      className={`relative z-10 flex min-h-12 shrink-0 items-center gap-2 rounded-xl px-3 text-left text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-orange-600 ${selectedCategory === category.id ? 'text-orange-700' : 'text-neutral-600 hover:bg-white/70'}`}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="max-w-28">{category.label}</span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                aria-label="Rolar categorias para frente"
                onClick={(event) =>
                  event.currentTarget.previousElementSibling?.scrollBy({
                    left: 300,
                    behavior: 'smooth',
                  })
                }
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-600 hover:bg-white"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
          <div
            data-shared-search="compact"
            style={{
              viewTransitionName:
                currentView === 'explore' && compactSearch ? 'shared-search-bar' : 'none',
            }}
            aria-hidden={
              currentView === 'explore' && !compactSearch && isDesktop ? true : undefined
            }
            inert={currentView === 'explore' && !compactSearch && isDesktop ? true : undefined}
            className={`flex-1 min-w-0 max-w-xl mx-1 sm:mx-4 lg:mx-6 ${currentView === 'explore' ? `header-compact-search sm:absolute sm:left-1/2 sm:!mx-0 sm:-translate-x-1/2 sm:transition-[opacity,transform] sm:duration-[400ms] sm:ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ${compactSearch ? 'sm:translate-y-0 sm:opacity-100' : 'sm:pointer-events-none sm:translate-y-16 sm:opacity-0'}` : ''}`}
            data-compact-search={currentView === 'explore' && compactSearch ? 'true' : 'false'}
          >
            <button
              type="button"
              onClick={onOpenSearch}
              aria-label="Iniciar busca"
              className="min-h-[68px] sm:min-h-11 w-full flex items-center justify-center sm:justify-between px-5 sm:pl-4 sm:pr-2 py-1.5 sm:py-2 rounded-full bg-white text-neutral-900 hover:bg-neutral-50 border border-neutral-200 shadow-[0_6px_18px_-14px_rgba(15,23,42,0.38)] hover:border-neutral-300 hover:shadow-sm transition-all cursor-pointer group min-w-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
            >
              <Search
                aria-hidden="true"
                className="mr-3 h-6 w-6 shrink-0 text-neutral-700 sm:hidden"
              />
              <span className="text-lg font-bold text-neutral-900 sm:hidden">Iniciar busca</span>
              <div className="hidden min-w-0 items-center text-neutral-800 sm:flex sm:text-sm">
                <span className="pr-2 sm:pr-3 text-neutral-900 font-bold truncate min-w-0 max-[360px]:hidden">
                  {searchSummaryText ? searchSummaryText : 'Caldas Novas & Região'}
                </span>
                <span className="hidden border-l border-neutral-200 px-2.5 font-medium text-neutral-600 whitespace-nowrap md:inline sm:px-3">
                  {searchDateSummary}
                </span>
                <span className="hidden border-l border-neutral-200 pl-2.5 font-normal text-neutral-500 whitespace-nowrap lg:inline sm:pl-3">
                  {searchGuestSummary}
                </span>
              </div>
              <div className="hidden w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-orange-500 to-amber-500 sm:flex items-center justify-center text-white flex-shrink-0 ml-1.5 sm:ml-2 group-hover:scale-105 shadow-sm shadow-orange-500/30 transition-transform">
                <Search className="h-4 w-4 stroke-[2.5]" />
              </div>
            </button>
          </div>

          {/* Right section: Currency and User Menu */}
          <div
            className={`relative hidden items-center gap-1.5 transition-transform duration-[400ms] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none sm:flex sm:gap-2.5 lg:gap-3 flex-shrink-0 ${compactSearch ? 'sm:translate-x-[max(0px,calc((100vw_-_var(--header-expanded-width))_/2))]' : ''}`}
          >
            <div
              aria-hidden={!compactSearch || undefined}
              inert={!compactSearch || undefined}
              className={`absolute right-full mr-3 hidden transition-opacity duration-[400ms] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none min-[1440px]:block ${compactSearch ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
            >
              <button
                type="button"
                onClick={onCreateListing}
                className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-3 text-xs font-semibold text-neutral-900 hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-orange-600"
              >
                Anuncie seu imóvel
              </button>
            </div>
            {/* Currency selector dropdown */}
            <div className="relative flex-shrink-0" ref={currencyRef}>
              <button
                ref={currencyTriggerRef}
                onClick={() => setIsCurrencyMenuOpen(!isCurrencyMenuOpen)}
                className="flex min-h-11 items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-semibold text-neutral-700 hover:text-neutral-900 liquid-glass-button border border-neutral-200/90 rounded-full transition-all cursor-pointer"
                aria-label={`Moeda de exibição ${currency}. Conversões em USD e EUR são aproximadas.`}
                aria-haspopup="true"
                aria-expanded={isCurrencyMenuOpen}
                aria-controls="currency-menu-panel"
                title="Alterar moeda de exibição"
              >
                <Globe className="w-3.5 h-3.5 text-neutral-600 flex-shrink-0" />
                <span className="font-bold">{currency}</span>
              </button>

              {isCurrencyMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40 bg-transparent"
                    onClick={() => setIsCurrencyMenuOpen(false)}
                    aria-hidden="true"
                  />
                  <div
                    id="currency-menu-panel"
                    role="group"
                    aria-label="Opções de moeda"
                    className="absolute right-0 mt-2 w-48 bg-white/96 backdrop-blur-3xl rounded-2xl shadow-2xl border border-neutral-200/90 py-2 z-50 animate-in fade-in zoom-in-95 duration-100"
                  >
                    <div className="px-3 py-1.5 text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                      Moeda
                    </div>
                    <p className="px-3 pb-2 text-[11px] leading-relaxed text-neutral-600">
                      Conversões em USD e EUR são aproximadas. O pagamento é processado em reais
                      (BRL).
                    </p>
                    {[
                      { code: 'BRL', label: 'Real Brasileiro (R$)' },
                      { code: 'USD', label: 'Dólar Americano ($)' },
                      { code: 'EUR', label: 'Euro (€)' },
                    ].map((item) => (
                      <button
                        key={item.code}
                        onClick={() => {
                          setCurrency(item.code as Currency);
                          setIsCurrencyMenuOpen(false);
                          currencyTriggerRef.current?.focus();
                        }}
                        className="flex min-h-11 w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-neutral-800 transition-colors hover:bg-neutral-100"
                      >
                        <span className={currency === item.code ? 'font-bold text-orange-600' : ''}>
                          {item.label}
                        </span>
                        {currency === item.code && (
                          <Check className="w-3.5 h-3.5 text-orange-600" />
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* User profile & Navigation dropdown - Minha Conta */}
            <div className="relative flex-shrink-0" ref={menuRef}>
              <button
                ref={accountTriggerRef}
                type="button"
                onClick={toggleAccountMenu}
                className={`flex min-h-11 items-center gap-2 pl-2 sm:pl-2.5 pr-2.5 sm:pr-3 py-1 sm:py-1.5 rounded-full bg-white/95 hover:bg-white backdrop-blur-xl border border-neutral-300/90 shadow-xs hover:shadow-md transition-all cursor-pointer flex-shrink-0 ${
                  isUserMenuOpen ? 'ring-2 ring-orange-500/40 border-orange-400' : ''
                }`}
                title="Minha Conta"
                aria-label="Minha Conta"
                aria-haspopup="true"
                aria-expanded={isUserMenuOpen}
                aria-controls="account-menu-panel"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-neutral-900 to-neutral-800 text-white flex items-center justify-center text-xs font-semibold relative shadow-xs flex-shrink-0">
                  <User className="w-4 h-4" />
                  {tripsCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-orange-500 rounded-full border-2 border-white ring-1 ring-orange-400" />
                  )}
                </div>
                <span className="text-xs font-extrabold text-neutral-900 hidden sm:inline select-none">
                  Minha Conta
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-neutral-500 transition-transform duration-200 flex-shrink-0 ${isUserMenuOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {/* Blur effect specifically and ONLY for the Minha Conta panel */}
              {isUserMenuOpen &&
                createPortal(
                  <>
                    {/* Invisible backdrop to dismiss dropdown on click-outside without blurring the header or page */}
                    <div
                      className="fixed inset-0 z-[9998] bg-transparent"
                      onClick={() => setIsUserMenuOpen(false)}
                      aria-hidden="true"
                    />

                    {/* Minha Conta Panel with high-legibility frosted blur effect and crisp contrast */}
                    <div
                      id="account-menu-panel"
                      ref={accountMenuRef}
                      role="group"
                      aria-label="Opções da conta"
                      style={{ top: accountMenuPosition.top, right: accountMenuPosition.right }}
                      className="fixed w-72 max-w-[calc(100vw-1.5rem)] max-h-[min(75vh,36rem)] overflow-y-auto overscroll-contain bg-white/96 backdrop-blur-3xl rounded-2xl shadow-2xl border border-neutral-200/90 py-2.5 z-[9999] text-xs animate-in fade-in zoom-in-95 duration-150 ring-1 ring-black/10"
                    >
                      <div className="px-4 py-3 border-b border-neutral-200/80 bg-neutral-50/90 backdrop-blur-md">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-black uppercase tracking-wider text-orange-600 bg-orange-100/90 px-2 py-0.5 rounded-full border border-orange-200 flex-shrink-0">
                            Minha Conta
                          </span>
                          <span
                            className={`flex items-center gap-1 text-[11px] font-bold flex-shrink-0 ${isAccountConnected ? 'text-emerald-600' : 'text-neutral-500'}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${isAccountConnected ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'}`}
                            />
                            {isAccountConnected ? 'Conectado' : 'Desconectado'}
                          </span>
                        </div>
                        <p className="font-extrabold text-neutral-950 text-sm truncate">
                          {isAccountConnected ? accountName || 'Hóspede' : 'Acesse sua conta'}
                        </p>
                        <p className="text-[11px] text-neutral-600 font-medium truncate">
                          {isAccountConnected
                            ? accountEmail
                            : 'Entre ou crie sua conta para reservar'}
                        </p>
                      </div>

                      {!isAccountConnected && (
                        <div className="grid grid-cols-2 gap-2 border-b border-neutral-200/80 p-3">
                          <button
                            type="button"
                            onClick={() => {
                              onOpenAccount('login');
                              setIsUserMenuOpen(false);
                            }}
                            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-orange-300 bg-white/80 px-3 py-2.5 font-bold text-orange-700 transition hover:bg-orange-50"
                          >
                            <LogIn className="h-4 w-4" /> Entrar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onOpenAccount('signup');
                              setIsUserMenuOpen(false);
                            }}
                            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-3 py-2.5 font-bold text-white shadow-sm transition hover:brightness-105"
                          >
                            <UserPlus className="h-4 w-4" /> Criar conta
                          </button>
                        </div>
                      )}
                      {isAccountConnected && (
                        <div className="border-b border-neutral-200/80 px-3 py-3">
                          <button
                            type="button"
                            onClick={() => {
                              onOpenAccount('login');
                              setIsUserMenuOpen(false);
                            }}
                            className="flex min-h-11 w-full items-center justify-center rounded-xl border border-neutral-200 bg-white/90 px-3 py-2.5 text-center font-bold text-neutral-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50"
                          >
                            Gerenciar conta
                          </button>
                          <button
                            type="button"
                            disabled={signingOut}
                            onClick={async () => {
                              setSigningOut(true);
                              setSignOutError('');
                              try {
                                await onSignOut();
                                setIsUserMenuOpen(false);
                              } catch {
                                setSignOutError('Não foi possível sair da conta. Tente novamente.');
                              } finally {
                                setSigningOut(false);
                              }
                            }}
                            className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white/90 px-3 py-2.5 text-center font-bold text-neutral-700 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                          >
                            <LogOut className="h-4 w-4" />
                            {signingOut ? 'Saindo…' : 'Sair da conta'}
                          </button>
                          {signOutError && (
                            <p
                              role="alert"
                              className="mt-2 text-center text-[11px] font-semibold text-red-600"
                            >
                              {signOutError}
                            </p>
                          )}
                        </div>
                      )}

                      {isAccountConnected && (
                        <div className="py-1">
                          <button
                            onClick={() => {
                              setCurrentView('explore');
                              setIsUserMenuOpen(false);
                            }}
                            className={`flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-neutral-100 ${
                              currentView === 'explore'
                                ? 'font-bold text-orange-600 bg-orange-50'
                                : 'text-neutral-800'
                            }`}
                          >
                            <Sparkles className="w-4 h-4 text-orange-500 flex-shrink-0" />
                            <span className="font-semibold">Explorar hospedagens</span>
                          </button>

                          <button
                            onClick={() => {
                              setCurrentView('trips');
                              setIsUserMenuOpen(false);
                            }}
                            className={`flex min-h-11 w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-neutral-100 ${
                              currentView === 'trips'
                                ? 'font-bold text-orange-600 bg-orange-50'
                                : 'text-neutral-800'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <Briefcase className="w-4 h-4 text-neutral-600 flex-shrink-0" />
                              <span className="font-semibold">Minhas reservas e vouchers</span>
                            </div>
                            {tripsCount > 0 && (
                              <span className="bg-orange-500 text-white font-bold px-2 py-0.5 rounded-full text-[11px] shadow-xs">
                                {tripsCount}
                              </span>
                            )}
                          </button>

                          <button
                            onClick={() => {
                              setCurrentView('wishlists');
                              setIsUserMenuOpen(false);
                            }}
                            className={`flex min-h-11 w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-neutral-100 ${
                              currentView === 'wishlists'
                                ? 'font-bold text-orange-600 bg-orange-50'
                                : 'text-neutral-800'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <Heart className="w-4 h-4 text-neutral-600 flex-shrink-0" />
                              <span className="font-semibold">Favoritos</span>
                            </div>
                          </button>
                          {ownerAccessStatus === 'approved' && (
                            <button
                              onClick={() => {
                                setCurrentView('host');
                                setIsUserMenuOpen(false);
                              }}
                              className={`flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-orange-50 ${currentView === 'host' ? 'bg-orange-50 font-bold text-orange-700' : 'text-neutral-800'}`}
                            >
                              <Briefcase className="h-4 w-4 flex-shrink-0 text-orange-600" />
                              <span className="font-semibold">Painel do proprietário</span>
                            </button>
                          )}
                          {ownerAccessStatus === 'none' && (
                            <button
                              type="button"
                              disabled={ownerRequestLoading}
                              onClick={() => {
                                void onRequestOwnerAccess();
                              }}
                              className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-neutral-800 transition-colors hover:bg-orange-50 disabled:opacity-60"
                            >
                              <Sparkles className="h-4 w-4 flex-shrink-0 text-orange-600" />
                              <span className="font-semibold">
                                {ownerRequestLoading
                                  ? 'Enviando solicitação…'
                                  : 'Solicitar acesso de proprietário'}
                              </span>
                            </button>
                          )}
                          {ownerAccessStatus === 'pending' && (
                            <div
                              className="flex items-center gap-3 px-4 py-2.5 text-neutral-600"
                              role="status"
                            >
                              <Sparkles className="h-4 w-4 flex-shrink-0 text-orange-600" />
                              <span className="font-semibold">
                                Solicitação de proprietário em análise
                              </span>
                            </div>
                          )}
                          {(ownerAccessStatus === 'suspended' ||
                            ownerAccessStatus === 'rejected') && (
                            <div className="px-4 py-2.5 text-[11px] text-neutral-500" role="status">
                              Para revisar seu acesso de proprietário, fale com a Central.
                            </div>
                          )}
                          {isOwnerAdmin && (
                            <button
                              onClick={() => {
                                setCurrentView('ownerAdmin');
                                setIsUserMenuOpen(false);
                              }}
                              className={`flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-orange-50 ${currentView === 'ownerAdmin' ? 'bg-orange-50 font-bold text-orange-700' : 'text-neutral-800'}`}
                            >
                              <ShieldCheck className="h-4 w-4 flex-shrink-0 text-orange-600" />
                              <span className="font-semibold">
                                Analisar acesso de proprietários
                              </span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </>,
                  document.body,
                )}
            </div>
          </div>
        </div>
      </div>
      {toolbar && (
        <div
          className={`search-toolbar-collapse ${compactSearch ? 'search-toolbar-collapse--compact' : ''}`}
        >
          <div>{typeof toolbar === 'function' ? toolbar(compactSearch) : toolbar}</div>
        </div>
      )}
    </header>
  );
};
