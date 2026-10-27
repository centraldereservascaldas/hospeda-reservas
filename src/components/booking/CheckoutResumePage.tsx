import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  CircleAlert,
  Clock3,
  LoaderCircle,
  Printer,
  ShieldCheck,
} from 'lucide-react';
import { crcnBackendApi } from '../../services/crcnBackendApi';
import type {
  CheckoutResumeResponse,
  DirectBookingOrderSummary,
} from '../../services/crcnBackendApi';
import { CieloCheckoutIframe } from './CieloCheckoutIframe';
import { getCheckoutResumeToken } from '../../utils/checkoutResumeStorage';

const pixIdempotencyStoragePrefix = 'crcn.checkout.pix.';

function getPixPaymentIdempotencyKey(reference: string): string {
  const storageKey = `${pixIdempotencyStoragePrefix}${reference}`;
  try {
    const existingKey = window.sessionStorage.getItem(storageKey);
    if (existingKey && /^[A-Za-z0-9._~-]{16,128}$/.test(existingKey)) return existingKey;
  } catch {
    // Continue with an in-memory key when session storage is unavailable.
  }

  const idempotencyKey = crypto.randomUUID();
  try {
    window.sessionStorage.setItem(storageKey, idempotencyKey);
  } catch {
    // The ref below preserves the key until the page is closed.
  }

  return idempotencyKey;
}

function isValidPixPaymentIdempotencyKey(value: string | null): value is string {
  return value !== null && /^[A-Za-z0-9._~-]{16,128}$/.test(value);
}

function clearPixPaymentIdempotencyKey(reference: string): void {
  try {
    window.sessionStorage.removeItem(`${pixIdempotencyStoragePrefix}${reference}`);
  } catch {
    // The key is still rotated in memory for this page.
  }
}

interface CheckoutResumePageProps {
  reference: string;
}

type ResumeState =
  | { kind: 'loading' }
  | { kind: 'missing-token' }
  | { kind: 'not-found' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; data: CheckoutResumeResponse };

const moneyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

const paymentAttemptStatusLabels = {
  processing: 'Registrando pagamento',
  pending: 'Aguardando pagamento',
  in_process: 'Pagamento em análise',
  approved: 'Pagamento aprovado',
  rejected: 'Pagamento não aprovado',
  cancelled: 'Pagamento cancelado',
  unknown: 'Pagamento em conferência',
  attention_required: 'Pagamento em conferência',
} as const;

const statusDetails: Record<
  DirectBookingOrderSummary['status'],
  { title: string; detail: string; tone: 'neutral' | 'positive' | 'attention' }
> = {
  iniciado: {
    title: 'Pedido iniciado',
    detail: 'Estamos preparando a conferência da sua estadia.',
    tone: 'neutral',
  },
  cotado: {
    title: 'Cotação registrada',
    detail: 'A estadia foi cotada. A pré-reserva ainda não foi confirmada.',
    tone: 'neutral',
  },
  pre_reservado: {
    title: 'Pré-reserva registrada',
    detail: 'A acomodação está em pré-reserva. Isso ainda não representa uma reserva confirmada.',
    tone: 'neutral',
  },
  pagamento_pendente: {
    title: 'Pagamento pendente',
    detail: 'O pedido aguarda a atualização do pagamento. A reserva ainda não está confirmada.',
    tone: 'neutral',
  },
  pago_em_confirmacao: {
    title: 'Pagamento recebido',
    detail: 'Estamos verificando a confirmação da reserva na Stays.',
    tone: 'neutral',
  },
  confirmado: {
    title: 'Reserva confirmada',
    detail: 'A confirmação da reserva foi registrada após a verificação na Stays.',
    tone: 'positive',
  },
  atencao_operacional: {
    title: 'Pedido em conferência',
    detail: 'A equipe precisa revisar este pedido antes de orientar os próximos passos.',
    tone: 'attention',
  },
  expirado: {
    title: 'Prazo da pré-reserva encerrado',
    detail: 'A disponibilidade precisa ser consultada novamente antes de continuar.',
    tone: 'attention',
  },
  pagamento_recusado: {
    title: 'Pagamento não aprovado',
    detail: 'Este pedido não foi confirmado. Consulte a equipe antes de tentar novamente.',
    tone: 'attention',
  },
  liberacao_pendente: {
    title: 'Liberação em andamento',
    detail: 'Estamos verificando a liberação da pré-reserva na Stays.',
    tone: 'attention',
  },
  cancelamento_solicitado: {
    title: 'Cancelamento solicitado',
    detail: 'A solicitação está em acompanhamento. Consulte a equipe para os próximos passos.',
    tone: 'attention',
  },
  reembolso_pendente: {
    title: 'Reembolso em acompanhamento',
    detail: 'O pedido de reembolso ainda está em processamento.',
    tone: 'attention',
  },
  reembolsado: {
    title: 'Reembolso registrado',
    detail: 'O pedido consta como reembolsado.',
    tone: 'positive',
  },
  contestado: {
    title: 'Pagamento contestado',
    detail: 'A equipe está acompanhando a contestação do pagamento.',
    tone: 'attention',
  },
  concluido: {
    title: 'Estadia concluída',
    detail: 'Este pedido consta como concluído.',
    tone: 'positive',
  },
};

const refreshableStatuses = new Set<DirectBookingOrderSummary['status']>([
  'iniciado',
  'cotado',
  'pre_reservado',
  'pagamento_pendente',
  'pago_em_confirmacao',
  'liberacao_pendente',
  'atencao_operacional',
  'cancelamento_solicitado',
  'reembolso_pendente',
  'contestado',
]);

const refreshablePaymentStatuses = new Set([
  'pending',
  'in_process',
  'approved',
  'unknown',
  'attention_required',
]);

function formatDate(value: string): string {
  return dateFormatter.format(new Date(`${value}T12:00:00Z`));
}

function getToneClasses(tone: 'neutral' | 'positive' | 'attention'): string {
  if (tone === 'positive') return 'border-emerald-200 bg-emerald-50 text-emerald-950';
  if (tone === 'attention') return 'border-amber-300 bg-amber-50 text-amber-950';
  return 'border-orange-200 bg-orange-50 text-orange-950';
}

function getOrderStatusDetails(order: DirectBookingOrderSummary) {
  if (order.paymentStatus === 'refunded') {
    return {
      title: 'Pagamento estornado',
      detail: order.reservationConfirmed
        ? 'O gateway informa o estorno. O último registro da Stays indica a reserva como confirmada, e a equipe está revisando a situação da hospedagem.'
        : 'O gateway informa o estorno. A equipe está revisando a situação do pedido e da reserva.',
      tone: 'attention' as const,
    };
  }
  if (order.paymentStatus === 'charged_back') {
    return {
      title: 'Pagamento contestado',
      detail: order.reservationConfirmed
        ? 'O gateway informa uma contestação. O último registro da Stays indica a reserva como confirmada; a equipe está revisando a situação da hospedagem.'
        : 'O gateway informa uma contestação. A equipe está revisando a situação do pedido e da reserva.',
      tone: 'attention' as const,
    };
  }

  return statusDetails[order.status];
}

export function CheckoutResumePage({ reference }: CheckoutResumePageProps) {
  const [resumeState, setResumeState] = useState<ResumeState>({ kind: 'loading' });
  const [retryKey, setRetryKey] = useState(0);
  const [pixCopyResult, setPixCopyResult] = useState<{
    code: string;
    status: 'copied' | 'failed';
  } | null>(null);
  const [isStartingPixPayment, setIsStartingPixPayment] = useState(false);
  const [paymentStartError, setPaymentStartError] = useState<string | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'pix' | 'card'>('pix');
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const pixPaymentSubmissionInFlightRef = useRef(false);
  const pixPaymentIdempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const previousTitle = document.title;
    const existingRobots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previousRobotsContent = existingRobots?.content;
    const robotsMeta = existingRobots ?? document.createElement('meta');
    if (!existingRobots) {
      robotsMeta.name = 'robots';
      document.head.append(robotsMeta);
    }

    document.title = 'Acompanhe seu pedido | CRCN';
    robotsMeta.content = 'noindex, nofollow';

    return () => {
      document.title = previousTitle;
      if (existingRobots && previousRobotsContent !== undefined) {
        existingRobots.content = previousRobotsContent;
      } else {
        robotsMeta.remove();
      }
    };
  }, []);

  useEffect(() => {
    setPixCopyResult(null);
    const token = getCheckoutResumeToken(reference);
    if (!token) {
      setResumeState({ kind: 'missing-token' });
      return;
    }

    let isCurrent = true;
    let refreshTimeout: number | undefined;

    const refresh = async (showLoading: boolean): Promise<void> => {
      if (showLoading) setResumeState({ kind: 'loading' });
      const result = await crcnBackendApi.resumeCheckout(reference, token);
      if (!isCurrent) return;

      if (result.kind !== 'ready') {
        setResumeState({ kind: result.kind });
        return;
      }

      setResumeState({ kind: 'ready', data: result.data });
      if (
        refreshableStatuses.has(result.data.order.status) ||
        (result.data.order.status === 'expirado' &&
          result.data.payment.attempt != null &&
          refreshablePaymentStatuses.has(result.data.payment.attempt.status))
      ) {
        refreshTimeout = window.setTimeout(() => {
          void refresh(false);
        }, 30_000);
      }
    };

    void refresh(true);

    return () => {
      isCurrent = false;
      if (refreshTimeout !== undefined) window.clearTimeout(refreshTimeout);
    };
  }, [reference, retryKey]);

  const copyPixCode = async (copyPaste: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(copyPaste);
      setPixCopyResult({ code: copyPaste, status: 'copied' });
    } catch {
      setPixCopyResult({ code: copyPaste, status: 'failed' });
    }
  };

  const startPixPayment = async (order: DirectBookingOrderSummary): Promise<void> => {
    if (pixPaymentSubmissionInFlightRef.current) return;

    const token = getCheckoutResumeToken(reference);
    if (!token) {
      setPaymentStartError('Esta sessão não tem a credencial para continuar o pagamento.');
      return;
    }

    pixPaymentSubmissionInFlightRef.current = true;
    setIsStartingPixPayment(true);
    setPaymentStartError(null);
    try {
      if (!isValidPixPaymentIdempotencyKey(pixPaymentIdempotencyKeyRef.current)) {
        pixPaymentIdempotencyKeyRef.current = getPixPaymentIdempotencyKey(reference);
      }
      const result = await crcnBackendApi.createCheckoutPayment(
        reference,
        token,
        order.quoteTotal,
        {
          paymentMethod: 'pix',
          paymentMethodId: 'pix',
          idempotencyKey: pixPaymentIdempotencyKeyRef.current,
        },
      );

      if (result.kind === 'response') {
        if (result.success) {
          pixPaymentIdempotencyKeyRef.current = null;
          clearPixPaymentIdempotencyKey(reference);
          setRetryKey((current) => current + 1);
          return;
        }

        setPaymentStartError(result.message);
        if (result.code === 'idempotency_key_reused') {
          pixPaymentIdempotencyKeyRef.current = null;
          clearPixPaymentIdempotencyKey(reference);
        }
        setRetryKey((current) => current + 1);
      } else {
        setPaymentStartError(
          'Não foi possível iniciar o Pix. Atualize o pedido e tente novamente.',
        );
      }
    } catch {
      setPaymentStartError('Não foi possível iniciar o Pix. Atualize o pedido e tente novamente.');
    } finally {
      pixPaymentSubmissionInFlightRef.current = false;
      setIsStartingPixPayment(false);
    }
  };

  const order = resumeState.kind === 'ready' ? resumeState.data.order : null;
  const paymentAttempt =
    resumeState.kind === 'ready' ? (resumeState.data.payment.attempt ?? null) : null;
  const reservationExpiresAt = order?.expiresAt ? Date.parse(order.expiresAt) : Number.NaN;
  const reservationIsActive =
    Number.isFinite(reservationExpiresAt) && reservationExpiresAt > currentTime;

  useEffect(() => {
    if (!Number.isFinite(reservationExpiresAt)) return;

    const timeout = window.setTimeout(
      () => setCurrentTime(Date.now()),
      Math.max(0, reservationExpiresAt - Date.now() + 1),
    );

    return () => window.clearTimeout(timeout);
  }, [reservationExpiresAt]);

  const canRetryPixPayment =
    paymentAttempt === null ||
    paymentAttempt.status === 'rejected' ||
    paymentAttempt.status === 'cancelled';
  const canStartPixPayment =
    order !== null &&
    resumeState.kind === 'ready' &&
    resumeState.data.payment.enabled &&
    resumeState.data.payment.methods.includes('pix') &&
    reservationIsActive &&
    (order.status === 'pre_reservado' || order.status === 'pagamento_recusado') &&
    canRetryPixPayment;
  const paymentCapabilities = resumeState.kind === 'ready' ? resumeState.data.payment : null;
  const cardPublicKey = paymentCapabilities?.publicKey ?? null;
  const canStartCardPayment =
    order !== null &&
    paymentCapabilities?.enabled === true &&
    paymentCapabilities.methods.includes('card') &&
    cardPublicKey !== null &&
    reservationIsActive &&
    (order.status === 'pre_reservado' || order.status === 'pagamento_recusado') &&
    canRetryPixPayment;
  const showPaymentMethodSelector = canStartPixPayment && canStartCardPayment;
  const showPixPaymentAction =
    canStartPixPayment && (!canStartCardPayment || selectedPaymentMethod === 'pix');
  const showCardPaymentForm =
    canStartCardPayment && (!canStartPixPayment || selectedPaymentMethod === 'card');
  const showActiveCieloCheckout =
    paymentAttempt?.method === 'card' && typeof paymentAttempt.checkoutUrl === 'string';
  const status = order ? getOrderStatusDetails(order) : null;
  const StatusIcon =
    status?.tone === 'positive' ? BadgeCheck : status?.tone === 'attention' ? CircleAlert : Clock3;

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-4 py-8 text-neutral-950 print:min-h-0 print:bg-white print:px-0 print:py-0 sm:px-8 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl flex-col print:min-h-0 print:py-5">
        <header className="flex items-center justify-between border-b border-neutral-300/80 pb-5">
          <a href="/" className="text-sm font-black tracking-tight text-neutral-950">
            CRCN <span className="font-medium text-neutral-500">· Central de Reservas</span>
          </a>
          <span className="flex items-center gap-2 text-xs font-semibold text-neutral-600">
            <ShieldCheck className="h-4 w-4 text-orange-700" aria-hidden="true" />
            Consulta protegida
          </span>
        </header>

        <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <section aria-labelledby="checkout-resume-title" className="max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-800">
              Acompanhe seu pedido
            </p>
            <h1
              id="checkout-resume-title"
              className="mt-4 text-4xl font-black leading-tight tracking-tight sm:text-5xl"
            >
              Sua estadia, com cada etapa no lugar.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-neutral-600">
              Consulte o estado registrado pela Central de Reservas. A confirmação só aparece depois
              da verificação da reserva na Stays.
            </p>

            <div className="mt-8 rounded-3xl border border-neutral-200 bg-white p-5 shadow-[0_18px_60px_-36px_rgba(37,30,18,0.35)] sm:p-7">
              {resumeState.kind === 'loading' && (
                <div
                  className="flex items-center gap-3 py-6 text-sm font-semibold text-neutral-700"
                  role="status"
                  aria-live="polite"
                >
                  <LoaderCircle
                    className="h-5 w-5 text-orange-700 motion-safe:animate-spin"
                    aria-hidden="true"
                  />
                  Consultando seu pedido com segurança…
                </div>
              )}

              {resumeState.kind === 'missing-token' && (
                <div className="space-y-3" role="alert">
                  <h2 className="text-lg font-extrabold">Acesso disponível neste navegador</h2>
                  <p className="text-sm leading-6 text-neutral-600">
                    Para proteger seus dados, é necessário o código de acesso gerado na criação do
                    pedido. Ele fica guardado somente na sessão do navegador em que a compra foi
                    iniciada.
                  </p>
                  <a
                    href="/"
                    className="inline-flex items-center gap-2 pt-2 text-sm font-bold text-orange-800 hover:text-orange-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-700"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar aos imóveis
                  </a>
                </div>
              )}

              {resumeState.kind === 'unavailable' && (
                <div className="space-y-3" role="alert">
                  <h2 className="text-lg font-extrabold">Não foi possível consultar agora</h2>
                  <p className="text-sm leading-6 text-neutral-600">
                    O pedido não foi alterado. Tente novamente; a referência e o código de acesso
                    continuam protegidos nesta sessão.
                  </p>
                  <button
                    type="button"
                    onClick={() => setRetryKey((current) => current + 1)}
                    className="mt-2 rounded-full bg-neutral-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                  >
                    Tentar novamente
                  </button>
                </div>
              )}

              {resumeState.kind === 'not-found' && (
                <div className="space-y-3" role="alert">
                  <h2 className="text-lg font-extrabold">Não foi possível acessar o pedido</h2>
                  <p className="text-sm leading-6 text-neutral-600">
                    A referência ou o código de acesso não conferem. Por segurança, não informamos
                    se existe um pedido para esta referência.
                  </p>
                  <a
                    href="/"
                    className="inline-flex items-center gap-2 pt-2 text-sm font-bold text-orange-800 hover:text-orange-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-700"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar aos imóveis
                  </a>
                </div>
              )}

              {resumeState.kind === 'ready' && order && status && (
                <div className="space-y-6">
                  <div
                    className={`flex items-start gap-3 rounded-2xl border p-4 ${getToneClasses(status.tone)}`}
                    role="status"
                    aria-live="polite"
                  >
                    <StatusIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <div>
                      <h2 className="font-extrabold">{status.title}</h2>
                      <p className="mt-1 text-sm leading-6">{status.detail}</p>
                    </div>
                  </div>
                  {order.status === 'pagamento_recusado' && !reservationIsActive && (
                    <p
                      className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
                      role="status"
                    >
                      O prazo da pré-reserva terminou. Consulte novamente a disponibilidade e o
                      preço antes de iniciar outro pedido.
                    </p>
                  )}

                  <dl className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl bg-[#f7f4ee] p-4">
                      <dt className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                        Entrada
                      </dt>
                      <dd className="mt-1 font-bold">{formatDate(order.from)}</dd>
                    </div>
                    <div className="rounded-2xl bg-[#f7f4ee] p-4">
                      <dt className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                        Saída
                      </dt>
                      <dd className="mt-1 font-bold">{formatDate(order.to)}</dd>
                    </div>
                    <div className="rounded-2xl bg-[#f7f4ee] p-4">
                      <dt className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                        Total do pedido
                      </dt>
                      <dd className="mt-1 text-lg font-black">
                        {moneyFormatter.format(Number(order.quoteTotal))}
                      </dd>
                    </div>
                    {order.expiresAt && !resumeState.data.confirmation && (
                      <div className="rounded-2xl bg-[#f7f4ee] p-4">
                        <dt className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                          Prazo da pré-reserva
                        </dt>
                        <dd className="mt-1 font-bold">
                          {dateTimeFormatter.format(new Date(order.expiresAt))} (horário local)
                        </dd>
                      </div>
                    )}
                    <div className="rounded-2xl bg-[#f7f4ee] p-4">
                      <dt className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                        Responsável
                      </dt>
                      <dd className="mt-1 font-bold">{order.guestName}</dd>
                    </div>
                    <div className="rounded-2xl bg-[#f7f4ee] p-4">
                      <dt className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                        Pedido
                      </dt>
                      <dd className="mt-1 font-mono text-sm font-bold">
                        {order.publicReference.slice(0, 8).toUpperCase()}
                      </dd>
                    </div>
                  </dl>

                  {resumeState.data.confirmation && (
                    <section
                      aria-labelledby="checkout-confirmation-title"
                      className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"
                    >
                      <h2
                        id="checkout-confirmation-title"
                        className="font-extrabold text-emerald-950"
                      >
                        Confirmação registrada na Stays
                      </h2>
                      {resumeState.data.confirmation.reservationCode && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                            Código da reserva
                          </p>
                          <p className="mt-1 break-all font-mono text-lg font-black text-emerald-950">
                            {resumeState.data.confirmation.reservationCode}
                          </p>
                        </div>
                      )}
                      {resumeState.data.confirmation.confirmedAt && (
                        <p className="text-xs text-emerald-900">
                          Confirmada em{' '}
                          {dateTimeFormatter.format(
                            new Date(resumeState.data.confirmation.confirmedAt),
                          )}
                        </p>
                      )}
                      {paymentAttempt?.status === 'approved' && (
                        <dl className="grid gap-3 border-t border-emerald-200 pt-3 text-sm sm:grid-cols-2">
                          <div>
                            <dt className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                              Valor pago
                            </dt>
                            <dd className="mt-1 font-extrabold text-emerald-950">
                              {moneyFormatter.format(Number(paymentAttempt.amount))}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                              Forma de pagamento
                            </dt>
                            <dd className="mt-1 font-extrabold text-emerald-950">
                              {paymentAttempt.method === 'pix' ? 'Pix' : 'Cartão'}
                            </dd>
                          </div>
                          {paymentAttempt.paidAt && (
                            <div className="sm:col-span-2">
                              <dt className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                                Pagamento aprovado em
                              </dt>
                              <dd className="mt-1 font-semibold text-emerald-950">
                                {dateTimeFormatter.format(new Date(paymentAttempt.paidAt))}
                              </dd>
                            </div>
                          )}
                        </dl>
                      )}
                      <div className="flex justify-end border-t border-emerald-200 pt-3 print:hidden">
                        <button
                          type="button"
                          onClick={() => window.print()}
                          className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-white px-4 py-2 text-sm font-bold text-emerald-950 transition hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
                        >
                          <Printer className="h-4 w-4" aria-hidden="true" />
                          Imprimir comprovante
                        </button>
                      </div>
                    </section>
                  )}

                  {(canStartPixPayment || canStartCardPayment || showActiveCieloCheckout) && order && (
                    <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4">
                      {showPaymentMethodSelector && (
                        <div className="flex gap-2" role="group" aria-label="Método de pagamento">
                          <button
                            type="button"
                            aria-pressed={selectedPaymentMethod === 'pix'}
                            onClick={() => setSelectedPaymentMethod('pix')}
                            className={`rounded-full px-4 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 ${selectedPaymentMethod === 'pix' ? 'bg-orange-800 text-white' : 'border border-neutral-300 text-neutral-800 hover:bg-neutral-100'}`}
                          >
                            Pix
                          </button>
                          <button
                            type="button"
                            aria-pressed={selectedPaymentMethod === 'card'}
                            onClick={() => setSelectedPaymentMethod('card')}
                            className={`rounded-full px-4 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 ${selectedPaymentMethod === 'card' ? 'bg-orange-800 text-white' : 'border border-neutral-300 text-neutral-800 hover:bg-neutral-100'}`}
                          >
                            Cartão
                          </button>
                        </div>
                      )}

                      {showPixPaymentAction && (
                        <div className="space-y-3" aria-labelledby="checkout-start-payment-title">
                          <div>
                            <h2 id="checkout-start-payment-title" className="font-extrabold">
                              {paymentAttempt
                                ? 'Nova tentativa Pix disponível'
                                : 'Pré-reserva pronta para pagamento'}
                            </h2>
                            <p className="mt-1 text-sm leading-6 text-neutral-700">
                              {paymentAttempt
                                ? 'A tentativa anterior foi encerrada. Você pode solicitar outro Pix enquanto a pré-reserva estiver válida.'
                                : 'A cobrança Pix só será solicitada quando você continuar. A confirmação da estadia depende da validação posterior na Stays.'}
                            </p>
                          </div>
                          {paymentStartError && (
                            <p className="text-sm text-rose-800" role="alert">
                              {paymentStartError}
                            </p>
                          )}
                          <button
                            type="button"
                            disabled={isStartingPixPayment}
                            onClick={() => void startPixPayment(order)}
                            className="rounded-full bg-orange-800 px-5 py-3 text-sm font-bold text-white transition hover:bg-orange-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-wait disabled:opacity-60"
                          >
                            {isStartingPixPayment
                              ? 'Solicitando Pix…'
                              : paymentAttempt
                                ? 'Tentar novamente com Pix'
                                : 'Gerar pagamento Pix'}
                          </button>
                        </div>
                      )}

                      {(showCardPaymentForm || showActiveCieloCheckout) && cardPublicKey === 'cielo-iframe' && (
                        <CieloCheckoutIframe
                          reference={reference}
                          amount={order.quoteTotal}
                          checkoutUrl={paymentAttempt?.checkoutUrl ?? null}
                          onAttemptStarted={() => setRetryKey((current) => current + 1)}
                        />
                      )}
                    </section>
                  )}

                  {paymentAttempt && (
                    <section
                      aria-labelledby="checkout-payment-title"
                      className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 print:hidden"
                    >
                      <div>
                        <h2 id="checkout-payment-title" className="font-extrabold">
                          Pagamento {paymentAttempt.method === 'pix' ? 'Pix' : 'com cartão'}
                        </h2>
                        <p
                          className="mt-1 text-sm text-neutral-700"
                          role="status"
                          aria-live="polite"
                        >
                          {paymentAttemptStatusLabels[paymentAttempt.status]}
                        </p>
                      </div>

                      {paymentAttempt.method === 'pix' && paymentAttempt.pix && (
                        <div className="space-y-4">
                          {paymentAttempt.pix.qrCodeBase64 && (
                            <img
                              src={`data:image/png;base64,${paymentAttempt.pix.qrCodeBase64}`}
                              alt="QR Code da tentativa de pagamento Pix"
                              className="mx-auto h-48 w-48 rounded-xl border border-neutral-200 bg-white p-2"
                            />
                          )}
                          {paymentAttempt.pix.copyPaste && (
                            <div className="space-y-2">
                              <label
                                htmlFor="checkout-pix-copy-paste"
                                className="block text-xs font-bold uppercase tracking-wider text-neutral-500"
                              >
                                Código Pix copia e cola
                              </label>
                              <textarea
                                id="checkout-pix-copy-paste"
                                readOnly
                                rows={3}
                                value={paymentAttempt.pix.copyPaste}
                                className="w-full resize-y rounded-xl border border-neutral-300 bg-neutral-50 p-3 font-mono text-xs leading-5 text-neutral-800"
                              />
                              <button
                                type="button"
                                onClick={() => void copyPixCode(paymentAttempt.pix!.copyPaste!)}
                                className="rounded-full bg-neutral-950 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                              >
                                Copiar código Pix
                              </button>
                              {pixCopyResult?.code === paymentAttempt.pix.copyPaste && (
                                <p
                                  className="text-xs text-neutral-600"
                                  role="status"
                                  aria-live="polite"
                                >
                                  {pixCopyResult.status === 'copied'
                                    ? 'Código copiado.'
                                    : 'Não foi possível copiar. Selecione o código para copiar.'}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {paymentAttempt.expiresAt && (
                        <p className="border-t border-neutral-200 pt-3 text-xs text-neutral-600">
                          Validade informada pelo pagamento:{' '}
                          {dateTimeFormatter.format(new Date(paymentAttempt.expiresAt))}
                        </p>
                      )}
                    </section>
                  )}

                  <button
                    type="button"
                    onClick={() => setRetryKey((current) => current + 1)}
                    className="rounded-full border border-neutral-300 bg-white px-4 py-2.5 text-xs font-bold text-neutral-800 transition hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 print:hidden"
                  >
                    Atualizar status
                  </button>

                  <p className="border-t border-neutral-200 pt-4 text-xs leading-5 text-neutral-600">
                    {paymentAttempt
                      ? 'Esta consulta acompanha o pagamento já solicitado e não envia novas cobranças.'
                      : 'Nenhum dado pessoal ou informação de cartão é exibido nesta página.'}
                  </p>
                </div>
              )}
            </div>
          </section>

          <aside className="relative hidden min-h-[430px] overflow-hidden rounded-[2rem] bg-neutral-950 p-9 text-white shadow-[0_30px_80px_-35px_rgba(37,30,18,0.5)] lg:flex lg:flex-col lg:justify-between print:hidden">
            <div
              className="absolute -right-20 -top-16 h-72 w-72 rounded-full border border-white/10"
              aria-hidden="true"
            />
            <div
              className="absolute -right-5 -top-1 h-44 w-44 rounded-full border border-orange-300/25"
              aria-hidden="true"
            />
            <div className="relative flex items-center gap-3 text-sm font-bold text-orange-200">
              <span className="h-px w-8 bg-orange-300" />
              HOSPEDAGEM EM CALDAS NOVAS
            </div>
            <div className="relative max-w-sm">
              <p className="text-5xl font-black leading-[1.05] tracking-tight">
                Transparência em cada passo.
              </p>
              <p className="mt-5 text-sm leading-6 text-neutral-300">
                Cotação, pagamento e confirmação são etapas diferentes. Aqui você acompanha somente
                o que já foi verificado.
              </p>
            </div>
            <div className="relative flex items-center justify-between border-t border-white/15 pt-5 text-xs text-neutral-400">
              <span>Central de Reservas CRCN</span>
              <span>BR · 01</span>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
