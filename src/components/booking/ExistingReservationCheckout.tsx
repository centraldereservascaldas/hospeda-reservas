import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { checkoutPathWithStayQuery } from '../../utils/checkoutUrl';
import {
  CieloSopCardForm,
  formatCieloCardPayment,
  type CieloCardPricing,
} from './CieloSopCardForm';
import { CheckoutResumePage } from './CheckoutResumePage';
import { PixPayerIdentificationField } from './PixPayerIdentificationField';
import { CheckoutSupportLink } from './CheckoutSupportLink';
import { CheckoutFooter } from './CheckoutFooter';
import { CheckoutContractLink } from './CheckoutContractLink';
import { ExistingReservationConditions } from './ExistingReservationConditions';
import { CheckoutLoadingSkeleton } from './CheckoutLoadingSkeleton';
import { ExistingReservationStayCard } from './ExistingReservationStayCard';
import { ExistingReservationGuestFields } from './ExistingReservationGuestFields';
import { ExistingReservationPaymentChoices } from './ExistingReservationPaymentChoices';
import { useExistingReservationCheckoutRecovery } from './useExistingReservationCheckoutRecovery';
import { useExistingReservationCheckoutData } from './useExistingReservationCheckoutData';
import { useExistingReservationPaymentPreparation } from './useExistingReservationPaymentPreparation';
import { LogoCRCN } from '../LogoCRCN';
import { LockKeyhole, QrCode } from 'lucide-react';

const money = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
export function ExistingReservationCheckout({
  code,
  accessToken: suppliedAccessToken,
}: {
  code: string;
  accessToken?: string;
}) {
  const [accessToken, setAccessToken] = useState<string | null>(suppliedAccessToken ?? null);
  const [authState, setAuthState] = useState<'loading' | 'signed-out' | 'ready'>(
    suppliedAccessToken ? 'ready' : 'loading',
  );
  const [guest, setGuest] = useState({ fullName: '', cpf: '', email: '', phone: '' });
  const [accepted, setAccepted] = useState(false);
  const [acceptanceError, setAcceptanceError] = useState(false);
  const [pixDocument, setPixDocument] = useState('');
  const [cardPricing, setCardPricing] = useState<CieloCardPricing | null>(null);
  const [renewalGeneration] = useState(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const generation = searchParams.get('renewal');

    return searchParams.get('retry') === '1' && generation && /^[A-Za-z0-9]{40}$/.test(generation)
      ? generation
      : null;
  });

  useEffect(() => {
    if (suppliedAccessToken) {
      setAccessToken(suppliedAccessToken);
      setAuthState('ready');
      return;
    }
    const client = supabase;
    if (!client) {
      setAuthState('signed-out');
      return;
    }

    let active = true;
    const applySession = (session: Awaited<ReturnType<typeof client.auth.getSession>>['data']['session']) => {
      if (!active) return;
      setAccessToken(session?.access_token ?? null);
      setAuthState(session?.user.email_confirmed_at ? 'ready' : 'signed-out');
    };
    void client.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => applySession(session));

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [suppliedAccessToken]);
  const {
    previousReference,
    previousReferenceBlocksPayment,
    previousReferenceCheckState,
    retryPreviousReferenceCheck,
    recoveryState,
    retryRecovery,
    recoveredReference,
    summaryRetry,
    retrySummary,
  } = useExistingReservationCheckoutRecovery({ code, renewalGeneration, accessToken });
  const {
    summary,
    completed,
    state,
    contractLoading,
    contract,
    plan,
    setPlan,
    method,
    setMethod,
  } = useExistingReservationCheckoutData({ code, refreshKey: summaryRetry, accessToken });

  const planMethods =
    plan === 'full'
      ? (summary?.paymentMethods ?? [])
      : (summary?.paymentPlans?.deposit.methods ?? []);
  const selectedAmountCents =
    summary?.paymentPlans?.[plan].amountCents === undefined
      ? (summary?.candidateBalanceCents ?? null)
      : summary.paymentPlans[plan].amountCents;
  const outstandingBalanceCents =
    summary?.outstandingBalanceCents ?? summary?.candidateBalanceCents ?? null;
  const canPay = planMethods.length > 0 && selectedAmountCents !== null && selectedAmountCents > 0;
  const showCompleted = state === 'ready' && completed;
  const {
    activeReference,
    paymentReviewRequired,
    prepared,
    preparePayment,
    showPaymentStatus,
    startPix,
  } = useExistingReservationPaymentPreparation({
    code,
    accessToken,
    renewalGeneration,
    recoveryState,
    summary,
    contract,
    canPay,
    planMethods,
    method,
    plan,
    guest,
    accepted,
    onAcceptanceReset: setAccepted,
    selectedAmountCents,
    cardPricing,
    pixDocument,
  });

  const cardLabel =
    summary?.cardInstallments.length === 1
      ? `Cartão em ${summary.cardInstallments[0]}x`
      : summary &&
          summary.cardInstallments.length > 0 &&
          summary.cardInstallments.every((value, index) => value === index + 1)
        ? `Cartão em até ${summary.cardInstallments.length}x`
        : 'Cartão · parcelas disponíveis';
  const resumeReference = activeReference ?? recoveredReference;
  if (resumeReference) return <CheckoutResumePage reference={resumeReference} focusOnMount />;

  return (
    <main className="checkout-purchase checkout-existing-reservation flex min-h-screen flex-col text-neutral-950">
      <header className="checkout-purchase-header liquid-glass px-5 py-4 sm:px-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <a
            href="/"
            aria-label="Central de Reservas Caldas Novas — início"
            className="shrink-0 rounded-xl focus-visible:outline-2 focus-visible:outline-orange-700"
          >
            <LogoCRCN size="md" variant="glass" responsiveText />
          </a>
          {!showCompleted && (
            <span className="liquid-glass-pill flex items-center gap-2 rounded-full px-3 py-2.5 text-xs font-semibold text-neutral-700">
              <LockKeyhole size={15} className="text-orange-700" aria-hidden="true" />
              Pagamento seguro
            </span>
          )}
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl flex-1 px-5 pt-7 sm:px-8 sm:pt-10">
        {authState !== 'ready' && (
          <section className="mx-auto max-w-xl rounded-2xl border border-orange-200 bg-white p-6 shadow-sm" role="status">
            <h1 className="text-xl font-bold">{authState === 'loading' ? 'Verificando sua sessão' : 'Entre na sua conta para continuar'}</h1>
            <p className="mt-2 text-sm text-neutral-600">A reserva só pode ser acessada pela conta confirmada com o mesmo e-mail do titular.</p>
            {authState === 'signed-out' && (
              <a href={`/?conta=entrar&retorno=${encodeURIComponent(window.location.href)}`} className="mt-4 inline-flex rounded-xl bg-orange-700 px-4 py-3 font-semibold text-white">Entrar com a conta do titular</a>
            )}
          </section>
        )}
        <div hidden={authState !== 'ready'}>
        {!showCompleted && (
          <div className="mb-6">
            <h1 className="mt-1 text-3xl font-black">Confirme e pague</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Revise os dados da hospedagem, confirme o titular da reserva e escolha como deseja
              pagar.
            </p>
          </div>
        )}
        {!showCompleted && previousReferenceBlocksPayment && previousReference && (
          <div
            className="mb-6 space-y-3 rounded-xl border border-orange-200 bg-orange-50 p-4"
            role="status"
          >
            <p className="font-semibold">
              {previousReferenceCheckState === 'checking'
                ? 'Estamos conferindo o pagamento iniciado anteriormente.'
                : 'Você já iniciou um pagamento para esta reserva neste navegador.'}
            </p>
            <p className="text-sm text-neutral-700">
              {previousReferenceCheckState === 'unavailable'
                ? 'Não conseguimos confirmar o resultado agora. Acompanhe o pedido antes de iniciar outra cobrança.'
                : 'Acompanhe a tentativa antes de iniciar outra cobrança.'}
            </p>
            <a
              className="inline-flex min-h-11 items-center rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
              href={checkoutPathWithStayQuery(
                `/checkout/${previousReference}`,
                window.location.search,
              )}
            >
              Acompanhar pagamento
            </a>
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-xl border border-neutral-400 px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-orange-700"
              onClick={retryPreviousReferenceCheck}
            >
              Verificar novamente
            </button>
          </div>
        )}
        {!showCompleted && recoveryState === 'checking' && (
          <p role="status" className="mb-6 rounded-xl bg-white p-4">
            Estamos verificando se já existe um pagamento iniciado.
          </p>
        )}
        {!showCompleted && recoveryState === 'error' && (
          <div
            role="alert"
            className="mb-6 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
          >
            <p>
              Não foi possível verificar o pagamento anterior. Tente novamente ou fale com nosso
              atendimento antes de pagar.
            </p>
            <button
              type="button"
              className="min-h-11 rounded-xl border border-neutral-400 px-4 font-semibold"
              onClick={retryRecovery}
            >
              Verificar novamente
            </button>
            <CheckoutSupportLink details={{ reservationCode: code }} />
          </div>
        )}
        {state === 'loading' && <CheckoutLoadingSkeleton label="Consultando os dados da reserva" />}
        {state === 'error' && (
          <div className="checkout-purchase-form liquid-glass-card space-y-3 rounded-3xl p-6">
            <p role="alert">
              Não foi possível consultar esta reserva. Confira o código ou fale com nosso
              atendimento.
            </p>
            <button
              type="button"
              className="min-h-11 rounded-xl border border-neutral-400 px-4 py-2 font-semibold focus-visible:outline-2 focus-visible:outline-orange-700"
              onClick={retrySummary}
            >
              Tentar novamente
            </button>
            <CheckoutSupportLink details={{ reservationCode: code }} />
          </div>
        )}
        {showCompleted && (
          <section className="checkout-purchase-form liquid-glass-card mx-auto max-w-2xl rounded-3xl p-6 text-center sm:p-10">
            <div
              className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-100 text-emerald-800"
              aria-hidden="true"
            >
              <span className="text-2xl font-bold">✓</span>
            </div>
            <h1 className="mt-5 text-2xl font-black text-slate-900 sm:text-3xl">
              Sua reserva está confirmada e 100% paga
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Se precisar de ajuda, fale com nosso atendimento.
            </p>
            <CheckoutSupportLink
              details={{
                message:
                  'Olá! Gostaria de falar com o atendimento sobre uma reserva já confirmada.',
              }}
            />
          </section>
        )}
        {state === 'ready' && summary && recoveryState === 'clear' && (
          <>
            <ExistingReservationStayCard key={summary.code} summary={summary} />
            {(!canPay || previousReferenceBlocksPayment) && (
              <aside
                className="checkout-summary-card mb-6 rounded-3xl p-5"
                aria-label="Resumo da reserva"
              >
                <h2 className="font-bold">Resumo do pagamento</h2>
                {summary.totalCents !== null && (
                  <p>Total da hospedagem: {money(summary.totalCents)}</p>
                )}
                {outstandingBalanceCents !== null && (
                  <p>
                    <span>
                      {summary.balanceStatus === 'unrecorded_candidate'
                        ? 'Em aberto'
                        : 'Saldo para conferência'}
                    </span>
                    : {money(outstandingBalanceCents)}
                  </p>
                )}
              </aside>
            )}

            <div className="grid items-start gap-6">
              <section
                className="checkout-purchase-form liquid-glass-card min-w-0 rounded-3xl p-5 sm:p-7"
                aria-label="Dados e pagamento da reserva"
              >
                {canPay &&
                  summary.balanceStatus === 'unrecorded_candidate' &&
                  !previousReferenceBlocksPayment && (
                    <p
                      role="status"
                      className="mb-6 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950"
                    >
                      Este valor está em aberto. O pagamento será confirmado depois que a Cielo
                      confirmar a transação.
                    </p>
                  )}
                {!previousReferenceBlocksPayment && canPay && selectedAmountCents !== null ? (
                  <CieloSopCardForm
                    cardNumberLabel="Número do cartão"
                    existingReservationHolderCpf={guest.cpf}
                    validateCardNumber
                    validatePayerDocument
                    reference=""
                    amount={(selectedAmountCents / 100).toFixed(2)}
                    credentials={null}
                    preparePayment={preparePayment}
                    paymentMethod={method}
                    guestPrefill={guest}
                    disabled={paymentReviewRequired}
                    onPricingChange={setCardPricing}
                    lockInstallments={prepared}
                    allowedInstallments={summary.cardInstallments}
                    onAttemptFinished={showPaymentStatus}
                    onAlternativeSubmit={startPix}
                    alternativeContent={
                      <section
                        className="checkout-pix-panel"
                        aria-labelledby="existing-checkout-pix-title"
                      >
                        <h2
                          id="existing-checkout-pix-title"
                          className="text-lg font-bold text-neutral-950"
                        >
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
                        <PixPayerIdentificationField
                          value={pixDocument}
                          onChange={setPixDocument}
                          disabled={prepared || paymentReviewRequired}
                          allowAlphanumericCnpj
                        />
                      </section>
                    }
                    beforeSubmit={
                      <>
                        <aside
                          className="checkout-summary-card liquid-glass-card overflow-hidden rounded-3xl p-5 sm:p-6"
                          aria-label="Resumo da reserva"
                        >
                          <div className="mt-5 border-t border-neutral-200 pt-4">
                            <p className="text-xs font-bold uppercase tracking-[0.15em] text-orange-800">
                              Última conferência
                            </p>
                            <h2 className="mt-1 text-xl font-extrabold text-slate-900">
                              Resumo do pagamento
                            </h2>
                            <dl className="mt-3 space-y-3 text-sm">
                              <div className="flex justify-between gap-3">
                                <dt className="text-neutral-600">Total da hospedagem</dt>
                                <dd className="font-medium">
                                  {summary.totalCents === null
                                    ? 'Em conferência'
                                    : money(summary.totalCents)}
                                </dd>
                              </div>
                              {outstandingBalanceCents !== null && (
                                <div className="flex justify-between gap-3">
                                  <dt className="text-neutral-600">
                                    {summary.balanceStatus === 'unrecorded_candidate'
                                      ? 'Em aberto'
                                      : canPay
                                        ? 'Saldo a pagar'
                                        : 'Saldo para conferência'}
                                  </dt>
                                  <dd className="font-medium">{money(outstandingBalanceCents)}</dd>
                                </div>
                              )}
                            </dl>
                          </div>
                          {canPay && method === 'card' && cardPricing ? (
                            <div
                              className="mt-5 space-y-2 border-t border-neutral-200 pt-4"
                              aria-live="polite"
                            >
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <span className="text-sm font-semibold text-neutral-800">
                                  Você pagará
                                </span>
                                <strong className="text-xl font-extrabold text-orange-800">
                                  {formatCieloCardPayment(cardPricing)}
                                </strong>
                              </div>
                              <p className="text-sm text-neutral-600">
                                Total no cartão: {money(cardPricing.totalCents)}
                              </p>
                            </div>
                          ) : (
                            <div className="mt-5 flex justify-between gap-3 border-t border-neutral-200 pt-4 font-bold">
                              <span>
                                {canPay
                                  ? 'Pague agora'
                                  : summary.balanceStatus === 'unrecorded_candidate'
                                    ? 'Em aberto'
                                    : 'Valor em conferência'}
                              </span>
                              <span>
                                {selectedAmountCents === null ? '—' : money(selectedAmountCents)}
                              </span>
                            </div>
                          )}
                          <p className="mt-4 rounded-xl bg-white/55 p-3 text-xs leading-5 text-neutral-600">
                            Confira os dados. A cobrança só será iniciada quando o pagamento estiver
                            liberado.
                          </p>
                        </aside>
                        <div
                          className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-slate-600"
                          aria-label="Sinais de segurança do checkout"
                        >
                          <span>
                            <LockKeyhole size={16} aria-hidden="true" />
                            Pagamento processado pela Cielo
                          </span>
                          <span>
                            <LockKeyhole size={16} aria-hidden="true" />
                            Pagamento protegido
                          </span>
                        </div>
                        <ExistingReservationConditions />
                        {contract ? (
                          <span className="block text-sm">
                            <CheckoutContractLink openInModal suppliedContract={contract} />
                            <span className="ml-2 text-neutral-600">Versão {contract.version}</span>
                          </span>
                        ) : contractLoading ? (
                          <p role="status" className="mt-3 text-sm text-neutral-600">
                            Carregando contrato…
                          </p>
                        ) : (
                          <p role="alert" className="mt-3 text-sm text-rose-700">
                            Não foi possível carregar o contrato. Atualize a página antes de
                            continuar.
                          </p>
                        )}
                        <label
                          className={`mt-4 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border bg-white/75 p-4 text-sm leading-6 ${acceptanceError ? 'border-rose-600' : 'border-neutral-200'}`}
                        >
                          <input
                            type="checkbox"
                            checked={accepted}
                            onChange={(event) => {
                              setAccepted(event.target.checked);
                              if (event.target.checked) setAcceptanceError(false);
                            }}
                            onInvalid={() => setAcceptanceError(true)}
                            aria-invalid={acceptanceError}
                            aria-describedby={
                              acceptanceError ? 'existing-acceptance-error' : undefined
                            }
                            disabled={paymentReviewRequired || !contract}
                            className="mt-0.5 h-5 w-5 shrink-0 accent-orange-800"
                            required
                          />{' '}
                          <span>
                            Li e aceito as condições da hospedagem e conferi os dados do titular.
                          </span>
                        </label>
                        {acceptanceError && (
                          <p
                            id="existing-acceptance-error"
                            role="alert"
                            className="mt-2 text-sm font-semibold text-rose-700"
                          >
                            Aceite as condições da hospedagem para continuar.
                          </p>
                        )}
                      </>
                    }
                    submitLabel={
                      method === 'pix'
                        ? `Gerar QR Code Pix · ${money(selectedAmountCents)}`
                        : undefined
                    }
                  >
                    <ExistingReservationGuestFields
                      guest={guest}
                      onChange={setGuest}
                      disabled={prepared || paymentReviewRequired}
                    />
                    <ExistingReservationPaymentChoices
                      summary={summary}
                      plan={plan}
                      setPlan={setPlan}
                      method={method}
                      setMethod={setMethod}
                      planMethods={planMethods}
                      selectedAmountCents={selectedAmountCents}
                      outstandingBalanceCents={outstandingBalanceCents}
                      disabled={prepared || paymentReviewRequired}
                      cardLabel={cardLabel}
                      contract={contract}
                    />
                    {prepared && (
                      <p className="mt-4 text-sm text-neutral-600">
                        A forma de pagamento e as parcelas foram reservadas para este pedido.
                      </p>
                    )}
                  </CieloSopCardForm>
                ) : (
                  !previousReferenceBlocksPayment && (
                    <div
                      className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
                      role="status"
                    >
                      <p className="font-semibold">Saldo em aberto</p>
                      <p className="mt-1">
                        O checkout não conseguiu liberar uma forma de pagamento agora. Fale com
                        nosso atendimento para concluir a reserva.
                      </p>
                    </div>
                  )
                )}
                <div className="mt-5">
                  <CheckoutSupportLink
                    details={{
                      reservationCode: summary.code,
                      listingTitle: summary.property ?? undefined,
                      listingId: summary.listingId ?? undefined,
                      from: summary.checkIn ?? undefined,
                      to: summary.checkOut ?? undefined,
                      balanceTotal:
                        outstandingBalanceCents !== null
                          ? outstandingBalanceCents / 100
                          : undefined,
                      paymentMethod: canPay && !previousReferenceBlocksPayment ? method : undefined,
                      installments:
                        canPay && !previousReferenceBlocksPayment && method === 'card'
                          ? cardPricing?.installments
                          : undefined,
                      total:
                        canPay &&
                        !previousReferenceBlocksPayment &&
                        method === 'card' &&
                        cardPricing
                          ? cardPricing.totalCents / 100
                          : undefined,
                    }}
                  />
                </div>
              </section>
            </div>
          </>
        )}
        </div>
      </div>
      {!showCompleted && <CheckoutFooter hideContractLink />}
    </main>
  );
}
