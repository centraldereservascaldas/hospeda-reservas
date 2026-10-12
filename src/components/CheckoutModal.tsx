import React, { useEffect, useId, useRef, useState } from 'react';
import { X, ChevronLeft, ShieldCheck } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { Property, Currency } from '../types';
import { formatCurrency } from '../utils/formatters';
import { crcnBackendApi, CalculatedPriceResponse } from '../services/crcnBackendApi';
import { supabase, supabaseConfigured } from '../services/supabase';
import { useDialogFocus } from './useDialogFocus';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingData: {
    property: Property;
    checkIn: string;
    checkOut: string;
    guests: { adults: number; children: number; infants: number; pets: number };
    nights: number;
    totalAmount: number;
    cleaningFee: number;
    serviceFee: number;
    discount: number;
    quote: CalculatedPriceResponse;
  } | null;
  currency: Currency;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  bookingData,
  currency,
}) => {
  const fieldId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogFocus(isOpen && bookingData !== null, onClose, { initialFocusRef: closeButtonRef });
  
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup');
  const [authFullName, setAuthFullName] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthProcessing, setIsAuthProcessing] = useState(false);
  const [isStaysSyncing, setIsStaysSyncing] = useState(false);
  const [isStaysSynced, setIsStaysSynced] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [authError, setAuthError] = useState('');
  const [messageToHost, setMessageToHost] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [currentQuote, setCurrentQuote] = useState<CalculatedPriceResponse | null>(bookingData?.quote || null);

  useEffect(() => {
    setCurrentQuote(bookingData?.quote || null);
    setCheckoutError('');
  }, [bookingData]);

  const syncVerifiedAccount = async (activeSession: Session) => {
    if (!supabase) return;
    setSession(activeSession);
    setGuestEmail(activeSession.user.email || '');
    setGuestName(String(activeSession.user.user_metadata?.full_name || activeSession.user.user_metadata?.name || ''));
    setIsStaysSyncing(true);
    setIsStaysSynced(false);
    setAuthError('');
    setAuthMessage('Conta validada. Sincronizando seu cadastro para a reserva…');
    try {
      const result = await crcnBackendApi.syncStaysGuest(activeSession.access_token);
      if (!result?.success) throw new Error(result?.message || 'Não foi possível sincronizar seu cadastro com as reservas.');
      setIsStaysSynced(true);
      setAuthMessage('Conta conectada e cadastro sincronizado.');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Não foi possível sincronizar seu cadastro.');
      setAuthMessage('');
    } finally {
      setIsStaysSyncing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!isOpen || !supabase) {
      setSession(null);
      setIsStaysSynced(false);
      return;
    }
    void supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setAuthError('Não foi possível recuperar sua sessão. Entre novamente.');
        return;
      }
      if (data.session) void syncVerifiedAccount(data.session);
    });
    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen || !bookingData) return null;

  const { property, checkIn, checkOut, guests, nights, totalAmount, cleaningFee, discount } = bookingData;
  const shownTotal = currentQuote?.total ?? totalAmount;

  const handleAccountSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) {
      setAuthError('O login ainda não foi configurado neste site.');
      return;
    }
    setIsAuthProcessing(true);
    setAuthError('');
    setAuthMessage('');
    try {
      const email = guestEmail.trim().toLowerCase();
      if (authMode === 'signup') {
        if (authFullName.trim().split(/\s+/).filter(Boolean).length < 2) {
          throw new Error('Informe seu nome completo.');
        }
        if (authPassword.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
        localStorage.setItem('hospeda_pending_email_confirmation', 'true');
        const { data, error } = await supabase.auth.signUp({
          email,
          password: authPassword,
          options: {
            data: { full_name: authFullName.trim() },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        if (!data.session) {
          setAuthPassword('');
          setAuthMessage('Cadastro iniciado. Confirme seu e-mail pelo link enviado e depois entre para sincronizar sua conta.');
          return;
        }
        await syncVerifiedAccount(data.session);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: authPassword });
        if (error) throw error;
        if (!data.session) throw new Error('Não foi possível iniciar sua sessão.');
        await syncVerifiedAccount(data.session);
      }
      setAuthPassword('');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Não foi possível acessar sua conta.');
    } finally {
      setIsAuthProcessing(false);
    }
  };

  const handleSignOut = async () => {
    await supabase?.auth.signOut();
    setSession(null);
    setIsStaysSynced(false);
    setAuthMessage('');
    setAuthError('');
  };

  const handleFinalizeBooking = async () => {
    if (!currentQuote || currentQuote.source !== 'stays-live') {
      setCheckoutError('Não há uma cotação oficial válida. Volte à acomodação e atualize o preço.');
      return;
    }
    if (!session || !isStaysSynced || !supabase) {
      setCheckoutError('Entre ou crie sua conta e aguarde a sincronização antes de continuar.');
      return;
    }
    setIsProcessing(true);
    setCheckoutError('');
    try {
      const { data: latestSession, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !latestSession.session) throw new Error('Sua sessão expirou. Entre novamente para continuar.');
      const response = await crcnBackendApi.createCheckout({
        listingId: property.staysListingId || property.id,
        from: checkIn,
        to: checkOut,
        guests,
        quoteTotal: currentQuote.total,
      }, latestSession.session.access_token);
      if (response?.code === 'quote_changed' && response.quote) {
        setCurrentQuote(response.quote);
        setCheckoutError(`${response.message || 'O preço foi atualizado.'} Confira o novo total antes de continuar.`);
      } else if (response?.success && response.redirectUrl) {
        window.location.assign(response.redirectUrl);
      } else {
        setCheckoutError(response?.message || 'Não foi possível iniciar o checkout seguro. Tente novamente.');
      }
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'Falha de comunicação ao revalidar sua reserva. Nenhuma reserva foi confirmada. Tente novamente.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="min-h-screen py-8 px-3 sm:px-6 flex justify-center items-start">
        <div ref={dialogRef} data-dialog-focus-root role="dialog" aria-modal="true" aria-labelledby={`${fieldId}-title`} tabIndex={-1} className="w-full max-w-4xl bg-white/98 sm:bg-white/96 backdrop-blur-2xl rounded-3xl shadow-2xl overflow-hidden border border-neutral-200/90 animate-in zoom-in-95 duration-200">
          
          {/* Header */}
          <div className="px-6 py-4 border-b border-neutral-200 bg-white/95 backdrop-blur-md flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Voltar e fechar checkout"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 flex items-center justify-center text-neutral-700 transition-colors shadow-2xs"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 id={`${fieldId}-title`} className="text-lg font-black text-neutral-950">
                Central de Reservas Caldas Novas • Confirmar Estadia
              </h2>
            </div>

            <button
              type="button"
              aria-label="Fechar checkout"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/70 hover:bg-white border border-white/80 flex items-center justify-center text-neutral-500 hover:text-neutral-900 transition-colors shadow-2xs"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* CHECKOUT STEP */}
          <div className="p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-10">
              
              {/* Left Column: Form & Payment (7 cols) */}
              <div className="lg:col-span-7 space-y-8">
                
                {/* Trip details summary */}
                <div className="space-y-4">
                  <h3 className="text-base font-bold text-neutral-900">Resumo da sua estadia em Caldas Novas</h3>
                  
                  <div className="flex items-center justify-between py-2 border-b border-neutral-100 text-xs sm:text-sm">
                    <div>
                      <p className="font-bold text-neutral-900">Datas</p>
                      <p className="text-neutral-600">{checkIn} até {checkOut} ({nights} noites)</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-2 border-b border-neutral-100 text-xs sm:text-sm">
                    <div>
                      <p className="font-bold text-neutral-900">Hóspedes</p>
                      <p className="text-neutral-600">
                        {guests.adults + guests.children} hóspedes
                        {guests.infants > 0 ? `, ${guests.infants} bebês` : ''}
                        {guests.pets > 0 ? `, ${guests.pets} pets` : ''}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Guest authentication and Stays account synchronization */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-neutral-900">Entre ou crie sua conta</h3>
                    <p className="mt-1 text-xs text-neutral-500">Use sua conta para reservar. Seu cadastro será sincronizado com o sistema de reservas após a confirmação do e-mail.</p>
                  </div>

                  {!supabaseConfigured ? (
                    <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                      O serviço de login ainda não está configurado. Defina `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` e aplique a migração SQL do projeto.
                    </div>
                  ) : session ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-emerald-950">{guestName || 'Hóspede'}</p>
                          <p className="mt-0.5 text-xs text-emerald-800">{guestEmail}</p>
                          <p className="mt-2 text-xs text-emerald-800" role="status">
                            {isStaysSyncing ? 'Sincronizando seu cadastro…' : isStaysSynced ? '✓ Conta sincronizada e pronta para reservar.' : 'A sincronização ainda não foi concluída.'}
                          </p>
                        </div>
                        <button type="button" onClick={() => void handleSignOut()} className="text-xs font-bold text-emerald-900 underline underline-offset-2">Sair</button>
                      </div>
                      {!isStaysSynced && !isStaysSyncing && (
                        <button type="button" onClick={() => void syncVerifiedAccount(session)} className="mt-3 rounded-xl border border-emerald-300 bg-white/80 px-3 py-2 text-xs font-bold text-emerald-900 hover:bg-white">Tentar sincronizar novamente</button>
                      )}
                    </div>
                  ) : (
                    <form onSubmit={handleAccountSubmit} className="space-y-3 rounded-2xl border border-neutral-200 bg-white/70 p-4">
                      <div className="grid grid-cols-2 gap-2 rounded-xl bg-neutral-100 p-1 text-xs font-bold">
                        <button type="button" onClick={() => { setAuthMode('signup'); setAuthError(''); setAuthMessage(''); }} className={`rounded-lg px-3 py-2 transition-colors ${authMode === 'signup' ? 'bg-white text-orange-700 shadow-sm' : 'text-neutral-500'}`}>Criar conta</button>
                        <button type="button" onClick={() => { setAuthMode('login'); setAuthError(''); setAuthMessage(''); }} className={`rounded-lg px-3 py-2 transition-colors ${authMode === 'login' ? 'bg-white text-orange-700 shadow-sm' : 'text-neutral-500'}`}>Já tenho conta</button>
                      </div>
                      {authMode === 'signup' && (
                        <div>
                        <label htmlFor={`${fieldId}-guest-name`} className="mb-1 block text-xs font-semibold text-neutral-700">Nome completo</label>
                          <input id={`${fieldId}-guest-name`} autoComplete="name" required minLength={3} value={authFullName} onChange={(e) => setAuthFullName(e.target.value)} className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus-visible:ring-2 focus-visible:ring-orange-600" />
                        </div>
                      )}
                      <div>
                        <label htmlFor={`${fieldId}-guest-email`} className="mb-1 block text-xs font-semibold text-neutral-700">E-mail</label>
                        <input id={`${fieldId}-guest-email`} type="email" autoComplete="email" required value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus-visible:ring-2 focus-visible:ring-orange-600" />
                      </div>
                      <div>
                        <label htmlFor={`${fieldId}-guest-password`} className="mb-1 block text-xs font-semibold text-neutral-700">Senha</label>
                        <input id={`${fieldId}-guest-password`} type="password" autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} required minLength={authMode === 'signup' ? 8 : 1} value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus-visible:ring-2 focus-visible:ring-orange-600" />
                        {authMode === 'signup' && <p className="mt-1 text-[11px] text-neutral-500">Use pelo menos 8 caracteres.</p>}
                      </div>
                      {authError && <p role="alert" className="text-xs font-semibold text-red-700">{authError}</p>}
                      {authMessage && <p role="status" className="text-xs font-semibold text-emerald-800">{authMessage}</p>}
                      <button type="submit" disabled={isAuthProcessing} className="w-full rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 text-sm font-extrabold text-white shadow-md shadow-orange-500/20 disabled:cursor-wait disabled:opacity-60">
                        {isAuthProcessing ? 'Validando conta…' : authMode === 'signup' ? 'Criar conta e continuar' : 'Entrar e continuar'}
                      </button>
                    </form>
                  )}
                  {authError && session && <p role="alert" className="text-xs font-semibold text-red-700">{authError}</p>}
                  {authMessage && session && <p role="status" className="sr-only">{authMessage}</p>}
                </div>

                <div className="p-4 rounded-2xl border border-sky-200 bg-sky-50 text-xs text-sky-900">
                  <p className="font-bold">Pagamento seguro</p>
                  <p className="mt-1">Você seguirá para um ambiente seguro para revisar a disponibilidade, escolher a forma de pagamento e concluir a reserva. Este site não coleta nem processa dados de cartão.</p>
                </div>

                {/* Message to Central */}
                <div className="space-y-2">
                  <label htmlFor={`${fieldId}-message-to-host`} className="text-xs font-semibold text-neutral-700 block">
                    Observações para a Central de Reservas Caldas Novas (Opcional)
                  </label>
                  <textarea
                    id={`${fieldId}-message-to-host`}
                    rows={2}
                    value={messageToHost}
                    onChange={(e) => setMessageToHost(e.target.value)}
                    placeholder="Ex: Horário estimado de chegada, solicitação de berço ou dúvidas sobre parques..."
                    className="w-full p-3 rounded-xl border border-neutral-300 text-xs focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-orange-600 outline-none"
                  />
                </div>

                {/* Submit Button */}
                <div className="pt-2">
                  <button
                    disabled={isProcessing || !currentQuote || currentQuote.source !== 'stays-live' || !session || !isStaysSynced}
                    onClick={handleFinalizeBooking}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 text-white font-extrabold text-sm shadow-lg shadow-orange-500/35 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <span>Revalidando disponibilidade e preço...</span>
                    ) : !session ? (
                      <><ShieldCheck className="w-4 h-4" /><span>Entre ou crie uma conta para reservar</span></>
                    ) : !isStaysSynced ? (
                      <><ShieldCheck className="w-4 h-4" /><span>Aguardando sincronização do cadastro…</span></>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Continuar para checkout • {formatCurrency(shownTotal, currency)}</span>
                      </>
                    )}
                  </button>
                  {checkoutError && <p role="alert" className="text-center text-xs font-semibold text-red-700 mt-2">{checkoutError}</p>}
                  <p className="text-center text-[10px] text-neutral-400 mt-2">
                    A reserva só estará confirmada após a conclusão do pagamento.
                  </p>
                </div>

              </div>

              {/* Right Column: Reservation Preview */}
              <div className="lg:col-span-5">
                <div className="p-6 rounded-3xl border border-neutral-200/90 bg-white/70 backdrop-blur-xl space-y-4 shadow-sm">
                  {/* Property Card Mini */}
                  <div className="flex gap-4">
                    <img
                      src={property.images[0]}
                      alt={property.title}
                      className="w-24 h-24 rounded-2xl object-cover flex-shrink-0 shadow-sm"
                    />
                    <div className="flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-orange-600 uppercase">
                          {property.subtitle}
                        </span>
                        <h4 className="font-bold text-xs text-neutral-900 line-clamp-2 mt-0.5">
                          {property.title}
                        </h4>
                      </div>
                      {property.reviewsSynced && property.reviewCount > 0 && (
                        <div className="flex items-center gap-1 text-[11px] font-semibold text-neutral-800">
                          <span>★ {property.rating.toFixed(2)}</span>
                          <span className="text-neutral-400">({property.reviewCount} avaliações)</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-neutral-200/80 my-3" />

                  {/* Price breakdown */}
                  <h4 className="text-xs font-bold text-neutral-900">Detalhamento da Estadia</h4>
                  <div className="space-y-2 text-xs text-neutral-600">
                    <div className="flex justify-between">
                      <span>{formatCurrency(currentQuote?.dailyRate ?? property.pricePerNight, currency)} x {nights} noites</span>
                      <span>{formatCurrency(currentQuote?.baseTotal ?? property.pricePerNight * nights, currency)}</span>
                    </div>

                    {discount > 0 && (
                      <div className="flex justify-between text-emerald-600 font-semibold">
                        <span>Desconto estadia prolongada</span>
                        <span>-{formatCurrency(discount, currency)}</span>
                      </div>
                    )}

                    {cleaningFee > 0 && (
                      <div className="flex justify-between">
                        <span>Taxa de limpeza{currentQuote?.cleaningIncluded ? ' (incluída na diária)' : ''}</span>
                        <span>{formatCurrency(cleaningFee, currency)}</span>
                      </div>
                    )}

                    <div className="border-t border-neutral-200 pt-3 flex justify-between font-bold text-sm text-neutral-900">
                      <span>Total final</span>
                      <span className="text-orange-600 text-base font-black">{formatCurrency(shownTotal, currency)}</span>
                    </div>
                  </div>

                  {/* Protection Banner */}
                  <div className="p-3 rounded-xl bg-orange-50/60 border border-orange-200/80 text-xs text-neutral-700 flex items-start gap-2.5">
                    <ShieldCheck className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-neutral-900">Garantia Central de Reservas CN</p>
                      <p className="text-[11px] text-neutral-600 mt-0.5">
                        Pulseiras e acesso garantido a parques e piscinas com apoio de nossa equipe em Caldas Novas.
                      </p>
                    </div>
                  </div>

                </div>
              </div>

            </div>

        </div>
      </div>
    </div>
  );
};
