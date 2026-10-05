import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Search, 
  LogIn,
  UserPlus,
  Globe, 
  User, 
  Heart, 
  Briefcase, 
  Sparkles,
  PhoneCall,
  Check,
  Zap,
  ChevronDown,
  LogOut
} from 'lucide-react';
import { Currency } from '../types';
import { LogoCRCN } from './LogoCRCN';

interface HeaderProps {
  onOpenSearch: () => void;
  currentView: 'explore' | 'trips' | 'wishlists' | 'host';
  setCurrentView: (view: 'explore' | 'trips' | 'wishlists' | 'host') => void;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  tripsCount: number;
  searchSummaryText?: string;
  accountName?: string;
  accountEmail?: string;
  isAccountConnected: boolean;
  onOpenAccount: (mode: 'login' | 'signup') => void;
  onSignOut: () => Promise<void>;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSearch,
  currentView,
  setCurrentView,
  currency,
  setCurrency,
  tripsCount,
  searchSummaryText,
  accountName,
  accountEmail,
  isAccountConnected,
  onOpenAccount,
  onSignOut,
}) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isCurrencyMenuOpen, setIsCurrencyMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const currencyRef = useRef<HTMLDivElement>(null);
  const [accountMenuPosition, setAccountMenuPosition] = useState({ top: 0, right: 12 });
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');

  const toggleAccountMenu = () => {
    if (isUserMenuOpen) {
      setIsUserMenuOpen(false);
      return;
    }
    const rect = accountButtonRef.current?.getBoundingClientRect();
    if (rect) {
      setAccountMenuPosition({ top: rect.bottom + 10, right: Math.max(12, window.innerWidth - rect.right) });
    }
    setIsUserMenuOpen(true);
  };

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target) && !accountMenuRef.current?.contains(target)) {
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
    const updatePosition = () => {
      const rect = accountButtonRef.current?.getBoundingClientRect();
      if (rect) {
        setAccountMenuPosition({ top: rect.bottom + 10, right: Math.max(12, window.innerWidth - rect.right) });
      }
    };
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isUserMenuOpen]);

  return (
    <header className="sticky top-0 z-50 liquid-glass border-b border-white/60 shadow-[0_4px_30px_rgba(0,0,0,0.03)] backdrop-blur-2xl">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-2 sm:gap-4">
          
          {/* Official Company Logo: Central de Reservas Caldas Novas */}
          <button 
            onClick={() => setCurrentView('explore')}
            className="flex items-center cursor-pointer group focus:outline-none flex-shrink-0"
            title="Central de Reservas Caldas Novas"
          >
            <LogoCRCN size="md" variant="light" responsiveText={true} />
          </button>

          {/* Central Search Bar with min-w-0 so it never forces overflow */}
          <div className="flex-1 min-w-0 max-w-xl mx-1 sm:mx-4 lg:mx-6">
            <button
              onClick={onOpenSearch}
              className="w-full flex items-center justify-between pl-3 sm:pl-4 pr-1.5 sm:pr-2 py-1.5 sm:py-2 rounded-full liquid-glass-pill hover:bg-white/90 border border-white/85 shadow-[0_4px_20px_rgba(0,0,0,0.06),inset_0_1px_1.5px_rgba(255,255,255,0.9)] hover:shadow-lg transition-all cursor-pointer group min-w-0"
            >
              <div className="flex items-center divide-x divide-neutral-200 text-xs sm:text-sm font-semibold text-neutral-800 min-w-0 truncate">
                <span className="pr-2 sm:pr-3 text-neutral-900 font-bold truncate min-w-0">
                  {searchSummaryText ? searchSummaryText : 'Caldas Novas & Região'}
                </span>
                <span className="hidden md:inline px-2.5 sm:px-3 text-neutral-600 font-medium whitespace-nowrap">
                  Qualquer semana
                </span>
                <span className="hidden lg:inline pl-2.5 sm:pl-3 text-neutral-500 font-normal whitespace-nowrap">
                  Hóspedes?
                </span>
              </div>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-orange-500 to-amber-500 flex items-center justify-center text-white flex-shrink-0 ml-1.5 sm:ml-2 group-hover:scale-105 shadow-sm shadow-orange-500/30 transition-transform">
                <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
              </div>
            </button>
          </div>

          {/* Right section: Currency and User Menu */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 lg:gap-3 flex-shrink-0">
            {/* Currency selector dropdown */}
            <div className="relative flex-shrink-0" ref={currencyRef}>
              <button
                onClick={() => setIsCurrencyMenuOpen(!isCurrencyMenuOpen)}
                className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-semibold text-neutral-700 hover:text-neutral-900 liquid-glass-button border border-white/80 rounded-full transition-all cursor-pointer"
                title="Alterar Moeda"
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
                  <div className="absolute right-0 mt-2 w-48 bg-white/96 backdrop-blur-3xl rounded-2xl shadow-2xl border border-neutral-200/90 py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-1.5 text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                      Moeda
                    </div>
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
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-neutral-800 hover:bg-neutral-100 flex items-center justify-between cursor-pointer transition-colors font-medium"
                      >
                        <span className={currency === item.code ? 'font-bold text-orange-600' : ''}>
                          {item.label}
                        </span>
                        {currency === item.code && <Check className="w-3.5 h-3.5 text-orange-600" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* User profile & Navigation dropdown - Minha Conta */}
            <div className="relative flex-shrink-0" ref={menuRef}>
              <button
                ref={accountButtonRef}
                onClick={toggleAccountMenu}
                className={`flex items-center gap-2 pl-2 sm:pl-2.5 pr-2.5 sm:pr-3 py-1 sm:py-1.5 rounded-full bg-white/95 hover:bg-white backdrop-blur-xl border border-neutral-300/90 shadow-xs hover:shadow-md transition-all cursor-pointer flex-shrink-0 ${
                  isUserMenuOpen ? 'ring-2 ring-orange-500/40 border-orange-400' : ''
                }`}
                title="Minha Conta"
                aria-label="Minha Conta"
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
                <ChevronDown className={`w-3.5 h-3.5 text-neutral-500 transition-transform duration-200 flex-shrink-0 ${isUserMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Blur effect specifically and ONLY for the Minha Conta panel */}
              {isUserMenuOpen && createPortal(
                <>
                  {/* Invisible backdrop to dismiss dropdown on click-outside without blurring the header or page */}
                  <div 
                    className="fixed inset-0 z-[9998] bg-transparent"
                    onClick={() => setIsUserMenuOpen(false)} 
                    aria-hidden="true" 
                  />

                  {/* Minha Conta Panel with high-legibility frosted blur effect and crisp contrast */}
                  <div ref={accountMenuRef} style={{ top: accountMenuPosition.top, right: accountMenuPosition.right }} className="fixed w-72 max-w-[calc(100vw-1.5rem)] max-h-[min(75vh,36rem)] overflow-y-auto overscroll-contain bg-white/96 backdrop-blur-3xl rounded-2xl shadow-2xl border border-neutral-200/90 py-2.5 z-[9999] text-xs animate-in fade-in zoom-in-95 duration-150 ring-1 ring-black/10">
                    <div className="px-4 py-3 border-b border-neutral-200/80 bg-neutral-50/90 backdrop-blur-md">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-orange-600 bg-orange-100/90 px-2 py-0.5 rounded-full border border-orange-200 flex-shrink-0">
                          Minha Conta
                        </span>
                        <span className={`flex items-center gap-1 text-[10px] font-bold flex-shrink-0 ${isAccountConnected ? 'text-emerald-600' : 'text-neutral-500'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isAccountConnected ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'}`} />
                          {isAccountConnected ? 'Conectado' : 'Desconectado'}
                        </span>
                      </div>
                      <p className="font-extrabold text-neutral-950 text-sm truncate">{isAccountConnected ? (accountName || 'Hóspede') : 'Acesse sua conta'}</p>
                      <p className="text-[11px] text-neutral-600 font-medium truncate">{isAccountConnected ? accountEmail : 'Entre ou crie sua conta para reservar'}</p>
                    </div>

                    {!isAccountConnected && (
                      <div className="grid grid-cols-2 gap-2 border-b border-neutral-200/80 p-3">
                        <button type="button" onClick={() => { onOpenAccount('login'); setIsUserMenuOpen(false); }} className="flex items-center justify-center gap-2 rounded-xl border border-orange-300 bg-white/80 px-3 py-2.5 font-bold text-orange-700 transition hover:bg-orange-50">
                          <LogIn className="h-4 w-4" /> Entrar
                        </button>
                        <button type="button" onClick={() => { onOpenAccount('signup'); setIsUserMenuOpen(false); }} className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-3 py-2.5 font-bold text-white shadow-sm transition hover:brightness-105">
                          <UserPlus className="h-4 w-4" /> Criar conta
                        </button>
                      </div>
                    )}
                    {isAccountConnected && (
                      <div className="border-b border-neutral-200/80 px-3 py-3">
                        <button type="button" onClick={() => { onOpenAccount('login'); setIsUserMenuOpen(false); }} className="flex min-h-10 w-full items-center justify-center rounded-xl border border-neutral-200 bg-white/90 px-3 py-2.5 text-center font-bold text-neutral-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50">Gerenciar conta</button>
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
                          className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white/90 px-3 py-2.5 text-center font-bold text-neutral-700 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                        >
                          <LogOut className="h-4 w-4" />
                          {signingOut ? 'Saindo…' : 'Sair da conta'}
                        </button>
                        {signOutError && <p role="alert" className="mt-2 text-center text-[11px] font-semibold text-red-600">{signOutError}</p>}
                      </div>
                    )}

                    {isAccountConnected && <div className="py-1">
                      <button
                        onClick={() => {
                          setCurrentView('explore');
                          setIsUserMenuOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-neutral-100 cursor-pointer transition-colors ${
                          currentView === 'explore' ? 'font-bold text-orange-600 bg-orange-50' : 'text-neutral-800'
                        }`}
                      >
                        <Sparkles className="w-4 h-4 text-orange-500 flex-shrink-0" />
                        <span className="font-semibold">Explorar Hospedagens</span>
                      </button>

                      <button
                        onClick={() => {
                          setCurrentView('trips');
                          setIsUserMenuOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-neutral-100 cursor-pointer transition-colors ${
                          currentView === 'trips' ? 'font-bold text-orange-600 bg-orange-50' : 'text-neutral-800'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Briefcase className="w-4 h-4 text-neutral-600 flex-shrink-0" />
                          <span className="font-semibold">Minhas Reservas & Vouchers</span>
                        </div>
                        {tripsCount > 0 && (
                          <span className="bg-orange-500 text-white font-bold px-2 py-0.5 rounded-full text-[10px] shadow-xs">
                            {tripsCount}
                          </span>
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setCurrentView('wishlists');
                          setIsUserMenuOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-neutral-100 cursor-pointer transition-colors ${
                          currentView === 'wishlists' ? 'font-bold text-orange-600 bg-orange-50' : 'text-neutral-800'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Heart className="w-4 h-4 text-neutral-600 flex-shrink-0" />
                          <span className="font-semibold">Favoritos</span>
                        </div>
                      </button>
                    </div>}

                  </div>
                </>,
                document.body
              )}
            </div>

          </div>

        </div>
      </div>
    </header>
  );
};
