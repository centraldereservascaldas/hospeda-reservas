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
import { checkoutApi } from '../../services/checkoutApi';
import { emitConfirmedPurchase, emitFunnelEvent } from '../../utils/measurementEvents';
import type {
  CheckoutAccessCredentials,
  CheckoutResumeResponse,
  DirectBookingOrderSummary,
} from '../../services/checkoutApi';
import { MercadoPagoCardForm } from './MercadoPagoCardForm';
import { CieloSopCardForm } from './CieloSopCardForm';
import { CheckoutSupportLink } from './CheckoutSupportLink';
import { CieloCheckoutIframe } from './CieloCheckoutIframe';
import {
  clearCheckoutResumeToken,
  getCheckoutResumeToken,
} from '../../utils/checkoutResumeStorage';

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
  accessToken?: string;
}

type ResumeState =
  | { kind: 'loading' }
  | { kind: 'missing-token' }
  | { kind: 'not-found' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; data: CheckoutResumeResponse; credentials: CheckoutAccessCredentials };

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

export function CheckoutResumePage({ reference, accessToken }: CheckoutResumePageProps) {
  const [resumeState, setResumeState] = useState<ResumeState>({ kind: 'loading' });
  const [retryKey, setRetryKey] = useState(0);
  const [pixCopyResult, setPixCopyResult] = useState<{
    code: string;
    status: 'copied' | 'failed';
  } | null>(null);
  const [isStartingPixPayment, setIsStartingPixPayment] = useState(false);
  const [paymentStartError, setPaymentStartError] = useState<string | null>(null);
  const [cancellationRequestError, setCancellationRequestError] = useState<string | null>(null);
  const [isRequestingCancellation, setIsRequestingCancellation] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'pix' | 'card'>('pix');
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const pixPaymentSubmissionInFlightRef = useRef(false);
  const pixPaymentInfoEmittedRef = useRef(false);
  const pixPaymentIdempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setPixCopyResult(null);
    const resumeToken = getCheckoutResumeToken(reference);
    const credentials: CheckoutAccessCredentials | null = accessToken
      ? { type: 'authenticated' as const, accessToken }
      : resumeToken
        ? { type: 'resume-token' as const, resumeToken }
        : null;
    if (!credentials) {
      setResumeState({ kind: 'missing-token' });
      return;
    }

    let isCurrent = true;
    let refreshTimeout: number | undefined;

    const refresh = async (showLoading: boolean): Promise<void> => {
      if (showLoading) setResumeState({ kind: 'loading' });
      let resolvedCredentials = credentials;
      let result = await checkoutApi.resumeCheckout(reference, resolvedCredentials);
      if (result.kind === 'not-found' && accessToken && resumeToken) {
        resolvedCredentials = { type: 'resume-token', resumeToken };
        result = await checkoutApi.resumeCheckout(reference, resolvedCredentials);
      }
      if (!isCurrent) return;

      if (result.kind === 'not-found' && resolvedCredentials.type === 'resume-token') {
        clearCheckoutResumeToken(reference);
      }

      if (result.kind !== 'ready') {
        setResumeState({ kind: result.kind });
        return;
      }

      setResumeState({ kind: 'ready', data: result.data, credentials: resolvedCredentials });
      void emitConfirmedPurchase(result.data.order);
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
  }, [accessToken, reference, retryKey]);

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

    const credentials = resumeState.kind === 'ready' ? resumeState.credentials : null;
    if (!credentials) {
      setPaymentStartError('Esta sessão não tem a credencial para continuar o pagamento.');
      return;
    }

    pixPaymentSubmissionInFlightRef.current = true;
    if (!pixPaymentInfoEmittedRef.current) {
      pixPaymentInfoEmittedRef.current = emitFunnelEvent({
        event: 'add_payment_info',
        payment_type: 'pix',
      });
    }
    setIsStartingPixPayment(true);
    setPaymentStartError(null);
    try {
      if (!isValidPixPaymentIdempotencyKey(pixPaymentIdempotencyKeyRef.current)) {
        pixPaymentIdempotencyKeyRef.current = getPixPaymentIdempotencyKey(reference);
      }
      const result = await checkoutApi.createCheckoutPayment(
        reference,
        credentials,
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
        if (result.kind === 'not-found' && credentials.type === 'resume-token') {
          clearCheckoutResumeToken(reference);
        }
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

  const requestCancellation = async (): Promise<void> => {
    if (resumeState.kind !== 'ready' || isRequestingCancellation) return;
    const confirmed = window.confirm(
      'Deseja registrar uma solicitação de cancelamento? A Central analisará o pedido. Esta solicitação não cancela a reserva nem realiza estorno do pagamento.',
    );
    if (!confirmed) return;

    setIsRequestingCancellation(true);
    setCancellationRequestError(null);
    try {
      await checkoutApi.requestCheckoutCancellation(reference, resumeState.credentials);
      setRetryKey((current) => current + 1);
    } catch (error) {
      setCancellationRequestError(
        error instanceof Error
          ? error.message
          : 'Não foi possível registrar a solicitação. Tente novamente.',
      );
    } finally {
      setIsRequestingCancellation(false);
    }
  };

  const order = resumeState.kind === 'ready' ? resumeState.data.order : null;
  const paymentAttempt =
    resumeState.kind === 'ready' ? (resumeState.data.payment.attempt ?? null) : null;
  const supportLink = (
    <CheckoutSupportLink
      details={{
        reference,
        listingId: order?.listingId,
        from: order?.from,
        to: order?.to,
        paymentMethod: paymentAttempt?.method ?? selectedPaymentMethod,
        baseTotal: order ? Number(order.quoteTotal) : undefined,
        total: paymentAttempt ? Number(paymentAttempt.amount) : undefined,
      }}
    />
  );
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
  const isCieloProvider =
    paymentCapabilities?.provider === 'cielo_sandbox' || paymentCapabilities?.provider === 'cielo';
  const isHostedCieloProvider = paymentCapabilities?.provider === 'cielo_hosted';
  const canStartCardPayment =
    order !== null &&
    paymentCapabilities?.enabled === true &&
    paymentCapabilities.methods.includes('card') &&
    (isCieloProvider || isHostedCieloProvider || cardPublicKey !== null) &&
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
  const showHostedCieloCheckout =
    isHostedCieloProvider && (showCardPaymentForm || showActiveCieloCheckout);
  const status = order ? getOrderStatusDetails(order) : null;
  const StatusIcon =
    status?.tone === 'positive' ? BadgeCheck : status?.tone === 'attention' ? CircleAlert : Clock3;

  return (
    <main
      className="min-h-[100dvh] bg-[#f7f4ee] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-8 pb-8 text-neutral-950 print:min-h-0 print:bg-white print:px-0 print:py-0 print:!pt-0 print:!pb-0 sm:pl-[max(2rem,env(safe-area-inset-left,0px))] sm:pr-[max(2rem,env(safe-area-inset-right,0px))] sm:pt-12 sm:pb-12 [@media(max-height:400px)]:pt-3 [@media(max-height:400px)]:pb-3"
      style={{
        paddingTop:
          'max(0.75rem, min(2rem, calc((100dvh - 25rem) / 2)), env(safe-area-inset-top, 0px))',
        paddingBottom:
          'max(0.75rem, min(2rem, calc((100dvh - 25rem) / 2)), env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-5xl flex-col print:min-h-0 print:py-5 [@media(max-height:400px)]:min-h-0">
        <header className="flex items-center justify-between border-b border-neutral-300/80 pb-5 [@media(max-height:400px)]:pb-3 max-[360px]:pb-3">
          <a
            href="/"
            className="inline-flex min-h-11 items-center rounded-md text-sm font-black tracking-tight text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
          >
            CRCN <span className="font-medium text-neutral-500">· Central de Reservas</span>
          </a>
          <span className="flex items-center gap-2 text-xs font-semibold text-neutral-600">
            <ShieldCheck className="h-4 w-4 text-orange-700" aria-hidden="true" />
            Consulta protegida
          </span>
        </header>

        <div className="grid flex-1 items-center gap-10 py-10 [@media(max-height:400px)]:gap-4 [@media(max-height:400px)]:py-4 max-[360px]:gap-4 max-[360px]:py-4 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <section aria-labelledby="checkout-resume-title" className="min-w-0 max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-800">
              Acompanhe seu pedido
            </p>
            <h1
              id="checkout-resume-title"
              className="mt-4 text-3xl font-black leading-tight tracking-tight min-[400px]:text-4xl sm:text-5xl [@media(max-height:400px)]:mt-2 [@media(max-height:400px)]:text-3xl"
            >
              Sua estadia, com cada etapa no lugar.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-neutral-600 [@media(max-height:400px)]:hidden max-[360px]:hidden">
              Consulte o estado registrado pela Central de Reservas. A confirmação só aparece depois
              da verificação da reserva na Stays.
            </p>

            <div className="mt-8 rounded-3xl border border-neutral-200 bg-white p-5 shadow-[0_18px_60px_-36px_rgba(37,30,18,0.35)] sm:p-7 [@media(max-height:400px)]:mt-2 [@media(max-height:400px)]:p-3 max-[360px]:mt-4 max-[360px]:p-4">
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
                  <h2 className="text-lg font-extrabold">Entre na conta usada no pedido</h2>
                  <p className="text-sm leading-6 text-neutral-600">
                    Entre na sua conta CRCN com o mesmo e-mail confirmado informado no pedido para
                    recuperá-lo entre dispositivos. Se você fez a compra como visitante, abra este
                    endereço no navegador em que iniciou o pedido.
                  </p>
                  <a
                    href="/"
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl px-1 py-2 text-sm font-bold text-orange-800 hover:text-orange-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-700"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Ir para a CRCN e entrar na
                    minha conta
                  </a>
                </div>
              )}

              {resumeState.kind === 'unavailable' && (
                <div className="space-y-3" role="alert">
                  <h2 className="text-lg font-extrabold">Não foi possível consultar agora</h2>
                  {supportLink}
                  <p className="text-sm leading-6 text-neutral-600">
                    O pedido não foi alterado. Tente novamente; a referência e o código de acesso
                    continuam protegidos nesta sessão.
                  </p>
                  <button
                    type="button"
                    onClick={() => setRetryKey((current) => current + 1)}
                    className="mt-2 min-h-11 rounded-full bg-neutral-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                  >
                    Tentar novamente
                  </button>
                </div>
              )}

              {resumeState.kind === 'not-found' && (
                <div className="space-y-3" role="alert">
                  <h2 className="text-lg font-extrabold">Não foi possível acessar o pedido</h2>
                  {supportLink}
                  <p className="text-sm leading-6 text-neutral-600">
                    A referência ou o código de acesso não conferem. Por segurança, não informamos
                    se existe um pedido para esta referência.
                  </p>
                  <a
                    href="/"
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl px-1 py-2 text-sm font-bold text-orange-800 hover:text-orange-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-700"
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
                      <p className="mt-1 break-words text-sm leading-6 [overflow-wrap:anywhere]">
                        {status.detail}
                      </p>
                    </div>
                  </div>
                  {order.status === 'atencao_operacional' && paymentAttempt === null && (
                    <p
                      className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
                      role="alert"
                    >
                      O pagamento não foi iniciado. Nenhum código Pix foi gerado para este pedido.
                      Fale com nosso atendimento antes de tentar outra compra.
                    </p>
                  )}
                  {(status.tone === 'attention' ||
                    paymentAttempt?.status === 'rejected' ||
                    paymentAttempt?.status === 'attention_required' ||
                    paymentAttempt?.status === 'unknown') &&
                    supportLink}
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
                      <dd className="mt-1 break-words font-bold [overflow-wrap:anywhere]">
                        {order.guestName}
                      </dd>
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
                          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-emerald-300 bg-white px-4 py-2 text-sm font-bold text-emerald-950 transition hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
                        >
                          <Printer className="h-4 w-4" aria-hidden="true" />
                          Imprimir comprovante
                        </button>
                      </div>
                    </section>
                  )}

                  {order.status === 'confirmado' && order.paymentStatus === 'approved' && (
                    <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
                      <h2 className="font-extrabold text-neutral-950">Solicitar cancelamento</h2>
                      <p className="text-sm leading-6 text-neutral-700">
                        A Central analisará sua solicitação. O pedido não cancela a reserva nem
                        realiza o estorno do pagamento.
                      </p>
                      {cancellationRequestError && (
                        <p className="text-sm text-red-800" role="alert">
                          {cancellationRequestError}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => void requestCancellation()}
                        disabled={isRequestingCancellation}
                        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-bold text-neutral-900 transition hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-800 disabled:cursor-wait disabled:opacity-60"
                      >
                        {isRequestingCancellation && (
                          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                        )}
                        {isRequestingCancellation
                          ? 'Enviando solicitação…'
                          : 'Solicitar cancelamento'}
                      </button>
                    </section>
                  )}

                  {order.status === 'cancelamento_solicitado' && order.cancellationReceipt && (
                    <section
                      aria-labelledby="checkout-cancellation-receipt-title"
                      className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4"
                      role="status"
                    >
                      <h2
                        id="checkout-cancellation-receipt-title"
                        className="font-extrabold text-amber-950"
                      >
                        Solicitação de cancelamento registrada
                      </h2>
                      <p className="text-sm leading-6 text-amber-950">
                        A Central analisará o pedido. A reserva continua ativa até a confirmação do
                        cancelamento, e o estorno ainda não foi realizado.
                      </p>
                      <p className="text-sm text-amber-950">
                        Protocolo:{' '}
                        <span className="font-mono font-bold">
                          {order.cancellationReceipt.protocol}
                        </span>
                      </p>
                      <p className="text-sm text-amber-950">
                        Registrada em{' '}
                        {dateTimeFormatter.format(new Date(order.cancellationReceipt.requestedAt))}
                      </p>
                    </section>
                  )}

                  {(canStartPixPayment || canStartCardPayment || showActiveCieloCheckout) &&
                    order && (
                      <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4">
                        {showPaymentMethodSelector && (
                          <div className="flex gap-2" role="group" aria-label="Método de pagamento">
                            <button
                              type="button"
                              aria-pressed={selectedPaymentMethod === 'pix'}
                              onClick={() => setSelectedPaymentMethod('pix')}
                              className={`min-h-11 rounded-full px-4 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 ${selectedPaymentMethod === 'pix' ? 'bg-orange-800 text-white' : 'border border-neutral-300 text-neutral-800 hover:bg-neutral-100'}`}
                            >
                              Pix
                            </button>
                            <button
                              type="button"
                              aria-pressed={selectedPaymentMethod === 'card'}
                              onClick={() => setSelectedPaymentMethod('card')}
                              className={`min-h-11 rounded-full px-4 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 ${selectedPaymentMethod === 'card' ? 'bg-orange-800 text-white' : 'border border-neutral-300 text-neutral-800 hover:bg-neutral-100'}`}
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
                              <div>
                                <p className="text-sm text-rose-800" role="alert">
                                  {paymentStartError}
                                </p>
                                {supportLink}
                              </div>
                            )}
                            <button
                              type="button"
                              disabled={isStartingPixPayment}
                              onClick={() => void startPixPayment(order)}
                              className="inline-flex min-h-11 max-w-full items-center justify-center rounded-full bg-orange-800 px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-orange-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-wait disabled:opacity-60"
                            >
                              {isStartingPixPayment
                                ? 'Solicitando Pix…'
                                : paymentAttempt
                                  ? 'Tentar novamente com Pix'
                                  : 'Gerar pagamento Pix'}
                            </button>
                          </div>
                        )}

                        {showCardPaymentForm && isCieloProvider && (
                          <CieloSopCardForm
                            failureContent={supportLink}
                            reference={reference}
                            amount={order.quoteTotal}
                            credentials={
                              resumeState.kind === 'ready' ? resumeState.credentials : null
                            }
                            onAttemptFinished={() => setRetryKey((current) => current + 1)}
                          />
                        )}
                        {showHostedCieloCheckout && (
                          <CieloCheckoutIframe
                            reference={reference}
                            amount={order.quoteTotal}
                            checkoutUrl={paymentAttempt?.checkoutUrl ?? null}
                            onAttemptStarted={() => setRetryKey((current) => current + 1)}
                          />
                        )}
                        {showCardPaymentForm && !isCieloProvider && cardPublicKey && (
                          <MercadoPagoCardForm
                            reference={reference}
                            amount={order.quoteTotal}
                            publicKey={cardPublicKey}
                            credentials={
                              resumeState.kind === 'ready' ? resumeState.credentials : null
                            }
                            isPixAvailable={canStartPixPayment}
                            onAttemptFinished={() => setRetryKey((current) => current + 1)}
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
                                className="block min-h-24 w-full min-w-0 resize-y break-all rounded-xl border border-neutral-300 bg-neutral-50 p-3 font-mono text-xs leading-5 text-neutral-800"
                              />
                              <button
                                type="button"
                                onClick={() => void copyPixCode(paymentAttempt.pix!.copyPaste!)}
                                className="inline-flex min-h-11 max-w-full items-center justify-center rounded-full bg-neutral-950 px-4 py-2.5 text-center text-xs font-bold text-white transition hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
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
                    className="min-h-11 rounded-full border border-neutral-300 bg-white px-4 py-2.5 text-xs font-bold text-neutral-800 transition hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 print:hidden"
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
