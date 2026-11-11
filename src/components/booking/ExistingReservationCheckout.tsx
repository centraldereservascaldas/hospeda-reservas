import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../services/apiFetch';
import { checkoutApi } from '../../services/checkoutApi';
import { checkoutPathWithStayQuery, existingReservationUrl } from '../../utils/checkoutUrl';
import { saveCheckoutResumeToken } from '../../utils/checkoutResumeStorage';
import { formatBrazilianPhone } from '../../utils/checkoutInputFormatting';
import { CieloSopCardForm, type CieloCardPricing, type CieloPaymentContext } from './CieloSopCardForm';
import { CheckoutResumePage } from './CheckoutResumePage';
import { PixPayerIdentificationField, getPixPayerIdentification } from './PixPayerIdentificationField';
import { CheckoutSupportLink } from './CheckoutSupportLink';
import { LogoCRCN } from '../LogoCRCN';
import { LockKeyhole, QrCode } from 'lucide-react';
import { bindExistingReservationIntent, clearExistingReservationIntent, getExistingReservationIntent, getExistingReservationResumeReferences, markExistingReservationIntentSubmitted, saveExistingReservationResumeReference, startExistingReservationIntent } from '../../utils/existingReservationResumeStorage';

interface ReservationSummary {
  code: string;
  listingId: string | null;
  property: string | null;
  image: string | null;
  checkIn: string | null;
  checkOut: string | null;
  guests: number | null;
  adults: number | null;
  children: number | null;
  infants: number | null;
  totalCents: number | null;
  candidateBalanceCents: number | null;
  balanceStatus: string;
  paymentEnabled: boolean;
  paymentMethods: string[];
  cardInstallments: number[];
}

const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const date = (value: string | null) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : 'Não informada';
const nullableString = (value: unknown) => value === null || typeof value === 'string';
const nullableInteger = (value: unknown) => value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
const fieldClass = 'mt-1.5 min-h-12 w-full rounded-xl border border-neutral-400/70 bg-white px-3 text-base text-neutral-950 outline-none focus-visible:border-orange-700 focus-visible:ring-2 focus-visible:ring-orange-700/20 disabled:bg-neutral-100';

function isSummary(value: unknown, code: string): value is ReservationSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return item.code === code && nullableString(item.listingId) && nullableString(item.property)
    && nullableString(item.image) && nullableString(item.checkIn) && nullableString(item.checkOut)
    && nullableInteger(item.guests) && nullableInteger(item.adults) && nullableInteger(item.children)
    && nullableInteger(item.infants) && nullableInteger(item.totalCents) && nullableInteger(item.candidateBalanceCents)
    && typeof item.balanceStatus === 'string' && typeof item.paymentEnabled === 'boolean'
    && Array.isArray(item.paymentMethods) && item.paymentMethods.every((method) => method === 'pix' || method === 'card')
    && Array.isArray(item.cardInstallments) && item.cardInstallments.every((value) => Number.isInteger(value) && value >= 1 && value <= 6)
    && item.paymentEnabled === (item.paymentMethods.length > 0)
    && (item.paymentMethods.includes('card') === (item.cardInstallments.length > 0));
}

export function ExistingReservationCheckout({ code }: { code: string }) {
  const [summary, setSummary] = useState<ReservationSummary | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  const [guest, setGuest] = useState({ fullName: '', email: '', phone: '' });
  const [accepted, setAccepted] = useState(false);
  const [method, setMethod] = useState<'pix' | 'card'>('pix');
  const [pixDocument, setPixDocument] = useState('');
  const [cardPricing, setCardPricing] = useState<CieloCardPricing | null>(null);
  const [prepared, setPrepared] = useState(false);
  const [paymentReviewRequired, setPaymentReviewRequired] = useState(false);
  const [activeReference, setActiveReference] = useState<string | null>(null);
  const [storageFailure, setStorageFailure] = useState(false);
  const contextRef = useRef<CieloPaymentContext | null>(null);
  const pixKeyRef = useRef<string | null>(null);
  const previousReferences = useMemo(() => getExistingReservationResumeReferences(code), [code]);
  const [intentKey, setIntentKey] = useState(() => getExistingReservationIntent(code));
  const [intentError, setIntentError] = useState('');
  const showPaymentForm = previousReferences.length === 0 || intentKey !== null;

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    void apiFetch(`/api/existing-reservations/${encodeURIComponent(code)}/checkout-summary`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => response.ok ? response.json() as Promise<{ success: boolean; reservation: unknown }> : null)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (!data?.success || !isSummary(data.reservation, code)) { setState('error'); return; }
        setSummary(data.reservation);
        setMethod(data.reservation.paymentMethods.includes('pix') ? 'pix' : 'card');
        window.history.replaceState(null, '', existingReservationUrl(code, data.reservation, window.location.search));
        setState('ready');
      })
      .catch(() => { if (!controller.signal.aborted) setState('error'); });
    return () => controller.abort();
  }, [code, retry]);

  const preparePayment = async (): Promise<CieloPaymentContext> => {
    if (contextRef.current) return contextRef.current;
    if (!summary?.paymentEnabled || !summary.candidateBalanceCents || !summary.listingId || !summary.checkIn || !summary.checkOut || !accepted) {
      throw new Error('Confira os dados e aceite o valor do pagamento antes de continuar.');
    }
    const payer = { fullName: guest.fullName.trim(), email: guest.email.trim(), phone: guest.phone.trim() };
    const idempotencyKey = intentKey ?? startExistingReservationIntent(code);
    if (!intentKey) setIntentKey(idempotencyKey);
    const request = { expectedBalanceCents: summary.candidateBalanceCents, guest: payer, acceptedPayment: true, paymentMethod: method, ...(method === 'card' ? { installments: cardPricing?.installments } : {}) };
    await bindExistingReservationIntent(code, idempotencyKey, request);
    const previouslySubmitted = markExistingReservationIntentSubmitted(code, idempotencyKey);
    let response: Response;
    let data: unknown;
    try {
      response = await apiFetch(`/api/existing-reservations/${encodeURIComponent(code)}/checkout`, {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(request),
      });
      data = await response.json();
    } catch {
      throw new Error('Não foi possível confirmar o preparo do pagamento. Tente novamente sem alterar os dados ou fale com nosso atendimento.');
    }
    // Laravel FormRequest validation runs before the checkout service. Only a first,
    // definitively rejected dispatch can be reset; an earlier lost response remains ambiguous.
    if (!previouslySubmitted && response.status === 422 && data && typeof data === 'object'
      && 'errors' in data && data.errors && typeof data.errors === 'object' && !Array.isArray(data.errors)) {
      clearExistingReservationIntent(code);
      setIntentKey(null);
      throw new Error('Confira e corrija os dados informados para continuar. Nenhum pedido foi iniciado nesta tentativa.');
    }
    if (!response.ok && data && typeof data === 'object' && 'code' in data) {
      if (data.code === 'existing_checkout_already_started') {
        setPaymentReviewRequired(true);
        throw new Error('Já existe um pedido para esta reserva. Volte ao navegador em que ele foi iniciado ou fale com nosso atendimento antes de pagar.');
      }
      if (data.code === 'existing_receivable_unconfirmed') {
        setPaymentReviewRequired(true);
        throw new Error('O registro desta reserva está em conferência. Fale com nosso atendimento antes de iniciar outro pagamento.');
      }
    }
    if (!response.ok || !data || typeof data !== 'object' || !('success' in data) || data.success !== true
      || !('resume' in data) || !data.resume || typeof data.resume !== 'object'
      || !('order' in data) || !data.order || typeof data.order !== 'object'
      || !('payment' in data) || !data.payment || typeof data.payment !== 'object') {
      throw new Error('Não foi possível preparar o pagamento. Confira o saldo com nosso atendimento.');
    }
    const resume = data.resume as Record<string, unknown>;
    const order = data.order as Record<string, unknown>;
    const payment = data.payment as Record<string, unknown>;
    if (typeof resume.reference !== 'string' || !/^[A-Za-z0-9]{40}$/.test(resume.reference)
      || typeof resume.token !== 'string' || !/^[A-Za-z0-9]{64}$/.test(resume.token)
      || typeof resume.expiresAt !== 'string' || !Number.isFinite(Date.parse(resume.expiresAt)) || Date.parse(resume.expiresAt) <= Date.now()
      || resume.path !== `/checkout/${resume.reference}`
      || order.publicReference !== resume.reference || typeof order.status !== 'string'
      || typeof order.quoteTotal !== 'string'
      || Math.round(Number(order.quoteTotal) * 100) !== summary.candidateBalanceCents
      || !['cielo', 'cielo_sandbox'].includes(String(payment.provider))) {
      throw new Error('O pedido precisa de conferência antes de iniciar o pagamento.');
    }
    saveCheckoutResumeToken(resume.reference, resume.token, resume.expiresAt);
    saveExistingReservationResumeReference(code, resume.reference);
    try {
      const storedToken = window.sessionStorage.getItem(`crcn.checkout.resume.${resume.reference}`);
      const storedReferences = window.sessionStorage.getItem(`crcn.existing-reservation.resume.${code}`);
      if (!storedToken || JSON.parse(storedToken).token !== resume.token
        || !storedReferences || !JSON.parse(storedReferences).includes(resume.reference)) throw new Error();
    } catch {
      setStorageFailure(true);
      throw new Error('Não foi possível guardar o acesso ao pedido. Tente novamente sem alterar os dados ou fale com nosso atendimento.');
    }
    clearExistingReservationIntent(code);
    setIntentKey(null);
    const context: CieloPaymentContext = { reference: resume.reference, amount: order.quoteTotal, credentials: { type: 'resume-token', resumeToken: resume.token } };
    window.history.replaceState(null, '', checkoutPathWithStayQuery(resume.path, window.location.search));
    if (order.status !== 'pre_reservado' || order.paymentStatus !== null || payment.enabled !== true) {
      setActiveReference(context.reference);
      throw new Error('Acompanhe a situação deste pedido antes de tentar novamente.');
    }
    contextRef.current = context;
    setPrepared(true);
    return context;
  };

  const showPaymentStatus = () => {
    if (contextRef.current) setActiveReference(contextRef.current.reference);
  };

  const cardLabel = summary?.cardInstallments.length === 1
    ? `Cartão em ${summary.cardInstallments[0]}x`
    : summary && summary.cardInstallments.length > 0 && summary.cardInstallments.every((value, index) => value === index + 1)
      ? `Cartão em até ${summary.cardInstallments.length}x`
      : 'Cartão · parcelas disponíveis';
  const startPix = async () => {
    const identification = getPixPayerIdentification(pixDocument);
    if (!identification) throw new Error('Informe o CPF ou CNPJ de quem vai pagar o Pix.');
    const context = await preparePayment();
    pixKeyRef.current ??= crypto.randomUUID();
    const result = await checkoutApi.createCheckoutPayment(context.reference, context.credentials, context.amount, {
      paymentMethod: 'pix', paymentMethodId: 'pix', payerIdentification: identification, idempotencyKey: pixKeyRef.current,
    });
    if (result.kind !== 'response' || !result.success) {
      showPaymentStatus();
      throw new Error('Estamos conferindo a tentativa. Acompanhe o pedido antes de tentar novamente.');
    }
    showPaymentStatus();
  };

  if (storageFailure) return <main className="mx-auto max-w-3xl p-6"><h1 className="text-2xl font-bold">Não foi possível guardar o acesso ao pedido</h1><p role="alert" className="mt-4">Não inicie outro pagamento. Tente novamente sem alterar os dados quando o armazenamento do navegador estiver disponível ou fale com nosso atendimento.</p><CheckoutSupportLink details={{ reservationCode: code }} /></main>;
  if (activeReference) return <CheckoutResumePage reference={activeReference} focusOnMount />;

  return <main className="checkout-purchase min-h-screen pb-24 text-neutral-950">
    <header className="checkout-purchase-header liquid-glass px-5 py-4 sm:px-10">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <a href="/" aria-label="Central de Reservas Caldas Novas — início" className="shrink-0 rounded-xl focus-visible:outline-2 focus-visible:outline-orange-700"><LogoCRCN size="md" variant="glass" responsiveText /></a>
        <span className="liquid-glass-pill flex items-center gap-2 rounded-full px-3 py-2.5 text-xs font-semibold text-neutral-700"><LockKeyhole size={15} className="text-orange-700" aria-hidden="true" />Checkout seguro</span>
      </div>
    </header>
    <div className="checkout-purchase-form liquid-glass-card mx-auto mt-8 max-w-3xl rounded-3xl p-5 sm:mt-10 sm:p-10">
      <p className="text-sm font-bold uppercase tracking-widest text-orange-700">Central de Reservas · Caldas Novas</p>
      <h1 className="mt-3 text-3xl font-black">Sua reserva</h1>
      {previousReferences.length > 0 && <div className="mt-6 space-y-3 rounded-xl border border-orange-200 bg-orange-50 p-4"><p className="font-semibold">Você já iniciou pagamento para esta reserva neste navegador.</p><p className="text-sm text-neutral-700">Acompanhe as tentativas antes de iniciar outra cobrança.</p>{previousReferences.map((reference, index) => <a key={reference} className="mr-3 inline-flex min-h-11 items-center rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700" href={checkoutPathWithStayQuery(`/checkout/${reference}`, window.location.search)}>Acompanhar pagamento {previousReferences.length > 1 ? index + 1 : ''}</a>)}{!intentKey && <button type="button" className="min-h-11 rounded-xl border border-neutral-400 px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-orange-700" onClick={() => { try { setIntentKey(startExistingReservationIntent(code)); setIntentError(''); } catch (error) { setIntentError(error instanceof Error ? error.message : 'Não foi possível guardar esta tentativa.'); } }}>Iniciar nova tentativa</button>}{intentError && <p role="alert">{intentError}</p>}</div>}
      {intentKey && <p role="status" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm">Para recuperar uma tentativa interrompida, informe exatamente os mesmos dados, valor e forma de pagamento usados anteriormente. Se não souber, fale com nosso atendimento.</p>}
      {state === 'loading' && <p role="status" className="mt-6">Consultando os dados da reserva…</p>}
      {state === 'error' && <div className="mt-6 space-y-3"><p role="alert">Não foi possível consultar esta reserva. Confira o código ou fale com nosso atendimento.</p><button type="button" className="min-h-11 rounded-xl border border-neutral-400 px-4 py-2 font-semibold focus-visible:outline-2 focus-visible:outline-orange-700" onClick={() => setRetry((value) => value + 1)}>Tentar novamente</button><CheckoutSupportLink details={{ reservationCode: code }} /></div>}
      {state === 'ready' && summary && <section className="mt-6 space-y-6" aria-label="Dados da reserva">
        {summary.image && <img src={summary.image} alt="" className="max-h-72 w-full rounded-2xl object-cover" />}
        <div><p className="text-sm text-slate-600">Reserva {summary.code}</p><h2 className="mt-1 text-xl font-bold">{summary.property || 'Acomodação'}</h2></div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div><dt className="text-sm text-slate-600">Entrada</dt><dd className="font-bold">{date(summary.checkIn)}</dd></div>
          <div><dt className="text-sm text-slate-600">Saída</dt><dd className="font-bold">{date(summary.checkOut)}</dd></div>
          <div><dt className="text-sm text-slate-600">Hóspedes</dt><dd className="font-bold">{summary.guests ?? 'Não informado'}</dd></div>
          <div><dt className="text-sm text-slate-600">Total da hospedagem</dt><dd className="font-bold">{summary.totalCents === null ? 'Em conferência' : money(summary.totalCents)}</dd></div>
          {['pending_candidate', 'unrecorded_candidate'].includes(summary.balanceStatus) && summary.candidateBalanceCents !== null && <div><dt className="text-sm text-slate-600">{!summary.paymentEnabled ? 'Saldo para conferência' : summary.balanceStatus === 'unrecorded_candidate' ? 'Valor para pagamento' : 'Saldo a pagar'}</dt><dd className="font-bold">{money(summary.candidateBalanceCents)}</dd></div>}
        </dl>
        {summary.paymentEnabled && summary.balanceStatus === 'unrecorded_candidate' && showPaymentForm && <p role="status" className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950">Confira o valor antes de continuar. O pagamento será confirmado somente após a aprovação.</p>}
        {showPaymentForm && summary.paymentEnabled && summary.candidateBalanceCents !== null ? <CieloSopCardForm
          reference="" amount={(summary.candidateBalanceCents / 100).toFixed(2)} credentials={null}
          preparePayment={preparePayment} paymentMethod={method} guestPrefill={guest} disabled={!accepted || paymentReviewRequired}
          onPricingChange={setCardPricing}
          lockInstallments={prepared}
          allowedInstallments={summary.cardInstallments}
          onAttemptFinished={showPaymentStatus} onAlternativeSubmit={startPix}
          alternativeContent={<section className="checkout-pix-panel" aria-labelledby="existing-checkout-pix-title"><h2 id="existing-checkout-pix-title" className="text-lg font-bold text-neutral-950"><span aria-hidden="true" className="checkout-section-number mr-3">3</span>Pague com Pix</h2><div className="mt-4 flex gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-emerald-950"><QrCode className="mt-0.5 shrink-0" size={28} aria-hidden="true" /><div><p className="font-bold">Pix seguro e rápido</p><p className="mt-1 text-sm leading-6">Gere o QR Code e pague aqui mesmo, sem sair desta página.</p></div></div><PixPayerIdentificationField value={pixDocument} onChange={setPixDocument} disabled={prepared || paymentReviewRequired} /></section>}
          submitLabel={method === 'pix' ? 'Gerar Pix para pagar aqui' : undefined}
        >
          <fieldset disabled={prepared || paymentReviewRequired} className="space-y-3">
            <legend className="text-lg font-bold">Dados de quem vai pagar</legend>
            <label className="block text-sm font-semibold">Nome completo<input className={fieldClass} required value={guest.fullName} onChange={(event) => setGuest({ ...guest, fullName: event.target.value })} autoComplete="name" /></label>
            <label className="block text-sm font-semibold">E-mail<input className={fieldClass} required type="email" value={guest.email} onChange={(event) => setGuest({ ...guest, email: event.target.value })} autoComplete="email" /></label>
            <label className="block text-sm font-semibold">WhatsApp<input className={fieldClass} required type="tel" value={guest.phone} onChange={(event) => setGuest({ ...guest, phone: formatBrazilianPhone(event.target.value) })} autoComplete="tel" /></label>
          </fieldset>
          <fieldset disabled={prepared || paymentReviewRequired} className="space-y-2"><legend className="font-bold">Forma de pagamento</legend>
            {summary.paymentMethods.includes('pix') && <label className="mr-5"><input type="radio" name="existing-method" checked={method === 'pix'} onChange={() => setMethod('pix')} /> Pix</label>}
            {summary.paymentMethods.includes('card') && <label><input type="radio" name="existing-method" checked={method === 'card'} onChange={() => setMethod('card')} /> {cardLabel}</label>}
          </fieldset>
          {prepared && <p className="text-sm text-neutral-600">A forma de pagamento e as parcelas foram reservadas para este pedido.</p>}
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} disabled={paymentReviewRequired} required /> Confirmo o pagamento do saldo informado desta reserva.</label>
        </CieloSopCardForm> : showPaymentForm && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">O pagamento desta reserva ainda está em conferência. Entre em contato com nosso atendimento.</p>}
        <CheckoutSupportLink details={{ reservationCode: summary.code, listingTitle: summary.property ?? undefined, listingId: summary.listingId ?? undefined, from: summary.checkIn ?? undefined, to: summary.checkOut ?? undefined, balanceTotal: summary.candidateBalanceCents !== null ? summary.candidateBalanceCents / 100 : undefined, paymentMethod: summary.paymentEnabled && showPaymentForm ? method : undefined, installments: summary.paymentEnabled && showPaymentForm && method === 'card' ? cardPricing?.installments : undefined, total: summary.paymentEnabled && showPaymentForm && method === 'card' && cardPricing ? cardPricing.totalCents / 100 : undefined }} />
      </section>}
    </div>
  </main>;
}
