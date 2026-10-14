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
}

export const OwnerAccessAdminView: React.FC<OwnerAccessAdminViewProps> = ({ accessToken }) => {
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
  }, [accessToken, operationsPage, webhookPage, operationsRefreshKey]);

  const handleApproved = () => setRefreshKey((value) => value + 1);

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
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
              Pedidos em conferência e notificações de pagamento sem tentativa local correspondente.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOperationsRefreshKey((value) => value + 1)}
            disabled={operationsLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-white/80 bg-white/75 px-4 py-2.5 text-sm font-bold text-neutral-700 shadow-sm backdrop-blur-xl hover:bg-white disabled:opacity-60"
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
            <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> Carregando pedidos…
          </div>
        ) : !operationsError && operationsOrders.length === 0 && unmatchedWebhookTotal === 0 ? (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-8 text-center text-sm font-semibold text-emerald-900">
            Nenhum pedido exige ação operacional agora.
          </div>
        ) : (
          <>
            {!operationsError && unmatchedWebhookTotal > 0 && unmatchedWebhooks.length === 0 && (
              <p role="alert">
                A API informa {unmatchedWebhookTotal} notificação(ões) pendente(s), mas não retornou
                os registros. Atualize a fila para tentar novamente.
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
                      className="inline-flex items-center gap-1 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Anterior
                    </button>
                    <button
                      type="button"
                      onClick={() => setWebhookPage((page) => Math.min(webhookLastPage, page + 1))}
                      disabled={operationsLoading || webhookPage >= webhookLastPage}
                      className="inline-flex items-center gap-1 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
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
                      className="inline-flex items-center gap-1 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Anterior
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setOperationsPage((page) => Math.min(operationsLastPage, page + 1))
                      }
                      disabled={operationsLoading || operationsPage >= operationsLastPage}
                      className="inline-flex items-center gap-1 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
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
            className="inline-flex items-center gap-2 rounded-xl border border-white/80 bg-white/75 px-4 py-2.5 text-sm font-bold text-neutral-700 shadow-sm backdrop-blur-xl hover:bg-white disabled:opacity-60"
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
const webhookStatusLabels: Record<DirectBookingOperationsWebhook['status'], string> = {
  received: 'Recebido',
  retrying: 'Em nova tentativa',
  failed: 'Falha',
  queued: 'Na fila',
  processing: 'Em processamento',
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
          <p className="text-xs text-neutral-600">{order.guestEmail}</p>
        </div>
        <p className="text-lg font-black text-neutral-950">
          {operationsMoney.format(Number(order.quoteTotal))}
        </p>
      </div>
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
      {(order.issue || order.gatewayPaymentId) && (
        <div className="mt-3 space-y-2 break-words border-t border-neutral-100 pt-3 text-[11px] text-neutral-500">
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
            <p>
              ID do gateway: <span className="font-mono">{order.gatewayPaymentId}</span>
            </p>
          )}
        </div>
      )}
      {(order.updatedAt || order.lastEvent) && (
        <p className="mt-3 border-t border-neutral-100 pt-3 text-[11px] text-neutral-500">
          {order.lastEvent?.event && (
            <span>
              Último evento:{' '}
              <strong className="font-semibold text-neutral-700">{order.lastEvent.event}</strong>
            </span>
          )}
          {order.lastEvent?.at && (
            <span>
              {order.lastEvent.event ? ' · ' : ''}
              {operationsDateTime.format(new Date(order.lastEvent.at))}
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
      {order.status === 'cancelamento_solicitado' && (
        <div className="mt-4 border-t border-neutral-100 pt-4">
          {confirmingManualCancellation ? (
            <div className="space-y-3">
              <p className="text-xs leading-5 text-neutral-700">
                Este encaminhamento só registra a decisão e não altera a Stays nem o gateway. A
                equipe ainda precisará cancelar a reserva na Stays, executar o reembolso e conferir
                ambos.
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
                  className="rounded-xl border border-neutral-300 px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={() => void startManualCancellation()}
                  disabled={startingManualCancellation}
                  className="rounded-xl bg-neutral-950 px-3 py-2 text-xs font-bold text-white hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-60"
                >
                  {startingManualCancellation ? 'Registrando…' : 'Registrar encaminhamento manual'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setConfirmingManualCancellation(true)}
                className="rounded-xl border border-neutral-300 px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
              >
                Registrar encaminhamento manual
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
                  className="rounded-xl border border-neutral-300 px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-wait disabled:opacity-50"
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
                  className="rounded-xl border border-neutral-300 px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-wait disabled:opacity-50"
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
            className="inline-flex items-center gap-2 rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-wait disabled:opacity-60"
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
            className="w-full rounded-xl border border-neutral-200 bg-white/90 py-3 pl-10 pr-3 text-sm outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
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
                onClick={() => setSelectedOwnerId(owner.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition ${selectedOwnerId === owner.id ? 'bg-orange-50 ring-1 ring-orange-300' : 'hover:bg-neutral-50'}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-neutral-800">
                    {owner.name}
                  </span>
                  <span className="block truncate text-[11px] text-neutral-500">
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

      <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-neutral-700">
        <input
          type="checkbox"
          checked={identityVerified}
          onChange={(event) => setIdentityVerified(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-orange-600"
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
          onClick={() => void handleApprove()}
          disabled={!identityVerified || !selectedOwnerId || saving}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2.5 text-sm font-extrabold text-white shadow-md shadow-orange-500/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
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
