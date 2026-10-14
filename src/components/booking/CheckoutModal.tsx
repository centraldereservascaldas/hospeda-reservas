import React, { useEffect, useId, useRef, useState } from 'react';
import { X, ChevronLeft, ShieldCheck, CircleAlert } from 'lucide-react';
import { Property, Currency } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { getPublicPropertyTitle } from '../../utils/publicPropertyTitle';
import {
  getPropertyFeeAmount,
  getPropertyFeeLabel,
  getVisiblePropertyFees,
} from '../../utils/propertyPricing';
import {
  crcnBackendApi,
  type CalculatedPriceResponse,
  type CheckoutReadinessResponse,
} from '../../services/crcnBackendApi';
import { useDialogFocus } from '../useDialogFocus';

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
  const [approvedTerms, setApprovedTerms] = useState<{
    version: string;
    fields: [string, string][];
  } | null>(null);
  const [termsUnavailable, setTermsUnavailable] = useState(false);
  const [readiness, setReadiness] = useState<CheckoutReadinessResponse | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [quoteOverride, setQuoteOverride] = useState<CalculatedPriceResponse | null>(null);
  const fieldId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogFocus(isOpen && bookingData !== null, onClose, {
    initialFocusRef: closeButtonRef,
  });

  const currentQuote = quoteOverride ?? bookingData?.quote ?? null;

  useEffect(() => {
    let isCurrent = true;
    const listingId = bookingData?.property.staysListingId || bookingData?.property.id;

    setApprovedTerms(null);
    setTermsUnavailable(false);
    setReadiness(null);
    setReadinessLoading(Boolean(isOpen && listingId));
    setTermsAccepted(false);
    setIsSubmitting(false);
    setSubmitError(null);
    setQuoteOverride(null);

    if (!isOpen || !listingId) {
      setReadinessLoading(false);
      return () => {
        isCurrent = false;
      };
    }

    void Promise.all([
      crcnBackendApi.getCheckoutTerms(listingId),
      crcnBackendApi.getCheckoutReadiness(bookingData?.property.id || listingId),
    ]).then(([termsResult, readinessResult]) => {
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
    });

    return () => {
      isCurrent = false;
    };
  }, [bookingData?.property.id, bookingData?.property.staysListingId, isOpen]);

  if (!isOpen || !bookingData) return null;

  const { property, checkIn, checkOut, guests, nights, totalAmount, cleaningFee, discount } =
    bookingData;
  const guestCount = guests.adults + guests.children + guests.infants;
  const displayTitle = getPublicPropertyTitle(property.title);
  const shownTotal = currentQuote?.total ?? totalAmount;
  const shownDiscount = currentQuote?.source === 'stays-live' ? currentQuote.discount : discount;
  const shownCleaningFee = currentQuote?.cleaningFee ?? cleaningFee;
  const shownServiceFee = currentQuote?.serviceFee ?? 0;
  const visibleQuoteFees = getVisiblePropertyFees(currentQuote?.fees || []);
  const quoteFeesIncluded = currentQuote?.feesIncluded ?? false;
  const quoteCurrency = currentQuote?.currency ?? currency;

  const canSubmit =
    readiness?.ready === true && approvedTerms !== null && termsAccepted && !isSubmitting;

  const handleCheckoutSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSubmitError(null);

    if (!canSubmit || !approvedTerms || !readiness?.payment.methods.includes('pix')) {
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

    setIsSubmitting(true);
    const result = await crcnBackendApi.createCheckout({
      listingId,
      from: checkIn,
      to: checkOut,
      guests,
      quoteTotal,
      guest,
      acceptedTermsVersion: approvedTerms.version,
      acceptedTerms: true,
      idempotencyKey: crypto.randomUUID(),
    });

    if (result?.resume) {
      window.location.assign(result.resume.path);
      return;
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
      setIsSubmitting(false);
      return;
    }

    setSubmitError(
      result?.message || 'Não foi possível preparar o pedido. Revise a cotação e tente novamente.',
    );
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="min-h-screen py-8 px-3 sm:px-6 flex justify-center items-start">
        <div
          ref={dialogRef}
          data-dialog-focus-root
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${fieldId}-title`}
          tabIndex={-1}
          className="w-full max-w-4xl bg-white/98 sm:bg-white/96 backdrop-blur-2xl rounded-3xl shadow-2xl overflow-hidden border border-neutral-200/90 animate-in zoom-in-95 duration-200"
        >
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
                Central de Reservas Caldas Novas • Resumo da estadia
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
            {/* Left Column: Trip summary (7 cols) */}
            <div className="lg:col-span-7 space-y-8">
              {/* Trip details summary */}
              <div className="space-y-4">
                <h3 className="text-base font-bold text-neutral-900">
                  Resumo da sua estadia em Caldas Novas
                </h3>

                <div className="flex items-center justify-between py-2 border-b border-neutral-100 text-xs sm:text-sm">
                  <div>
                    <p className="font-bold text-neutral-900">Datas</p>
                    <p className="text-neutral-600">
                      {checkIn} até {checkOut} ({nights} noites)
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-neutral-100 text-xs sm:text-sm">
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
                    <p className="mt-1 text-xs text-neutral-600">
                      Informe os dados de contato para continuar com a pré-reserva e o pagamento.
                    </p>
                  </div>
                  <fieldset disabled={!readiness?.ready || isSubmitting} className="space-y-3">
                    <div>
                      <label
                        htmlFor={`${fieldId}-guest-name`}
                        className="block text-xs font-bold text-neutral-800"
                      >
                        Nome completo
                      </label>
                      <input
                        id={`${fieldId}-guest-name`}
                        name="name"
                        autoComplete="name"
                        required
                        className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`${fieldId}-guest-email`}
                        className="block text-xs font-bold text-neutral-800"
                      >
                        E-mail
                      </label>
                      <input
                        id={`${fieldId}-guest-email`}
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`${fieldId}-guest-phone`}
                        className="block text-xs font-bold text-neutral-800"
                      >
                        Telefone
                      </label>
                      <input
                        id={`${fieldId}-guest-phone`}
                        name="phone"
                        type="tel"
                        autoComplete="tel"
                        required
                        className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>
                  </fieldset>
                </div>

                {approvedTerms ? (
                  <section
                    className="space-y-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-xs text-emerald-950"
                    aria-labelledby={`${fieldId}-terms-title`}
                  >
                    <div>
                      <h4 id={`${fieldId}-terms-title`} className="font-bold">
                        Condições aprovadas desta acomodação
                      </h4>
                      <p className="mt-1 text-[11px]">Versão {approvedTerms.version}</p>
                    </div>
                    <dl className="space-y-2">
                      {approvedTerms.fields.map(([name, value]) => (
                        <div key={name}>
                          <dt className="font-semibold">{name}</dt>
                          <dd className="mt-0.5 whitespace-pre-wrap">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <label
                      htmlFor={`${fieldId}-accept-terms`}
                      className="flex items-start gap-2 border-t border-emerald-200 pt-3 font-semibold"
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
                    className="p-4 rounded-2xl border border-amber-300 bg-amber-50 text-xs text-amber-950"
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
                          Antes de abrir a compra, precisamos publicar as regras aplicáveis a este
                          imóvel e à tarifa, incluindo cancelamento e eventuais cobranças externas.
                          Elas variam por acomodação e não serão presumidas aqui.
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
                      className="mb-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-950"
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
                          : readiness?.ready && readiness.payment.methods.includes('pix')
                            ? 'Continuar para pagamento Pix'
                            : 'Compra no site em preparação'}
                    </span>
                  </button>
                  <p
                    id={`${fieldId}-checkout-status`}
                    className="text-center text-[10px] text-neutral-600 mt-2"
                  >
                    {readiness?.ready && readiness.payment.methods.includes('pix')
                      ? 'O pedido será validado e pré-reservado antes de você iniciar o pagamento Pix.'
                      : 'Pix e cartão ainda não estão disponíveis. Nenhum pedido, reserva ou pagamento será iniciado.'}
                  </p>
                </div>
              </form>
            </div>

            {/* Right Column: Reservation Preview */}
            <div className="lg:col-span-5">
              <div className="p-6 rounded-3xl border border-neutral-200/90 bg-white/70 backdrop-blur-xl space-y-4 shadow-sm">
                {/* Property Card Mini */}
                <div className="flex gap-4">
                  <img
                    src={property.images[0]}
                    alt={displayTitle}
                    className="w-24 h-24 rounded-2xl object-cover flex-shrink-0 shadow-sm"
                  />
                  <div className="flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-orange-600 uppercase">
                        {property.subtitle}
                      </span>
                      <h4 className="font-bold text-xs text-neutral-900 line-clamp-2 mt-0.5">
                        {displayTitle}
                      </h4>
                    </div>
                    {property.reviewsSynced && property.reviewCount > 0 && (
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-neutral-800">
                        <span>★ {property.rating.toFixed(2)}</span>
                        <span className="text-neutral-600">
                          ({property.reviewCount} avaliações)
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-neutral-200/80 my-3" />

                {/* Price breakdown */}
                <h4 className="text-xs font-bold text-neutral-900">Detalhamento da Estadia</h4>
                <div className="space-y-2 text-xs text-neutral-600">
                  <div className="flex justify-between">
                    <span>
                      {currentQuote?.breakdown.dailyRateText ||
                        `${formatCurrency(property.pricePerNight, currency)} x ${nights} noites`}
                    </span>
                    <span>
                      {formatCurrency(
                        currentQuote?.baseTotal ?? property.pricePerNight * nights,
                        currency,
                      )}
                    </span>
                  </div>

                  {shownDiscount > 0 && (
                    <div className="flex justify-between text-emerald-600 font-semibold">
                      <span>Desconto estadia prolongada</span>
                      <span>-{formatCurrency(shownDiscount, currency)}</span>
                    </div>
                  )}

                  {visibleQuoteFees.length
                    ? visibleQuoteFees.map((fee, index) => (
                        <div className="flex justify-between" key={fee._id || index}>
                          <span>
                            {getPropertyFeeLabel(fee)}
                            {quoteFeesIncluded ? ' (incluída no total)' : ''}
                          </span>
                          <span>
                            {formatCurrency(getPropertyFeeAmount(fee, quoteCurrency), currency)}
                          </span>
                        </div>
                      ))
                    : (shownCleaningFee > 0 || shownServiceFee > 0) && (
                        <>
                          {shownCleaningFee > 0 && (
                            <div className="flex justify-between">
                              <span>
                                Taxa de limpeza
                                {currentQuote?.cleaningIncluded ? ' (incluída no total)' : ''}
                              </span>
                              <span>{formatCurrency(shownCleaningFee, currency)}</span>
                            </div>
                          )}
                          {shownServiceFee > 0 && (
                            <div className="flex justify-between">
                              <span>Outras taxas incluídas na hospedagem</span>
                              <span>{formatCurrency(shownServiceFee, currency)}</span>
                            </div>
                          )}
                        </>
                      )}

                  <div className="border-t border-neutral-200 pt-3 flex justify-between font-bold text-sm text-neutral-900">
                    <span>Total final</span>
                    <span className="text-orange-600 text-base font-black">
                      {formatCurrency(shownTotal, currency)}
                    </span>
                  </div>
                </div>

                {/* Protection Banner */}
                <div className="p-3 rounded-xl bg-orange-50/60 border border-orange-200/80 text-xs text-neutral-700 flex items-start gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-neutral-900">Acompanhamento CRCN</p>
                    <p className="text-[11px] text-neutral-600 mt-0.5">
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
