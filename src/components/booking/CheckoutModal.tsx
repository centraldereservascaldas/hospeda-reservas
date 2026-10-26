import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft, ShieldCheck, CircleAlert } from 'lucide-react';
import { Property, Currency } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { getPublicPropertyTitle } from '../../utils/publicPropertyTitle';
import {
  getPropertyFeeAmount,
  getPropertyFeeLabel,
  getVisiblePropertyFees,
} from '../../utils/propertyPricing';
import { crcnBackendApi } from '../../services/crcnBackendApi';
import type { CalculatedPriceResponse } from '../../services/crcnBackendApi';
import { checkoutApi, type CheckoutReadinessResponse } from '../../services/checkoutApi';
import { useDialogFocus } from '../useDialogFocus';
import { countOccupancyGuests } from '../../utils/guestCounts';
import {
  clearCheckoutSubmissionKey,
  getOrCreateCheckoutSubmissionKey,
} from '../../utils/checkoutSubmissionStorage';

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

function formatCheckoutDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return value;

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  bookingData,
  currency,
}) => {
  const [approvedTerms, setApprovedTerms] = useState<{
    version: string;
    fields: [string, string][];
  } | null>(null);
  const [termsUnavailable, setTermsUnavailable] = useState(false);
  const [readiness, setReadiness] = useState<CheckoutReadinessResponse | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [checkoutStatusChecked, setCheckoutStatusChecked] = useState(false);
  const [checkoutStatusRetryKey, setCheckoutStatusRetryKey] = useState(0);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [quoteOverride, setQuoteOverride] = useState<CalculatedPriceResponse | null>(null);
  const checkoutSubmissionInFlightRef = useRef(false);
  const fieldId = useId();
  const checkoutTitleRef = useRef<HTMLHeadingElement>(null);
  const checkoutStatusRef = useRef<HTMLParagraphElement>(null);
  const checkoutStatusRetryFocusRef = useRef(false);
  const previousCheckoutStatusRetryKeyRef = useRef(checkoutStatusRetryKey);
  const dialogRef = useDialogFocus(isOpen && bookingData !== null, onClose, {
    initialFocusRef: checkoutTitleRef,
  });

  const currentQuote = quoteOverride ?? bookingData?.quote ?? null;

  useEffect(() => {
    let isCurrent = true;
    const listingId = bookingData?.property.staysListingId || bookingData?.property.id;
    const isRetry = previousCheckoutStatusRetryKeyRef.current !== checkoutStatusRetryKey;
    previousCheckoutStatusRetryKeyRef.current = checkoutStatusRetryKey;

    setApprovedTerms(null);
    setTermsUnavailable(false);
    setReadiness(null);
    setReadinessLoading(Boolean(isOpen && listingId));
    if (!isRetry) setCheckoutStatusChecked(false);
    setTermsAccepted(false);
    setIsSubmitting(false);
    setSubmitError(null);
    setQuoteOverride(null);

    if (!isOpen || !listingId) {
      setReadinessLoading(false);
      setCheckoutStatusChecked(false);
      checkoutStatusRetryFocusRef.current = false;
      return () => {
        isCurrent = false;
      };
    }

    void Promise.all([
      checkoutApi.getCheckoutTerms(listingId),
      checkoutApi.getCheckoutReadiness(bookingData?.property.id || listingId),
    ])
      .then(([termsResult, readinessResult]) => {
        if (!isCurrent) return;

        if (termsResult.kind === 'ready') {
          const { version, snapshot } = termsResult.data.terms;
          const fields = Object.entries(snapshot).filter(([key]) => key !== 'version');
          const areAllFieldsPlainText =
            fields.length > 0 &&
            fields.every(([, value]) => typeof value === 'string' && value.trim() !== '');

          if (areAllFieldsPlainText) {
            setApprovedTerms({ version, fields: fields as [string, string][] });
          } else {
            setTermsUnavailable(true);
          }
        } else {
          setTermsUnavailable(true);
        }

        if (readinessResult.kind === 'ready') {
          setReadiness(readinessResult.data);
        }
        setReadinessLoading(false);
        setCheckoutStatusChecked(true);
        if (checkoutStatusRetryFocusRef.current) {
          checkoutStatusRetryFocusRef.current = false;
          window.requestAnimationFrame(() => {
            if (isCurrent) checkoutStatusRef.current?.focus();
          });
        }
      })
      .catch(() => {
        if (!isCurrent) return;

        setTermsUnavailable(true);
        setReadiness(null);
        setReadinessLoading(false);
        setCheckoutStatusChecked(true);
        if (checkoutStatusRetryFocusRef.current) {
          checkoutStatusRetryFocusRef.current = false;
          window.requestAnimationFrame(() => {
            if (isCurrent) checkoutStatusRef.current?.focus();
          });
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [
    bookingData?.property.id,
    bookingData?.property.staysListingId,
    checkoutStatusRetryKey,
    isOpen,
  ]);

  if (!isOpen || !bookingData) return null;

  const { property, checkIn, checkOut, guests, nights, totalAmount, cleaningFee, discount } =
    bookingData;
  const guestCount = countOccupancyGuests(guests);
  const displayTitle = getPublicPropertyTitle(property.title);
  const shownTotal = currentQuote?.total ?? totalAmount;
  const shownDiscount = currentQuote?.source === 'stays-live' ? currentQuote.discount : discount;
  const shownCleaningFee = currentQuote?.cleaningFee ?? cleaningFee;
  const shownServiceFee = currentQuote?.serviceFee ?? 0;
  const visibleQuoteFees = getVisiblePropertyFees(currentQuote?.fees || []);
  const quoteFeesIncluded = currentQuote?.feesIncluded ?? false;
  const quoteCurrency = currentQuote?.currency ?? currency;
  const availablePaymentMethods = readiness?.payment.methods ?? [];
  const hasAvailablePaymentMethod = availablePaymentMethods.length > 0;
  const availablePaymentMethodsLabel = availablePaymentMethods
    .map((method) => (method === 'pix' ? 'Pix' : 'cartão'))
    .join(' e ');
  const canContinueCheckout =
    readiness?.ready === true && approvedTerms !== null && hasAvailablePaymentMethod;
  const checkoutStatusMessage = readinessLoading
    ? 'Verificando compra no site e formas de pagamento…'
    : termsUnavailable
      ? 'Não foi possível carregar as condições desta estadia. Tente consultar novamente.'
      : readiness === null
        ? 'Não foi possível verificar a prontidão do checkout. Tente consultar novamente.'
        : canContinueCheckout
          ? `Após validar e pré-reservar o pedido, você poderá pagar com ${availablePaymentMethodsLabel}.`
          : !readiness.checkoutEnabled
            ? 'A compra no site ainda não está habilitada para esta acomodação.'
            : !readiness.termsAvailable
              ? 'As condições desta estadia ainda não estão habilitadas para a compra no site.'
              : !readiness.payment.enabled
                ? 'O pagamento online ainda não está habilitado para esta acomodação.'
                : 'O checkout ainda não está pronto para continuar.';
  const canRetryCheckoutStatus = checkoutStatusChecked && (termsUnavailable || readiness === null);

  const canSubmit =
    readiness?.ready === true && approvedTerms !== null && termsAccepted && !isSubmitting;

  const handleCheckoutSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSubmitError(null);

    if (checkoutSubmissionInFlightRef.current) return;
    if (!canSubmit || !approvedTerms || !hasAvailablePaymentMethod) {
      setSubmitError('A compra ainda não está pronta para continuar.');
      return;
    }

    const formData = new FormData(event.currentTarget);
    const guest = {
      fullName: String(formData.get('name') ?? '').trim(),
      email: String(formData.get('email') ?? '').trim(),
      phone: String(formData.get('phone') ?? '').trim(),
    };
    const listingId = property.id;
    const quoteTotal = currentQuote?.total ?? totalAmount;
    const checkoutSubmission = {
      listingId,
      from: checkIn,
      to: checkOut,
      guests,
      quoteTotal,
      guest,
      acceptedTermsVersion: approvedTerms.version,
      acceptedTerms: true as const,
    };

    checkoutSubmissionInFlightRef.current = true;
    setIsSubmitting(true);
    try {
      const idempotencyKey = await getOrCreateCheckoutSubmissionKey(checkoutSubmission);
      const result = await checkoutApi.createCheckout({
        ...checkoutSubmission,
        idempotencyKey,
      });

      if (result?.resume) {
        await clearCheckoutSubmissionKey(checkoutSubmission);
        window.history.pushState(null, '', result.resume.path);
        window.dispatchEvent(new PopStateEvent('popstate'));
        return;
      }

      if (result !== null && result.code !== 'checkout_resume_unavailable') {
        await clearCheckoutSubmissionKey(checkoutSubmission);
      }

      if (result?.code === 'quote_changed') {
        setTermsAccepted(false);
        const refreshedQuote = await crcnBackendApi.calculatePrice({
          listingId: property.staysListingId || property.id,
          from: checkIn,
          to: checkOut,
          guests: guestCount,
        });

        if (refreshedQuote?.source === 'stays-live') {
          setQuoteOverride(refreshedQuote);
          setSubmitError(
            'O preço ou a disponibilidade mudou. Confira o total atualizado e aceite novamente antes de continuar.',
          );
        } else {
          setSubmitError(
            'O preço mudou, mas não foi possível atualizá-lo agora. Tente novamente quando a cotação estiver disponível.',
          );
        }
        return;
      }

      setSubmitError('Não foi possível preparar o pedido. Revise a cotação e tente novamente.');
    } catch {
      setSubmitError(
        'Não foi possível confirmar se o pedido foi registrado. Tente novamente sem alterar os dados para reutilizar a mesma tentativa.',
      );
    } finally {
      checkoutSubmissionInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="flex min-h-[100dvh] items-start justify-center py-8 pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] sm:pl-[max(1.5rem,env(safe-area-inset-left,0px))] sm:pr-[max(1.5rem,env(safe-area-inset-right,0px))]"
        style={{
          paddingTop: 'max(2rem, env(safe-area-inset-top, 0px))',
          paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div
          ref={dialogRef}
          data-dialog-focus-root
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${fieldId}-title`}
          tabIndex={-1}
          className="w-full max-w-4xl bg-white/98 sm:bg-white/96 backdrop-blur-2xl rounded-3xl shadow-2xl border border-neutral-200/90 animate-in zoom-in-95 duration-200"
        >
          {/* Header */}
          <div className="sticky top-[env(safe-area-inset-top,0px)] z-20 flex items-center rounded-t-3xl border-b border-neutral-200 bg-white/95 px-3 py-3 backdrop-blur-md sm:px-6 sm:py-4">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <button
                type="button"
                aria-label="Voltar para acomodação"
                onClick={onClose}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 text-neutral-700 shadow-2xs transition-colors hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
              >
                <ChevronLeft aria-hidden="true" className="h-5 w-5" />
              </button>
              <h2
                ref={checkoutTitleRef}
                id={`${fieldId}-title`}
                tabIndex={-1}
                className="min-w-0 text-sm font-black leading-snug text-neutral-950 sm:text-lg"
              >
                Central de Reservas Caldas Novas • Resumo da estadia
              </h2>
            </div>
          </div>

          {/* CHECKOUT STEP */}
          <div className="grid grid-cols-1 gap-8 p-4 sm:gap-10 sm:p-10 lg:grid-cols-12">
            {/* Left Column: Trip summary (7 cols) */}
            <div className="lg:col-span-7 space-y-8">
              {/* Trip details summary */}
              <div className="space-y-4">
                <h3 className="text-base font-bold text-neutral-900">
                  Resumo da sua estadia em Caldas Novas
                </h3>

                <div className="flex items-center justify-between py-2 border-b border-neutral-100 text-sm">
                  <div>
                    <p className="font-bold text-neutral-900">Datas</p>
                    <p className="break-words text-neutral-600">
                      <time dateTime={checkIn}>{formatCheckoutDate(checkIn)}</time> até{' '}
                      <time dateTime={checkOut}>{formatCheckoutDate(checkOut)}</time> ({nights}{' '}
                      {nights === 1 ? 'noite' : 'noites'})
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-neutral-100 text-sm">
                  <div>
                    <p className="font-bold text-neutral-900">Hóspedes</p>
                    <p className="text-neutral-600">
                      {guestCount} pessoa{guestCount === 1 ? '' : 's'}
                      {guests.infants > 0
                        ? `, incluindo ${guests.infants} bebê${guests.infants === 1 ? '' : 's'}`
                        : ''}
                      {guests.pets > 0 ? `, ${guests.pets} pets` : ''}
                    </p>
                  </div>
                </div>
              </div>

              <form
                className="space-y-5"
                aria-busy={isSubmitting}
                onSubmit={(event) => void handleCheckoutSubmit(event)}
              >
                <div className="space-y-3">
                  <div>
                    <h3 className="text-base font-bold text-neutral-900">
                      Dados do responsável pela reserva
                    </h3>
                    <p className="mt-1 text-sm text-neutral-600">
                      Informe os dados de contato para continuar com a pré-reserva e o pagamento.
                    </p>
                  </div>
                  <fieldset disabled={!readiness?.ready || isSubmitting} className="space-y-3">
                    <div>
                      <label
                        htmlFor={`${fieldId}-guest-name`}
                        className="block text-sm font-bold text-neutral-800"
                      >
                        Nome completo
                      </label>
                      <input
                        id={`${fieldId}-guest-name`}
                        name="name"
                        autoComplete="name"
                        required
                        className="mt-1.5 min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`${fieldId}-guest-email`}
                        className="block text-sm font-bold text-neutral-800"
                      >
                        E-mail
                      </label>
                      <input
                        id={`${fieldId}-guest-email`}
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        className="mt-1.5 min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`${fieldId}-guest-phone`}
                        className="block text-sm font-bold text-neutral-800"
                      >
                        Telefone
                      </label>
                      <input
                        id={`${fieldId}-guest-phone`}
                        name="phone"
                        type="tel"
                        autoComplete="tel"
                        required
                        className="mt-1.5 min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>
                  </fieldset>
                </div>

                {approvedTerms ? (
                  <section
                    className="space-y-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950"
                    aria-labelledby={`${fieldId}-terms-title`}
                  >
                    <div>
                      <h4 id={`${fieldId}-terms-title`} className="font-bold">
                        Condições desta hospedagem
                      </h4>
                    </div>
                    <dl className="space-y-2">
                      {approvedTerms.fields.map(([name, value]) => (
                        <div key={name}>
                          <dt className="font-semibold">{name}</dt>
                          <dd className="mt-0.5 break-words whitespace-pre-wrap [overflow-wrap:anywhere]">
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <label
                      htmlFor={`${fieldId}-accept-terms`}
                      className="flex min-h-11 items-start gap-2 border-t border-emerald-200 pt-3 font-semibold"
                    >
                      <input
                        id={`${fieldId}-accept-terms`}
                        type="checkbox"
                        required
                        checked={termsAccepted}
                        disabled={!readiness?.ready || isSubmitting}
                        onChange={(event) => setTermsAccepted(event.currentTarget.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-emerald-500 text-emerald-700 focus-visible:ring-2 focus-visible:ring-orange-600 disabled:cursor-not-allowed"
                      />
                      <span>
                        Li e aceito as condições desta acomodação e o total de{' '}
                        {formatCurrency(shownTotal, currency)}.
                      </span>
                    </label>
                    <p>
                      O pedido só será criado após nova validação de preço e disponibilidade. A
                      pré-reserva não significa confirmação da estadia.
                    </p>
                  </section>
                ) : (
                  <div
                    className="p-4 rounded-2xl border border-amber-300 bg-amber-50 text-sm text-amber-950"
                    role="status"
                    aria-live="polite"
                  >
                    <div className="flex items-start gap-2.5">
                      <CircleAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                      <div className="space-y-1">
                        <p className="font-bold">
                          {termsUnavailable
                            ? 'Condições desta acomodação ainda não disponíveis'
                            : 'Consultando as condições da acomodação'}
                        </p>
                        <p>
                          Antes de abrir a compra, precisamos aprovar e publicar, para este imóvel e
                          tarifa, preço e taxas, cancelamento e reembolso, forma e prazo de
                          pagamento, prazo da pré-reserva e atendimento. Essas regras variam por
                          acomodação e não serão presumidas aqui.
                        </p>
                        <p>
                          {readinessLoading
                            ? 'Também estamos verificando se a compra e o pagamento estão habilitados.'
                            : 'Nenhum pedido, pré-reserva ou pagamento será iniciado até que as condições e o pagamento estejam prontos.'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-1">
                  {submitError && (
                    <p
                      className="mb-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-950"
                      role="alert"
                    >
                      {submitError}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    aria-describedby={`${fieldId}-checkout-status`}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-700 via-amber-700 to-orange-800 text-white font-extrabold text-sm shadow-lg shadow-orange-500/35 flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                    <span>
                      {isSubmitting
                        ? 'Preparando seu pedido…'
                        : readinessLoading
                          ? 'Verificando compra no site…'
                          : readiness?.ready && hasAvailablePaymentMethod
                            ? 'Continuar para pagamento'
                            : 'Compra no site em preparação'}
                    </span>
                  </button>
                  <p
                    ref={checkoutStatusRef}
                    id={`${fieldId}-checkout-status`}
                    role="status"
                    aria-live="polite"
                    tabIndex={-1}
                    className="text-center text-sm text-neutral-600 mt-2"
                  >
                    {checkoutStatusMessage}
                  </p>
                  {canRetryCheckoutStatus && (
                    <button
                      type="button"
                      aria-disabled={readinessLoading}
                      onClick={() => {
                        if (readinessLoading) return;
                        checkoutStatusRetryFocusRef.current = true;
                        setReadinessLoading(true);
                        setCheckoutStatusRetryKey((current) => current + 1);
                      }}
                      className="mx-auto mt-3 flex min-h-11 items-center justify-center rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-bold text-neutral-800 transition hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 aria-disabled:cursor-wait aria-disabled:opacity-60"
                    >
                      {readinessLoading ? 'Consultando novamente…' : 'Tentar novamente'}
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Right Column: Reservation Preview */}
            <div className="min-w-0 lg:col-span-5">
              <div className="min-w-0 space-y-4 rounded-3xl border border-neutral-200/90 bg-white/70 p-4 shadow-sm backdrop-blur-xl sm:p-6">
                {/* Property Card Mini */}
                <div className="flex min-w-0 gap-4">
                  <img
                    src={property.images[0]}
                    alt={displayTitle}
                    className="h-24 w-24 shrink-0 rounded-2xl object-cover shadow-sm"
                  />
                  <div className="flex min-w-0 flex-1 flex-col justify-between">
                    <div>
                      <span className="break-words text-[11px] font-bold uppercase text-orange-600">
                        {property.subtitle}
                      </span>
                      <h4 className="mt-0.5 line-clamp-2 break-words text-sm font-bold text-neutral-900">
                        {displayTitle}
                      </h4>
                    </div>
                    {property.reviewsSynced && property.reviewCount > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-x-1 text-[11px] font-semibold text-neutral-800">
                        <span>★ {property.rating.toFixed(2)}</span>
                        <span className="text-neutral-600">
                          ({property.reviewCount}{' '}
                          {property.reviewCount === 1 ? 'avaliação' : 'avaliações'})
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-neutral-200/80 my-3" />

                {/* Price breakdown */}
                <h4 className="text-sm font-bold text-neutral-900">Detalhamento da Estadia</h4>
                <div className="space-y-2 text-sm text-neutral-600">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 break-words">
                      {currentQuote?.breakdown.dailyRateText ||
                        `${formatCurrency(property.pricePerNight, currency)} x ${nights} noites`}
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-right">
                      {formatCurrency(
                        currentQuote?.baseTotal ?? property.pricePerNight * nights,
                        currency,
                      )}
                    </span>
                  </div>

                  {shownDiscount > 0 && (
                    <div className="flex items-start justify-between gap-3 font-semibold text-emerald-600">
                      <span className="min-w-0 break-words">Desconto estadia prolongada</span>
                      <span className="shrink-0 whitespace-nowrap text-right">
                        -{formatCurrency(shownDiscount, currency)}
                      </span>
                    </div>
                  )}

                  {visibleQuoteFees.length
                    ? visibleQuoteFees.map((fee, index) => (
                        <div
                          className="flex items-start justify-between gap-3"
                          key={fee._id || index}
                        >
                          <span className="min-w-0 break-words">
                            {getPropertyFeeLabel(fee)}
                            {quoteFeesIncluded ? ' (incluída no total)' : ''}
                          </span>
                          <span className="shrink-0 whitespace-nowrap text-right">
                            {formatCurrency(getPropertyFeeAmount(fee, quoteCurrency), currency)}
                          </span>
                        </div>
                      ))
                    : (shownCleaningFee > 0 || shownServiceFee > 0) && (
                        <>
                          {shownCleaningFee > 0 && (
                            <div className="flex items-start justify-between gap-3">
                              <span className="min-w-0 break-words">
                                Taxa de limpeza
                                {currentQuote?.cleaningIncluded ? ' (incluída no total)' : ''}
                              </span>
                              <span className="shrink-0 whitespace-nowrap text-right">
                                {formatCurrency(shownCleaningFee, currency)}
                              </span>
                            </div>
                          )}
                          {shownServiceFee > 0 && (
                            <div className="flex items-start justify-between gap-3">
                              <span className="min-w-0 break-words">
                                Outras taxas incluídas na hospedagem
                              </span>
                              <span className="shrink-0 whitespace-nowrap text-right">
                                {formatCurrency(shownServiceFee, currency)}
                              </span>
                            </div>
                          )}
                        </>
                      )}

                  <div className="flex items-start justify-between gap-3 border-t border-neutral-200 pt-3 text-sm font-bold text-neutral-900">
                    <span className="min-w-0 break-words">Total final</span>
                    <span className="shrink-0 whitespace-nowrap text-right text-base font-black text-orange-600">
                      {formatCurrency(shownTotal, currency)}
                    </span>
                  </div>
                  {currency !== 'BRL' && (
                    <p className="text-xs leading-relaxed text-neutral-500">
                      Conversão indicativa. A cobrança será processada em reais (BRL).
                    </p>
                  )}
                </div>

                {/* Protection Banner */}
                <div className="p-3 rounded-xl bg-orange-50/60 border border-orange-200/80 text-sm text-neutral-700 flex items-start gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-neutral-900">Acompanhamento CRCN</p>
                    <p className="text-sm text-neutral-600 mt-0.5">
                      Nossa equipe acompanha a confirmação da reserva e orienta você sobre o
                      check-in em Caldas Novas.
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
