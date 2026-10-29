import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { ArrowLeft, BadgeCheck, CreditCard, LockKeyhole, ShieldCheck } from 'lucide-react';
import {
  ParkTicketSelector,
  getPreviewTicketLines,
  type ParkTicketCart,
} from './ParkTicketSelector';
import type { CheckoutModal } from './CheckoutModal';
import { CieloSopCardForm, type CieloPaymentContext } from './CieloSopCardForm';
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
>;
const fieldClass =
  'mt-1.5 min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 text-base text-neutral-950 outline-none focus-visible:ring-2 focus-visible:ring-orange-700 disabled:bg-neutral-50';
const formatDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });

/** Isolated own-checkout entry. The public Stays checkout remains selected by AppOverlayLayer. */
export function SinglePageCheckout({
  bookingData,
  guestPrefill,
  onClose,
}: SinglePageCheckoutProps) {
  const [guest, setGuest] = useState(guestPrefill ?? { fullName: '', email: '', phone: '' });
  const [terms, setTerms] = useState<{ version: string; fields: [string, string][] } | null>(null);
  const [readiness, setReadiness] = useState<CheckoutReadinessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [quote, setQuote] = useState(bookingData?.quote ?? null);
  const [prepared, setPrepared] = useState(false);
  const [ticketCart, setTicketCart] = useState<ParkTicketCart>({});
  const preparedRef = useRef<CieloPaymentContext | null>(null);
  const [attemptFinished, setAttemptFinished] = useState(false);
  const [result, setResult] = useState<CheckoutResumeResponse | null>(null);
  const [statusUnavailable, setStatusUnavailable] = useState(false);
  const [statusRetry, setStatusRetry] = useState(0);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bookingData) return;
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
  }, [bookingData, retry]);

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
  const ready =
    readiness?.singlePageCheckoutEnabled === true &&
    readiness?.ready === true &&
    terms !== null &&
    readiness.payment.methods.includes('card') &&
    ['cielo', 'cielo_sandbox'].includes(readiness.payment.provider);
  const fees = getVisiblePropertyFees(quote.fees || []);
  const showParkTicketsPreview = readiness?.parkTicketsPreviewEnabled === true;
  const ticketLines = showParkTicketsPreview ? getPreviewTicketLines(ticketCart) : [];
  const ticketsTotal = ticketLines.reduce((sum, line) => sum + line.totalCents, 0) / 100;
  const hasTickets = ticketLines.length > 0;

  const preparePayment = async (): Promise<CieloPaymentContext> => {
    if (hasTickets)
      throw new Error(
        'Os ingressos estão em demonstração. Remova-os para testar somente a hospedagem.',
      );
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

  const confirmed =
    result?.order.reservationConfirmed === true &&
    result.order.status === 'confirmado' &&
    result.order.paymentStatus === 'approved';
  const rejected =
    result?.payment.attempt?.status === 'rejected' || result?.order.status === 'pagamento_recusado';

  return (
    <main className="min-h-screen bg-white pb-24 text-neutral-950">
      <header className="border-b border-neutral-200 px-5 py-5 sm:px-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <a href="/" className="text-xl font-black tracking-tight text-orange-800">
            CRCN
            <span className="ml-2 hidden text-sm font-medium text-neutral-500 sm:inline">
              Central de Reservas
            </span>
          </a>
          <span className="flex items-center gap-2 text-xs text-neutral-600">
            <LockKeyhole size={15} aria-hidden="true" /> Compra segura
          </span>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 pt-8 sm:px-10 sm:pt-10">
        <div className="mb-8 flex items-center gap-4">
          {!prepared && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Voltar para acomodação"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-orange-700"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {attemptFinished ? 'Sua reserva' : 'Confirme e pague'}
          </h1>
        </div>
        <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-16">
          <div className="min-w-0">
            <section className="mb-7 border-b border-neutral-200 pb-6" aria-labelledby="trip-title">
              <h2 id="trip-title" className="mb-4 text-xl font-bold">
                Sua viagem
              </h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-semibold">Datas</p>
                  <p className="mt-1 text-neutral-600">
                    {formatDate(checkIn)} – {formatDate(checkOut)} · {nights} noites
                  </p>
                </div>
                <div>
                  <p className="font-semibold">Hóspedes</p>
                  <p className="mt-1 text-neutral-600">
                    {countOccupancyGuests(guests)} pessoas
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
                        : 'Acompanhando sua confirmação'}
                </h2>
                <p className="text-sm leading-6 text-neutral-600">
                  {confirmed
                    ? 'Tudo certo com a sua hospedagem. Guarde o código da reserva e confira os detalhes no comprovante.'
                    : rejected
                      ? 'O pagamento foi recusado e a hospedagem não está confirmada. Consulte os detalhes do pedido para ver os próximos passos.'
                      : 'A reserva só estará confirmada após a verificação do pagamento e da hospedagem. Acompanhe aqui, sem repetir a compra.'}
                </p>
                {confirmed && result?.confirmation?.reservationCode && (
                  <p className="font-mono text-lg font-bold">
                    {result.confirmation.reservationCode}
                  </p>
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
                preparePayment={preparePayment}
                guestPrefill={guest}
                disabled={!ready || !accepted || hasTickets}
                submitLabel={
                  hasTickets
                    ? 'Compra com ingressos em demonstração'
                    : `Confirmar e pagar ${money(total)}`
                }
                onAttemptFinished={() => setAttemptFinished(true)}
                beforeSubmit={
                  showParkTicketsPreview ? (
                    <div className="space-y-3">
                      <ParkTicketSelector
                        from={checkIn}
                        to={checkOut}
                        value={ticketCart}
                        disabled={prepared}
                        onChange={(value) => {
                          setTicketCart(value);
                          setAccepted(false);
                        }}
                      />
                      {hasTickets && (
                        <p className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-950">
                          Esta é uma simulação visual. O pagamento com ingressos está bloqueado até
                          integrarmos a venda e a emissão. Desmarque a oferta para testar apenas a
                          hospedagem.
                        </p>
                      )}
                    </div>
                  ) : undefined
                }
              >
                <fieldset disabled={prepared} className="mb-7 border-b border-neutral-200 pb-7">
                  <legend className="mb-2 text-xl font-bold">Seus dados</legend>
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
                <section
                  className="mb-7 border-b border-neutral-200 pb-6"
                  aria-labelledby="conditions-title"
                >
                  <h2 id="conditions-title" className="mb-3 text-xl font-bold">
                    Antes de confirmar
                  </h2>
                  {terms && (
                    <details className="rounded-xl border border-neutral-200 p-4">
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
                      disabled={!ready || prepared || hasTickets}
                      onChange={(event) => setAccepted(event.target.checked)}
                      className="mt-1 h-4 w-4 accent-orange-800"
                    />
                    <span>
                      Li e aceito as condições da hospedagem e a cobrança de{' '}
                      <strong>{money(total)}</strong>.
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
            <div className="rounded-2xl border border-neutral-300 p-5 sm:p-6">
              <div className="flex gap-4">
                <img
                  src={property.images[0]}
                  alt=""
                  className="h-24 w-24 rounded-xl object-cover"
                />
                <div className="min-w-0">
                  <p className="text-xs text-neutral-500">Sua hospedagem em Caldas Novas</p>
                  <h2 className="mt-1 text-sm font-semibold leading-5">
                    {getPublicPropertyTitle(property.title)}
                  </h2>
                  {property.reviewsSynced && property.reviewCount > 0 && (
                    <p className="mt-2 text-xs">
                      ★ {property.rating.toFixed(2)} · {property.reviewCount} avaliações
                    </p>
                  )}
                </div>
              </div>
              <div className="my-5 border-t border-neutral-200" />
              <h3 className="mb-4 text-lg font-bold">Detalhes do preço</h3>
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
                {hasTickets && (
                  <>
                    <div className="flex justify-between gap-3 border-t border-neutral-200 pt-3 font-semibold">
                      <dt>Subtotal hospedagem</dt>
                      <dd>{money(total)}</dd>
                    </div>
                    {ticketLines.map((line) => (
                      <div
                        key={`${line.parkId}-${line.category}`}
                        className="flex justify-between gap-3"
                      >
                        <dt>
                          <span className="block font-medium">{line.parkName}</span>
                          <span className="text-xs text-neutral-500">
                            {line.quantity} × {line.category} · {formatDate(line.date || checkIn)}
                          </span>
                        </dt>
                        <dd className="shrink-0">{money(line.totalCents / 100)}</dd>
                      </div>
                    ))}
                    <div className="flex justify-between gap-3 text-orange-800">
                      <dt>Ingressos · demonstrativo</dt>
                      <dd>{money(ticketsTotal)}</dd>
                    </div>
                  </>
                )}
                <div
                  className="flex justify-between gap-3 border-t border-neutral-200 pt-4 text-base font-bold"
                  aria-live="polite"
                >
                  <dt>{hasTickets ? 'Total da simulação' : 'Total (BRL)'}</dt>
                  <dd>{money(total + ticketsTotal)}</dd>
                </div>
              </dl>
              {hasTickets && (
                <p className="mt-3 text-xs leading-5 text-amber-900">
                  Valores ilustrativos. Nenhuma compra ou emissão de ingresso será realizada.
                </p>
              )}
              <p className="mt-4 flex items-center gap-2 text-xs text-neutral-500">
                <CreditCard size={16} aria-hidden="true" /> Pagamento integral no cartão
              </p>
            </div>
            <div className="mt-5 flex items-start gap-3 px-2">
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
