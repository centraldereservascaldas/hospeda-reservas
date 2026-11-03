import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { ArrowLeft, BadgeCheck, CreditCard, LockKeyhole, QrCode, ShieldCheck } from 'lucide-react';
import { LogoCRCN } from '../LogoCRCN';
import type { CheckoutModal } from './CheckoutModal';
import {
  CieloSopCardForm,
  formatCieloCardPayment,
  type CieloCardPricing,
  type CieloPaymentContext,
} from './CieloSopCardForm';
import {
  checkoutApi,
  type CheckoutReadinessResponse,
  type CheckoutResumeResponse,
} from '../../services/checkoutApi';
import { crcnBackendApi } from '../../services/crcnBackendApi';
import {
  getOrCreateCheckoutSubmissionKey,
  clearCheckoutSubmissionKey,
} from '../../utils/checkoutSubmissionStorage';
import { emitConfirmedPurchase } from '../../utils/measurementEvents';
import { formatCurrency } from '../../utils/formatters';
import { countOccupancyGuests } from '../../utils/guestCounts';
import { getPublicPropertyTitle } from '../../utils/publicPropertyTitle';
import {
  getVisiblePropertyFees,
  getPropertyFeeLabel,
  getPropertyFeeAmount,
} from '../../utils/propertyPricing';

type SinglePageCheckoutProps = Pick<
  ComponentProps<typeof CheckoutModal>,
  'bookingData' | 'guestPrefill' | 'onClose'
> & {
  previewOnly?: boolean;
};
const fieldClass =
  'mt-1.5 min-h-12 w-full rounded-xl border border-neutral-400/70 bg-white px-3 text-base text-neutral-950 outline-none focus-visible:border-orange-700 focus-visible:ring-2 focus-visible:ring-orange-700/20 disabled:bg-neutral-100';
const formatDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });

/** Isolated own-checkout entry. The public Stays checkout remains selected by AppOverlayLayer. */
export function SinglePageCheckout({
  bookingData,
  guestPrefill,
  onClose,
  previewOnly = false,
}: SinglePageCheckoutProps) {
  const [guest, setGuest] = useState(guestPrefill ?? { fullName: '', email: '', phone: '' });
  const [terms, setTerms] = useState<{ version: string; fields: [string, string][] } | null>(null);
  const [readiness, setReadiness] = useState<CheckoutReadinessResponse | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'pix'>('card');
  const [cardPricing, setCardPricing] = useState<CieloCardPricing | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [quote, setQuote] = useState(bookingData?.quote ?? null);
  const [prepared, setPrepared] = useState(false);
  const preparedRef = useRef<CieloPaymentContext | null>(null);
  const [attemptFinished, setAttemptFinished] = useState(false);
  const [result, setResult] = useState<CheckoutResumeResponse | null>(null);
  const [statusUnavailable, setStatusUnavailable] = useState(false);
  const [statusRetry, setStatusRetry] = useState(0);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bookingData) return;
    if (previewOnly) {
      setTerms({
        version: 'preview-local',
        fields: [
          ['Cancelamento', 'Condições demonstrativas para revisão do layout.'],
          ['Hospedagem', 'A reserva será confirmada somente após pagamento e confirmação.'],
        ],
      });
      setReadiness({
        success: true,
        ready: true,
        termsAvailable: true,
        checkoutEnabled: true,
        singlePageCheckoutEnabled: true,
        payment: {
          enabled: true,
          methods: ['card', 'pix'],
          publicKey: null,
          provider: 'cielo_sandbox',
        },
      });
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setReadiness(null);
    setTerms(null);
    void Promise.all([
      checkoutApi.getCheckoutTerms(bookingData.property.staysListingId || bookingData.property.id),
      checkoutApi.getCheckoutReadiness(bookingData.property.id),
    ])
      .then(([conditions, capabilities]) => {
        if (!active) return;
        if (conditions.kind === 'ready') {
          const fields = Object.entries(conditions.data.terms.snapshot).filter(
            ([key]) => key !== 'version',
          );
          if (
            fields.length &&
            fields.every(([, value]) => typeof value === 'string' && value.trim())
          ) {
            setTerms({
              version: conditions.data.terms.version,
              fields: fields as [string, string][],
            });
          }
        }
        if (capabilities.kind === 'ready') setReadiness(capabilities.data);
      })
      .catch(() => {
        /* Fail closed; the retry control remains available. */
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [bookingData, previewOnly, retry]);

  useEffect(() => {
    if (!attemptFinished || !preparedRef.current) return;
    const context = preparedRef.current;
    let active = true;
    let timer: number | undefined;
    resultRef.current?.focus();
    const refresh = async () => {
      try {
        const response = await checkoutApi.resumeCheckout(context.reference, context.credentials);
        if (!active) return;
        if (response.kind !== 'ready') {
          setStatusUnavailable(true);
          return;
        }
        setStatusUnavailable(false);
        setResult(response.data);
        void emitConfirmedPurchase(response.data.order);
        const terminal = [
          'confirmado',
          'concluido',
          'expirado',
          'pagamento_recusado',
          'reembolsado',
          'contestado',
          'cancelamento_solicitado',
        ];
        if (
          !terminal.includes(response.data.order.status) &&
          response.data.payment.attempt?.status !== 'rejected'
        ) {
          timer = window.setTimeout(() => void refresh(), 15_000);
        }
      } catch {
        if (active) setStatusUnavailable(true);
      }
    };
    void refresh();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [attemptFinished, statusRetry]);

  if (!bookingData || !quote) return null;
  const { property, checkIn, checkOut, guests, nights } = bookingData;
  const total = quote.total;
  const money = (value: number) => formatCurrency(value, 'BRL');
  const cardReady =
    readiness?.singlePageCheckoutEnabled === true &&
    readiness?.ready === true &&
    terms !== null &&
    readiness.payment.methods.includes('card') &&
    ['cielo', 'cielo_sandbox'].includes(readiness.payment.provider);
  const pixReady =
    readiness?.singlePageCheckoutEnabled === true &&
    readiness?.ready === true &&
    terms !== null &&
    readiness.payment.methods.includes('pix') &&
    ['cielo', 'cielo_sandbox'].includes(readiness.payment.provider) &&
    quote.source === 'stays-live' &&
    !prepared &&
    !attemptFinished;
  const ready = paymentMethod === 'card' ? cardReady : pixReady;
  const fees = getVisiblePropertyFees(quote.fees || []);
  const paymentTotal =
    paymentMethod === 'card' && cardPricing ? cardPricing.totalCents / 100 : total;
  const cardPaymentLabel = cardPricing ? formatCieloCardPayment(cardPricing) : money(paymentTotal);

  const preparePayment = async (): Promise<CieloPaymentContext> => {
    if (preparedRef.current) return preparedRef.current;
    if (!ready || !accepted || !terms)
      throw new Error('Confira e aceite as condições da hospedagem antes de pagar.');
    const submission = {
      listingId: property.id,
      from: checkIn,
      to: checkOut,
      guests,
      quoteTotal: total,
      guest: {
        fullName: guest.fullName.trim(),
        email: guest.email.trim(),
        phone: guest.phone.trim(),
      },
      acceptedTermsVersion: terms.version,
      acceptedTerms: true as const,
    };
    const idempotencyKey = await getOrCreateCheckoutSubmissionKey(submission);
    const response = await checkoutApi.createCheckout({ ...submission, idempotencyKey });
    if (response?.resume && response.order) {
      // Keep a safe recovery URL without navigating away or exposing access credentials.
      const context: CieloPaymentContext = {
        reference: response.resume.reference,
        amount: response.order.quoteTotal,
        credentials: { type: 'resume-token', resumeToken: response.resume.token },
      };
      preparedRef.current = context;
      setPrepared(true);
      window.history.replaceState(null, '', response.resume.path);
      await clearCheckoutSubmissionKey(submission);
      if (
        !response.success ||
        response.order.status !== 'pre_reservado' ||
        response.order.paymentStatus !== null ||
        !response.payment.enabled ||
        !['cielo', 'cielo_sandbox'].includes(response.payment.provider)
      ) {
        setAttemptFinished(true);
        throw new Error(
          'Este pedido já possui uma atualização. Estamos consultando a situação antes de qualquer pagamento.',
        );
      }
      return context;
    }
    if (response?.code === 'quote_changed') {
      setAccepted(false);
      const updated = await crcnBackendApi.calculatePrice({
        listingId: property.staysListingId || property.id,
        from: checkIn,
        to: checkOut,
        guests: countOccupancyGuests(guests),
      });
      if (updated?.source === 'stays-live') setQuote(updated);
      throw new Error(
        'O preço ou a disponibilidade mudou. Confira o resumo atualizado e aceite novamente antes de pagar.',
      );
    }
    throw new Error(
      response?.message ||
        'Não foi possível preparar a reserva. Tente novamente com os mesmos dados para recuperar sua tentativa.',
    );
  };

  const startCieloPix = async (): Promise<void> => {
    if (!pixReady || !accepted)
      throw new Error('Confira e aceite as condições da hospedagem antes de continuar com o Pix.');
    const context = await preparePayment();
    const response = await checkoutApi.createCheckoutPayment(
      context.reference,
      context.credentials,
      context.amount,
      {
        paymentMethod: 'pix',
        paymentMethodId: 'pix',
        idempotencyKey: crypto.randomUUID(),
      },
    );
    if (response.kind !== 'response' || !response.success) {
      throw new Error(
        response.kind === 'response'
          ? response.message
          : 'Não foi possível gerar o Pix. Atualize o pedido antes de tentar novamente.',
      );
    }
    setAttemptFinished(true);
  };

  const confirmed =
    result?.order.reservationConfirmed === true &&
    result.order.status === 'confirmado' &&
    result.order.paymentStatus === 'approved';
  const rejected =
    result?.payment.attempt?.status === 'rejected' || result?.order.status === 'pagamento_recusado';
  const pendingPix =
    result?.payment.attempt?.method === 'pix' && result.payment.attempt.status === 'pending';

  return (
    <main className="checkout-purchase min-h-screen pb-24 text-neutral-950">
      <header className="checkout-purchase-header liquid-glass px-5 py-4 sm:px-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <a
            href="/"
            aria-label="Central de Reservas Caldas Novas — início"
            className="shrink-0 rounded-xl focus-visible:outline-2 focus-visible:outline-orange-700"
          >
            <LogoCRCN size="md" variant="glass" responsiveText={true} />
          </a>
          <span className="liquid-glass-pill flex items-center gap-2 rounded-full px-3 py-2.5 text-xs font-semibold text-neutral-700 sm:px-4">
            <LockKeyhole size={15} className="text-orange-700" aria-hidden="true" />{' '}
            <span className="hidden min-[380px]:inline">Checkout seguro</span>
            <span className="min-[380px]:hidden">Seguro</span>
          </span>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 pt-8 sm:px-10 sm:pt-10">
        <div className="mb-7 flex items-center gap-4 sm:mb-9">
          {!prepared && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Voltar para acomodação"
              className="liquid-glass-button flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-700 hover:bg-white focus-visible:outline-2 focus-visible:outline-orange-700"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-orange-800 sm:text-xs">
              Central de Reservas · Caldas Novas
            </p>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              {attemptFinished ? 'Sua reserva' : 'Confirme e pague'}
            </h1>
            <p className="mt-2 max-w-lg text-sm leading-6 text-neutral-600">
              {attemptFinished
                ? 'Acompanhe a confirmação da sua hospedagem.'
                : 'Sua hospedagem escolhida. Agora, cuide dos últimos detalhes.'}
            </p>
          </div>
        </div>
        <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
          <div className="checkout-purchase-form liquid-glass-card min-w-0 rounded-3xl p-5 sm:p-7">
            <section
              className="mb-7 border-b border-neutral-300/80 pb-6"
              aria-labelledby="trip-title"
            >
              <h2 id="trip-title" className="mb-4 flex items-center gap-3 text-lg font-bold">
                <span aria-hidden="true" className="checkout-section-number">
                  1
                </span>{' '}
                Sua viagem
              </h2>
              <div className="checkout-trip-details grid grid-cols-2 gap-4 rounded-2xl p-4 text-sm">
                <div>
                  <p className="font-semibold">Datas</p>
                  <p className="mt-1 text-neutral-600">
                    {formatDate(checkIn)} – {formatDate(checkOut)} · {nights} noites
                  </p>
                </div>
                <div>
                  <p className="font-semibold">Hóspedes</p>
                  <p className="mt-1 text-neutral-600">
                    {countOccupancyGuests(guests)}{' '}
                    {countOccupancyGuests(guests) === 1 ? 'pessoa' : 'pessoas'}
                    {guests.infants > 0 ? ` · ${guests.infants} bebê(s)` : ''}
                    {guests.pets > 0 ? ` · ${guests.pets} pet(s)` : ''}
                  </p>
                </div>
              </div>
            </section>
            {attemptFinished ? (
              <div
                ref={resultRef}
                tabIndex={-1}
                className="space-y-4 rounded-2xl border border-neutral-200 p-6"
                role="status"
                aria-live="polite"
              >
                {confirmed && (
                  <BadgeCheck className="text-emerald-700" size={36} aria-hidden="true" />
                )}
                <h2 className="text-xl font-bold">
                  {statusUnavailable
                    ? 'Estamos conferindo seu pedido'
                    : confirmed
                      ? 'Reserva confirmada!'
                      : rejected
                        ? 'Pagamento não aprovado'
                        : pendingPix
                          ? 'Pague com Pix nesta página'
                          : 'Acompanhando sua confirmação'}
                </h2>
                <p className="text-sm leading-6 text-neutral-600">
                  {confirmed
                    ? 'Tudo certo com a sua hospedagem. Guarde o código da reserva e confira os detalhes no comprovante.'
                    : rejected
                      ? 'O pagamento foi recusado e a hospedagem não está confirmada. Consulte os detalhes do pedido para ver os próximos passos.'
                      : pendingPix
                        ? 'Escaneie o QR Code ou copie o código abaixo. A confirmação aparecerá aqui após a aprovação do pagamento.'
                        : 'A reserva só estará confirmada após a verificação do pagamento e da hospedagem. Acompanhe aqui, sem repetir a compra.'}
                </p>
                {confirmed && result?.confirmation?.reservationCode && (
                  <p className="font-mono text-lg font-bold">
                    {result.confirmation.reservationCode}
                  </p>
                )}
                {result?.payment.attempt?.method === 'pix' &&
                  result.payment.attempt.status === 'pending' &&
                  result.payment.attempt.pix && (
                    <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
                      <p className="font-bold">Pix gerado · aguardando pagamento</p>
                      {result.payment.attempt.pix.qrCodeBase64 && (
                        <img
                          src={`data:image/png;base64,${result.payment.attempt.pix.qrCodeBase64}`}
                          alt="QR Code Pix para pagamento"
                          className="mx-auto h-48 w-48 rounded-xl bg-white p-2"
                        />
                      )}
                      {result.payment.attempt.pix.copyPaste && (
                        <>
                          <textarea
                            readOnly
                            value={result.payment.attempt.pix.copyPaste}
                            aria-label="Código Pix copia e cola"
                            className="min-h-24 w-full resize-none rounded-xl border border-emerald-300 bg-white p-3 font-mono text-xs"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              void navigator.clipboard?.writeText(
                                result.payment.attempt?.pix?.copyPaste ?? '',
                              )
                            }
                            className="min-h-11 w-full rounded-xl bg-emerald-800 px-4 py-3 text-sm font-bold text-white"
                          >
                            Copiar código Pix
                          </button>
                        </>
                      )}
                      <p className="text-xs leading-5">
                        A reserva só será confirmada após a consulta segura do pagamento na Cielo.
                      </p>
                    </div>
                  )}
                <button
                  type="button"
                  onClick={() => setStatusRetry((value) => value + 1)}
                  className="min-h-11 underline underline-offset-4"
                >
                  Atualizar situação
                </button>
                <a
                  href={`/checkout/${preparedRef.current?.reference}`}
                  className="block min-h-11 rounded-xl bg-neutral-950 px-4 py-3 text-center text-sm font-semibold text-white"
                >
                  {confirmed ? 'Ver detalhes e comprovante' : 'Ver detalhes do pedido'}
                </a>
              </div>
            ) : (
              <CieloSopCardForm
                reference=""
                amount={total.toFixed(2)}
                credentials={null}
                previewOnly={previewOnly}
                preparePayment={preparePayment}
                guestPrefill={guest}
                disabled={!ready || !accepted}
                paymentMethod={paymentMethod}
                onPricingChange={setCardPricing}
                onAlternativeSubmit={startCieloPix}
                alternativeContent={
                  <section className="checkout-pix-panel" aria-labelledby="checkout-pix-title">
                    <h2 id="checkout-pix-title" className="text-lg font-bold text-neutral-950">
                      <span aria-hidden="true" className="checkout-section-number mr-3">
                        3
                      </span>
                      Pague com Pix
                    </h2>
                    <div className="mt-4 flex gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-emerald-950">
                      <QrCode className="mt-0.5 shrink-0" size={28} aria-hidden="true" />
                      <div>
                        <p className="font-bold">Pix seguro e rápido</p>
                        <p className="mt-1 text-sm leading-6">
                          Gere o QR Code e pague aqui mesmo, sem sair desta página.
                        </p>
                      </div>
                    </div>
                  </section>
                }
                submitLabel={paymentMethod === 'pix' ? 'Gerar Pix para pagar aqui' : undefined}
                onAttemptFinished={() => setAttemptFinished(true)}
              >
                <fieldset disabled={prepared} className="mb-7 border-b border-neutral-300/80 pb-7">
                  <legend className="mb-2 text-lg font-bold">
                    <span aria-hidden="true" className="checkout-section-number mr-3">
                      2
                    </span>
                    Seus dados
                  </legend>
                  <p className="mb-4 text-sm text-neutral-500">
                    Enviaremos a confirmação para este e-mail.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-medium sm:col-span-2">
                      Nome completo
                      <input
                        required
                        name="guestName"
                        autoComplete="name"
                        value={guest.fullName}
                        onChange={(event) => setGuest({ ...guest, fullName: event.target.value })}
                        className={fieldClass}
                      />
                    </label>
                    <label className="text-sm font-medium">
                      E-mail
                      <input
                        required
                        name="guestEmail"
                        type="email"
                        autoComplete="email"
                        value={guest.email}
                        onChange={(event) => setGuest({ ...guest, email: event.target.value })}
                        className={fieldClass}
                      />
                    </label>
                    <label className="text-sm font-medium">
                      Telefone
                      <input
                        required
                        name="guestPhone"
                        type="tel"
                        autoComplete="tel"
                        value={guest.phone}
                        onChange={(event) => setGuest({ ...guest, phone: event.target.value })}
                        className={fieldClass}
                      />
                    </label>
                  </div>
                </fieldset>
                <fieldset disabled={prepared} className="mb-7 border-b border-neutral-300/80 pb-7">
                  <legend className="mb-3 text-sm font-bold text-neutral-950">
                    Como você prefere pagar?
                  </legend>
                  <div className="checkout-payment-methods grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      aria-label="Cartão, processado pela Cielo"
                      aria-pressed={paymentMethod === 'card'}
                      onClick={() => {
                        setPaymentMethod('card');
                        setAccepted(false);
                      }}
                      className="checkout-payment-method"
                    >
                      <CreditCard size={20} aria-hidden="true" />
                      <span>
                        <strong>Cartão</strong>
                        <small>Cielo</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label="Pix, aprovação rápida"
                      aria-pressed={paymentMethod === 'pix'}
                      disabled={!pixReady}
                      onClick={() => {
                        setPaymentMethod('pix');
                        setAccepted(false);
                      }}
                      className="checkout-payment-method"
                    >
                      <QrCode size={20} aria-hidden="true" />
                      <span>
                        <strong>Pix</strong>
                        <small>{pixReady ? 'Sem taxa' : 'Indisponível'}</small>
                      </span>
                    </button>
                  </div>
                  <div
                    className="checkout-trust-badges mt-4 grid gap-2 sm:grid-cols-3"
                    aria-label="Sinais de segurança do checkout"
                  >
                    <span>
                      <LockKeyhole size={16} aria-hidden="true" />
                      SSL verificado
                    </span>
                    <span>
                      <ShieldCheck size={16} aria-hidden="true" />
                      Dados protegidos
                    </span>
                    <span>
                      <BadgeCheck size={16} aria-hidden="true" />
                      Pagamento acompanhado
                    </span>
                  </div>
                </fieldset>
                <section
                  className="mb-7 border-b border-neutral-300/80 pb-6"
                  aria-labelledby="conditions-title"
                >
                  <h2 id="conditions-title" className="mb-3 text-xl font-bold">
                    Antes de confirmar
                  </h2>
                  {terms && (
                    <details className="rounded-xl border border-neutral-300/90 bg-white/55 p-4">
                      <summary className="cursor-pointer text-sm font-semibold">
                        Condições da hospedagem e cancelamento
                      </summary>
                      <dl className="mt-4 space-y-3 text-sm">
                        {terms.fields.map(([name, value]) => (
                          <div key={name}>
                            <dt className="font-semibold">{name}</dt>
                            <dd className="mt-1 whitespace-pre-wrap break-words text-neutral-600">
                              {value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  )}
                  <label className="mt-4 flex min-h-11 items-start gap-3 text-sm leading-6">
                    <input
                      type="checkbox"
                      required
                      checked={accepted}
                      disabled={!ready || prepared}
                      onChange={(event) => setAccepted(event.target.checked)}
                      className="mt-1 h-4 w-4 accent-orange-800"
                    />
                    <span>
                      Li e aceito as condições da hospedagem e a cobrança de{' '}
                      <strong>{money(paymentTotal)}</strong>.
                    </span>
                  </label>
                  {!ready && (
                    <div role="status" className="mt-3 text-sm text-amber-900">
                      {loading
                        ? 'Consultando preço, condições e pagamento…'
                        : 'Não foi possível liberar a compra com cartão para esta acomodação.'}
                      {!loading && (
                        <button
                          type="button"
                          onClick={() => setRetry((value) => value + 1)}
                          className="ml-2 min-h-11 underline"
                        >
                          Consultar novamente
                        </button>
                      )}
                    </div>
                  )}
                </section>
              </CieloSopCardForm>
            )}
          </div>
          <aside
            className="order-first md:sticky md:top-8 md:order-last"
            aria-label="Resumo da compra"
          >
            <div className="checkout-summary-card liquid-glass-card overflow-hidden rounded-3xl p-5 sm:p-6">
              <div className="checkout-summary-image relative -mx-5 -mt-5 mb-5 sm:-mx-6 sm:-mt-6">
                <img src={property.images[0]} alt="" className="h-36 w-full object-cover sm:h-44" />
                <span className="liquid-glass-pill absolute bottom-3 left-4 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-800">
                  Sua hospedagem
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-orange-800">
                  {property.subtitle || 'Central de Reservas Caldas Novas'}
                </p>
                <h2 className="mt-2 text-base font-bold leading-6">
                  {getPublicPropertyTitle(property.title)}
                </h2>
                {property.reviewsSynced && property.reviewCount > 0 && (
                  <p className="mt-2 text-xs">
                    ★ {property.rating.toFixed(2)} · {property.reviewCount} avaliações
                  </p>
                )}
              </div>
              <div className="my-5 border-t border-neutral-200" />
              <h3 className="mb-4 text-sm font-bold">Detalhes do preço</h3>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt>{nights} noites</dt>
                  <dd>{money(quote.baseTotal)}</dd>
                </div>
                {quote.discount > 0 && (
                  <div className="flex justify-between gap-3 text-emerald-700">
                    <dt>Desconto</dt>
                    <dd>−{money(quote.discount)}</dd>
                  </div>
                )}
                {fees.length ? (
                  fees.map((fee, index) => (
                    <div key={fee._id || index} className="flex justify-between gap-3">
                      <dt>
                        {getPropertyFeeLabel(fee)}
                        {quote.feesIncluded ? ' (incluída)' : ''}
                      </dt>
                      <dd className="shrink-0">
                        {money(getPropertyFeeAmount(fee, quote.currency))}
                      </dd>
                    </div>
                  ))
                ) : (
                  <>
                    {quote.cleaningFee > 0 && (
                      <div className="flex justify-between gap-3">
                        <dt>Limpeza{quote.cleaningIncluded ? ' (incluída)' : ''}</dt>
                        <dd>{money(quote.cleaningFee)}</dd>
                      </div>
                    )}
                    {quote.serviceFee > 0 && (
                      <div className="flex justify-between gap-3">
                        <dt>Outras taxas</dt>
                        <dd>{money(quote.serviceFee)}</dd>
                      </div>
                    )}
                  </>
                )}
                {paymentMethod === 'card' && cardPricing && (
                  <div className="flex justify-between gap-3 text-neutral-700">
                    <dt>
                      Acréscimo do cartão · {cardPricing.ratePercent.toLocaleString('pt-BR')}%
                    </dt>
                    <dd>{money(cardPricing.feeCents / 100)}</dd>
                  </div>
                )}
                <div
                  className="checkout-summary-total flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-5 font-bold"
                  aria-live="polite"
                >
                  <dt>{paymentMethod === 'pix' ? 'Pague no Pix' : 'Pague no cartão'}</dt>
                  <dd>{paymentMethod === 'card' ? cardPaymentLabel : money(paymentTotal)}</dd>
                </div>
                {paymentMethod === 'card' && cardPricing && cardPricing.installments > 1 && (
                  <div className="flex justify-between gap-3 text-xs text-neutral-600">
                    <dt>Total da compra</dt>
                    <dd>{money(paymentTotal)}</dd>
                  </div>
                )}
              </dl>
              <p className="mt-4 flex items-center gap-2 rounded-xl bg-white/55 px-3 py-2.5 text-xs text-neutral-600">
                {paymentMethod === 'pix' ? (
                  <QrCode size={16} aria-hidden="true" />
                ) : (
                  <CreditCard size={16} aria-hidden="true" />
                )}
                {paymentMethod === 'pix'
                  ? 'Pagamento seguro com Pix · sem taxa'
                  : 'Cartão em até 6x · confira o total'}
              </p>
            </div>
            <div className="liquid-glass mt-4 flex items-start gap-3 rounded-2xl p-4">
              <ShieldCheck size={22} className="shrink-0 text-orange-800" aria-hidden="true" />
              <p className="text-xs leading-5 text-neutral-600">
                <strong className="block text-neutral-900">Reserve com a CRCN</strong>Confira as
                condições antes de pagar. Nossa equipe acompanha a confirmação da sua hospedagem.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
