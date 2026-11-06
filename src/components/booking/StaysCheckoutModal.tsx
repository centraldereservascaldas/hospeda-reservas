import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft, ShieldCheck, X } from 'lucide-react';
import type { Currency } from '../../types';
import type { AppOverlayBookingPayload } from '../../types/booking';
import { formatCurrency } from '../../utils/formatters';
import { getPublicPropertyTitle } from '../../utils/publicPropertyTitle';
import { crcnBackendApi, type CalculatedPriceResponse } from '../../services/crcnBackendApi';
import { navigateToHostedCheckout } from '../../utils/hostedCheckoutNavigation';
import { useDialogFocus } from '../useDialogFocus';

interface StaysCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingData: AppOverlayBookingPayload | null;
  guestPrefill: { fullName: string; email: string; phone: string };
  currency: Currency;
}

export const StaysCheckoutModal: React.FC<StaysCheckoutModalProps> = ({
  isOpen,
  onClose,
  bookingData,
  guestPrefill,
  currency,
}) => {
  const [guest, setGuest] = useState({ fullName: '', email: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedQuote, setUpdatedQuote] = useState<CalculatedPriceResponse | null>(null);
  const [readiness, setReadiness] = useState<{
    state: 'loading' | 'ready' | 'blocked';
    message: string;
  }>({ state: 'loading', message: 'Verificando a disponibilidade do checkout…' });
  const inFlight = useRef(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const dialogRef = useDialogFocus(isOpen && bookingData !== null, onClose, {
    initialFocusRef: closeRef,
  });

  useEffect(() => {
    if (!isOpen) return;
    setGuest({ fullName: guestPrefill.fullName, email: guestPrefill.email });
    setError(null);
    setUpdatedQuote(null);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [isOpen, bookingData?.property.id, guestPrefill.email, guestPrefill.fullName]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setReadiness({ state: 'loading', message: 'Verificando a disponibilidade do checkout…' });
    void crcnBackendApi.getStaysCheckoutReadiness().then((result) => {
      if (!active) return;
      setReadiness(
        result?.ready
          ? { state: 'ready', message: result.message }
          : {
              state: 'blocked',
              message:
                result?.message ||
                'Não foi possível confirmar a disponibilidade do checkout agora.',
            },
      );
    });
    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen || !bookingData) return null;

  const { property, checkIn, checkOut, guests, nights } = bookingData;
  const people = guests.adults + guests.children + guests.infants;
  const quote = updatedQuote ?? bookingData.quote;
  const canContinue =
    readiness.state === 'ready' && quote.source === 'stays-live' && people > 0 && !submitting;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canContinue || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const result = await crcnBackendApi.startStaysCheckout({
        listingId: property.staysListingId || property.id,
        from: checkIn,
        to: checkOut,
        guests: people,
        quoteTotal: quote.total,
        guest: { fullName: guest.fullName.trim(), email: guest.email.trim() },
      });
      if (result?.success === true) {
        if (navigateToHostedCheckout(result.checkoutUrl)) return;
        setError('O sistema retornou um endereço de checkout inválido. Tente novamente.');
        return;
      }
      if (result?.success === false && result.code === 'quote_changed') {
        const refreshed = await crcnBackendApi.calculatePrice({
          listingId: property.staysListingId || property.id,
          from: checkIn,
          to: checkOut,
          guests: people,
        });
        if (refreshed?.source === 'stays-live') setUpdatedQuote(refreshed);
      }
      setError(
        result?.success === false
          ? result.message
          : 'Não foi possível abrir o checkout. Tente novamente.',
      );
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="checkout-modal-overlay fixed inset-0 z-50 overflow-y-auto bg-neutral-950/70 backdrop-blur-md md:flex md:items-center md:justify-center">
      <div className="flex min-h-dvh items-start justify-center px-3 py-8 sm:px-6 md:min-h-full md:w-full md:items-center md:py-2">
        <div
          ref={dialogRef}
          data-dialog-focus-root
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="checkout-modal-dialog w-full max-w-3xl overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-2xl"
        >
          <div className="checkout-modal-header flex items-center justify-between border-b border-neutral-200 px-5 py-4">
            <div className="flex items-center gap-3">
              <button
                ref={closeRef}
                type="button"
                aria-label="Voltar e fechar checkout"
                onClick={onClose}
                className="rounded-full bg-neutral-100 p-2 text-neutral-700"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <h2 id={titleId} className="text-lg font-black text-neutral-950">
                Resumo da reserva
              </h2>
            </div>
            <button
              type="button"
              aria-label="Fechar checkout"
              onClick={onClose}
              className="p-2 text-neutral-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid gap-6 p-5 sm:p-8 md:grid-cols-2">
            <div className="space-y-5">
              <div>
                <h3 className="font-bold text-neutral-950">
                  {getPublicPropertyTitle(property.title)}
                </h3>
                <p className="mt-2 text-sm text-neutral-700">
                  {checkIn} até {checkOut} · {nights} noites · {people}{' '}
                  {people === 1 ? 'hóspede' : 'hóspedes'}
                </p>
                <p className="mt-3 text-2xl font-black text-neutral-950">
                  {formatCurrency(quote.total, currency)}
                </p>
                <p className="text-xs text-neutral-600">
                  Total cotado para sua hospedagem. O valor final será mostrado novamente no checkout.
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                Você será direcionado para nosso parceiro de reservas para conferir as condições da hospedagem,
                preencher os demais dados e concluir o pagamento.
              </div>
            </div>

            {readiness.state === 'ready' ? (
              <form className="space-y-4" aria-busy={submitting} onSubmit={submit}>
                <h3 className="font-bold text-neutral-950">Seus dados de contato</h3>
                <div>
                  <label htmlFor={`${titleId}-name`} className="block text-sm font-semibold">
                    Nome e sobrenome
                  </label>
                  <input
                    id={`${titleId}-name`}
                    required
                    minLength={5}
                    maxLength={180}
                    pattern="\S{2,}(?:\s+\S{2,})+"
                    title="Informe nome e sobrenome, com pelo menos duas letras em cada parte."
                    autoComplete="name"
                    value={guest.fullName}
                    onChange={(event) =>
                      setGuest((value) => ({ ...value, fullName: event.target.value }))
                    }
                    className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5"
                  />
                </div>
                <div>
                  <label htmlFor={`${titleId}-email`} className="block text-sm font-semibold">
                    E-mail
                  </label>
                  <input
                    id={`${titleId}-email`}
                    type="email"
                    required
                    maxLength={254}
                    autoComplete="email"
                    value={guest.email}
                    onChange={(event) =>
                      setGuest((value) => ({ ...value, email: event.target.value }))
                    }
                    className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5"
                  />
                </div>
                <p className="text-xs leading-relaxed text-neutral-600">
                  Ao continuar, estes dados serão enviados ao parceiro de reservas para abrir o checkout. Consulte
                  nossa{' '}
                  <a href="/privacidade" className="underline">
                    Política de Privacidade
                  </a>
                  .
                </p>
                {error && (
                  <p
                    role="alert"
                    className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-950"
                  >
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={!canContinue}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-700 px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                  {submitting ? 'Abrindo checkout…' : 'Continuar para o checkout'}
                </button>
                {quote.source !== 'stays-live' && (
                  <p role="status" className="text-xs text-amber-800">
                    Aguarde uma cotação atualizada para continuar.
                  </p>
                )}
              </form>
            ) : (
              <div
                role={readiness.state === 'blocked' ? 'alert' : 'status'}
                className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950"
              >
                {readiness.message}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
