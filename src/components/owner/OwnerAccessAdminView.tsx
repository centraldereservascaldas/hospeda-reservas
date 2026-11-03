import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react';
import {
  crcnBackendApi,
  DirectBookingOperationsOrder,
  DirectBookingOperationsWebhook,
  OwnerAccessRequest,
  StaysOwnerSummary,
} from '../../services/crcnBackendApi';

interface OwnerAccessAdminViewProps {
  accessToken: string;
  canManagePayments: boolean;
}

type ConfirmationEmailStatus = NonNullable<
  DirectBookingOperationsOrder['confirmationEmail']
>['status'];

const confirmationEmailStatusLabels: Record<ConfirmationEmailStatus, string> = {
  pending: 'pendente',
  queued: 'na fila',
  processing: 'enviando',
  sent: 'enviado',
  failed: 'falhou',
  skipped: 'não enviado: reserva não está mais confirmada',
};

export const OwnerAccessAdminView: React.FC<OwnerAccessAdminViewProps> = ({
  accessToken,
  canManagePayments,
}) => {
  const [requests, setRequests] = useState<OwnerAccessRequest[]>([]);
  const [operationsOrders, setOperationsOrders] = useState<DirectBookingOperationsOrder[]>([]);
  const [unmatchedWebhooks, setUnmatchedWebhooks] = useState<DirectBookingOperationsWebhook[]>([]);
  const [unmatchedWebhookTotal, setUnmatchedWebhookTotal] = useState(0);
  const [operationsLoading, setOperationsLoading] = useState(true);
  const [operationsError, setOperationsError] = useState('');
  const [operationsRefreshKey, setOperationsRefreshKey] = useState(0);
  const [operationsPage, setOperationsPage] = useState(1);
  const [operationsLastPage, setOperationsLastPage] = useState(1);
  const [operationsTotal, setOperationsTotal] = useState(0);
  const [webhookPage, setWebhookPage] = useState(1);
  const [webhookLastPage, setWebhookLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void crcnBackendApi
      .getOwnerAccessRequests(accessToken)
      .then((items) => {
        if (active) setRequests(items);
      })
      .catch((loadError) => {
        if (active)
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Não foi possível carregar as solicitações.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, refreshKey]);

  useEffect(() => {
    if (!canManagePayments) {
      setOperationsLoading(false);
      return;
    }
    let active = true;
    setOperationsLoading(true);
    setOperationsError('');
    void crcnBackendApi
      .getDirectBookingOperationsOrders(accessToken, operationsPage, webhookPage)
      .then((result) => {
        if (active) {
          setOperationsOrders(result.orders);
          setUnmatchedWebhooks(result.unmatchedWebhooks);
          setUnmatchedWebhookTotal(result.unmatchedWebhookTotal);
          setWebhookLastPage(result.unmatchedWebhookLastPage);
          setOperationsLastPage(result.lastPage);
          setOperationsTotal(result.total);
          if (result.currentPage > Math.max(result.lastPage, 1)) {
            setOperationsPage(Math.max(result.lastPage, 1));
          }
          if (result.unmatchedWebhookCurrentPage > result.unmatchedWebhookLastPage) {
            setWebhookPage(result.unmatchedWebhookLastPage);
          }
        }
      })
      .catch((loadError) => {
        if (active)
          setOperationsError(
            loadError instanceof Error
              ? loadError.message
              : 'Não foi possível carregar os pedidos em conferência.',
          );
      })
      .finally(() => {
        if (active) setOperationsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, canManagePayments, operationsPage, webhookPage, operationsRefreshKey]);

  const handleApproved = () => setRefreshKey((value) => value + 1);

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {canManagePayments && (
        <div className="mb-10">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900">
                <AlertCircle className="h-4 w-4" aria-hidden="true" /> Operação de vendas diretas
              </div>
              <h1 className="text-2xl font-black tracking-tight text-neutral-950 sm:text-3xl">
                Itens que precisam de ação
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-neutral-600">
                Pedidos em conferência e notificações de pagamento sem tentativa local
                correspondente.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOperationsRefreshKey((value) => value + 1)}
              disabled={operationsLoading}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/80 bg-white/75 px-4 py-2.5 text-sm font-bold text-neutral-700 shadow-sm backdrop-blur-xl hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${operationsLoading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />{' '}
              Atualizar fila
            </button>
          </div>
          {operationsError && (
            <div
              role="alert"
              className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800"
            >
              {operationsError}
            </div>
          )}
          {operationsLoading ? (
            <div
              className="flex items-center justify-center gap-2 rounded-3xl border border-white/80 bg-white/65 p-8 text-sm font-semibold text-neutral-600 backdrop-blur-xl"
              role="status"
            >
              <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> Carregando
              pedidos…
            </div>
          ) : !operationsError && operationsOrders.length === 0 && unmatchedWebhookTotal === 0 ? (
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-8 text-center text-sm font-semibold text-emerald-900">
              Nenhum pedido exige ação operacional agora.
            </div>
          ) : (
            <>
              {!operationsError && unmatchedWebhookTotal > 0 && unmatchedWebhooks.length === 0 && (
                <p role="alert">
                  Há {unmatchedWebhookTotal} notificação(ões) pendente(s) sem detalhes disponíveis.
                  Atualize a fila para tentar novamente.
                </p>
              )}
              {unmatchedWebhooks.length > 0 && (
                <section aria-labelledby="unmatched-webhooks-title" className="mb-6 space-y-3">
                  <div>
                    <h2
                      id="unmatched-webhooks-title"
                      className="text-base font-extrabold text-neutral-900"
                    >
                      Notificações sem pedido vinculado
                    </h2>
                    <p className="mt-1 text-xs text-neutral-600">
                      {unmatchedWebhookTotal} notificação(ões) aguardam associação ou conferência.
                      {unmatchedWebhookTotal > 0 &&
                        ` · página ${webhookPage} de ${Math.max(webhookLastPage, 1)}`}
                    </p>
                  </div>
                  <div className="space-y-3">
                    {unmatchedWebhooks.map((webhook) => (
                      <UnmatchedWebhookCard
                        key={webhook.id}
                        webhook={webhook}
                        accessToken={accessToken}
                        onRetried={() => setOperationsRefreshKey((value) => value + 1)}
                      />
                    ))}
                  </div>
                  <nav
                    aria-label="Paginação das notificações sem pedido vinculado"
                    className="flex flex-wrap items-center justify-between gap-3"
                  >
                    <p className="text-xs text-neutral-600">
                      {unmatchedWebhookTotal} notificação(ões) · página {webhookPage} de{' '}
                      {Math.max(webhookLastPage, 1)}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setWebhookPage((page) => Math.max(1, page - 1))}
                        disabled={operationsLoading || webhookPage <= 1}
                        className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Anterior
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setWebhookPage((page) => Math.min(webhookLastPage, page + 1))
                        }
                        disabled={operationsLoading || webhookPage >= webhookLastPage}
                        className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Próxima <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </nav>
                </section>
              )}
              {operationsOrders.length > 0 && (
                <>
                  <h2 className="mb-3 text-base font-extrabold text-neutral-900">
                    Pedidos em conferência
                  </h2>
                  <div className="space-y-3">
                    {operationsOrders.map((order) => (
                      <DirectBookingOperationsCard
                        key={order.id}
                        order={order}
                        accessToken={accessToken}
                        onUpdated={() => setOperationsRefreshKey((value) => value + 1)}
                      />
                    ))}
                  </div>
                  <nav
                    aria-label="Paginação dos pedidos em conferência"
                    className="mt-4 flex flex-wrap items-center justify-between gap-3"
                  >
                    <p className="text-xs text-neutral-600">
                      {operationsTotal} pedido(s) · página {operationsPage} de{' '}
                      {Math.max(operationsLastPage, 1)}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setOperationsPage((page) => Math.max(1, page - 1))}
                        disabled={operationsLoading || operationsPage <= 1}
                        className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Anterior
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setOperationsPage((page) => Math.min(operationsLastPage, page + 1))
                        }
                        disabled={operationsLoading || operationsPage >= operationsLastPage}
                        className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Próxima <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </nav>
                </>
              )}
            </>
          )}
        </div>
      )}

      <div className="border-t border-neutral-200 pt-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50/80 px-3 py-1 text-xs font-bold text-orange-800">
              <ShieldCheck className="h-4 w-4" /> Área restrita da Central
            </div>
            <h1 className="text-2xl font-black tracking-tight text-neutral-950 sm:text-3xl">
              Acessos de proprietários
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-600">
              Confira a identidade por um canal oficial antes de associar uma conta do site ao
              cadastro da Stays. A pesquisa mostra apenas nome, identificador e quantidade de
              imóveis; a consulta considera os últimos 10 anos.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/80 bg-white/75 px-4 py-2.5 text-sm font-bold text-neutral-700 shadow-sm backdrop-blur-xl hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800"
          >
            {error}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-3xl border border-white/80 bg-white/65 p-10 text-sm font-semibold text-neutral-600 backdrop-blur-xl">
            <LoaderCircle className="h-5 w-5 animate-spin" /> Carregando solicitações…
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-3xl border border-white/80 bg-white/65 p-10 text-center text-sm text-neutral-600 backdrop-blur-xl">
            Não há solicitações pendentes no momento.
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <OwnerRequestCard
                key={request.userId}
                request={request}
                accessToken={accessToken}
                onApproved={handleApproved}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

const orderStatusLabels: Record<DirectBookingOperationsOrder['status'], string> = {
  iniciado: 'Pedido iniciado',
  cotado: 'Cotação registrada',
  pre_reservado: 'Pré-reserva',
  liberacao_pendente: 'Liberação pendente',
  pagamento_pendente: 'Pagamento pendente',
  pago_em_confirmacao: 'Pago, aguardando Stays',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  expirado: 'Expirado',
  pagamento_recusado: 'Pagamento recusado',
  atencao_operacional: 'Atenção operacional',
  cancelamento_solicitado: 'Cancelamento solicitado',
  reembolso_pendente: 'Reembolso pendente',
  reembolsado: 'Reembolsado',
  contestado: 'Contestado',
};

const operationsMoney = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const operationsDate = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' });
const operationsDateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});
const issueSourceLabels: Record<string, string> = {
  stays: 'Stays',
  payment: 'pagamento',
  payment_gateway: 'conciliação do gateway',
  webhook: 'notificação do gateway',
  email: 'e-mail transacional',
  late_or_unreserved_payment: 'pagamento após o prazo da pré-reserva',
  guest_cancellation_request: 'solicitação de cancelamento do hóspede',
};
const staysActionLabels: Record<string, string> = {
  create_client: 'Cadastro do hóspede',
  create_reservation: 'Criação da pré-reserva',
  cancel_reservation: 'Liberação da pré-reserva',
  register_payment: 'Lançamento do pagamento',
  confirm_reservation: 'Confirmação da reserva',
};
const manualCancellationReasonLabels: Record<string, string> = {
  guest_cancellation_requested: 'cancelamento solicitado pelo hóspede',
  payment_approved_after_hold: 'pagamento aprovado após o prazo da pré-reserva',
};
const webhookStatusLabels: Record<DirectBookingOperationsWebhook['status'], string> = {
  received: 'Recebido',
  retrying: 'Em nova tentativa',
  failed: 'Falha',
  queued: 'Na fila',
  processing: 'Em processamento',
};

const getSuggestedNextAction = (order: DirectBookingOperationsOrder): string | null => {
  if (order.status === 'reembolso_pendente') {
    if (!order.staysCancellationConfirmed) {
      return order.staysReservationId
        ? 'Consulte a Stays para confirmar que a reserva foi cancelada.'
        : 'Localize a reserva correspondente na Stays e confirme o cancelamento antes de avançar.';
    }

    if (!order.gatewayRefundConfirmed) {
      return order.gatewayPaymentId
        ? 'Consulte o Mercado Pago para confirmar o estorno. A verificação não envia uma nova solicitação de reembolso.'
        : 'Localize a tentativa de pagamento correspondente no Mercado Pago e confirme o estorno; não solicite outro reembolso.';
    }

    return 'As duas conferências aparecem concluídas, mas o pedido permanece nesta fila. Atualize a fila e revise o histórico operacional.';
  }

  if (order.lastEvent?.code === 'payment_state_changed_during_reservation_release') {
    return 'A Stays confirmou o cancelamento da pré-reserva enquanto o pagamento mudava. Reconcilie o pagamento no gateway e trate a reserva com a equipe antes de informar o hóspede.';
  }

  if (
    order.status === 'atencao_operacional' &&
    order.latePaymentAfterHold &&
    order.paymentStatus === 'approved' &&
    order.staysReservationId !== null
  ) {
    return 'Verifique a disponibilidade e a reserva na Stays. Registre a revisão do pagamento tardio quando o pedido permitir; não confirme nem cancele automaticamente.';
  }

  if (order.paymentApprovedWithoutConfirmedReservation) {
    return 'Compare o pagamento aprovado no gateway com a reserva na Stays. Mantenha a confirmação ao hóspede suspensa até conciliar os dois registros.';
  }

  if (order.status === 'contestado') {
    return 'Confira o estado e os prazos da contestação no gateway e reconcilie a situação da reserva na Stays antes de responder ao hóspede.';
  }

  if (order.status === 'cancelamento_solicitado') {
    return 'Revise a política aplicável e a solicitação do hóspede. Registre o encaminhamento manual após decidir os próximos passos na Stays e no gateway.';
  }

  if (order.status === 'liberacao_pendente') {
    return 'Consulte o estado da reserva na Stays antes de repetir ou considerar concluída a liberação da pré-reserva.';
  }

  if (order.issue?.source === 'stays') {
    return 'Confira a ação e a mensagem da Stays e consulte o estado atual da reserva antes de qualquer repetição.';
  }

  if (order.issue?.source === 'payment' || order.issue?.source === 'webhook') {
    return 'Consulte o estado autoritativo do pagamento no gateway e reconcilie o pedido antes de iniciar outra tentativa.';
  }

  if (order.issue?.source === 'email') {
    return 'Confira o estado da outbox e a entrega do e-mail. Não recrie a reserva nem o pagamento para reenviar a comunicação.';
  }

  if (order.status === 'atencao_operacional') {
    return 'Revise o último evento e os registros de gateway e Stays para identificar a divergência antes de agir.';
  }

  return null;
};

const DirectBookingOperationsCard: React.FC<{
  order: DirectBookingOperationsOrder;
  accessToken: string;
  onUpdated: () => void;
}> = ({ order, accessToken, onUpdated }) => {
  const [confirmingManualCancellation, setConfirmingManualCancellation] = useState(false);
  const [startingManualCancellation, setStartingManualCancellation] = useState(false);
  const [manualCancellationError, setManualCancellationError] = useState('');
  const [verifyingStaysCancellation, setVerifyingStaysCancellation] = useState(false);
  const [staysCancellationError, setStaysCancellationError] = useState('');
  const [verifyingGatewayRefund, setVerifyingGatewayRefund] = useState(false);
  const [gatewayRefundError, setGatewayRefundError] = useState('');
  const [revokingResumeToken, setRevokingResumeToken] = useState(false);
  const [resumeTokenRevocationError, setResumeTokenRevocationError] = useState('');

  const startManualCancellation = async (): Promise<void> => {
    setStartingManualCancellation(true);
    setManualCancellationError('');
    try {
      await crcnBackendApi.startManualDirectBookingCancellation(accessToken, order.publicReference);
      setConfirmingManualCancellation(false);
      onUpdated();
    } catch (error) {
      setManualCancellationError(
        error instanceof Error ? error.message : 'Não foi possível encaminhar o pedido.',
      );
    } finally {
      setStartingManualCancellation(false);
    }
  };

  const verifyStaysCancellation = async (): Promise<void> => {
    setVerifyingStaysCancellation(true);
    setStaysCancellationError('');
    try {
      await crcnBackendApi.verifyManualDirectBookingStaysCancellation(
        accessToken,
        order.publicReference,
      );
      onUpdated();
    } catch (error) {
      setStaysCancellationError(
        error instanceof Error
          ? error.message
          : 'Não foi possível confirmar o cancelamento na Stays.',
      );
    } finally {
      setVerifyingStaysCancellation(false);
    }
  };

  const verifyGatewayRefund = async (): Promise<void> => {
    setVerifyingGatewayRefund(true);
    setGatewayRefundError('');
    try {
      await crcnBackendApi.verifyManualDirectBookingGatewayRefund(
        accessToken,
        order.publicReference,
      );
      onUpdated();
    } catch (error) {
      setGatewayRefundError(
        error instanceof Error
          ? error.message
          : 'Não foi possível confirmar o estorno no Mercado Pago.',
      );
    } finally {
      setVerifyingGatewayRefund(false);
    }
  };

  const revokeResumeToken = async (): Promise<void> => {
    const confirmed = window.confirm(
      'Revogar o link invalida a retomada como visitante. O titular ainda poderá acessar o pedido depois de entrar com o e-mail confirmado correspondente. Esta ação não cancela reserva nem pagamento. Continuar?',
    );
    if (!confirmed) return;

    setRevokingResumeToken(true);
    setResumeTokenRevocationError('');
    try {
      await crcnBackendApi.revokeDirectBookingResumeToken(accessToken, order.publicReference);
      onUpdated();
    } catch (error) {
      setResumeTokenRevocationError(
        error instanceof Error
          ? error.message
          : 'Não foi possível revogar a credencial de retomada.',
      );
    } finally {
      setRevokingResumeToken(false);
    }
  };

  const latePaymentCancellationReview =
    order.status === 'atencao_operacional' &&
    order.latePaymentAfterHold &&
    order.paymentStatus === 'approved' &&
    order.staysReservationId !== null;
  const canStartManualCancellation =
    order.status === 'cancelamento_solicitado' || latePaymentCancellationReview;
  const suggestedNextAction = getSuggestedNextAction(order);
  const resumeTokenExpiresAt = order.resumeTokenExpiresAt
    ? Date.parse(order.resumeTokenExpiresAt)
    : Number.NaN;
  const hasValidResumeTokenExpiration = Number.isFinite(resumeTokenExpiresAt);
  const hasActiveResumeToken =
    order.hasResumeToken === true &&
    hasValidResumeTokenExpiration &&
    resumeTokenExpiresAt > Date.now();
  const hasExpiredResumeToken = hasValidResumeTokenExpiration && resumeTokenExpiresAt <= Date.now();
  const resumeTokenStatus =
    order.hasResumeToken === true
      ? !hasValidResumeTokenExpiration
        ? 'sem validade configurada'
        : hasActiveResumeToken
          ? 'ativa'
          : 'expirada'
      : order.resumeTokenRevocation
        ? 'revogada'
        : hasExpiredResumeToken
          ? 'expirada'
          : 'indisponível';

  return (
    <article className="rounded-2xl border border-amber-200/80 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-sm font-extrabold text-neutral-950">
              {order.publicReference.slice(0, 12).toUpperCase()}
            </h2>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-900">
              {orderStatusLabels[order.status]}
            </span>
          </div>
          <p className="mt-2 text-sm font-bold text-neutral-800">{order.guestName}</p>
          <p className="break-all text-xs text-neutral-600">{order.guestEmail}</p>
        </div>
        <p className="text-lg font-black text-neutral-950">
          {operationsMoney.format(Number(order.quoteTotal))}
        </p>
      </div>
      {(order.paymentApprovedWithoutConfirmedReservation || order.staysActionFailed) && (
        <ul
          className="mt-4 space-y-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs font-semibold text-rose-950"
          aria-label="Alertas operacionais prioritários"
        >
          {order.paymentApprovedWithoutConfirmedReservation && (
            <li role="alert">
              Pagamento aprovado sem reserva confirmada na Stays. Conferir antes de qualquer ação
              com o hóspede.
            </li>
          )}
          {order.staysActionFailed && (
            <li role="alert">Uma ação de integração com a Stays falhou e requer conferência.</li>
          )}
        </ul>
      )}
      {suggestedNextAction && (
        <p className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-xs leading-5 text-sky-950">
          <strong className="font-bold">Próximo passo sugerido:</strong> {suggestedNextAction}
        </p>
      )}
      {(order.hasResumeToken === true ||
        order.resumeTokenExpiresAt ||
        order.resumeTokenRevocation) && (
        <section
          className="mt-4 space-y-3 border-t border-neutral-100 pt-4"
          aria-label="Credencial de retomada do visitante"
        >
          <div className="text-xs leading-5 text-neutral-700">
            <p>
              Retomada como visitante:{' '}
              <strong className="font-semibold text-neutral-900">{resumeTokenStatus}</strong>
              {order.resumeTokenExpiresAt && hasValidResumeTokenExpiration && (
                <>
                  {hasExpiredResumeToken ? ' · expirou em ' : ' · válida até '}
                  {operationsDateTime.format(new Date(order.resumeTokenExpiresAt))}
                </>
              )}
            </p>
            {order.resumeTokenRevocation && (
              <p className="text-neutral-600">
                Revogada por ID{' '}
                <span className="break-all font-mono text-neutral-800">
                  {order.resumeTokenRevocation.reviewedBy ?? 'indisponível'}
                </span>
                {order.resumeTokenRevocation.at && (
                  <> · {operationsDateTime.format(new Date(order.resumeTokenRevocation.at))}</>
                )}
                .
              </p>
            )}
          </div>
          {resumeTokenRevocationError && (
            <p className="text-xs font-semibold text-rose-800" role="alert">
              {resumeTokenRevocationError}
            </p>
          )}
          {hasActiveResumeToken && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void revokeResumeToken()}
                disabled={revokingResumeToken}
                className="min-h-11 rounded-xl border border-rose-300 px-3 py-2 text-xs font-bold text-rose-800 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-wait disabled:opacity-50"
              >
                {revokingResumeToken ? 'Revogando link…' : 'Revogar link de visitante'}
              </button>
            </div>
          )}
        </section>
      )}
      <dl className="mt-4 grid gap-3 border-t border-neutral-200 pt-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="font-bold uppercase tracking-wide text-neutral-500">Imóvel</dt>
          <dd className="mt-1 font-semibold text-neutral-800">{order.listingId}</dd>
        </div>
        <div>
          <dt className="font-bold uppercase tracking-wide text-neutral-500">Estadia</dt>
          <dd className="mt-1 font-semibold text-neutral-800">
            {operationsDate.format(new Date(`${order.from}T12:00:00Z`))} –{' '}
            {operationsDate.format(new Date(`${order.to}T12:00:00Z`))}
          </dd>
        </div>
        <div>
          <dt className="font-bold uppercase tracking-wide text-neutral-500">Pagamento</dt>
          <dd className="mt-1 font-semibold text-neutral-800">
            {order.paymentStatus ?? 'Sem atualização'}
            {order.paymentMethod ? ` · ${order.paymentMethod}` : ''}
          </dd>
        </div>
        <div>
          <dt className="font-bold uppercase tracking-wide text-neutral-500">Stays</dt>
          <dd className="mt-1 break-all font-mono font-semibold text-neutral-800">
            {order.staysReservationId ?? 'Sem reserva vinculada'}
          </dd>
        </div>
      </dl>
      {(order.issue || order.gatewayPaymentId || order.confirmationEmail) && (
        <div className="mt-3 space-y-2 break-words border-t border-neutral-100 pt-3 text-[11px] text-neutral-500">
          {order.confirmationEmail && (
            <p>
              E-mail de confirmação:{' '}
              <strong className="font-semibold text-neutral-700">
                {confirmationEmailStatusLabels[order.confirmationEmail.status]}
              </strong>
              {' · '}
              {order.confirmationEmail.attempts} tentativa(s)
              {order.confirmationEmail.queuedAt &&
                ` · na fila desde ${operationsDateTime.format(new Date(order.confirmationEmail.queuedAt))}`}
              {order.confirmationEmail.nextAttemptAt &&
                ` · próxima tentativa ${operationsDateTime.format(new Date(order.confirmationEmail.nextAttemptAt))}`}
            </p>
          )}
          {order.issue && (
            <div>
              <p>
                Exceção ({issueSourceLabels[order.issue.source] ?? order.issue.source}
                {order.issue.action
                  ? ` · ${staysActionLabels[order.issue.action] ?? order.issue.action}`
                  : ''}
                ): <strong className="font-semibold text-neutral-700">{order.issue.status}</strong>
                {order.issue.code ? ` · ${order.issue.code}` : ''}
              </p>
              {order.issue.message && (
                <p className="mt-1 leading-5 text-neutral-600">{order.issue.message}</p>
              )}
            </div>
          )}
          {order.gatewayPaymentId && (
            <p className="break-all">
              ID do gateway: <span className="font-mono">{order.gatewayPaymentId}</span>
            </p>
          )}
        </div>
      )}
      {(order.createdAt || order.updatedAt || order.lastEvent) && (
        <p className="mt-3 break-words border-t border-neutral-100 pt-3 text-[11px] text-neutral-500 [overflow-wrap:anywhere]">
          {order.createdAt && (
            <span>Pedido criado {operationsDateTime.format(new Date(order.createdAt))}</span>
          )}
          {order.lastEvent?.event && (
            <span>
              {order.createdAt ? ' · ' : ''}Último evento:{' '}
              <strong className="font-semibold text-neutral-700">{order.lastEvent.event}</strong>
            </span>
          )}
          {order.lastEvent?.at && (
            <span>
              {order.lastEvent.event || order.createdAt ? ' · ' : ''}
              {operationsDateTime.format(new Date(order.lastEvent.at))}
            </span>
          )}
          {order.lastEvent?.previous_gateway_status && order.lastEvent.gateway_status && (
            <span>
              {' · '}Estado do gateway: {order.lastEvent.previous_gateway_status} →{' '}
              {order.lastEvent.gateway_status}
            </span>
          )}
          {order.updatedAt && (
            <span>
              {order.lastEvent?.at ? ' · ' : ''}Pedido atualizado{' '}
              {operationsDateTime.format(new Date(order.updatedAt))}
            </span>
          )}
        </p>
      )}
      {canStartManualCancellation && (
        <div className="mt-4 border-t border-neutral-100 pt-4">
          {confirmingManualCancellation ? (
            <div className="space-y-3">
              <p className="text-xs leading-5 text-neutral-700">
                {latePaymentCancellationReview
                  ? 'O pagamento foi aprovado após o prazo da pré-reserva. Este registro inicia a revisão manual; não altera a Stays nem o Mercado Pago. A equipe ainda precisa cancelar a reserva na Stays e executar o estorno conforme a política aplicável.'
                  : 'Este encaminhamento só registra a decisão e não altera a Stays nem o gateway. A equipe ainda precisará cancelar a reserva na Stays, executar o reembolso e conferir ambos.'}
              </p>
              {manualCancellationError && (
                <p className="text-xs font-semibold text-rose-800" role="alert">
                  {manualCancellationError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingManualCancellation(false)}
                  disabled={startingManualCancellation}
                  className="min-h-11 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:opacity-50"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={() => void startManualCancellation()}
                  disabled={startingManualCancellation}
                  className="min-h-11 rounded-xl bg-neutral-950 px-3 py-2 text-xs font-bold text-white hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-wait disabled:opacity-60"
                >
                  {startingManualCancellation
                    ? 'Registrando…'
                    : latePaymentCancellationReview
                      ? 'Registrar revisão de pagamento tardio'
                      : 'Registrar encaminhamento manual'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setConfirmingManualCancellation(true)}
                className="min-h-11 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
              >
                {latePaymentCancellationReview
                  ? 'Registrar revisão de pagamento tardio'
                  : 'Registrar encaminhamento manual'}
              </button>
            </div>
          )}
        </div>
      )}
      {order.status === 'reembolso_pendente' && (
        <section
          className="mt-4 space-y-3 border-t border-neutral-100 pt-4"
          aria-label="Conferências de cancelamento"
        >
          <p className="text-xs leading-5 text-orange-950">
            O pedido só sai desta fila quando a Stays confirmar a baixa e o Mercado Pago informar o
            estorno.
          </p>
          {order.manualCancellationReview && (
            <p className="text-[11px] leading-5 text-neutral-600">
              Revisão registrada por ID{' '}
              <span className="font-mono text-neutral-800">
                {order.manualCancellationReview.reviewedBy ?? 'indisponível'}
              </span>
              {order.manualCancellationReview.reason
                ? ` · ${manualCancellationReasonLabels[order.manualCancellationReview.reason] ?? order.manualCancellationReview.reason}`
                : ''}
              {order.manualCancellationReview.at
                ? ` · ${operationsDateTime.format(new Date(order.manualCancellationReview.at))}`
                : ''}
              .
            </p>
          )}
          {order.manualGatewayRefundReview && (
            <p className="text-[11px] leading-5 text-neutral-600">
              Estorno conferido por ID{' '}
              <span className="font-mono text-neutral-800">
                {order.manualGatewayRefundReview.reviewedBy ?? 'indisponível'}
              </span>
              {order.manualGatewayRefundReview.at
                ? ` · ${operationsDateTime.format(new Date(order.manualGatewayRefundReview.at))}`
                : ''}
              .
            </p>
          )}
          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
              <dt className="font-bold text-neutral-600">Cancelamento na Stays</dt>
              <dd className="mt-1 font-semibold text-neutral-900">
                {order.staysCancellationConfirmed
                  ? 'Confirmado na consulta'
                  : 'Pendente de confirmação'}
              </dd>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
              <dt className="font-bold text-neutral-600">Estorno no gateway</dt>
              <dd className="mt-1 font-semibold text-neutral-900">
                {order.gatewayRefundConfirmed
                  ? 'Confirmado pelo Mercado Pago'
                  : 'Aguardando confirmação do Mercado Pago'}
              </dd>
            </div>
          </dl>
          {staysCancellationError && (
            <p className="text-xs font-semibold text-rose-800" role="alert">
              {staysCancellationError}
            </p>
          )}
          {gatewayRefundError && (
            <p className="text-xs font-semibold text-rose-800" role="alert">
              {gatewayRefundError}
            </p>
          )}
          {(!order.staysCancellationConfirmed || !order.gatewayRefundConfirmed) && (
            <div className="flex flex-wrap justify-end gap-2">
              {!order.gatewayRefundConfirmed && (
                <button
                  type="button"
                  onClick={() => void verifyGatewayRefund()}
                  disabled={verifyingGatewayRefund || !order.gatewayPaymentId}
                  className="min-h-11 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-wait disabled:opacity-50"
                >
                  {verifyingGatewayRefund
                    ? 'Consultando Mercado Pago…'
                    : 'Consultar estorno no Mercado Pago'}
                </button>
              )}
              {!order.staysCancellationConfirmed && (
                <button
                  type="button"
                  onClick={() => void verifyStaysCancellation()}
                  disabled={verifyingStaysCancellation || !order.staysReservationId}
                  className="min-h-11 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-wait disabled:opacity-50"
                >
                  {verifyingStaysCancellation
                    ? 'Consultando Stays…'
                    : 'Consultar cancelamento na Stays'}
                </button>
              )}
            </div>
          )}
        </section>
      )}
    </article>
  );
};

const getUnmatchedWebhookNextAction = (webhook: DirectBookingOperationsWebhook): string => {
  if (webhook.canRetry) {
    return 'Reprocesse esta notificação pelo botão abaixo. A conciliação consulta o pagamento no gateway e não cria outra cobrança.';
  }

  if (webhook.status === 'failed') {
    return 'O limite de novas conciliações foi atingido. Confira o pagamento diretamente no Mercado Pago e localize o pedido correspondente antes de qualquer ação.';
  }

  if (webhook.status === 'received') {
    return 'A notificação foi recebida e aguarda processamento. Não gere outra cobrança; confira o pagamento no Mercado Pago se ela continuar sem pedido vinculado.';
  }

  if (webhook.status === 'queued') {
    return 'A conciliação está na fila. Aguarde o processamento e não gere outra cobrança.';
  }

  if (webhook.status === 'retrying') {
    return 'O sistema tentará conciliar novamente. Aguarde a próxima tentativa e não gere outra cobrança.';
  }

  return 'A conciliação está processando esta notificação. Aguarde a atualização do pedido e não gere outra cobrança.';
};

const UnmatchedWebhookCard: React.FC<{
  webhook: DirectBookingOperationsWebhook;
  accessToken: string;
  onRetried: () => void;
}> = ({ webhook, accessToken, onRetried }) => {
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState('');

  const retryWebhook = async (): Promise<void> => {
    setIsRetrying(true);
    setRetryError('');
    try {
      await crcnBackendApi.retryDirectBookingWebhook(accessToken, webhook.id);
      onRetried();
    } catch (error) {
      setRetryError(
        error instanceof Error ? error.message : 'Não foi possível reenviar a notificação.',
      );
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <article className="rounded-2xl border border-amber-200/80 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-neutral-950">Notificação sem tentativa local</h3>
          <p className="mt-1 break-all font-mono text-xs text-neutral-600">
            ID do pagamento: {webhook.gatewayPaymentId}
          </p>
        </div>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-900">
          {webhookStatusLabels[webhook.status]}
        </span>
      </div>
      <dl className="mt-4 grid gap-3 border-t border-neutral-200 pt-4 text-xs sm:grid-cols-3">
        <div>
          <dt className="font-bold uppercase tracking-wide text-neutral-500">Conciliações</dt>
          <dd className="mt-1 font-semibold text-neutral-800">{webhook.attempts}</dd>
        </div>
        <div>
          <dt className="font-bold uppercase tracking-wide text-neutral-500">Último erro</dt>
          <dd className="mt-1 break-all font-mono font-semibold text-neutral-800">
            {webhook.errorCode ?? 'Sem código de erro'}
          </dd>
        </div>
        <div>
          <dt className="font-bold uppercase tracking-wide text-neutral-500">Atualizado</dt>
          <dd className="mt-1 font-semibold text-neutral-800">
            {webhook.updatedAt ? operationsDateTime.format(new Date(webhook.updatedAt)) : '—'}
          </dd>
        </div>
      </dl>
      <p className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-xs leading-5 text-sky-950">
        <strong className="font-bold">Próximo passo sugerido:</strong>{' '}
        {getUnmatchedWebhookNextAction(webhook)}
      </p>
      {retryError && (
        <p className="mt-3 text-sm font-semibold text-rose-800" role="alert">
          {retryError}
        </p>
      )}
      {webhook.canRetry && (
        <div className="mt-4 flex justify-end border-t border-neutral-100 pt-4">
          <button
            type="button"
            onClick={() => void retryWebhook()}
            disabled={isRetrying}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-wait disabled:opacity-60"
          >
            {isRetrying ? (
              <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            {isRetrying ? 'Enviando para conciliação…' : 'Tentar conciliação novamente'}
          </button>
        </div>
      )}
    </article>
  );
};

const OwnerRequestCard: React.FC<{
  request: OwnerAccessRequest;
  accessToken: string;
  onApproved: () => void;
}> = ({ request, accessToken, onApproved }) => {
  const [query, setQuery] = useState('');
  const [owners, setOwners] = useState<StaysOwnerSummary[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [identityVerified, setIdentityVerified] = useState(false);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const term = query.trim();
    if (term.length < 2) {
      setOwners([]);
      setSearching(false);
      return () => {
        active = false;
      };
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      void crcnBackendApi
        .searchStaysOwners(accessToken, term)
        .then((results) => {
          if (active) setOwners(results);
        })
        .catch((searchError) => {
          if (active) {
            setOwners([]);
            setError(
              searchError instanceof Error ? searchError.message : 'A pesquisa na Stays falhou.',
            );
          }
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [accessToken, query]);

  const handleApprove = async () => {
    if (!identityVerified || !selectedOwnerId) return;
    setSaving(true);
    setError('');
    try {
      await crcnBackendApi.approveOwnerAccess(accessToken, request.userId, selectedOwnerId);
      onApproved();
    } catch (approveError) {
      setError(
        approveError instanceof Error ? approveError.message : 'Não foi possível aprovar o acesso.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (
      !window.confirm(
        `Recusar o acesso de ${request.fullName || request.email || 'este solicitante'}?`,
      )
    )
      return;
    setSaving(true);
    setError('');
    try {
      await crcnBackendApi.rejectOwnerAccess(accessToken, request.userId);
      onApproved();
    } catch (rejectError) {
      setError(
        rejectError instanceof Error ? rejectError.message : 'Não foi possível recusar o acesso.',
      );
    } finally {
      setSaving(false);
    }
  };

  const requestedAt = request.requestedAt
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(request.requestedAt),
      )
    : 'Data indisponível';

  return (
    <article className="rounded-3xl border border-white/85 bg-white/70 p-5 shadow-[0_12px_36px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-200/70 pb-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-orange-100 text-orange-700">
            <UserRoundCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-extrabold text-neutral-900">
              {request.fullName || 'Nome não informado'}
            </h2>
            <p className="text-sm text-neutral-600">{request.email || 'E-mail não disponível'}</p>
            <p className="mt-1 text-xs text-neutral-400">Solicitado em {requestedAt}</p>
          </div>
        </div>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
          Em análise
        </span>
      </div>

      <div className="mt-4">
        <label
          className="mb-2 block text-sm font-bold text-neutral-800"
          htmlFor={`stays-owner-search-${request.userId}`}
        >
          Localizar cadastro na Stays
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            id={`stays-owner-search-${request.userId}`}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedOwnerId('');
              setError('');
            }}
            placeholder="Pesquise pelo nome ou ID (mín. 2 caracteres)"
            className="min-h-11 w-full rounded-xl border border-neutral-200 bg-white/90 py-3 pl-10 pr-3 text-sm outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
          />
        </div>
        {searching && (
          <p className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Pesquisando na Stays…
          </p>
        )}
        {!searching && query.trim().length >= 2 && owners.length === 0 && !error && (
          <p className="mt-2 text-xs text-neutral-500">Nenhum cadastro corresponde à pesquisa.</p>
        )}
        {owners.length > 0 && (
          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-neutral-200 bg-white/90 p-1">
            {owners.map((owner) => (
              <button
                key={owner.id}
                type="button"
                aria-pressed={selectedOwnerId === owner.id}
                onClick={() => setSelectedOwnerId(owner.id)}
                className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${selectedOwnerId === owner.id ? 'bg-orange-50 ring-1 ring-orange-300' : 'hover:bg-neutral-50'}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-neutral-800">
                    {owner.name}
                  </span>
                  <span className="block truncate text-xs text-neutral-500">
                    ID {owner.id} ·{' '}
                    {owner.propertyCount === undefined
                      ? 'Quantidade de imóveis indisponível'
                      : `${owner.propertyCount} imóvel(is)`}
                  </span>
                </span>
                {selectedOwnerId === owner.id && (
                  <Check className="h-4 w-4 shrink-0 text-orange-600" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl px-2 py-2 text-xs leading-relaxed text-neutral-700">
        <input
          type="checkbox"
          checked={identityVerified}
          onChange={(event) => setIdentityVerified(event.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-orange-600"
        />
        <span>
          Confirmei a identidade do solicitante por um canal oficial da Central e verifiquei que ele
          corresponde a este proprietário.
        </span>
      </label>
      {error && (
        <p role="alert" className="mt-3 text-xs font-semibold text-red-700">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => void handleReject()}
          disabled={saving}
          className="mr-2 inline-flex min-h-11 items-center rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-700 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-45"
        >
          Recusar acesso
        </button>
        <button
          type="button"
          onClick={() => void handleApprove()}
          disabled={!identityVerified || !selectedOwnerId || saving}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2.5 text-sm font-extrabold text-white shadow-md shadow-orange-500/20 transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {saving ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}{' '}
          Aprovar acesso
        </button>
      </div>
    </article>
  );
};
